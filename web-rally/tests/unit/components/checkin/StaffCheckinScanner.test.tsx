import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => ({
  staffCheckIn: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  onScan: undefined as ((data: string) => void) | undefined,
}))

vi.mock('@/services/CheckinService', () => ({
  CheckinService: { staffCheckIn: h.staffCheckIn },
}))

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => ({
    success: h.toastSuccess,
    error: h.toastError,
    warning: h.toastWarning,
    info: vi.fn(),
  }),
}))

vi.mock('@/components/qr/QRCodeScanner', () => ({
  default: ({ onScan }: { onScan: (data: string) => void }) => {
    h.onScan = onScan
    return <div data-testid="qr-scanner-stub" />
  },
}))

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    body: unknown
    constructor(status: number, body: unknown) {
      super('ApiError')
      this.status = status
      this.body = body
    }
  }
  return { MockApiError }
})

vi.mock('@/services/apiClient', () => ({
  ApiError: MockApiError,
}))

import { StaffCheckinScanner } from '@/components/checkin/StaffCheckinScanner'

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('StaffCheckinScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.onScan = undefined
  })

  it('renders the trigger button', () => {
    render(<StaffCheckinScanner checkpointId={1} />, { wrapper: createWrapper() })
    expect(screen.getByText('Ler QR da equipa')).toBeInTheDocument()
  })

  it('opens the scanner when the trigger is clicked', () => {
    render(<StaffCheckinScanner checkpointId={1} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    expect(screen.getByTestId('qr-scanner-stub')).toBeInTheDocument()
  })

  it('shows an error toast for an unrecognized scan format', () => {
    render(<StaffCheckinScanner checkpointId={1} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('not-a-valid-code')
    expect(h.toastError).toHaveBeenCalledWith('QR inválido. Aponta ao código da equipa.')
    expect(h.staffCheckIn).not.toHaveBeenCalled()
  })

  it('extracts the code from a raw ACCESS-CODE scan and submits it', async () => {
    h.staffCheckIn.mockResolvedValueOnce({
      status: 'checked_in',
      team_name: 'Team A',
      team_id: 1,
      checkpoint_order: 2,
    })
    const onTeamIdentified = vi.fn()

    render(
      <StaffCheckinScanner checkpointId={9} onTeamIdentified={onTeamIdentified} />,
      { wrapper: createWrapper() },
    )
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('abcd-1234')

    await waitFor(() => expect(h.staffCheckIn).toHaveBeenCalledWith('ABCD-1234', 9))
    await waitFor(() => expect(onTeamIdentified).toHaveBeenCalledWith(1))
    expect(h.toastSuccess).toHaveBeenCalledWith('Team A — chegada registada no posto 2.')
  })

  it('extracts the code from a login URL scan', async () => {
    h.staffCheckIn.mockResolvedValueOnce({
      status: 'already_present',
      team_name: 'Team B',
      team_id: 2,
      checkpoint_order: 1,
    })

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('https://example.com/rally/team-login?code=wxyz-9999')

    await waitFor(() => expect(h.staffCheckIn).toHaveBeenCalledWith('WXYZ-9999', 9))
    expect(h.toastSuccess).toHaveBeenCalledWith('Team B — já neste posto. A abrir avaliação.')
  })

  it('shows a warning toast when the team has not reached this checkpoint yet', async () => {
    h.staffCheckIn.mockResolvedValueOnce({
      status: 'not_arrived',
      team_name: 'Team C',
      team_id: 3,
      checkpoint_order: 1,
    })

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('ABCD-1234')

    await waitFor(() =>
      expect(h.toastWarning).toHaveBeenCalledWith(
        'Team C ainda não chegou a este posto (vem mais à frente).',
      ),
    )
  })

  it('shows an error toast with API detail when the check-in fails', async () => {
    h.staffCheckIn.mockRejectedValueOnce(new MockApiError(404, { detail: 'Equipa não encontrada' }))

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('ABCD-1234')

    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Equipa não encontrada'))
  })

  it('shows a generic error toast when the API error has no detail', async () => {
    h.staffCheckIn.mockRejectedValueOnce(new MockApiError(500, {}))

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('ABCD-1234')

    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith('Não foi possível identificar a equipa.'),
    )
  })

  it('ignores duplicate scans while a submission is in flight', async () => {
    let resolvePromise: (v: unknown) => void = () => {}
    h.staffCheckIn.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve
      }),
    )

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    act(() => {
      h.onScan?.('ABCD-1234')
    })
    act(() => {
      h.onScan?.('ABCD-1234')
    })

    await waitFor(() => expect(h.staffCheckIn).toHaveBeenCalledTimes(1))

    await act(async () => {
      resolvePromise({ status: 'checked_in', team_name: 'X', team_id: 1, checkpoint_order: 1 })
    })
  })

  it('shows a generic error toast when the error is not an ApiError', async () => {
    h.staffCheckIn.mockRejectedValueOnce(new Error('network down'))

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('ABCD-1234')

    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith('Não foi possível identificar a equipa.'),
    )
  })

  it('shows a generic error toast when ApiError detail is not a string', async () => {
    h.staffCheckIn.mockRejectedValueOnce(new MockApiError(500, { detail: { nested: true } }))

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('ABCD-1234')

    await waitFor(() =>
      expect(h.toastError).toHaveBeenCalledWith('Não foi possível identificar a equipa.'),
    )
  })

  it('handles a scan without a registered onTeamIdentified callback', async () => {
    h.staffCheckIn.mockResolvedValueOnce({
      status: 'checked_in',
      team_name: 'No Callback Team',
      team_id: 5,
      checkpoint_order: 3,
    })

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })
    fireEvent.click(screen.getByText('Ler QR da equipa'))
    h.onScan?.('ABCD-1234')

    await waitFor(() =>
      expect(h.toastSuccess).toHaveBeenCalledWith(
        'No Callback Team — chegada registada no posto 3.',
      ),
    )
    // Scanner should close after success
    expect(screen.queryByTestId('qr-scanner-stub')).not.toBeInTheDocument()
  })

  it('renders the recent scans list capped at 5 entries', async () => {
    for (let i = 0; i < 6; i++) {
      h.staffCheckIn.mockResolvedValueOnce({
        status: 'checked_in',
        team_name: `Team ${i}`,
        team_id: i,
        checkpoint_order: 1,
      })
    }

    render(<StaffCheckinScanner checkpointId={9} />, { wrapper: createWrapper() })

    for (let i = 0; i < 6; i++) {
      fireEvent.click(screen.getByText('Ler QR da equipa'))
      await act(async () => {
        h.onScan?.('ABCD-1234')
        await Promise.resolve()
      })
    }

    await waitFor(() => expect(screen.getByText('Team 5')).toBeInTheDocument())
    expect(screen.queryByText('Team 0')).not.toBeInTheDocument()
  })
})
