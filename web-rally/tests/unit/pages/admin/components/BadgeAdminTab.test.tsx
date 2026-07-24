import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BadgeDefinitionResponse } from '@/client';
import BadgeAdminTab from '@/pages/admin/components/badges/BadgeAdminTab';

const { mockUseBadgeDefinitions, mockUpdateMutate, mockRemoveMutate } = vi.hoisted(() => ({
  mockUseBadgeDefinitions: vi.fn(),
  mockUpdateMutate: vi.fn(),
  mockRemoveMutate: vi.fn(),
}));

vi.mock('@/hooks/useBadgeAdmin', () => ({
  useBadgeDefinitions: () => mockUseBadgeDefinitions(),
  useBadgeDefinitionMutations: () => ({
    update: { mutate: mockUpdateMutate },
    remove: { mutate: mockRemoveMutate },
  }),
}));

vi.mock('@/lib/badgeTriggers', () => ({
  triggerMeta: (t: string) => ({ label: `Trigger:${t}` }),
}));

vi.mock('@/lib/badges', () => ({
  BADGE_FALLBACK: { color: '#000', glyph: '?' },
}));

vi.mock('@/pages/admin/components/badges/BadgeForm', () => ({
  default: ({ editing, onDone }: { editing: BadgeDefinitionResponse | null; onDone: () => void }) => (
    <div data-testid="badge-form">
      <span>{editing ? `editing-${editing.id}` : 'new'}</span>
      <button onClick={onDone}>done-form</button>
    </div>
  ),
}));

vi.mock('@/pages/admin/components/badges/ManualAwardPanel', () => ({
  default: () => <div data-testid="manual-award-panel" />,
}));

const badge = (overrides: Partial<BadgeDefinitionResponse> = {}): BadgeDefinitionResponse => ({
  id: 1,
  name: 'Explorer',
  code: 'EXPLORER',
  description: 'desc',
  is_active: true,
  is_auto: false,
  trigger_type: null,
  icon_url: null,
  color: '#111',
  glyph: '🏅',
  ...overrides,
} as BadgeDefinitionResponse);

describe('BadgeAdminTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [], isLoading: true });
    render(<BadgeAdminTab />);
    expect(screen.getByText('A carregar…')).toBeInTheDocument();
  });

  it('shows empty state when no badges', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [], isLoading: false });
    render(<BadgeAdminTab />);
    expect(screen.getByText('Sem crachás no catálogo')).toBeInTheDocument();
  });

  it('renders a single badge with manual label and manual award panel', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [badge()], isLoading: false });
    render(<BadgeAdminTab />);
    expect(screen.getByText('Explorer')).toBeInTheDocument();
    expect(screen.getByText('EXPLORER')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByTestId('manual-award-panel')).toBeInTheDocument();
  });

  it('renders auto badge trigger label and icon image', () => {
    mockUseBadgeDefinitions.mockReturnValue({
      data: [badge({ is_auto: true, trigger_type: 'streak', icon_url: 'https://x/icon.png' })],
      isLoading: false,
    });
    const { container } = render(<BadgeAdminTab />);
    expect(screen.getByText('Trigger:streak')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x/icon.png');
  });

  it('renders many badges', () => {
    mockUseBadgeDefinitions.mockReturnValue({
      data: [badge({ id: 1, name: 'A' }), badge({ id: 2, name: 'B' }), badge({ id: 3, name: 'C' })],
      isLoading: false,
    });
    render(<BadgeAdminTab />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('opens create form when clicking Novo crachá', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [], isLoading: false });
    render(<BadgeAdminTab />);
    fireEvent.click(screen.getByText('Novo crachá'));
    expect(screen.getByTestId('badge-form')).toBeInTheDocument();
    expect(screen.getByText('new')).toBeInTheDocument();
  });

  it('opens edit form when clicking edit button on a badge', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [badge()], isLoading: false });
    render(<BadgeAdminTab />);
    fireEvent.click(screen.getByTitle('Editar'));
    expect(screen.getByText('editing-1')).toBeInTheDocument();
  });

  it('closes the form when onDone is called', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [], isLoading: false });
    render(<BadgeAdminTab />);
    fireEvent.click(screen.getByText('Novo crachá'));
    fireEvent.click(screen.getByText('done-form'));
    expect(screen.queryByTestId('badge-form')).not.toBeInTheDocument();
  });

  it('toggles badge active state', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [badge({ is_active: true })], isLoading: false });
    render(<BadgeAdminTab />);
    fireEvent.click(screen.getByTitle('Desativar'));
    expect(mockUpdateMutate).toHaveBeenCalledWith({ id: 1, data: { is_active: false } });
  });

  it('shows Ativar toggle for inactive badge', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [badge({ is_active: false })], isLoading: false });
    render(<BadgeAdminTab />);
    expect(screen.getByTitle('Ativar')).toBeInTheDocument();
  });

  it('deletes a badge through the confirm dialog', () => {
    mockUseBadgeDefinitions.mockReturnValue({ data: [badge()], isLoading: false });
    render(<BadgeAdminTab />);
    fireEvent.click(screen.getByTitle('Eliminar'));
    fireEvent.click(screen.getByText('Eliminar'));
    expect(mockRemoveMutate).toHaveBeenCalledWith(1);
  });
});
