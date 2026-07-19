import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { ColorModeProvider } from '@/components/theme/ColorModeProvider'
import { useColorMode } from '@/components/theme/useColorMode'
import { COLOR_MODE_STORAGE_KEY, readStoredMode, applyColorMode } from '@/components/theme/colorModeContext'

describe('colorModeContext helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'light')
  })

  it('readStoredMode falls back to the default when nothing is stored', () => {
    expect(readStoredMode()).toBe('dark')
  })

  it('readStoredMode returns the stored valid mode', () => {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, 'light')
    expect(readStoredMode()).toBe('light')
  })

  it('readStoredMode ignores invalid stored values', () => {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, 'invalid')
    expect(readStoredMode()).toBe('dark')
  })

  it('applyColorMode toggles the html class and color-scheme', () => {
    applyColorMode('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')

    applyColorMode('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })
})

describe('useColorMode', () => {
  it('throws when used outside a ColorModeProvider', () => {
    const { result } = renderHook(() => {
      try {
        return useColorMode()
      } catch (e) {
        return e
      }
    })
    expect(result.current).toBeInstanceOf(Error)
  })

  it('provides mode, setMode and toggle within a provider', () => {
    localStorage.clear()
    function Consumer() {
      const { mode, setMode, toggle } = useColorMode()
      return (
        <div>
          <span>{mode}</span>
          <button onClick={() => setMode('light')}>set-light</button>
          <button onClick={() => toggle()}>toggle</button>
        </div>
      )
    }

    render(
      <ColorModeProvider>
        <Consumer />
      </ColorModeProvider>,
    )

    expect(screen.getByText('dark')).toBeInTheDocument()

    act(() => fireEvent.click(screen.getByText('set-light')))
    expect(screen.getByText('light')).toBeInTheDocument()
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('light')

    act(() => fireEvent.click(screen.getByText('toggle')))
    expect(screen.getByText('dark')).toBeInTheDocument()
  })

  it('uses startViewTransition when available and a coordinate is provided', () => {
    localStorage.clear()
    const startViewTransition = vi.fn((cb: () => void) => {
      cb()
      return {} as unknown as ViewTransition
    })
    ;(document as any).startViewTransition = startViewTransition

    function Consumer() {
      const { mode, toggle } = useColorMode()
      return (
        <div>
          <span>{mode}</span>
          <button onClick={() => toggle({ clientX: 10, clientY: 20 })}>toggle</button>
        </div>
      )
    }

    render(
      <ColorModeProvider>
        <Consumer />
      </ColorModeProvider>,
    )

    act(() => fireEvent.click(screen.getByText('toggle')))

    expect(startViewTransition).toHaveBeenCalled()
    expect(screen.getByText('light')).toBeInTheDocument()

    delete (document as any).startViewTransition
  })
})
