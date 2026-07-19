import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CheckpointMediaManager from '@/pages/admin/components/CheckpointMediaManager';

const {
  mockListCheckpointMedia,
  mockCreateCheckpointMedia,
  mockDeleteCheckpointMedia,
  mockToast,
} = vi.hoisted(() => ({
  mockListCheckpointMedia: vi.fn(),
  mockCreateCheckpointMedia: vi.fn(),
  mockDeleteCheckpointMedia: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/client', () => ({
  listCheckpointMedia: (...args: unknown[]) => mockListCheckpointMedia(...args),
  createCheckpointMedia: (...args: unknown[]) => mockCreateCheckpointMedia(...args),
  deleteCheckpointMedia: (...args: unknown[]) => mockDeleteCheckpointMedia(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

vi.mock('@/components/themes/bloody', () => ({
  BloodyButton: (props: React.ComponentProps<'button'>) => <button {...props} />,
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const mediaItem = (overrides: Partial<any> = {}) => ({
  id: 1,
  kind: 'photo',
  caption: null,
  image_url: 'https://x/1.png',
  ...overrides,
});

describe('CheckpointMediaManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateCheckpointMedia.mockResolvedValue({ data: {} });
    mockDeleteCheckpointMedia.mockResolvedValue({ data: {} });
  });

  it('shows loading state while fetching media', () => {
    mockListCheckpointMedia.mockReturnValue(new Promise(() => {}));
    renderWithClient(<CheckpointMediaManager checkpointId={1} />);
    expect(screen.getByText('A carregar…')).toBeInTheDocument();
  });

  it('shows empty state when no photos exist', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    renderWithClient(<CheckpointMediaManager checkpointId={1} />);
    expect(
      await screen.findByText('Ainda sem fotos. Envie a primeira para a equipa adivinhar o sítio.'),
    ).toBeInTheDocument();
  });

  it('renders photos and fun facts counts', async () => {
    mockListCheckpointMedia.mockResolvedValue({
      data: [
        mediaItem({ id: 1, caption: 'Nice spot' }),
        mediaItem({ id: 2, kind: 'fun_fact', caption: 'Built in 1890', image_url: null }),
      ],
    });
    renderWithClient(<CheckpointMediaManager checkpointId={5} />);
    expect(await screen.findByText('Nice spot')).toBeInTheDocument();
    expect(screen.getByText('Built in 1890')).toBeInTheDocument();
    expect(screen.getAllByText('(1)')).toHaveLength(2);
  });

  it('uploads a photo when a file is selected', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    const { container } = renderWithClient(<CheckpointMediaManager checkpointId={3} />);
    await screen.findByText('Ainda sem fotos. Envie a primeira para a equipa adivinhar o sítio.');

    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 3 },
        body: { kind: 'photo', caption: null, image: file },
      }),
    );
    await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Foto do sítio adicionada!'));
  });

  it('shows error toast when photo upload fails', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    mockCreateCheckpointMedia.mockRejectedValue(new Error('boom'));
    const { container } = renderWithClient(<CheckpointMediaManager checkpointId={3} />);
    await screen.findByText('Ainda sem fotos. Envie a primeira para a equipa adivinhar o sítio.');

    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it('adds a fun fact via button click', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    renderWithClient(<CheckpointMediaManager checkpointId={7} />);
    await screen.findByText('Ainda sem fotos. Envie a primeira para a equipa adivinhar o sítio.');

    const input = screen.getByPlaceholderText('Ex: Este edifício foi construído em 1890…');
    fireEvent.change(input, { target: { value: 'Fun fact here' } });
    fireEvent.click(screen.getByText('Adicionar'));

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 7 },
        body: { kind: 'fun_fact', caption: 'Fun fact here' },
      }),
    );
  });

  it('adds a fun fact via Enter key', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    renderWithClient(<CheckpointMediaManager checkpointId={7} />);
    await screen.findByText('Ainda sem fotos. Envie a primeira para a equipa adivinhar o sítio.');

    const input = screen.getByPlaceholderText('Ex: Este edifício foi construído em 1890…');
    fireEvent.change(input, { target: { value: 'Enter fact' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 7 },
        body: { kind: 'fun_fact', caption: 'Enter fact' },
      }),
    );
  });

  it('does not add a fun fact when input is blank/whitespace', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    renderWithClient(<CheckpointMediaManager checkpointId={7} />);
    await screen.findByText('Ainda sem fotos. Envie a primeira para a equipa adivinhar o sítio.');

    const input = screen.getByPlaceholderText('Ex: Este edifício foi construído em 1890…');
    fireEvent.change(input, { target: { value: '   ' } });
    expect(screen.getByText('Adicionar').closest('button')).toBeDisabled();
    fireEvent.click(screen.getByText('Adicionar'));
    expect(mockCreateCheckpointMedia).not.toHaveBeenCalled();
  });

  it('deletes a photo when the remove button is clicked', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [mediaItem({ id: 9 })] });
    renderWithClient(<CheckpointMediaManager checkpointId={2} />);
    const removeBtn = await screen.findByLabelText('Remover foto');
    fireEvent.click(removeBtn);
    await waitFor(() =>
      expect(mockDeleteCheckpointMedia).toHaveBeenCalledWith({ path: { media_id: 9 } }),
    );
  });

  it('deletes a fun fact when the remove button is clicked', async () => {
    mockListCheckpointMedia.mockResolvedValue({
      data: [mediaItem({ id: 11, kind: 'fun_fact', caption: 'Old fact', image_url: null })],
    });
    renderWithClient(<CheckpointMediaManager checkpointId={2} />);
    const removeBtn = await screen.findByLabelText('Remover curiosidade');
    fireEvent.click(removeBtn);
    await waitFor(() =>
      expect(mockDeleteCheckpointMedia).toHaveBeenCalledWith({ path: { media_id: 11 } }),
    );
  });

  it('shows error toast when delete fails', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [mediaItem({ id: 9 })] });
    mockDeleteCheckpointMedia.mockRejectedValue(new Error('fail'));
    renderWithClient(<CheckpointMediaManager checkpointId={2} />);
    const removeBtn = await screen.findByLabelText('Remover foto');
    fireEvent.click(removeBtn);
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });

  it('includes photo caption when uploading', async () => {
    mockListCheckpointMedia.mockResolvedValue({ data: [] });
    const { container } = renderWithClient(<CheckpointMediaManager checkpointId={4} />);
    await screen.findByText('Ainda sem fotos. Envie a primeira para a equipa adivinhar o sítio.');

    fireEvent.change(screen.getByPlaceholderText('Legenda (opcional)'), {
      target: { value: 'Sunset view' },
    });
    const file = new File(['data'], 'photo.png', { type: 'image/png' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(mockCreateCheckpointMedia).toHaveBeenCalledWith({
        path: { checkpoint_id: 4 },
        body: { kind: 'photo', caption: 'Sunset view', image: file },
      }),
    );
  });
});
