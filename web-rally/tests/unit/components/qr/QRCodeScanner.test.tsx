import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const h = vi.hoisted(() => ({
  isActive: false,
  startScanning: vi.fn(),
  stopScanning: vi.fn(),
}))

vi.mock('@/hooks/useQRCodeScanner', () => ({
  useQRCodeScanner: () => ({
    isActive: h.isActive,
    startScanning: h.startScanning,
    stopScanning: h.stopScanning,
  }),
}))

import QRCodeScanner from '@/components/qr/QRCodeScanner'

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(impl) },
    writable: true,
    configurable: true,
  })
}

describe('QRCodeScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.isActive = false
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<QRCodeScanner onScan={vi.fn()} isOpen={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('requests camera access and shows the video element when opened', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
    mockGetUserMedia(async () => stream)

    render(<QRCodeScanner onScan={vi.fn()} isOpen />)

    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())
    expect(screen.getByText(/Alinhe o código QR/)).toBeInTheDocument()
  })

  it('shows a permission-denied message when access is rejected', async () => {
    mockGetUserMedia(async () => {
      throw new DOMException('denied', 'NotAllowedError')
    })

    render(<QRCodeScanner onScan={vi.fn()} isOpen />)

    await waitFor(() => expect(screen.getByText('Permissão Negada')).toBeInTheDocument())
  })

  it('shows a not-found message when no camera is available', async () => {
    mockGetUserMedia(async () => {
      throw new DOMException('none', 'NotFoundError')
    })

    render(<QRCodeScanner onScan={vi.fn()} isOpen />)

    await waitFor(() =>
      expect(screen.getByText('Nenhuma câmara disponível no dispositivo.')).toBeInTheDocument(),
    )
  })

  it('shows a generic error message for unknown camera errors', async () => {
    mockGetUserMedia(async () => {
      throw new Error('boom')
    })

    render(<QRCodeScanner onScan={vi.fn()} isOpen />)

    await waitFor(() =>
      expect(
        screen.getByText('Não foi possível aceder à câmara. Tente novamente.'),
      ).toBeInTheDocument(),
    )
  })

  it('calls onClose when the close button is clicked', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
    mockGetUserMedia(async () => stream)
    const onClose = vi.fn()

    render(<QRCodeScanner onScan={vi.fn()} isOpen onClose={onClose} />)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('Close QR code scanner'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the footer cancel button is clicked', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
    mockGetUserMedia(async () => stream)
    const onClose = vi.fn()

    render(<QRCodeScanner onScan={vi.fn()} isOpen onClose={onClose} />)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())

    fireEvent.click(screen.getByText('Cancelar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the scanning overlay when isActive is true', async () => {
    h.isActive = true
    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
    mockGetUserMedia(async () => stream)

    const { container } = render(<QRCodeScanner onScan={vi.fn()} isOpen />)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())

    await act(async () => {})
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('starts scanning once the video metadata is loaded and play succeeds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
    mockGetUserMedia(async () => stream)

    render(<QRCodeScanner onScan={vi.fn()} isOpen />)

    await act(async () => {
      await Promise.resolve()
    })

    const video = document.querySelector('video') as HTMLVideoElement
    video.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      video.onloadedmetadata?.(new Event('loadedmetadata'))
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(h.startScanning).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('shows a camera error when video.play() rejects', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
    mockGetUserMedia(async () => stream)

    render(<QRCodeScanner onScan={vi.fn()} isOpen />)

    await act(async () => {
      await Promise.resolve()
    })

    const video = document.querySelector('video') as HTMLVideoElement
    video.play = vi.fn().mockRejectedValue(new Error('play failed'))

    await act(async () => {
      video.onloadedmetadata?.(new Event('loadedmetadata'))
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => expect(screen.getByText('Erro ao iniciar câmara')).toBeInTheDocument())
  })

  it('stops existing tracks and does not render video when unmounted before getUserMedia resolves', async () => {
    let resolveStream: (s: MediaStream) => void = () => {}
    const stopTrack = vi.fn()
    mockGetUserMedia(
      () =>
        new Promise((resolve) => {
          resolveStream = resolve
        }),
    )

    const { unmount } = render(<QRCodeScanner onScan={vi.fn()} isOpen />)
    unmount()

    await act(async () => {
      resolveStream({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream)
      await Promise.resolve()
    })

    expect(stopTrack).toHaveBeenCalled()
  })

  it('stops media tracks on close when srcObject is set', async () => {
    const stopTrack = vi.fn()
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream
    mockGetUserMedia(async () => stream)
    const onClose = vi.fn()

    render(<QRCodeScanner onScan={vi.fn()} isOpen onClose={onClose} />)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())

    const video = document.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'srcObject', { value: stream, writable: true, configurable: true })

    fireEvent.click(screen.getByText('Cancelar'))
    expect(onClose).toHaveBeenCalled()
    expect(stopTrack).toHaveBeenCalled()
  })

  it('renders without a close callback and still stops the camera', async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
    mockGetUserMedia(async () => stream)

    render(<QRCodeScanner onScan={vi.fn()} isOpen />)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())

    fireEvent.click(screen.getByLabelText('Close QR code scanner'))
    expect(h.stopScanning).toHaveBeenCalled()
  })

  it('applies a custom className to the wrapper', () => {
    const { container } = render(
      <QRCodeScanner onScan={vi.fn()} isOpen className="my-custom-class" />,
    )
    expect(container.querySelector('.my-custom-class')).toBeInTheDocument()
  })
})
