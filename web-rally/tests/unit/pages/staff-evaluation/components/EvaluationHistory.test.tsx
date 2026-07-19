import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EvaluationHistory from '@/pages/staff-evaluation/components/EvaluationHistory';

const { mockGetEvaluationHistory } = vi.hoisted(() => ({
  mockGetEvaluationHistory: vi.fn(),
}));

vi.mock('@/client', () => ({
  getEvaluationHistory: mockGetEvaluationHistory,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('EvaluationHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    mockGetEvaluationHistory.mockReturnValue(new Promise(() => {}));
    renderWithClient(<EvaluationHistory resultId={1} />);
    expect(screen.getByText('A carregar histórico…')).toBeInTheDocument();
  });

  it('shows error state', async () => {
    mockGetEvaluationHistory.mockRejectedValue(new Error('fail'));
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar o histórico.')).toBeInTheDocument(),
    );
  });

  it('shows empty state', async () => {
    mockGetEvaluationHistory.mockResolvedValue({ data: [] });
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() =>
      expect(
        screen.getByText('Sem alterações registadas — avaliação nunca foi editada nem contestada.'),
      ).toBeInTheDocument(),
    );
  });

  it('renders edit entries with changes', async () => {
    mockGetEvaluationHistory.mockResolvedValue({
      data: [
        {
          id: 1,
          action: 'edited',
          editor_name: 'Jane',
          created_at: '2024-01-01T10:00:00Z',
          changes: { final_score: { before: 1, after: 2 } },
        },
      ],
    });
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() => expect(screen.getByText('Edição')).toBeInTheDocument());
    expect(screen.getByText(/Jane/)).toBeInTheDocument();
    expect(screen.getByText('Pontuação final:')).toBeInTheDocument();
  });

  it('renders contested entries with notes', async () => {
    mockGetEvaluationHistory.mockResolvedValue({
      data: [
        {
          id: 2,
          action: 'contested',
          editor_name: 'John',
          created_at: '2024-01-01T10:00:00Z',
          note: 'This looks wrong',
        },
      ],
    });
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() => expect(screen.getByText('Contestação')).toBeInTheDocument());
    expect(screen.getByText(/This looks wrong/)).toBeInTheDocument();
  });

  it('renders contested entries without a note', async () => {
    mockGetEvaluationHistory.mockResolvedValue({
      data: [
        {
          id: 3,
          action: 'contested',
          editor_name: 'John',
          created_at: '2024-01-01T10:00:00Z',
        },
      ],
    });
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() => expect(screen.getByText('Contestação')).toBeInTheDocument());
  });

  it('falls back to "desconhecido" when editor_name is missing', async () => {
    mockGetEvaluationHistory.mockResolvedValue({
      data: [
        {
          id: 4,
          action: 'edited',
          created_at: '2024-01-01T10:00:00Z',
          changes: { unknown_field: { before: 'a', after: 'b' } },
        },
      ],
    });
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() => expect(screen.getByText(/desconhecido/)).toBeInTheDocument());
    // unknown_field has no label mapping, so falls back to raw field name
    expect(screen.getByText('unknown_field:')).toBeInTheDocument();
  });

  it('formats null, object, and primitive diff values', async () => {
    mockGetEvaluationHistory.mockResolvedValue({
      data: [
        {
          id: 5,
          action: 'edited',
          editor_name: 'Jane',
          created_at: '2024-01-01T10:00:00Z',
          changes: {
            result_data: { before: null, after: { foo: 'bar' } },
            extra_shots: { before: 1, after: 3 },
          },
        },
      ],
    });
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() => expect(screen.getByText('Dados:')).toBeInTheDocument());
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('{"foo":"bar"}')).toBeInTheDocument();
  });

  it('handles a changes entry whose diff is not an object', async () => {
    mockGetEvaluationHistory.mockResolvedValue({
      data: [
        {
          id: 6,
          action: 'edited',
          editor_name: 'Jane',
          created_at: '2024-01-01T10:00:00Z',
          changes: { penalties: 'not-an-object' },
        },
      ],
    });
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() => expect(screen.getByText('Penalizações:')).toBeInTheDocument());
  });

  it('handles missing data by defaulting to empty entries list', async () => {
    mockGetEvaluationHistory.mockResolvedValue({ data: undefined });
    renderWithClient(<EvaluationHistory resultId={1} />);
    await waitFor(() =>
      expect(
        screen.getByText('Sem alterações registadas — avaliação nunca foi editada nem contestada.'),
      ).toBeInTheDocument(),
    );
  });
});
