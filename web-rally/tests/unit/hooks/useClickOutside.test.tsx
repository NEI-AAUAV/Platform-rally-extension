import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import useClickOutside from '@/hooks/useClickOutside'

describe('useClickOutside', () => {
  it('does nothing when inactive', () => {
    const onOutside = vi.fn()
    const addSpy = vi.spyOn(document, 'addEventListener')
    renderHook(() => {
      const ref = useRef<HTMLDivElement | null>(null)
      useClickOutside(ref, false, onOutside)
    })
    expect(addSpy).not.toHaveBeenCalledWith('mousedown', expect.any(Function))
    addSpy.mockRestore()
  })

  it('calls onOutside when clicking outside the ref element', () => {
    const onOutside = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useClickOutside(ref, true, onOutside)
    })

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(onOutside).toHaveBeenCalled()

    document.body.removeChild(container)
    document.body.removeChild(outside)
  })

  it('does not call onOutside when clicking inside the ref element', () => {
    const onOutside = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)

    renderHook(() => {
      const ref = useRef<HTMLElement | null>(container)
      useClickOutside(ref, true, onOutside)
    })

    container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onOutside).not.toHaveBeenCalled()

    document.body.removeChild(container)
  })

  it('calls onOutside on Escape key', () => {
    const onOutside = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(null)
      useClickOutside(ref, true, onOutside)
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onOutside).toHaveBeenCalled()
  })

  it('does not call onOutside for non-Escape keys', () => {
    const onOutside = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(null)
      useClickOutside(ref, true, onOutside)
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onOutside).not.toHaveBeenCalled()
  })

  it('calls onOutside when ref.current is null', () => {
    const onOutside = vi.fn()
    renderHook(() => {
      const ref = useRef<HTMLElement | null>(null)
      useClickOutside(ref, true, onOutside)
    })

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(onOutside).toHaveBeenCalled()
  })

  it('cleans up listeners on unmount', () => {
    const onOutside = vi.fn()
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement | null>(null)
      useClickOutside(ref, true, onOutside)
    })
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })
})
