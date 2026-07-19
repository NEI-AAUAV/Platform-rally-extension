import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DynamicScoringTab from '@/pages/admin/components/DynamicScoringTab';

const {
  mockListDynamicRules,
  mockCreateDynamicRule,
  mockUpdateDynamicRule,
  mockDeleteDynamicRule,
  mockListDynamicAwards,
  mockCreateDynamicAward,
  mockDeleteDynamicAward,
  mockGetTeams,
} = vi.hoisted(() => ({
  mockListDynamicRules: vi.fn(),
  mockCreateDynamicRule: vi.fn(),
  mockUpdateDynamicRule: vi.fn(),
  mockDeleteDynamicRule: vi.fn(),
  mockListDynamicAwards: vi.fn(),
  mockCreateDynamicAward: vi.fn(),
  mockDeleteDynamicAward: vi.fn(),
  mockGetTeams: vi.fn(),
}));

vi.mock('@/client', () => ({
  listDynamicRules: (...args: unknown[]) => mockListDynamicRules(...args),
  createDynamicRule: (...args: unknown[]) => mockCreateDynamicRule(...args),
  updateDynamicRule: (...args: unknown[]) => mockUpdateDynamicRule(...args),
  deleteDynamicRule: (...args: unknown[]) => mockDeleteDynamicRule(...args),
  listDynamicAwards: (...args: unknown[]) => mockListDynamicAwards(...args),
  createDynamicAward: (...args: unknown[]) => mockCreateDynamicAward(...args),
  deleteDynamicAward: (...args: unknown[]) => mockDeleteDynamicAward(...args),
  getTeams: (...args: unknown[]) => mockGetTeams(...args),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const rule = (overrides: Partial<any> = {}) => ({
  id: 1,
  name: 'Rule One',
  rule_type: 'bonus',
  points: 10,
  description: 'desc',
  is_active: true,
  is_automatic: false,
  ...overrides,
});

const award = (overrides: Partial<any> = {}) => ({
  id: 1,
  team_id: 1,
  points: 20,
  reason: 'good job',
  rule_id: null,
  is_active: true,
  ...overrides,
});

const team = (overrides: Partial<any> = {}) => ({ id: 1, name: 'Team Alpha', ...overrides });

describe('DynamicScoringTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockListDynamicRules.mockResolvedValue({ data: [] });
    mockListDynamicAwards.mockResolvedValue({ data: [] });
    mockGetTeams.mockResolvedValue({ data: [] });
    mockCreateDynamicRule.mockResolvedValue({ data: rule() });
    mockUpdateDynamicRule.mockResolvedValue({ data: rule({ is_active: false }) });
    mockDeleteDynamicRule.mockResolvedValue({ data: null });
    mockCreateDynamicAward.mockResolvedValue({ data: award() });
    mockDeleteDynamicAward.mockResolvedValue({ data: null });
  });

  it('renders heading and empty states', async () => {
    renderWithClient(<DynamicScoringTab />);
    expect(screen.getByText('Pontuação Dinâmica')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Sem regras definidas.')).toBeInTheDocument();
    });
    expect(screen.getByText('Sem prémios ativos.')).toBeInTheDocument();
  });

  it('renders a list of rules', async () => {
    mockListDynamicRules.mockResolvedValue({ data: [rule()] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Rule One')).toBeInTheDocument());
    expect(screen.getByText(/bonus · \+10 pts · desc/)).toBeInTheDocument();
  });

  it('renders a list of active awards with team names', async () => {
    mockGetTeams.mockResolvedValue({ data: [team()] });
    mockListDynamicAwards.mockResolvedValue({ data: [award()] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Team Alpha')).toBeInTheDocument());
    expect(screen.getByText(/\+20 pts · good job/)).toBeInTheDocument();
  });

  it('does not show inactive awards', async () => {
    mockListDynamicAwards.mockResolvedValue({ data: [award({ is_active: false })] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Sem prémios ativos.')).toBeInTheDocument());
  });

  it('opens and cancels the new rule form', async () => {
    renderWithClient(<DynamicScoringTab />);
    fireEvent.click(screen.getByText('Nova regra'));
    expect(screen.getByPlaceholderText('Nome da regra')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancelar'));
    expect(screen.queryByPlaceholderText('Nome da regra')).not.toBeInTheDocument();
  });

  it('creates a new rule via the form', async () => {
    renderWithClient(<DynamicScoringTab />);
    fireEvent.click(screen.getByText('Nova regra'));
    fireEvent.change(screen.getByPlaceholderText('Nome da regra'), {
      target: { value: 'New Rule' },
    });
    fireEvent.change(screen.getByPlaceholderText('ex: 50'), { target: { value: '25' } });
    fireEvent.click(screen.getByText('Criar'));
    await waitFor(() => expect(mockCreateDynamicRule).toHaveBeenCalled());
    expect(mockCreateDynamicRule).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ name: 'New Rule', points: 25 }),
      }),
    );
  });

  it('disables create rule button until name and points are filled', () => {
    renderWithClient(<DynamicScoringTab />);
    fireEvent.click(screen.getByText('Nova regra'));
    expect(screen.getByText('Criar')).toBeDisabled();
  });

  it('shows error message when rule creation fails', async () => {
    mockCreateDynamicRule.mockRejectedValue(new Error('failed'));
    renderWithClient(<DynamicScoringTab />);
    fireEvent.click(screen.getByText('Nova regra'));
    fireEvent.change(screen.getByPlaceholderText('Nome da regra'), {
      target: { value: 'X' },
    });
    fireEvent.change(screen.getByPlaceholderText('ex: 50'), { target: { value: '5' } });
    fireEvent.click(screen.getByText('Criar'));
    await waitFor(() => expect(screen.getByText('Erro ao criar regra.')).toBeInTheDocument());
  });

  it('toggles a rule active state', async () => {
    mockListDynamicRules.mockResolvedValue({ data: [rule()] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Rule One')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Desativar'));
    await waitFor(() =>
      expect(mockUpdateDynamicRule).toHaveBeenCalledWith({
        path: { rule_id: 1 },
        body: { is_active: false },
      }),
    );
  });

  it('deletes a rule after confirm', async () => {
    mockListDynamicRules.mockResolvedValue({ data: [rule()] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Rule One')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Eliminar'));
    await waitFor(() =>
      expect(mockDeleteDynamicRule).toHaveBeenCalledWith({ path: { rule_id: 1 } }),
    );
  });

  it('does not delete a rule when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    mockListDynamicRules.mockResolvedValue({ data: [rule()] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Rule One')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Eliminar'));
    expect(mockDeleteDynamicRule).not.toHaveBeenCalled();
  });

  it('opens and cancels the new award form', async () => {
    renderWithClient(<DynamicScoringTab />);
    fireEvent.click(screen.getByText('Novo prémio'));
    expect(screen.getByPlaceholderText('ex: -10 ou 50')).toBeInTheDocument();
    fireEvent.click(screen.getAllByText('Cancelar')[0]!);
    expect(screen.queryByPlaceholderText('ex: -10 ou 50')).not.toBeInTheDocument();
  });

  it('creates a new award via the form', async () => {
    mockGetTeams.mockResolvedValue({ data: [team()] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Novo prémio')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Novo prémio'));
    await waitFor(() => expect(screen.getByText('Team Alpha')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0]!, '1');
    fireEvent.change(screen.getByPlaceholderText('ex: -10 ou 50'), { target: { value: '15' } });
    fireEvent.click(screen.getAllByText('Criar')[0]!);
    await waitFor(() => expect(mockCreateDynamicAward).toHaveBeenCalled());
    expect(mockCreateDynamicAward).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ team_id: 1, points: 15 }),
      }),
    );
  });

  it('shows error message when award creation fails', async () => {
    mockGetTeams.mockResolvedValue({ data: [team()] });
    mockCreateDynamicAward.mockRejectedValue(new Error('failed'));
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Novo prémio')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Novo prémio'));
    await waitFor(() => expect(screen.getByText('Team Alpha')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getAllByRole('combobox')[0]!, '1');
    fireEvent.change(screen.getByPlaceholderText('ex: -10 ou 50'), { target: { value: '15' } });
    fireEvent.click(screen.getAllByText('Criar')[0]!);
    await waitFor(() => expect(screen.getByText('Erro ao criar prémio.')).toBeInTheDocument());
  });

  it('revokes an award after confirm', async () => {
    mockGetTeams.mockResolvedValue({ data: [team()] });
    mockListDynamicAwards.mockResolvedValue({ data: [award()] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('Team Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Revogar'));
    await waitFor(() =>
      expect(mockDeleteDynamicAward).toHaveBeenCalledWith({ path: { award_id: 1 } }),
    );
  });

  it('falls back to id-based label when team not found', async () => {
    mockGetTeams.mockResolvedValue({ data: [] });
    mockListDynamicAwards.mockResolvedValue({ data: [award({ team_id: 99 })] });
    renderWithClient(<DynamicScoringTab />);
    await waitFor(() => expect(screen.getByText('#99')).toBeInTheDocument());
  });
});
