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
  default: ({ isEditing, currentId, hasPendingDraft }: any) => (
    <div data-testid="checkpoint-form">
      {isEditing ? 'editing' : 'new'}
      <span data-testid="current-id">{currentId ?? 'none'}</span>
      <span data-testid="has-pending-draft">{hasPendingDraft ? 'yes' : 'no'}</span>
    </div>
  ),
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

vi.mock('@/pages/admin/components/checkpoints/CheckpointDetailsPanel', () => ({
  default: ({ checkpointId }: any) => (
    <div data-testid="details-panel">{checkpointId ?? 'none'}</div>
  ),
}));

// The stage manager talks to the API and the toast provider; this suite is
// about the list, so it is stubbed out here.
vi.mock('@/pages/admin/components/checkpoints/RouteStageManager', () => ({
  default: () => <div data-testid="route-stages" />,
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
  routeStatus: null,
  refetchCheckpoints: vi.fn(),
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

  it('summarises the route, drafts included', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      routeStatus: {
        published_count: 4,
        draft_count: 3,
        incomplete_published_ids: [],
        checkpoints: [],
      },
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByText(/4 na rota · 3 em rascunho/)).toBeInTheDocument();
    expect(screen.queryByText(/por completar/)).not.toBeInTheDocument();
  });

  it('shows no active checkpoint in the details panel by default', () => {
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByTestId('details-panel')).toHaveTextContent('none');
  });

  it('attaches the details panel to the checkpoint being edited', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      editingCheckpoint: { id: 7, name: 'CP Seven', order: 1 },
      selectedCheckpointId: 7,
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByTestId('details-panel')).toHaveTextContent('7');
  });

  it('attaches the details panel to the selected checkpoint (e.g. just created)', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      selectedCheckpointId: 9,
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByTestId('details-panel')).toHaveTextContent('9');
  });

  it('keeps the details panel on the selected checkpoint after editingCheckpoint clears', () => {
    // Mirrors post-update state: the update mutation resets editingCheckpoint
    // but deliberately leaves selectedCheckpointId alone.
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      hasCheckpoints: true,
      sortedCheckpoints: [{ id: 3, name: 'CP Three', order: 1 }],
      editingCheckpoint: null,
      selectedCheckpointId: 3,
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByTestId('details-panel')).toHaveTextContent('3');
  });

  it('passes the pending draft id as currentId and flags it, when no real edit is happening', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      pendingDraftId: 11,
      selectedCheckpointId: 11,
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByTestId('current-id')).toHaveTextContent('11');
    expect(screen.getByTestId('has-pending-draft')).toHaveTextContent('yes');
  });

  it('prefers editingCheckpoint over pendingDraftId for currentId', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      editingCheckpoint: { id: 5, name: 'CP Five', order: 1 },
      pendingDraftId: 11,
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByTestId('current-id')).toHaveTextContent('5');
  });

  it('flags published posts that are still incomplete', () => {
    mockUseCheckpointManagement.mockReturnValue({
      ...baseHookReturn,
      routeStatus: {
        published_count: 4,
        draft_count: 0,
        incomplete_published_ids: [1, 2],
        checkpoints: [],
      },
    });
    render(<CheckpointManagement userStore={{} as any} />);
    expect(screen.getByText(/2 publicado\(s\) por completar/)).toBeInTheDocument();
  });
});
