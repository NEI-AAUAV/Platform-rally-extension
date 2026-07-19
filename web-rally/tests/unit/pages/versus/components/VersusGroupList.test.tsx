import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import VersusGroupList from '@/pages/versus/components/VersusGroupList';
import type { ListingTeam, VersusGroupListResponse } from '@/client';

const { mockUseMutation, mockUpdateTeam } = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
  mockUpdateTeam: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

vi.mock('@/client', () => ({
  updateTeam: mockUpdateTeam,
}));

const teams = [
  { id: 1, name: 'Team A', total: 10, versus_group_id: 1 },
  { id: 2, name: 'Team B', total: 5, versus_group_id: 1 },
] as ListingTeam[];

const versusGroups = {
  groups: [{ group_id: 1, team_a_id: 1, team_b_id: 2 }],
} as VersusGroupListResponse;

describe('VersusGroupList', () => {
  let mutateFn: ReturnType<typeof vi.fn>;
  let mutationFnCapture: (groupId: number) => Promise<void>;
  let onSuccessCapture: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateFn = vi.fn();
    mockUseMutation.mockImplementation((opts) => {
      mutationFnCapture = opts.mutationFn;
      onSuccessCapture = opts.onSuccess;
      return { mutate: mutateFn, isPending: false };
    });
  });

  it('renders empty state when no groups', () => {
    render(
      <VersusGroupList
        versusGroups={{ groups: [] } as VersusGroupListResponse}
        teams={teams}
        onSuccess={vi.fn()}
      />,
    );
    expect(screen.getByText('Nenhum par versus criado ainda.')).toBeInTheDocument();
  });

  it('renders pair entries with scores', () => {
    render(<VersusGroupList versusGroups={versusGroups} teams={teams} onSuccess={vi.fn()} />);
    expect(screen.getByText('Team A')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
    expect(screen.getByText('10 - 5 pontos')).toBeInTheDocument();
  });

  it('skips rendering pair when a team is missing', () => {
    const oneTeam = [teams[0]!];
    render(<VersusGroupList versusGroups={versusGroups} teams={oneTeam} onSuccess={vi.fn()} />);
    expect(screen.queryByText('Team A')).not.toBeInTheDocument();
  });

  it('calls removeVersusPair on button click', () => {
    render(<VersusGroupList versusGroups={versusGroups} teams={teams} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByText('Remover'));
    expect(mutateFn).toHaveBeenCalledWith(1);
  });

  it('disables remove button while pending', () => {
    mockUseMutation.mockReturnValue({ mutate: mutateFn, isPending: true });
    render(<VersusGroupList versusGroups={versusGroups} teams={teams} onSuccess={vi.fn()} />);
    expect(screen.getByText('Remover').closest('button')).toBeDisabled();
  });

  it('handles undefined versusGroups gracefully', () => {
    render(<VersusGroupList versusGroups={undefined} teams={teams} onSuccess={vi.fn()} />);
    expect(screen.getByText('Pares Versus Ativos')).toBeInTheDocument();
  });

  it('handles undefined teams gracefully', () => {
    render(<VersusGroupList versusGroups={versusGroups} teams={undefined} onSuccess={vi.fn()} />);
    expect(screen.getByText('Pares Versus Ativos')).toBeInTheDocument();
    expect(screen.queryByText('Team A')).not.toBeInTheDocument();
  });

  it('mutationFn updates all teams in the group and clears versus_group_id', async () => {
    mockUpdateTeam.mockResolvedValue({});
    render(<VersusGroupList versusGroups={versusGroups} teams={teams} onSuccess={vi.fn()} />);
    await mutationFnCapture(1);
    expect(mockUpdateTeam).toHaveBeenCalledWith({
      path: { id: 1 },
      body: { name: 'Team A', versus_group_id: null },
    });
    expect(mockUpdateTeam).toHaveBeenCalledWith({
      path: { id: 2 },
      body: { name: 'Team B', versus_group_id: null },
    });
  });

  it('mutationFn handles no matching teams in group', async () => {
    render(<VersusGroupList versusGroups={versusGroups} teams={undefined} onSuccess={vi.fn()} />);
    await expect(mutationFnCapture(1)).resolves.toBeUndefined();
    expect(mockUpdateTeam).not.toHaveBeenCalled();
  });

  it('calls onSuccess when mutation succeeds', () => {
    const onSuccess = vi.fn();
    render(<VersusGroupList versusGroups={versusGroups} teams={teams} onSuccess={onSuccess} />);
    onSuccessCapture();
    expect(onSuccess).toHaveBeenCalled();
  });

  it('applies custom className', () => {
    const { container } = render(
      <VersusGroupList
        versusGroups={versusGroups}
        teams={teams}
        onSuccess={vi.fn()}
        className="custom-class"
      />,
    );
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});
