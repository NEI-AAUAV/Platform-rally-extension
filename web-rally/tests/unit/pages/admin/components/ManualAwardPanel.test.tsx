import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ManualAwardPanel from '@/pages/admin/components/badges/ManualAwardPanel';

const { mockGetTeams, mockUseBadgeAwardMutations, mockUseTeamBadges, mockAwardMutate } = vi.hoisted(() => ({
  mockGetTeams: vi.fn(),
  mockUseBadgeAwardMutations: vi.fn(),
  mockUseTeamBadges: vi.fn(),
  mockAwardMutate: vi.fn(),
}));

vi.mock('@/client', () => ({
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
}));

vi.mock('@/hooks/useBadgeAdmin', () => ({
  useBadgeAwardMutations: () => mockUseBadgeAwardMutations(),
}));

vi.mock('@/hooks/useBadges', () => ({
  useTeamBadges: (id: number | undefined) => mockUseTeamBadges(id),
}));

vi.mock('@/lib/apiError', () => ({
  apiErrorMessage: (_err: unknown, fallback: string) => fallback,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const definitions = [
  { id: 1, code: 'EXPLORER', name: 'Explorer' },
  { id: 2, code: 'SPEEDY', name: 'Speedy' },
] as any;

describe('ManualAwardPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false;
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    mockGetTeams.mockResolvedValue({ data: [{ id: 100, name: 'Team A' }] });
    mockUseBadgeAwardMutations.mockReturnValue({
      award: { mutate: mockAwardMutate, isPending: false, isError: false, error: null },
      revoke: { mutate: vi.fn() },
    });
    mockUseTeamBadges.mockReturnValue({ data: [] });
  });

  it('renders without crashing', async () => {
    renderWithClient(<ManualAwardPanel definitions={definitions} />);
    expect(screen.getByText('Atribuição manual')).toBeInTheDocument();
  });

  it('disables award button until team and badge selected', () => {
    renderWithClient(<ManualAwardPanel definitions={definitions} />);
    expect(screen.getByText('Atribuir crachá').closest('button')).toBeDisabled();
  });

  it('shows award error message', () => {
    mockUseBadgeAwardMutations.mockReturnValue({
      award: { mutate: mockAwardMutate, isPending: false, isError: true, error: new Error('x') },
      revoke: { mutate: vi.fn() },
    });
    renderWithClient(<ManualAwardPanel definitions={definitions} />);
    expect(screen.getByText('Erro ao atribuir.')).toBeInTheDocument();
  });

  it('does not show revoke list when no team selected', () => {
    mockUseTeamBadges.mockReturnValue({
      data: [{ id: 500, badge_type: 'EXPLORER' }],
    });
    renderWithClient(<ManualAwardPanel definitions={definitions} />);
    expect(screen.queryByText('Crachás desta equipa')).not.toBeInTheDocument();
  });

  it('renders combobox triggers for team and badge selection', async () => {
    renderWithClient(<ManualAwardPanel definitions={definitions} />);
    const comboboxes = await screen.findAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);
  });

  it('renders empty definitions gracefully', () => {
    renderWithClient(<ManualAwardPanel definitions={[]} />);
    expect(screen.getByText('Atribuição manual')).toBeInTheDocument();
  });

  it('renders many definitions', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      code: `CODE${i}`,
      name: `Badge ${i}`,
    }));
    renderWithClient(<ManualAwardPanel definitions={many as any} />);
    expect(screen.getByText('Atribuição manual')).toBeInTheDocument();
  });

  it('selects a team and badge then calls award mutate on click', async () => {
    const user = userEvent.setup();
    renderWithClient(<ManualAwardPanel definitions={definitions} />);

    const comboboxes = await screen.findAllByRole('combobox');
    const [teamTrigger, badgeTrigger] = comboboxes;

    await user.click(teamTrigger!);
    const teamOption = await screen.findByText('Team A');
    await user.click(teamOption);

    await user.click(badgeTrigger!);
    const badgeOption = await screen.findByText('Explorer');
    await user.click(badgeOption);

    const awardButton = screen.getByText('Atribuir crachá').closest('button')!;
    expect(awardButton).not.toBeDisabled();

    fireEvent.click(awardButton);
    expect(mockAwardMutate).toHaveBeenCalledWith({ team_id: 100, badge_code: 'EXPLORER' });
  });

  it('shows revoke list and revokes a badge on confirm', async () => {
    const mockRevokeMutate = vi.fn();
    mockUseBadgeAwardMutations.mockReturnValue({
      award: { mutate: mockAwardMutate, isPending: false, isError: false, error: null },
      revoke: { mutate: mockRevokeMutate },
    });
    mockUseTeamBadges.mockReturnValue({
      data: [{ id: 500, badge_type: 'EXPLORER' }],
    });

    const user = userEvent.setup();
    renderWithClient(<ManualAwardPanel definitions={definitions} />);

    const comboboxes = await screen.findAllByRole('combobox');
    const [teamTrigger] = comboboxes;
    await user.click(teamTrigger!);
    const teamOption = await screen.findByText('Team A');
    await user.click(teamOption);

    expect(await screen.findByText('Crachás desta equipa')).toBeInTheDocument();
    expect(screen.getByText('Explorer')).toBeInTheDocument();

    const revokeTrigger = screen.getByTitle('Revogar');
    await user.click(revokeTrigger);

    expect(await screen.findByText('Revogar crachá?')).toBeInTheDocument();
    const confirmButton = screen.getByText('Revogar', { selector: 'button' });
    fireEvent.click(confirmButton);

    expect(mockRevokeMutate).toHaveBeenCalledWith(500);
  });

  it('falls back to raw badge_type when definition not found for revoke list', async () => {
    mockUseTeamBadges.mockReturnValue({
      data: [{ id: 501, badge_type: 'UNKNOWN_CODE' }],
    });

    const user = userEvent.setup();
    renderWithClient(<ManualAwardPanel definitions={definitions} />);

    const comboboxes = await screen.findAllByRole('combobox');
    await user.click(comboboxes[0]!);
    const teamOption = await screen.findByText('Team A');
    await user.click(teamOption);

    expect(await screen.findByText('UNKNOWN_CODE')).toBeInTheDocument();
  });

  it('does not call award mutate when required fields are missing', () => {
    renderWithClient(<ManualAwardPanel definitions={definitions} />);
    const awardButton = screen.getByText('Atribuir crachá').closest('button')!;
    fireEvent.click(awardButton);
    expect(mockAwardMutate).not.toHaveBeenCalled();
  });
});
