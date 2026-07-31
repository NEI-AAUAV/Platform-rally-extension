import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { ColorModeProvider } from '@/components/theme/ColorModeProvider'
import { useColorMode } from '@/components/theme/useColorMode'
import {
  COLOR_MODE_STORAGE_KEY,
  REDUCE_TRANSPARENCY_STORAGE_KEY,
  readStoredPreference,
  readStoredReduceTransparency,
  applyColorMode,
  applyReduceTransparency,
  resolveColorMode,
} from '@/components/theme/colorModeContext'

describe('colorModeContext helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'light')
  })

  it('readStoredPreference falls back to system when nothing is stored', () => {
    expect(readStoredPreference()).toBe('system')
  })

  it('readStoredPreference returns the stored valid preference', () => {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, 'light')
    expect(readStoredPreference()).toBe('light')
  })

  it('readStoredPreference ignores invalid stored values', () => {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, 'invalid')
    expect(readStoredPreference()).toBe('system')
  })

  // The setup mock reports matches: false for every query, i.e. a light OS.
  it('resolveColorMode follows the OS appearance for the system preference', () => {
    expect(resolveColorMode('system')).toBe('light')
    expect(resolveColorMode('dark')).toBe('dark')
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

  it('reduce-transparency preference round-trips through storage and the html attribute', () => {
    expect(readStoredReduceTransparency()).toBe(false)
    localStorage.setItem(REDUCE_TRANSPARENCY_STORAGE_KEY, 'true')
    expect(readStoredReduceTransparency()).toBe(true)

    applyReduceTransparency(true)
    expect(document.documentElement.dataset.reduceTransparency).toBe('true')
    applyReduceTransparency(false)
    expect(document.documentElement.dataset.reduceTransparency).toBe('false')
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
      const { mode, preference, setMode, toggle } = useColorMode()
      return (
        <div>
          <span data-testid="mode">{mode}</span>
          <span data-testid="preference">{preference}</span>
          <button onClick={() => setMode('dark')}>set-dark</button>
          <button onClick={() => toggle()}>toggle</button>
        </div>
      )
    }

    render(
      <ColorModeProvider>
        <Consumer />
      </ColorModeProvider>,
    )

    // Nothing stored, so it follows the OS, which the setup mock reports as light.
    expect(screen.getByTestId('preference')).toHaveTextContent('system')
    expect(screen.getByTestId('mode')).toHaveTextContent('light')

    fireEvent.click(screen.getByText('set-dark'))
    expect(screen.getByTestId('mode')).toHaveTextContent('dark')
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('dark')

    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('mode')).toHaveTextContent('light')
    expect(screen.getByTestId('preference')).toHaveTextContent('light')
  })

  it('persists the reduce-transparency preference', () => {
    localStorage.clear()
    function Consumer() {
      const { reduceTransparency, setReduceTransparency } = useColorMode()
      return (
        <button onClick={() => setReduceTransparency(!reduceTransparency)}>
          {String(reduceTransparency)}
        </button>
      )
    }

    render(
      <ColorModeProvider>
        <Consumer />
      </ColorModeProvider>,
    )

    expect(screen.getByText('false')).toBeInTheDocument()
    fireEvent.click(screen.getByText('false'))
    expect(screen.getByText('true')).toBeInTheDocument()
    expect(localStorage.getItem(REDUCE_TRANSPARENCY_STORAGE_KEY)).toBe('true')
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

    fireEvent.click(screen.getByText('toggle'))

    expect(startViewTransition).toHaveBeenCalled()
    expect(screen.getByText('dark')).toBeInTheDocument()

    delete (document as any).startViewTransition
  })
})
