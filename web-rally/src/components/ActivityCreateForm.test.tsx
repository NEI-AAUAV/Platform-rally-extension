import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import ActivityForm from './ActivityCreateForm';
import { ActivityType, Checkpoint } from '@/types/activityTypes';

// Mock dependencies
vi.mock('@/components/themes/bloody', () => ({
  BloodyButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ActivityTypeInfo', () => ({
  default: () => <div data-testid="activity-type-info">Info</div>,
}));

// Mock UI components if necessary, but trying to use real ones first if possible.
// If they rely on complex providers, we might need to verify.
// components/ui/form relies on FormProvider which is standard RHF.

describe('ActivityCreateForm', () => {
  const mockCheckpoints: Checkpoint[] = [
    { id: 1, name: 'CP1', description: 'Desc1', location: 'Loc1', is_active: true },
    { id: 2, name: 'CP2', description: 'Desc2', location: 'Loc2', is_active: true },
  ];
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders basic form fields', () => {
    render(
      <ActivityForm
        checkpoints={mockCheckpoints}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByLabelText(/Nome da Atividade/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Descrição/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Checkpoint/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tipo de Atividade/i)).toBeInTheDocument();
  });

  it('shows TeamVs config fields when TeamVs type is selected', async () => {
    render(
      <ActivityForm
        checkpoints={mockCheckpoints}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Select TeamVsActivity
    const typeSelect = screen.getByLabelText(/Tipo de Atividade/i);
    fireEvent.change(typeSelect, { target: { value: ActivityType.TEAM_VS } });

    // Check for specific fields using data-testid (labels lack htmlFor associations)
    expect(screen.getByText('Configurações de Atividade Equipa vs Equipa')).toBeInTheDocument();
    expect(screen.getByTestId('input-base-points')).toBeInTheDocument();
    expect(screen.getByTestId('input-completion-points')).toBeInTheDocument();
    expect(screen.getByTestId('input-win-points')).toBeInTheDocument();
  });

  it('submits correct payload for TeamVsActivity', async () => {
    render(
      <ActivityForm
        checkpoints={mockCheckpoints}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Fill basic info
    fireEvent.change(screen.getByLabelText(/Nome da Atividade/i), { target: { value: 'Test Activity' } });

    // Select TeamVsActivity
    const typeSelect = screen.getByLabelText(/Tipo de Atividade/i);
    fireEvent.change(typeSelect, { target: { value: ActivityType.TEAM_VS } });

    // Fill config using data-testid (labels lack htmlFor associations)
    fireEvent.change(screen.getByTestId('input-base-points'), { target: { value: '10' } });
    fireEvent.change(screen.getByTestId('input-completion-points'), { target: { value: '20' } });
    fireEvent.change(screen.getByTestId('input-win-points'), { target: { value: '50' } });

    // Submit
    fireEvent.click(screen.getByText('Criar'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Test Activity',
        activity_type: ActivityType.TEAM_VS,
        config: expect.objectContaining({
          base_points: 10,
          completion_points: 20,
          win_points: 50,
        }),
      }));
    });
  });

  it('initializes form with initialData for editing', () => {
    const initialData = {
      name: 'Existing Activity',
      activity_type: ActivityType.TEAM_VS,
      checkpoint_id: 1,
      config: {
        base_points: 5,
        completion_points: 15,
        win_points: 100,
      },
    };

    render(
      <ActivityForm
        checkpoints={mockCheckpoints}
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        initialData={initialData}
      />
    );

    expect(screen.getByDisplayValue('Existing Activity')).toBeInTheDocument();
    expect(screen.getByTestId('input-base-points')).toHaveValue(5);
    expect(screen.getByTestId('input-completion-points')).toHaveValue(15);
    expect(screen.getByText('Editar Atividade')).toBeInTheDocument();
  });
});
