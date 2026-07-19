import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { formatStopwatchTime, useStopwatch } from '@/hooks/useStopwatch'

describe('formatStopwatchTime', () => {
  it('formats sub-hour durations as mm:ss.cc', () => {
    expect(formatStopwatchTime(0)).toBe('00:00.00')
    expect(formatStopwatchTime(65_432)).toBe('01:05.43')
  })

  it('formats durations over an hour as hh:mm:ss.cc', () => {
    expect(formatStopwatchTime(3_661_000)).toBe('01:01:01.00')
  })
})

describe('useStopwatch', () => {
  let now = 0
  let rafQueue: FrameRequestCallback[] = []

  beforeEach(() => {
    now = 1_000_000
    rafQueue = []
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafQueue.push(cb)
      return rafQueue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function flushRaf() {
    const queue = rafQueue
    rafQueue = []
    queue.forEach((cb) => cb(now))
  }

  it('starts in a stopped, zeroed state', () => {
    const { result } = renderHook(() => useStopwatch())
    expect(result.current.running).toBe(false)
    expect(result.current.elapsed).toBe(0)
    expect(result.current.laps).toEqual([])
  })

  it('start sets running true and accumulates elapsed time', () => {
    const { result } = renderHook(() => useStopwatch())

    act(() => result.current.start())
    expect(result.current.running).toBe(true)

    now += 500
    act(() => flushRaf())
    expect(result.current.elapsed).toBe(500)
  })

  it('pause stops the clock and preserves elapsed time', () => {
    const { result } = renderHook(() => useStopwatch())

    act(() => result.current.start())
    now += 300
    act(() => flushRaf())
    act(() => result.current.pause())

    expect(result.current.running).toBe(false)
    expect(result.current.elapsed).toBe(300)
  })

  it('reset clears elapsed time and laps', () => {
    const { result } = renderHook(() => useStopwatch())

    act(() => result.current.start())
    now += 300
    act(() => flushRaf())
    act(() => result.current.lap())
    act(() => result.current.reset())

    expect(result.current.elapsed).toBe(0)
    expect(result.current.laps).toEqual([])
    expect(result.current.running).toBe(false)
  })

  it('lap records elapsed and split time relative to the previous lap', () => {
    const { result } = renderHook(() => useStopwatch())

    act(() => result.current.start())
    now += 100
    act(() => flushRaf())
    act(() => result.current.lap())

    now += 150
    act(() => flushRaf())
    act(() => result.current.lap())

    expect(result.current.laps).toHaveLength(2)
    expect(result.current.laps[0]).toMatchObject({ n: 1, elapsed: 100, split: 100 })
    expect(result.current.laps[1]).toMatchObject({ n: 2, elapsed: 250, split: 150 })
  })

  it('cancels the animation frame on unmount', () => {
    const { result, unmount } = renderHook(() => useStopwatch())
    act(() => result.current.start())
    unmount()
    expect(window.cancelAnimationFrame).toHaveBeenCalled()
  })

  it('pause is a no-op when the stopwatch was never started', () => {
    const { result } = renderHook(() => useStopwatch())

    act(() => result.current.pause())

    expect(result.current.running).toBe(false)
    expect(result.current.elapsed).toBe(0)
    expect(window.cancelAnimationFrame).not.toHaveBeenCalled()
  })

  it('does not cancel an animation frame on unmount when never started', () => {
    const { unmount } = renderHook(() => useStopwatch())
    unmount()
    expect(window.cancelAnimationFrame).not.toHaveBeenCalled()
  })

  it('reset is safe to call when the stopwatch was never started', () => {
    const { result } = renderHook(() => useStopwatch())

    act(() => result.current.reset())

    expect(result.current.elapsed).toBe(0)
    expect(result.current.laps).toEqual([])
    expect(result.current.running).toBe(false)
  })
})
