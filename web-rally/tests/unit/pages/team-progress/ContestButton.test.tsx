import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ContestButton from '@/pages/team-progress/ContestButton';
import { contestEvaluation } from '@/client';

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

vi.mock('@/client', () => ({
  contestEvaluation: vi.fn(),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('ContestButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the contest trigger', () => {
    render(<ContestButton resultId={1} />, { wrapper: createWrapper() });
    expect(screen.getByRole('button', { name: /Contestar/ })).toBeInTheDocument();
  });

  it('opens the dialog and shows activity-specific description', async () => {
    const user = userEvent.setup();
    render(<ContestButton resultId={1} activityName="Corrida" />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Contestar/ }));
    expect(screen.getByText(/discordas da avaliação de "Corrida"/)).toBeInTheDocument();
  });

  it('disables the submit button while the reason is empty', async () => {
    const user = userEvent.setup();
    render(<ContestButton resultId={1} />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Contestar/ }));
    expect(screen.getByRole('button', { name: /Enviar contestação/ })).toBeDisabled();
  });

  it('enables the submit button once a reason is typed and trimmed reason is used', async () => {
    const user = userEvent.setup();
    render(<ContestButton resultId={1} />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Contestar/ }));
    await user.type(screen.getByLabelText('Motivo da contestação'), '   ');
    expect(screen.getByRole('button', { name: /Enviar contestação/ })).toBeDisabled();
  });

  it('submits the reason and shows the contested state on success', async () => {
    vi.mocked(contestEvaluation).mockResolvedValue({} as never);
    const user = userEvent.setup();
    render(<ContestButton resultId={1} />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Contestar/ }));
    await user.type(screen.getByLabelText('Motivo da contestação'), 'Pontuação errada');
    await user.click(screen.getByRole('button', { name: /Enviar contestação/ }));

    await vi.waitFor(() => expect(screen.getByText('Contestado')).toBeInTheDocument());
    expect(contestEvaluation).toHaveBeenCalledWith({
      path: { result_id: 1 },
      body: { reason: 'Pontuação errada' },
    });
    expect(mockToast.success).toHaveBeenCalled();
  });

  it('shows an error toast when submission fails', async () => {
    vi.mocked(contestEvaluation).mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    render(<ContestButton resultId={1} />, { wrapper: createWrapper() });
    await user.click(screen.getByRole('button', { name: /Contestar/ }));
    await user.type(screen.getByLabelText('Motivo da contestação'), 'Razão');
    await user.click(screen.getByRole('button', { name: /Enviar contestação/ }));

    await vi.waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('nope'));
  });
});
