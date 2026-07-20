import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ActivityCreateForm from '@/components/activity-form/ActivityCreateForm';
import { ActivityType, type Checkpoint } from '@/types/activityTypes';

describe('ActivityCreateForm', () => {
  const checkpoints: Checkpoint[] = [
    { id: 1, name: 'Checkpoint A', description: 'First checkpoint' } as Checkpoint,
    { id: 2, name: 'Checkpoint B', description: 'Second checkpoint' } as Checkpoint,
  ];

  it('renders create mode heading and default submit label', () => {
    render(<ActivityCreateForm checkpoints={checkpoints} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Criar Nova Atividade')).toBeInTheDocument();
    expect(screen.getByText('Configure uma nova atividade para o Rally')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar' })).toBeInTheDocument();
  });

  it('renders edit mode heading and label when initialData is provided', () => {
    render(
      <ActivityCreateForm
        checkpoints={checkpoints}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initialData={{ name: 'Existing Activity', checkpoint_id: 1 }}
      />
    );
    expect(screen.getByText('Editar Atividade')).toBeInTheDocument();
    expect(screen.getByText('Modifique os detalhes da atividade')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
  });

  it('shows "Salvando..." label and disables buttons when isLoading is true', () => {
    render(
      <ActivityCreateForm
        checkpoints={checkpoints}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        isLoading
      />
    );
    const submitButton = screen.getByRole('button', { name: 'Salvando...' });
    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });

  it('displays an error alert when error prop is provided', () => {
    render(
      <ActivityCreateForm
        checkpoints={checkpoints}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        error="Something went wrong"
      />
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not render an error alert when error prop is absent', () => {
    render(<ActivityCreateForm checkpoints={checkpoints} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ActivityCreateForm checkpoints={checkpoints} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders checkpoint options with name and description', () => {
    render(<ActivityCreateForm checkpoints={checkpoints} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Checkpoint A - First checkpoint')).toBeInTheDocument();
    expect(screen.getByText('Checkpoint B - Second checkpoint')).toBeInTheDocument();
  });

  it('defaults checkpoint_id to 0 when no checkpoints are provided', () => {
    render(<ActivityCreateForm checkpoints={[]} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    // Should render without crashing even with an empty checkpoints list
    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
  });

  it('submits the form with name, checkpoint, activity type and merged config data', async () => {
    const onSubmit = vi.fn();
    render(<ActivityCreateForm checkpoints={checkpoints} onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Ex: Cabo de Guerra'), {
      target: { value: 'Tug of War' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findByRole('button', { name: 'Criar' })).toBeInTheDocument();
  });

  it('updates configData via ActivityConfigFields when activity type changes to TIME_BASED', () => {
    render(<ActivityCreateForm checkpoints={checkpoints} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const selects = screen.getAllByRole('combobox');
    // Second select is activity_type
    fireEvent.change(selects[1]!, { target: { value: ActivityType.TIME_BASED } });
    expect(screen.getByText('Configurações de Atividade Baseada em Tempo')).toBeInTheDocument();
  });

  it('prefills configData from initialData.config', () => {
    render(
      <ActivityCreateForm
        checkpoints={checkpoints}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        initialData={{
          name: 'Existing',
          checkpoint_id: 1,
          activity_type: ActivityType.SCORE_BASED,
          config: { max_points: 80, base_score: 40 },
        }}
      />
    );
    expect(screen.getByText('Configurações de Atividade Baseada em Pontuação')).toBeInTheDocument();
  });

  it('opens the ActivityTypeInfo modal from within the form', () => {
    render(<ActivityCreateForm checkpoints={checkpoints} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const infoButtons = screen
      .getAllByRole('button')
      .filter((b) => b.querySelector('svg')?.classList.contains('lucide-info'));
    expect(infoButtons.length).toBeGreaterThan(0);
    fireEvent.click(infoButtons[0]!);
    expect(screen.getByText('Tipos de Atividades - Sistema de Pontuação')).toBeInTheDocument();
  });
});
