import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ComponentProps } from 'react';
import type ActivityCreateForm from '@/components/activity-form/ActivityCreateForm';
import type ActivityList from '@/components/activity-form/ActivityList';
import type { ActivityType } from '@/types/activityTypes';
import ActivityManagement from '@/pages/admin/components/ActivityManagement';

const {
  mockUseActivities,
  mockUseCreateActivity,
  mockUseUpdateActivity,
  mockUseDeleteActivity,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockUseActivities: vi.fn(),
  mockUseCreateActivity: vi.fn(),
  mockUseUpdateActivity: vi.fn(),
  mockUseDeleteActivity: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@/hooks/useActivities', () => ({
  useActivities: () => mockUseActivities(),
  useCreateActivity: () => mockUseCreateActivity(),
  useUpdateActivity: () => mockUseUpdateActivity(),
  useDeleteActivity: () => mockUseDeleteActivity(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => ({ success: mockToastSuccess, error: mockToastError }),
}));

vi.mock('@/components/activity-form/ActivityCreateForm', () => ({
  default: ({ onSubmit, onCancel, initialData }: ComponentProps<typeof ActivityCreateForm>) => (
    <div data-testid="activity-form">
      <span>{initialData ? 'editing' : 'creating'}</span>
      <button onClick={() => onSubmit({ name: 'New Activity', activity_type: 'GeneralActivity' as ActivityType, checkpoint_id: 1, config: {}, is_active: true })}>
        submit-form
      </button>
      <button onClick={onCancel}>cancel-form</button>
    </div>
  ),
}));

vi.mock('@/components/activity-form/ActivityList', () => ({
  default: ({ activities, onEdit, onDelete }: ComponentProps<typeof ActivityList>) => (
    <div data-testid="activity-list">
      {activities.map((a) => (
        <div key={a.id}>
          <span>{a.name}</span>
          <button onClick={() => onEdit(a)}>edit-{a.id}</button>
          <button onClick={() => onDelete(a.id)}>delete-{a.id}</button>
        </div>
      ))}
    </div>
  ),
}));

const checkpoints = [{ id: 1, name: 'CP1', order: 1 }];

describe('ActivityManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActivities.mockReturnValue({ data: { activities: [] } });
    mockUseCreateActivity.mockReturnValue({ mutate: vi.fn(), isPending: false, error: null });
    mockUseUpdateActivity.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseDeleteActivity.mockReturnValue({ mutate: vi.fn() });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders without crashing with no checkpoints', () => {
    render(<ActivityManagement checkpoints={[]} />);
    expect(
      screen.getByText('É necessário criar pelo menos um checkpoint antes de criar atividades.'),
    ).toBeInTheDocument();
  });

  it('disables new activity button when no checkpoints', () => {
    render(<ActivityManagement checkpoints={[]} />);
    expect(screen.getByText('Nova Atividade').closest('button')).toBeDisabled();
  });

  it('renders activity list when checkpoints exist', () => {
    mockUseActivities.mockReturnValue({
      data: {
        activities: [
          {
            id: 1,
            name: 'Act 1',
            description: null,
            activity_type: 'GeneralActivity',
            checkpoint_id: 1,
            config: {},
            is_active: true,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ],
      },
    });
    render(<ActivityManagement checkpoints={checkpoints} />);
    expect(screen.getByTestId('activity-list')).toBeInTheDocument();
    expect(screen.getByText('Act 1')).toBeInTheDocument();
  });

  it('renders empty activity list when no activities', () => {
    render(<ActivityManagement checkpoints={checkpoints} />);
    expect(screen.getByTestId('activity-list')).toBeInTheDocument();
  });

  it('opens create form when clicking Nova Atividade', () => {
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('Nova Atividade'));
    expect(screen.getByTestId('activity-form')).toBeInTheDocument();
    expect(screen.getByText('creating')).toBeInTheDocument();
  });

  it('creates an activity via form submission', () => {
    const mutate = vi.fn((_data, opts) => opts.onSuccess());
    mockUseCreateActivity.mockReturnValue({ mutate, isPending: false, error: null });
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('Nova Atividade'));
    fireEvent.click(screen.getByText('submit-form'));
    expect(mutate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('Atividade criada com sucesso!');
  });

  it('shows error toast on create failure', () => {
    const mutate = vi.fn((_data, opts) => opts.onError(new Error('boom')));
    mockUseCreateActivity.mockReturnValue({ mutate, isPending: false, error: null });
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('Nova Atividade'));
    fireEvent.click(screen.getByText('submit-form'));
    expect(mockToastError).toHaveBeenCalled();
  });

  it('edits an activity via edit button then submits update', () => {
    mockUseActivities.mockReturnValue({
      data: {
        activities: [
          {
            id: 5,
            name: 'Act 5',
            description: null,
            activity_type: 'GeneralActivity',
            checkpoint_id: 1,
            config: {},
            is_active: true,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ],
      },
    });
    const mutate = vi.fn((_data, opts) => opts.onSuccess());
    mockUseUpdateActivity.mockReturnValue({ mutate, isPending: false });
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('edit-5'));
    expect(screen.getByText('editing')).toBeInTheDocument();
    fireEvent.click(screen.getByText('submit-form'));
    expect(mutate).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalledWith('Atividade atualizada com sucesso!');
  });

  it('shows error toast on update failure', () => {
    mockUseActivities.mockReturnValue({
      data: {
        activities: [
          {
            id: 5,
            name: 'Act 5',
            description: null,
            activity_type: 'GeneralActivity',
            checkpoint_id: 1,
            config: {},
            is_active: true,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ],
      },
    });
    const mutate = vi.fn((_data, opts) => opts.onError(new Error('boom')));
    mockUseUpdateActivity.mockReturnValue({ mutate, isPending: false });
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('edit-5'));
    fireEvent.click(screen.getByText('submit-form'));
    expect(mockToastError).toHaveBeenCalled();
  });

  it('cancels the form', () => {
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('Nova Atividade'));
    fireEvent.click(screen.getByText('cancel-form'));
    expect(screen.queryByTestId('activity-form')).not.toBeInTheDocument();
  });

  it('deletes an activity after confirm', () => {
    mockUseActivities.mockReturnValue({
      data: {
        activities: [
          {
            id: 9,
            name: 'Act 9',
            description: null,
            activity_type: 'GeneralActivity',
            checkpoint_id: 1,
            config: {},
            is_active: true,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ],
      },
    });
    const mutate = vi.fn((_id, opts) => opts.onSuccess());
    mockUseDeleteActivity.mockReturnValue({ mutate });
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('delete-9'));
    expect(mutate).toHaveBeenCalledWith(9, expect.anything());
    expect(mockToastSuccess).toHaveBeenCalledWith('Atividade deletada com sucesso!');
  });

  it('does not delete when confirm is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockUseActivities.mockReturnValue({
      data: {
        activities: [
          {
            id: 9,
            name: 'Act 9',
            description: null,
            activity_type: 'GeneralActivity',
            checkpoint_id: 1,
            config: {},
            is_active: true,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ],
      },
    });
    const mutate = vi.fn();
    mockUseDeleteActivity.mockReturnValue({ mutate });
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('delete-9'));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows error toast on delete failure', () => {
    mockUseActivities.mockReturnValue({
      data: {
        activities: [
          {
            id: 9,
            name: 'Act 9',
            description: null,
            activity_type: 'GeneralActivity',
            checkpoint_id: 1,
            config: {},
            is_active: true,
            created_at: '2024-01-01',
            updated_at: '2024-01-01',
          },
        ],
      },
    });
    const mutate = vi.fn((_id, opts) => opts.onError(new Error('boom')));
    mockUseDeleteActivity.mockReturnValue({ mutate });
    render(<ActivityManagement checkpoints={checkpoints} />);
    fireEvent.click(screen.getByText('delete-9'));
    expect(mockToastError).toHaveBeenCalled();
  });
});
