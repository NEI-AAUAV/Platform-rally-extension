import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CheckpointGuideIndicationsManager from '@/pages/admin/components/checkpoints/CheckpointGuideIndicationsManager';

const { mockListGuideIndications, mockCreateGuideIndication, mockDeleteGuideIndication, mockToast } =
  vi.hoisted(() => ({
    mockListGuideIndications: vi.fn(),
    mockCreateGuideIndication: vi.fn(),
    mockDeleteGuideIndication: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
  }));

vi.mock('@/client', () => ({
  listGuideIndications: (...args: unknown[]) => mockListGuideIndications(...args),
  createGuideIndication: (...args: unknown[]) => mockCreateGuideIndication(...args),
  deleteGuideIndication: (...args: unknown[]) => mockDeleteGuideIndication(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

function renderWithClient(checkpointId = 5) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CheckpointGuideIndicationsManager checkpointId={checkpointId} />
    </QueryClientProvider>,
  );
}

const indication = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  hint: 'Look at the statue',
  question: null,
  expected_answer: null,
  order: 0,
  ...overrides,
});

describe('CheckpointGuideIndicationsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGuideIndications.mockResolvedValue({ data: [] });
    mockCreateGuideIndication.mockResolvedValue({ data: indication() });
    mockDeleteGuideIndication.mockResolvedValue({ data: {} });
  });

  it('renders zero-count header when there are no indications', async () => {
    renderWithClient();
    expect(await screen.findByText('(0)')).toBeInTheDocument();
    expect(screen.getByText('Indicações do guia')).toBeInTheDocument();
  });

  it('renders a list of indications with question and expected answer', async () => {
    mockListGuideIndications.mockResolvedValue({
      data: [
        indication({
          id: 1,
          hint: 'Look up',
          question: 'What do you see?',
          expected_answer: 'The sky',
        }),
      ],
    });
    renderWithClient();
    expect(await screen.findByText('Look up')).toBeInTheDocument();
    expect(screen.getByText('What do you see?')).toBeInTheDocument();
    expect(screen.getByText('The sky')).toBeInTheDocument();
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('renders multiple indications without question/expected answer paragraphs when absent', async () => {
    mockListGuideIndications.mockResolvedValue({
      data: [
        indication({ id: 1, hint: 'First hint' }),
        indication({ id: 2, hint: 'Second hint' }),
      ],
    });
    renderWithClient();
    expect(await screen.findByText('First hint')).toBeInTheDocument();
    expect(screen.getByText('Second hint')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('keeps the add button disabled until a hint is typed', async () => {
    renderWithClient();
    await screen.findByText('(0)');
    const addButton = screen.getByText('Adicionar indicação').closest('button')!;
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/Indicação a dar à equipa/), {
      target: { value: 'A new hint' },
    });
    expect(addButton).not.toBeDisabled();
  });

  it('does not submit when hint is only whitespace', async () => {
    renderWithClient();
    await screen.findByText('(0)');
    fireEvent.change(screen.getByPlaceholderText(/Indicação a dar à equipa/), {
      target: { value: '   ' },
    });
    const addButton = screen.getByText('Adicionar indicação').closest('button')!;
    expect(addButton).toBeDisabled();
  });

  it('adds a new indication with hint, question and expected answer, resetting the form', async () => {
    renderWithClient(7);
    await screen.findByText('(0)');

    fireEvent.change(screen.getByPlaceholderText(/Indicação a dar à equipa/), {
      target: { value: 'New hint' },
    });
    fireEvent.change(screen.getByPlaceholderText('Pergunta (opcional)'), {
      target: { value: 'A question' },
    });
    fireEvent.change(screen.getByPlaceholderText('Resposta esperada (opcional)'), {
      target: { value: 'An answer' },
    });

    fireEvent.click(screen.getByText('Adicionar indicação'));

    await waitFor(() =>
      expect(mockCreateGuideIndication).toHaveBeenCalledWith({
        path: { checkpoint_id: 7 },
        body: {
          hint: 'New hint',
          question: 'A question',
          expected_answer: 'An answer',
          order: 0,
        },
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Indicação adicionada!'));

    await waitFor(() =>
      expect((screen.getByPlaceholderText(/Indicação a dar à equipa/) as HTMLInputElement).value).toBe(''),
    );
  });

  it('computes the next order as max existing order + 1', async () => {
    mockListGuideIndications.mockResolvedValue({
      data: [indication({ id: 1, order: 2 }), indication({ id: 2, order: 5 })],
    });
    renderWithClient(3);
    await screen.findByText('(2)');

    fireEvent.change(screen.getByPlaceholderText(/Indicação a dar à equipa/), {
      target: { value: 'Another hint' },
    });
    fireEvent.click(screen.getByText('Adicionar indicação'));

    await waitFor(() =>
      expect(mockCreateGuideIndication).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ order: 6 }) }),
      ),
    );
  });

  it('sends null for empty question and expected answer', async () => {
    renderWithClient();
    await screen.findByText('(0)');
    fireEvent.change(screen.getByPlaceholderText(/Indicação a dar à equipa/), {
      target: { value: 'Just a hint' },
    });
    fireEvent.click(screen.getByText('Adicionar indicação'));

    await waitFor(() =>
      expect(mockCreateGuideIndication).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ question: null, expected_answer: null }),
        }),
      ),
    );
  });

  it('shows an error toast when adding an indication fails', async () => {
    mockCreateGuideIndication.mockRejectedValue(new Error('create failed'));
    renderWithClient();
    await screen.findByText('(0)');
    fireEvent.change(screen.getByPlaceholderText(/Indicação a dar à equipa/), {
      target: { value: 'Hint' },
    });
    fireEvent.click(screen.getByText('Adicionar indicação'));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('create failed'));
  });

  it('deletes an indication and shows a success toast', async () => {
    mockListGuideIndications.mockResolvedValue({ data: [indication({ id: 42 })] });
    renderWithClient();
    await screen.findByText('Look at the statue');

    fireEvent.click(screen.getByLabelText(/^Remover indicação/));

    await waitFor(() => expect(mockDeleteGuideIndication).toHaveBeenCalledWith({ path: { indication_id: 42 } }));
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Removido.'));
  });

  it('shows an error toast when deleting an indication fails', async () => {
    mockListGuideIndications.mockResolvedValue({ data: [indication({ id: 42 })] });
    mockDeleteGuideIndication.mockRejectedValue(new Error('delete failed'));
    renderWithClient();
    await screen.findByText('Look at the statue');

    fireEvent.click(screen.getByLabelText(/^Remover indicação/));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('delete failed'));
  });

  it('handles a missing indications payload gracefully', async () => {
    mockListGuideIndications.mockResolvedValue({ data: undefined });
    renderWithClient();
    expect(await screen.findByText('(0)')).toBeInTheDocument();
  });
});
