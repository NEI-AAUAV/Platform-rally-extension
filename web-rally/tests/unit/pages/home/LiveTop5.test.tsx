import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LiveTop5 from '@/pages/home/LiveTop5';

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const { mockGetTeams, mockUseScoreboardStream, mockUseRallySettings } = vi.hoisted(() => ({
  mockGetTeams: vi.fn(),
  mockUseScoreboardStream: vi.fn(),
  mockUseRallySettings: vi.fn(),
}));

vi.mock('@/client', () => ({
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
}));

vi.mock('@/hooks/useScoreboardStream', () => ({
  default: (...args: unknown[]) => mockUseScoreboardStream(...args),
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children }: { to: string; params?: Record<string, string>; children: React.ReactNode }) => (
    <a href={`${to}${params ? `/${params.id}` : ''}`}>{children}</a>
  ),
}));

vi.mock('framer-motion', () => ({
  motion: {
    ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => <ol {...props}>{children}</ol>,
    li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => <li {...props}>{children}</li>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/shared', () => ({
  FreshnessIndicator: () => <div>Freshness</div>,
}));

describe('LiveTop5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({ settings: {} });
  });

  it('renders nothing when there are no teams', async () => {
    mockGetTeams.mockResolvedValue({ data: [] });
    const { container } = renderWithClient(<LiveTop5 />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.firstChild).toBeNull();
  });

  it('renders top 5 sorted teams', async () => {
    mockGetTeams.mockResolvedValue({
      data: [
        { id: 1, name: 'Team Beta', classification: 2, total: 50 },
        { id: 2, name: 'Team Alpha', classification: 1, total: 80 },
      ],
    });
    renderWithClient(<LiveTop5 />);
    expect(await screen.findByText('Team Alpha')).toBeInTheDocument();
    expect(screen.getByText('Team Beta')).toBeInTheDocument();
    expect(screen.getByText('Classificação ao vivo')).toBeInTheDocument();
  });
});
