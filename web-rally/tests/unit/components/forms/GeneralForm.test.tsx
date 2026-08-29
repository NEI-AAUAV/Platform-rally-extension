import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import GeneralForm from '@/components/forms/GeneralForm';
import type { Team } from '@/types/forms';

const { mockUseRallySettings, mockToast } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/themes/bloody', () => ({
  BloodyButton: (props: ComponentProps<'button'>) => <button {...props} />,
}));

vi.mock('@/hooks/useGlobalPenaltyCounters', () => ({
  useGlobalPenaltyCounters: () => ({ globalPenaltyCounters: [], isLoading: false }),
  default: () => ({ globalPenaltyCounters: [], isLoading: false }),
  globalCounterKey: (id: number) => 'g_' + id,
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

describe('GeneralForm', () => {
  const mockTeam = { id: 1, name: 'Team A', num_members: 4 } as unknown as Team;
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({
      settings: { raw_settings: { extra_shots_penalty_per_member: 0, penalty_values: {} } },
    });
  });

  it('renders with default points from config', () => {
    render(
      <GeneralForm
        team={mockTeam}
        config={{ default_points: 25, min_points: 0, max_points: 100 }}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );
    expect(screen.getByLabelText('Assigned Points')).toHaveValue(25);
    expect(screen.getByText('Range: 0 - 100 points')).toBeInTheDocument();
  });

  it('falls back to RALLY_DEFAULTS when config lacks default_points', () => {
    render(<GeneralForm team={mockTeam} config={{}} onSubmit={mockOnSubmit} isSubmitting={false} />);
    expect(screen.getByLabelText('Assigned Points')).toBeInTheDocument();
  });

  it('submits assigned points', () => {
    render(
      <GeneralForm
        team={mockTeam}
        config={{ default_points: 10 }}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );
    fireEvent.change(screen.getByLabelText('Assigned Points'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { assigned_points: 50, notes: '' },
      extra_shots: 0,
      penalties: {},
    });
  });

  it('blocks submission on negative points', () => {
    render(
      <GeneralForm
        team={mockTeam}
        config={{ default_points: 10 }}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
      />
    );
    fireEvent.change(screen.getByLabelText('Assigned Points'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith('Os pontos têm de ser positivos.');
  });

  it('prefills from existingResult', () => {
    render(
      <GeneralForm
        team={mockTeam}
        config={{ default_points: 10 }}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          { result_data: { assigned_points: 88, notes: 'hi' }, extra_shots: 0, penalties: {} } as any
        }
      />
    );
    expect(screen.getByLabelText('Assigned Points')).toHaveValue(88);
    expect(screen.getByDisplayValue('hi')).toBeInTheDocument();
  });
});
