import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuidePage from '@/pages/guide/index';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const { mockUseGuideAccess, mockListGuideCheckpoints } = vi.hoisted(() => ({
  mockUseGuideAccess: vi.fn(),
  mockListGuideCheckpoints: vi.fn(),
}));

vi.mock('@/hooks/useGuideAccess', () => ({
  default: () => mockUseGuideAccess(),
}));

vi.mock('@/client', () => ({
  listGuideCheckpoints: (...args: unknown[]) => mockListGuideCheckpoints(...args),
}));

vi.mock('@/components/shared', () => ({
  LoadingState: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => <div>Navigate to {to}</div>,
}));

describe('GuidePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGuideCheckpoints.mockResolvedValue({ data: [] });
  });

  it('shows loading state while access is loading', () => {
    mockUseGuideAccess.mockReturnValue({ isAllowed: false, isLoading: true });
    renderWithClient(<GuidePage />);
    expect(screen.getByText('A carregar…')).toBeInTheDocument();
  });

  it('redirects home when not allowed', () => {
    mockUseGuideAccess.mockReturnValue({ isAllowed: false, isLoading: false });
    renderWithClient(<GuidePage />);
    expect(screen.getByText('Navigate to /')).toBeInTheDocument();
  });

  it('shows empty state when there are no checkpoints', async () => {
    mockUseGuideAccess.mockReturnValue({ isAllowed: true, isLoading: false });
    mockListGuideCheckpoints.mockResolvedValue({ data: [] });
    renderWithClient(<GuidePage />);
    expect(await screen.findByText('Sem postos disponíveis')).toBeInTheDocument();
  });

  it('renders checkpoint cards and expands to show media/indications', async () => {
    mockUseGuideAccess.mockReturnValue({ isAllowed: true, isLoading: false });
    mockListGuideCheckpoints.mockResolvedValue({
      data: [
        {
          id: 1,
          name: 'Checkpoint A',
          order: 1,
          latitude: 40.1,
          longitude: -8.4,
          description: 'A nice place',
          indications: [
            { id: 1, order: 1, hint: 'Look up', question: 'What color?', expected_answer: 'Blue' },
          ],
          media: [
            { id: 1, kind: 'photo', url: 'http://example.com/a.jpg', display_order: 1, caption: null },
            { id: 2, kind: 'fun_fact', caption: 'Fun fact here', display_order: 1 },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    renderWithClient(<GuidePage />);

    const button = await screen.findByText('Checkpoint A');
    expect(screen.getByText(/40.10000/)).toBeInTheDocument();

    await user.click(button);

    expect(screen.getByText('A nice place')).toBeInTheDocument();
    expect(screen.getByText('Look up')).toBeInTheDocument();
    expect(screen.getByText('What color?')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('Fun fact here')).toBeInTheDocument();

    const image = screen.getByAltText('Foto 1');
    await user.click(image.closest('button')!);
    expect(screen.getByLabelText('Fechar imagem ampliada')).toBeInTheDocument();
  });

  it('renders media empty state when a checkpoint has no media', async () => {
    mockUseGuideAccess.mockReturnValue({ isAllowed: true, isLoading: false });
    mockListGuideCheckpoints.mockResolvedValue({
      data: [
        {
          id: 2,
          name: 'Checkpoint B',
          order: 2,
          latitude: null,
          longitude: null,
          description: null,
          indications: [],
          media: [],
        },
      ],
    });
    const user = userEvent.setup();
    renderWithClient(<GuidePage />);

    const button = await screen.findByText('Checkpoint B');
    await user.click(button);
    expect(screen.getByText('Sem media disponível')).toBeInTheDocument();
  });
});
