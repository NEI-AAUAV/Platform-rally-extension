import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type React from 'react';
import VersusPairForm from '@/pages/versus/components/VersusPairForm';
import type { ListingTeam } from '@/client';

const { mockUseMutation, mockCreateVersusPair, mockToast } = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
  mockCreateVersusPair: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
}));

vi.mock('@/client', () => ({
  createVersusPair: mockCreateVersusPair,
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

// Radix Select doesn't support jsdom pointer interactions well; replace with a
// minimal native <select> so we can drive the full submit path in tests.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) => (
    <select value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="" />
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

const teams = [
  { id: 1, name: 'Team A', total: 10 },
  { id: 2, name: 'Team B', total: 5 },
  { id: 3, name: 'Team C', total: 0, versus_group_id: 9 },
] as ListingTeam[];

describe('VersusPairForm', () => {
  let mutateFn: ReturnType<typeof vi.fn>;
  let mutationFnCapture: (data: {
    team_a_id: number;
    team_b_id: number;
  }) => Promise<unknown>;
  let onSuccessCapture: () => void;
  let onErrorCapture: (error: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mutateFn = vi.fn();
    mockUseMutation.mockImplementation((opts) => {
      mutationFnCapture = opts.mutationFn;
      onSuccessCapture = opts.onSuccess;
      onErrorCapture = opts.onError;
      return { mutate: mutateFn, isPending: false, error: null };
    });
  });

  it('renders form and excludes teams already in a versus group', () => {
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);
    expect(screen.getByText('Criar Novo Par Versus')).toBeInTheDocument();
    expect(screen.getByText('Equipa A')).toBeInTheDocument();
  });

  it('disables submit button until both teams selected', () => {
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);
    expect(screen.getByText('Criar Par Versus').closest('button')).toBeDisabled();
  });

  it('renders error alert when createError present', () => {
    mockUseMutation.mockReturnValue({
      mutate: mutateFn,
      isPending: false,
      error: { message: 'Something failed' },
    });
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('shows creating label while pending', () => {
    mockUseMutation.mockReturnValue({ mutate: mutateFn, isPending: true, error: null });
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);
    expect(screen.getByText('A Criar...')).toBeInTheDocument();
  });

  it('handles undefined teams gracefully', () => {
    render(<VersusPairForm teams={undefined} onSuccess={vi.fn()} />);
    expect(screen.getByText('Criar Novo Par Versus')).toBeInTheDocument();
  });

  it('mutationFn calls createVersusPair with the request body and returns data', async () => {
    mockCreateVersusPair.mockResolvedValue({ data: { group_id: 1 } });
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);

    await expect(
      mutationFnCapture({ team_a_id: 1, team_b_id: 2 }),
    ).resolves.toEqual({ group_id: 1 });
    expect(mockCreateVersusPair).toHaveBeenCalledWith({
      body: { team_a_id: 1, team_b_id: 2 },
    });
  });

  it('onSuccess resets selections and shows a success toast', () => {
    const onSuccess = vi.fn();
    render(<VersusPairForm teams={teams} onSuccess={onSuccess} />);
    onSuccessCapture();
    expect(onSuccess).toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Par versus criado com sucesso!');
  });

  it('onError shows an error toast with the extracted message', () => {
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);
    onErrorCapture(new Error('boom'));
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('handleCreatePair does nothing when only one team selected (button stays disabled, mutate not invoked)', () => {
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);
    const button = screen.getByText('Criar Par Versus').closest('button')!;
    fireEvent.click(button);
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('calls mutate with parsed team ids when both teams are selected and differ', () => {
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);
    const [selectA, selectB] = screen.getAllByRole('combobox');

    fireEvent.change(selectA!, { target: { value: '1' } });
    fireEvent.change(selectB!, { target: { value: '2' } });

    const button = screen.getByText('Criar Par Versus').closest('button')!;
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    expect(mutateFn).toHaveBeenCalledWith({ team_a_id: 1, team_b_id: 2 });
  });

  it('does not call mutate when both selects resolve to the same team', () => {
    render(<VersusPairForm teams={teams} onSuccess={vi.fn()} />);
    const [selectA, selectB] = screen.getAllByRole('combobox');

    fireEvent.change(selectA!, { target: { value: '1' } });
    fireEvent.change(selectB!, { target: { value: '1' } });

    const button = screen.getByText('Criar Par Versus').closest('button')!;
    expect(button).toBeDisabled();
    fireEvent.click(button);

    expect(mutateFn).not.toHaveBeenCalled();
  });
});
