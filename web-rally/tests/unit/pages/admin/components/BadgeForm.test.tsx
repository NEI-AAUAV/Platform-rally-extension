import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BadgeDefinitionResponse } from '@/client';
import BadgeForm from '@/pages/admin/components/badges/BadgeForm';

const {
  mockGetActivities,
  mockGetCheckpoints,
  mockCreateMutateAsync,
  mockUpdateMutateAsync,
  mockUploadIconMutateAsync,
  mockMutationState,
} = vi.hoisted(() => ({
  mockGetActivities: vi.fn(),
  mockGetCheckpoints: vi.fn(),
  mockCreateMutateAsync: vi.fn(),
  mockUpdateMutateAsync: vi.fn(),
  mockUploadIconMutateAsync: vi.fn(),
  mockMutationState: {
    createIsError: false,
    createError: null as unknown,
    updateIsError: false,
    updateError: null as unknown,
  },
}));

vi.mock('@/client', () => ({
  getActivities: (...args: unknown[]) => mockGetActivities(...args),
  getCheckpoints: (...args: unknown[]) => mockGetCheckpoints(...args),
}));

// Radix Select doesn't support jsdom pointer interactions well; replace with a
// minimal native <select> so we can drive the trigger criteria selects in tests.
vi.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange: (value: string) => void;
    children: React.ReactNode;
  }) => (
    <select value={value ?? ''} onChange={(e) => onValueChange(e.target.value)}>
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

vi.mock('@/hooks/useBadgeAdmin', () => ({
  useBadgeDefinitionMutations: () => ({
    create: {
      mutateAsync: mockCreateMutateAsync,
      isPending: false,
      isError: mockMutationState.createIsError,
      error: mockMutationState.createError,
    },
    update: {
      mutateAsync: mockUpdateMutateAsync,
      isPending: false,
      isError: mockMutationState.updateIsError,
      error: mockMutationState.updateError,
    },
    uploadIcon: {
      mutateAsync: mockUploadIconMutateAsync,
      isPending: false,
    },
  }),
}));

const BADGE_GLYPH_PLACEHOLDER = '◈';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const badge = (overrides: Partial<BadgeDefinitionResponse> = {}): BadgeDefinitionResponse =>
  ({
    id: 1,
    name: 'Explorer',
    code: 'explorer',
    description: 'desc',
    color: '#ff0000',
    glyph: '🏅',
    is_active: true,
    is_auto: false,
    trigger_type: null,
    icon_url: null,
    criteria: {},
    ...overrides,
  }) as BadgeDefinitionResponse;

describe('BadgeForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutationState.createIsError = false;
    mockMutationState.createError = null;
    mockMutationState.updateIsError = false;
    mockMutationState.updateError = null;
    mockGetActivities.mockResolvedValue({ data: { activities: [{ id: 1, name: 'Act A' }] } });
    mockGetCheckpoints.mockResolvedValue({ data: [{ id: 1, name: 'CP A' }] });
    mockCreateMutateAsync.mockResolvedValue({ id: 99 });
    mockUpdateMutateAsync.mockResolvedValue({});
    mockUploadIconMutateAsync.mockResolvedValue({});
  });

  it('renders create form when no badge is editing', () => {
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    expect(screen.getByText('Criar crachá')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ex: first_arrival')).not.toBeDisabled();
  });

  it('renders edit form with disabled code field when editing', () => {
    renderWithClient(<BadgeForm editing={badge()} onDone={vi.fn()} />);
    expect(screen.getByText('Editar crachá')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ex: first_arrival')).toBeDisabled();
    expect(screen.getByText('O código não pode ser alterado.')).toBeInTheDocument();
  });

  it('populates form fields from editing badge, including numeric criteria', () => {
    renderWithClient(
      <BadgeForm
        editing={badge({
          is_auto: true,
          trigger_type: 'complete_n_activities',
          criteria: { count: 5 },
        })}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByDisplayValue('Explorer')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5')).toBeInTheDocument();
  });

  it('disables submit when name is empty', () => {
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    expect(screen.getByText('Criar')).toBeDisabled();
  });

  it('disables submit for new badge when code is empty even with a name', () => {
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Nome do crachá'), {
      target: { value: 'My Badge' },
    });
    expect(screen.getByText('Criar')).toBeDisabled();
  });

  it('enables submit once name and code are filled for a new badge', () => {
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Nome do crachá'), {
      target: { value: 'My Badge' },
    });
    fireEvent.change(screen.getByPlaceholderText('ex: first_arrival'), {
      target: { value: 'MYCODE' },
    });
    expect(screen.getByText('Criar')).not.toBeDisabled();
  });

  it('creates a badge and lower-cases the code on submit', async () => {
    const onDone = vi.fn();
    renderWithClient(<BadgeForm editing={null} onDone={onDone} />);
    fireEvent.change(screen.getByPlaceholderText('Nome do crachá'), {
      target: { value: 'My Badge' },
    });
    fireEvent.change(screen.getByPlaceholderText('ex: first_arrival'), {
      target: { value: 'MYCODE' },
    });
    fireEvent.click(screen.getByText('Criar'));

    await waitFor(() =>
      expect(mockCreateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'mycode', name: 'My Badge' }),
      ),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('updates an existing badge on submit', async () => {
    const onDone = vi.fn();
    renderWithClient(<BadgeForm editing={badge()} onDone={onDone} />);
    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() =>
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith({
        id: 1,
        data: expect.objectContaining({ name: 'Explorer' }),
      }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('uploads icon after create when an icon file is selected', async () => {
    const onDone = vi.fn();
    renderWithClient(<BadgeForm editing={null} onDone={onDone} />);
    fireEvent.change(screen.getByPlaceholderText('Nome do crachá'), {
      target: { value: 'My Badge' },
    });
    fireEvent.change(screen.getByPlaceholderText('ex: first_arrival'), {
      target: { value: 'MYCODE' },
    });

    const file = new File(['x'], 'icon.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Criar'));

    await waitFor(() =>
      expect(mockUploadIconMutateAsync).toHaveBeenCalledWith({ id: 99, image: file }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('uploads icon after update when an icon file is selected', async () => {
    const onDone = vi.fn();
    renderWithClient(<BadgeForm editing={badge()} onDone={onDone} />);

    const file = new File(['x'], 'icon.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() =>
      expect(mockUploadIconMutateAsync).toHaveBeenCalledWith({ id: 1, image: file }),
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('calls onDone when clicking cancel', () => {
    const onDone = vi.fn();
    renderWithClient(<BadgeForm editing={null} onDone={onDone} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onDone).toHaveBeenCalled();
  });

  it('shows the auto-assignment fields when isAuto is checked', () => {
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Condição de atribuição *')).toBeInTheDocument();
  });

  it('keeps submit disabled for auto badge without a trigger selected', () => {
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Nome do crachá'), {
      target: { value: 'My Badge' },
    });
    fireEvent.change(screen.getByPlaceholderText('ex: first_arrival'), {
      target: { value: 'MYCODE' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('Criar')).toBeDisabled();
  });

  it('renders numeric criteria trigger with required number field for auto badges', () => {
    renderWithClient(
      <BadgeForm
        editing={badge({ is_auto: true, trigger_type: 'score_threshold', criteria: {} })}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('ex: 100')).toBeInTheDocument();
  });

  it('shows an error message when the create mutation fails', () => {
    mockMutationState.createIsError = true;
    mockMutationState.createError = new Error('boom');
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('shows an error message when the update mutation fails', () => {
    mockMutationState.updateIsError = true;
    mockMutationState.updateError = new Error('boom');
    renderWithClient(<BadgeForm editing={badge()} onDone={vi.fn()} />);
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders activity criteria select for activity-scoped trigger when auto', async () => {
    renderWithClient(
      <BadgeForm
        editing={badge({ is_auto: true, trigger_type: 'win_activity', criteria: {} })}
        onDone={vi.fn()}
      />,
    );
    await waitFor(() => expect(mockGetActivities).toHaveBeenCalled());
    expect(screen.getByText('Atividade (opcional — vazio = qualquer)')).toBeInTheDocument();
  });

  it('renders checkpoint criteria select for checkpoint-scoped trigger when auto', async () => {
    renderWithClient(
      <BadgeForm
        editing={badge({ is_auto: true, trigger_type: 'first_complete_checkpoint', criteria: {} })}
        onDone={vi.fn()}
      />,
    );
    await waitFor(() => expect(mockGetCheckpoints).toHaveBeenCalled());
    expect(screen.getByText('Posto (opcional — vazio = qualquer)')).toBeInTheDocument();
  });

  it('selects a specific activity for an activity-scoped trigger', async () => {
    renderWithClient(
      <BadgeForm
        editing={badge({ is_auto: true, trigger_type: 'win_activity', criteria: {} })}
        onDone={vi.fn()}
      />,
    );
    expect(await screen.findByText('Act A')).toBeInTheDocument();
    const getSelect = () => screen.getAllByRole('combobox')[1] as HTMLSelectElement;

    fireEvent.change(getSelect(), { target: { value: '1' } });
    await waitFor(() => expect(getSelect()).toHaveValue('1'));

    fireEvent.change(getSelect(), { target: { value: '__any__' } });
    await waitFor(() => expect(getSelect()).toHaveValue('__any__'));
  });

  it('selects a specific checkpoint for a checkpoint-scoped trigger', async () => {
    renderWithClient(
      <BadgeForm
        editing={badge({ is_auto: true, trigger_type: 'first_complete_checkpoint', criteria: {} })}
        onDone={vi.fn()}
      />,
    );
    expect(await screen.findByText('CP A')).toBeInTheDocument();
    const getSelect = () => screen.getAllByRole('combobox')[1] as HTMLSelectElement;

    fireEvent.change(getSelect(), { target: { value: '1' } });
    await waitFor(() => expect(getSelect()).toHaveValue('1'));

    fireEvent.change(getSelect(), { target: { value: '__any__' } });
    await waitFor(() => expect(getSelect()).toHaveValue('__any__'));
  });

  it('updates glyph and color inputs', () => {
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    const glyphInput = screen.getByPlaceholderText(BADGE_GLYPH_PLACEHOLDER);
    fireEvent.change(glyphInput, { target: { value: '⭐' } });
    expect(glyphInput).toHaveValue('⭐');
  });

  it('updates description textarea', () => {
    renderWithClient(<BadgeForm editing={null} onDone={vi.fn()} />);
    const description = screen.getByPlaceholderText('Descrição opcional…');
    fireEvent.change(description, { target: { value: 'A cool badge' } });
    expect(description).toHaveValue('A cool badge');
  });

  it('fills numeric criteria and submits update with the criteria payload', async () => {
    renderWithClient(
      <BadgeForm
        editing={badge({ is_auto: true, trigger_type: 'complete_n_activities', criteria: {} })}
        onDone={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('ex: 5'), { target: { value: '3' } });
    expect(screen.getByText('Guardar')).not.toBeDisabled();

    fireEvent.click(screen.getByText('Guardar'));

    await waitFor(() =>
      expect(mockUpdateMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, data: expect.objectContaining({ criteria: { count: 3 } }) }),
      ),
    );
  });

  it('keeps submit disabled while numeric criteria is unset for an auto badge', () => {
    renderWithClient(
      <BadgeForm
        editing={badge({ is_auto: true, trigger_type: 'score_threshold', criteria: {} })}
        onDone={vi.fn()}
      />,
    );
    expect(screen.getByText('Guardar')).toBeDisabled();
  });
});
