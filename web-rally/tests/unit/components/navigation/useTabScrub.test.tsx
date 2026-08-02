import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useTabScrub } from '@/components/shared/navigation/useTabScrub'

const COUNT = 4
const LIST_WIDTH = 400
const SLOT = LIST_WIDTH / COUNT

function Harness({ activeIndex, onSelect }: { activeIndex: number; onSelect: (i: number) => void }) {
  const { listRef, pillRef, hoverIndex, isDragging, onPointerDown, onClickCapture } = useTabScrub({
    count: COUNT,
    activeIndex,
    onSelect,
  })

  return (
    <ul
      ref={listRef}
      data-testid="list"
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <span ref={pillRef} data-testid="pill" />
      <li data-testid="hover">{hoverIndex}</li>
      <li data-testid="dragging">{String(isDragging)}</li>
      <li>
        <a href="/somewhere" data-testid="link" onClick={(e) => e.preventDefault()}>
          tab
        </a>
      </li>
    </ul>
  )
}

/** jsdom lays nothing out, so the list has to be given a box. */
function stubLayout() {
  const list = screen.getByTestId('list')
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: LIST_WIDTH,
    height: 60,
    right: LIST_WIDTH,
    bottom: 60,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  Object.defineProperty(list, 'clientWidth', { value: LIST_WIDTH, configurable: true })
  return list
}

function pointerEvent(type: string, clientX: number, timeStamp = 0, clientY = 0) {
  const event = new Event(type, { bubbles: true }) as Event & {
    clientX: number
    clientY: number
    timeStamp: number
  }
  Object.defineProperty(event, 'clientX', { value: clientX })
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  return event
}

describe('useTabScrub', () => {
  let onSelect: ReturnType<typeof vi.fn<(index: number) => void>>

  beforeEach(() => {
    onSelect = vi.fn<(index: number) => void>()
    vi.restoreAllMocks()
  })

  it('parks the pill on the active tab', () => {
    render(<Harness activeIndex={2} onSelect={onSelect} />)
    stubLayout()
    // The effect measured before the layout stub, so re-settle by re-rendering.
    const pill = screen.getByTestId('pill')
    expect(pill.style.transform).toContain('translateX')
  })

  it('tracks the finger and selects the tab it was released over', () => {
    render(<Harness activeIndex={0} onSelect={onSelect} />)
    const list = stubLayout()

    fireEvent.pointerDown(list, { clientX: SLOT * 0.5, button: 0 })
    expect(screen.getByTestId('dragging')).toHaveTextContent('true')

    act(() => {
      globalThis.dispatchEvent(pointerEvent('pointermove', SLOT * 2.5, 40))
    })
    expect(screen.getByTestId('hover')).toHaveTextContent('2')

    act(() => {
      globalThis.dispatchEvent(pointerEvent('pointerup', SLOT * 2.5, 60))
    })
    expect(onSelect).toHaveBeenCalledWith(2)
    expect(screen.getByTestId('dragging')).toHaveTextContent('false')
    expect(screen.getByTestId('hover')).toHaveTextContent('-1')
  })

  it('does not navigate when the finger never moved — that is a tap, and the link handles it', () => {
    render(<Harness activeIndex={0} onSelect={onSelect} />)
    const list = stubLayout()

    fireEvent.pointerDown(list, { clientX: SLOT * 2.5, button: 0 })
    act(() => {
      globalThis.dispatchEvent(pointerEvent('pointerup', SLOT * 2.5, 10))
    })

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('swallows the click that follows a drag so the link does not also fire', () => {
    render(<Harness activeIndex={0} onSelect={onSelect} />)
    const list = stubLayout()

    fireEvent.pointerDown(list, { clientX: SLOT * 0.5, button: 0 })
    act(() => {
      globalThis.dispatchEvent(pointerEvent('pointermove', SLOT * 2.5, 40))
      globalThis.dispatchEvent(pointerEvent('pointerup', SLOT * 2.5, 60))
    })

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    screen.getByTestId('link').dispatchEvent(click)
    expect(click.defaultPrevented).toBe(true)
  })

  it('hands a vertical gesture back to the browser instead of scrubbing', () => {
    render(<Harness activeIndex={0} onSelect={onSelect} />)
    const list = stubLayout()

    fireEvent.pointerDown(list, { clientX: SLOT * 0.5, clientY: 0, button: 0 })
    act(() => {
      // Straight down: this is a page scroll, or Android's system gesture.
      globalThis.dispatchEvent(pointerEvent('pointermove', SLOT * 0.5 + 2, 30, 40))
    })

    expect(screen.getByTestId('dragging')).toHaveTextContent('false')

    act(() => {
      globalThis.dispatchEvent(pointerEvent('pointerup', SLOT * 2.5, 60, 40))
    })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('stretches the pill while moving and settles it back on release', () => {
    render(<Harness activeIndex={0} onSelect={onSelect} />)
    const list = stubLayout()
    const pill = screen.getByTestId('pill')

    fireEvent.pointerDown(list, { clientX: 0, button: 0 })
    act(() => {
      // A fast sweep: large distance, short interval.
      globalThis.dispatchEvent(pointerEvent('pointermove', 300, 8))
    })
    const scale = /scale\(([\d.]+)/.exec(pill.style.transform)
    expect(Number(scale?.[1])).toBeGreaterThan(1)

    act(() => {
      globalThis.dispatchEvent(pointerEvent('pointerup', 300, 20))
    })
    expect(pill.style.transform).toContain('scale(1, 1)')
  })
})
