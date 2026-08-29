import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import TimeBasedForm from '@/components/forms/TimeBasedForm';
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

vi.mock('@/components/shared', () => ({
  StopwatchWidget: ({ onUseTime }: { onUseTime: (s: number) => void }) => (
    <button onClick={() => onUseTime(12.5)}>Use stopwatch time</button>
  ),
}));

describe('TimeBasedForm', () => {
  const mockTeam = { id: 1, name: 'Team A', num_members: 4 } as unknown as Team;
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRallySettings.mockReturnValue({
      settings: { raw_settings: { extra_shots_penalty_per_member: 0, penalty_values: {} } },
    });
  });

  it('renders without crashing', () => {
    render(<TimeBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    expect(screen.getByLabelText('Completion Time (seconds)')).toBeInTheDocument();
  });

  it('submits parsed time', () => {
    render(<TimeBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText('Completion Time (seconds)'), {
      target: { value: '12.34' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { completion_time_seconds: 12.34, notes: '' },
      extra_shots: 0,
      penalties: {},
    });
  });

  it('accepts comma as decimal separator', () => {
    render(<TimeBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText('Completion Time (seconds)'), {
      target: { value: '12,5' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).toHaveBeenCalledWith({
      result_data: { completion_time_seconds: 12.5, notes: '' },
      extra_shots: 0,
      penalties: {},
    });
  });

  it('blocks submission for empty/invalid time', () => {
    render(<TimeBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      'Introduz um tempo válido e não negativo, em segundos.'
    );
  });

  it('blocks submission for negative time', () => {
    render(<TimeBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.change(screen.getByLabelText('Completion Time (seconds)'), {
      target: { value: '-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submeter avaliação/ }));
    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('toggles stopwatch and fills time from it', () => {
    render(<TimeBasedForm team={mockTeam} onSubmit={mockOnSubmit} isSubmitting={false} />);
    fireEvent.click(screen.getByText('Usar cronómetro'));
    expect(screen.getByText('Ocultar cronómetro')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Use stopwatch time'));
    expect(screen.getByLabelText('Completion Time (seconds)')).toHaveValue('12.5');
  });

  it('prefills numeric and string completion time from existingResult', () => {
    const { rerender } = render(
      <TimeBasedForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          { result_data: { completion_time_seconds: 33, notes: 'n1' }, extra_shots: 0, penalties: {} } as any
        }
      />
    );
    expect(screen.getByLabelText('Completion Time (seconds)')).toHaveValue('33');

    rerender(
      <TimeBasedForm
        team={mockTeam}
        onSubmit={mockOnSubmit}
        isSubmitting={false}
        existingResult={
          { result_data: { completion_time_seconds: '44.5', notes: 'n2' }, extra_shots: 0, penalties: {} } as any
        }
      />
    );
    expect(screen.getByLabelText('Completion Time (seconds)')).toHaveValue('44.5');
  });
});
