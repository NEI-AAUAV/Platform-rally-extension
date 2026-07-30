import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CheckpointManagement from '@/pages/admin/components/checkpoints/CheckpointManagement';

const { mockUseCheckpointManagement } = vi.hoisted(() => ({
  mockUseCheckpointManagement: vi.fn(),
}));

vi.mock('@/pages/admin/components/checkpoints/useCheckpointManagement', () => ({
  useCheckpointManagement: (...args: unknown[]) => mockUseCheckpointManagement(...args),
}));

vi.mock('@/pages/admin/components/checkpoints/CheckpointForm', () => ({
  default: ({ isEditing }: any) => <div data-testid="checkpoint-form">{isEditing ? 'editing' : 'new'}</div>,
}));

vi.mock('@/pages/admin/components/checkpoints/CheckpointListItem', () => ({
  default: ({ checkpoint, onEdit, onDelete }: any) => (
    <li>
      <span>{checkpoint.name}</span>
      <button onClick={() => onEdit(checkpoint)}>edit-{checkpoint.id}</button>
      <button onClick={() => onDelete(checkpoint.id)}>delete-{checkpoint.id}</button>
    </li>
  ),
}));

vi.mock('@/components/shared', () => ({
  EmptyState: ({ title, description }: any) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      <p>{description}</p>
    </div>
  ),
}));

const baseHookReturn = {
  checkpointForm: {},
  editingCheckpoint: null,
  draggedCheckpoint: null,
  sortedCheckpoints: [],
  hasCheckpoints: false,
  isCreatingCheckpoint: false,
  isUpdatingCheckpoint: false,
  isDeletingCheckpoint: false,
  handleCheckpointSubmit: vi.fn(),
  startEditCheckpoint: vi.fn(),
  cancelEdit: vi.fn(),
  deleteCheckpoint: vi.fn(),
  handleDragStart: vi.fn(),
  handleDragOver: vi.fn(),
  handleDrop: vi.fn(),
  handleDragEnd: vi.fn(),
};

describe('CheckpointManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCheckpointManagement.mockReturnValue(baseHookReturn);
  });

  it('renders form and empty state when no checkpoints', () => {
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByTestId('checkpoint-form')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('Nenhum checkpoint criado ainda')).toBeInTheDocument();
  });

  it('renders a single checkpoint', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      hasCheckpoints: true,
      sortedCheckpoints: [{ id: 1, name: 'CP One', order: 1 }],
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByText('CP One')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('renders many checkpoints', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      hasCheckpoints: true,
      sortedCheckpoints: [
        { id: 1, name: 'CP One', order: 1 },
        { id: 2, name: 'CP Two', order: 2 },
        { id: 3, name: 'CP Three', order: 3 },
      ],
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByText('CP One')).toBeInTheDocument();
    expect(screen.getByText('CP Two')).toBeInTheDocument();
    expect(screen.getByText('CP Three')).toBeInTheDocument();
  });

  it('calls startEditCheckpoint when edit clicked', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      hasCheckpoints: true,
      sortedCheckpoints: [{ id: 1, name: 'CP One', order: 1 }],
    });
    render(<CheckpointManagement userStore={{} as any} />);
    fireEvent.click(screen.getByText('edit-1'));
    expect(baseHookReturn.startEditCheckpoint).toHaveBeenCalledWith({ id: 1, name: 'CP One', order: 1 });
  });

  it('calls deleteCheckpoint when delete clicked', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      hasCheckpoints: true,
      sortedCheckpoints: [{ id: 1, name: 'CP One', order: 1 }],
    });
    render(<CheckpointManagement userStore={{} as any} />);
    fireEvent.click(screen.getByText('delete-1'));
    expect(baseHookReturn.deleteCheckpoint).toHaveBeenCalledWith(1);
  });

  it('shows editing state in form when editingCheckpoint present', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      editingCheckpoint: { id: 1, name: 'CP One', order: 1 },
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByText('editing')).toBeInTheDocument();
  });
});
