import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeferredJudgingTab from '@/pages/admin/components/judging/DeferredJudgingTab';

const { mockListPendingJudgments, mockJudgeDeferredResult } = vi.hoisted(() => ({
  mockListPendingJudgments: vi.fn(),
  mockJudgeDeferredResult: vi.fn(),
}));

vi.mock('@/client', () => ({
  listPendingJudgments: (...args: unknown[]) => mockListPendingJudgments(...args),
  judgeDeferredResult: (...args: unknown[]) => mockJudgeDeferredResult(...args),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const pendingResult = (overrides: Partial<any> = {}) => ({
  id: 1,
  team_id: 10,
  activity_id: 20,
  media_urls: [],
  ...overrides,
});

describe('DeferredJudgingTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJudgeDeferredResult.mockResolvedValue({ data: {} });
  });

  it('shows loading state initially', () => {
    mockListPendingJudgments.mockReturnValue(new Promise(() => {}));
    renderWithClient(<DeferredJudgingTab />);
    expect(screen.getByText('A carregar julgamentos pendentes…')).toBeInTheDocument();
  });

  it('shows empty state when no pending judgments', async () => {
    mockListPendingJudgments.mockResolvedValue({ data: [] });
    renderWithClient(<DeferredJudgingTab />);
    expect(await screen.findByText('Sem julgamentos pendentes')).toBeInTheDocument();
  });

  it('renders a single pending result without media', async () => {
    mockListPendingJudgments.mockResolvedValue({ data: [pendingResult()] });
    renderWithClient(<DeferredJudgingTab />);
    expect(await screen.findByText('Equipa #10 — Atividade #20')).toBeInTheDocument();
    expect(screen.getByText('Sem fotos anexadas')).toBeInTheDocument();
  });

  it('renders many pending results with media thumbnails', async () => {
    mockListPendingJudgments.mockResolvedValue({
      data: [
        pendingResult({ id: 1, media_urls: ['https://x/1.png'] }),
        pendingResult({ id: 2, team_id: 11 }),
      ],
    });
    renderWithClient(<DeferredJudgingTab />);
    expect(await screen.findByText('Resultado #1')).toBeInTheDocument();
    expect(screen.getByText('Resultado #2')).toBeInTheDocument();
    expect(screen.getByAltText('Foto 1')).toBeInTheDocument();
  });

  it('opens judging form and submits a valid score', async () => {
    mockListPendingJudgments.mockResolvedValue({ data: [pendingResult()] });
    renderWithClient(<DeferredJudgingTab />);
    fireEvent.click(await screen.findByText('Julgar'));
    fireEvent.change(screen.getByPlaceholderText('0–100'), { target: { value: '80' } });
    fireEvent.change(screen.getByPlaceholderText('Observações…'), { target: { value: 'good job' } });
    fireEvent.click(screen.getByText('Confirmar'));
    await waitFor(() =>
      expect(mockJudgeDeferredResult).toHaveBeenCalledWith({
        path: { result_id: 1 },
        body: { points: 80, notes: 'good job' },
      }),
    );
  });

  it('disables confirm button while points are empty', async () => {
    mockListPendingJudgments.mockResolvedValue({ data: [pendingResult()] });
    renderWithClient(<DeferredJudgingTab />);
    fireEvent.click(await screen.findByText('Julgar'));
    expect(screen.getByText('Confirmar')).toBeDisabled();
  });

  it('cancels judging form', async () => {
    mockListPendingJudgments.mockResolvedValue({ data: [pendingResult()] });
    renderWithClient(<DeferredJudgingTab />);
    fireEvent.click(await screen.findByText('Julgar'));
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByPlaceholderText('0–100')).not.toBeInTheDocument();
  });

  it('shows error message when judge mutation fails', async () => {
    mockListPendingJudgments.mockResolvedValue({ data: [pendingResult()] });
    mockJudgeDeferredResult.mockRejectedValue(new Error('fail'));
    renderWithClient(<DeferredJudgingTab />);
    fireEvent.click(await screen.findByText('Julgar'));
    fireEvent.change(screen.getByPlaceholderText('0–100'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Confirmar'));
    expect(await screen.findByText('Erro ao submeter julgamento. Tenta novamente.')).toBeInTheDocument();
  });
});
