import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import PWAInstallPrompt from '@/components/PWAInstallPrompt'

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
  it('renders nothing until a beforeinstallprompt event fires', () => {
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

  it('dismisses the prompt when "Agora não" is clicked', () => {
    render(<PWAInstallPrompt />)
    act(() => {
      dispatchBeforeInstallPrompt()
    })
    fireEvent.click(screen.getByLabelText('Dismiss install prompt'))
    expect(screen.queryByText('Instalar Rally Tascas')).not.toBeInTheDocument()
  })

  it('triggers the native install prompt and hides after choice', async () => {
    render(<PWAInstallPrompt />)
    let event: ReturnType<typeof dispatchBeforeInstallPrompt>
    act(() => {
      event = dispatchBeforeInstallPrompt()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Instalar'))
      await event!.userChoice
    })

    expect(event!.prompt).toHaveBeenCalled()
    expect(screen.queryByText('Instalar Rally Tascas')).not.toBeInTheDocument()
  })

  it('removes the beforeinstallprompt listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<PWAInstallPrompt />)
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('does not show the prompt again after being dismissed and re-triggering handleInstallClick indirectly', () => {
    render(<PWAInstallPrompt />)
    act(() => {
      dispatchBeforeInstallPrompt()
    })
    fireEvent.click(screen.getByLabelText('Dismiss install prompt'))
    // deferredPrompt is now null; component should render nothing
    expect(screen.queryByText('Instalar')).not.toBeInTheDocument()
  })
})
