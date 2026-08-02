import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import PWAInstallPrompt from '@/components/pwa/PWAInstallPrompt'

const DISMISS_LABEL = 'Dispensar sugestão de instalação'

/** jsdom reports Safari's vendor by default, so it has to be set per test. */
function setVendor(vendor: string) {
  Object.defineProperty(navigator, 'vendor', { value: vendor, configurable: true })
}

function dispatchBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string; platform: string }>
  }
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })
  window.dispatchEvent(event)
  return event
}

describe('PWAInstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
    setVendor('Google Inc.')
  })

  afterEach(() => {
    setVendor('Apple Computer, Inc.')
  })

  it('renders nothing on a Chromium browser until a beforeinstallprompt event fires', () => {
    const { container } = render(<PWAInstallPrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the install prompt after beforeinstallprompt fires', () => {
    render(<PWAInstallPrompt />)
    act(() => {
      dispatchBeforeInstallPrompt()
    })
    expect(screen.getByText('Instalar Rally Tascas')).toBeInTheDocument()
  })

  it('shows Add to Home Screen instructions on Apple browsers, which never fire the event', () => {
    setVendor('Apple Computer, Inc.')
    render(<PWAInstallPrompt />)
    expect(screen.getByText(/Adicionar ao/)).toBeInTheDocument()
    // Safari cannot be prompted programmatically, so there is no install button.
    expect(screen.queryByText('Instalar')).not.toBeInTheDocument()
  })

  it('renders nothing when already running standalone', () => {
    setVendor('Apple Computer, Inc.')
    const spy = vi.spyOn(globalThis, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === '(display-mode: standalone)',
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    )

    const { container } = render(<PWAInstallPrompt />)
    expect(container).toBeEmptyDOMElement()
    spy.mockRestore()
  })

  it('dismisses the prompt when "Agora não" is clicked and remembers it', () => {
    render(<PWAInstallPrompt />)
    act(() => {
      dispatchBeforeInstallPrompt()
    })
    fireEvent.click(screen.getByLabelText(DISMISS_LABEL))
    expect(screen.queryByText('Instalar Rally Tascas')).not.toBeInTheDocument()
    expect(localStorage.getItem('rally_install_prompt_dismissed')).toBe('true')
  })

  it('stays dismissed across mounts', () => {
    localStorage.setItem('rally_install_prompt_dismissed', 'true')
    const { container } = render(<PWAInstallPrompt />)
    act(() => {
      dispatchBeforeInstallPrompt()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('triggers the native install prompt and hides after choice', async () => {
    render(<PWAInstallPrompt />)
    let event: ReturnType<typeof dispatchBeforeInstallPrompt>
    act(() => {
      event = dispatchBeforeInstallPrompt()
    })

    fireEvent.click(screen.getByText('Instalar'))
    await event!.userChoice

    expect(event!.prompt).toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByText('Instalar Rally Tascas')).not.toBeInTheDocument(),
    )
  })

  it('removes the beforeinstallprompt listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<PWAInstallPrompt />)
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function))
    removeSpy.mockRestore()
  })
})
