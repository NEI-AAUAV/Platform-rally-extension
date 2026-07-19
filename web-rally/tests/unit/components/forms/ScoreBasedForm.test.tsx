import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ScoreBasedForm from '@/components/forms/ScoreBasedForm';
import type { Team } from '@/types/forms';

const { mockUseRallySettings, mockToast } = vi.hoisted(() => ({
  mockUseRallySettings: vi.fn(),
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/themes/bloody', () => ({
  BloodyButton: (props: ComponentProps<'button'>) => <button {...props} />,
}));

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

describe('ScoreBasedForm', () => {
  const mockTeam = { id: 1, name: 'Team A', num_members: 4 } as unknown as Team;
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({
      settings: { raw_settings: { extra_shots_penalty_per_member: 0, penalty_values: {} } },
    });
  });

  it('renders without crashing', () => {
    render(<ScoreBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    expect(screen.getByLabelText('Achieved Points')).toBeInTheDocument();
  });

  it('submits achieved points and notes', () => {
    render(<ScoreBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText('Achieved Points'), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Evaluation/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { achieved_points: 42, notes: '' },
      extra_shots: 0,
      penalties: {},
    });
  });

  it('shows error and blocks submission for negative points', () => {
    render(<ScoreBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText('Achieved Points'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Evaluation/ }));
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith('Points must be positive.');
  });

  it('prefills from existingResult', () => {
    render(
      <ScoreBasedForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          { result_data: { achieved_points: 77, notes: 'note' }, extra_shots: 0, penalties: {} } as any
        }
      />
    );
    expect(screen.getByLabelText('Achieved Points')).toHaveValue(77);
    expect(screen.getByDisplayValue('note')).toBeInTheDocument();
  });
});
