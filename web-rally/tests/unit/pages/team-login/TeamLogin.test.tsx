import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamLogin from '@/pages/team-login/index';

const { mockNavigate, mockSearch, mockUseTeamAuth, mockUseStaffLogin, mockToast, mockLogin } =
  vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockSearch: vi.fn(() => ({})),
    mockUseTeamAuth: vi.fn(),
    mockUseStaffLogin: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
    mockLogin: vi.fn(),
  }));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearch: () => mockSearch(),
}));

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}));

vi.mock('@/hooks/useLoginLink', () => ({
  default: () => mockUseStaffLogin(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useAppToast: () => mockToast,
}));

vi.mock('@/components/qr/QRCodeScanner', () => ({
  default: ({
    isOpen,
    onScan,
  }: {
    isOpen: boolean;
    onScan: (data: string) => void;
  }) =>
    isOpen ? (
      <div data-testid="qr-scanner">
        <button onClick={() => onScan('https://example.com/team-login?code=AXYZ-1234')}>
          scan-url
        </button>
        <button onClick={() => onScan('AXYZ-1234')}>scan-plain</button>
        <button onClick={() => onScan('not-a-code')}>scan-invalid</button>
      </div>
    ) : null,
}));

describe('TeamLogin page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockReturnValue({});
    mockUseStaffLogin.mockReturnValue(vi.fn());
    mockUseTeamAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      teamData: null,
      isLoggingIn: false,
      loginError: null,
    });
  });

  it('renders the login form', () => {
    render(<TeamLogin />);
    expect(screen.getByText('Login de Equipa')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('XXXX-XXXX')).toBeInTheDocument();
  });

  it('shows the "trocar equipa" heading when already authenticated', () => {
    mockUseTeamAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: true,
      teamData: { team_name: 'Team A' },
      isLoggingIn: false,
      loginError: null,
    });
    render(<TeamLogin />);
    expect(screen.getByText('Trocar Equipa')).toBeInTheDocument();
    expect(screen.getByText(/Equipa atual: Team A/)).toBeInTheDocument();
  });

  it('shows a toast error when submitting an empty code', async () => {
    const user = userEvent.setup();
    render(<TeamLogin />);
    // Button is disabled with empty code, so directly submit the form
    const form = screen.getByPlaceholderText('XXXX-XXXX').closest('form')!;
    // fireEvent submit bypasses disabled-button restriction
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });
    void user;
  });

  it('logs in successfully and navigates', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TeamLogin />);

    await user.type(screen.getByPlaceholderText('XXXX-XXXX'), 'ABCD-1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('ABCD-1234');
    });
    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/team-progress' });
    });
  });

  it('shows an error toast on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid code'));
    const user = userEvent.setup();
    render(<TeamLogin />);

    await user.type(screen.getByPlaceholderText('XXXX-XXXX'), 'WRONG');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Invalid code');
    });
  });

  it('displays a loginError message', () => {
    mockUseTeamAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      teamData: null,
      isLoggingIn: false,
      loginError: new Error('bad code'),
    });
    render(<TeamLogin />);
    expect(screen.getByText('bad code')).toBeInTheDocument();
  });

  it('pre-fills and auto-submits code from URL', async () => {
    mockSearch.mockReturnValue({ code: 'AXYZ-1234' });
    mockLogin.mockResolvedValue(undefined);
    render(<TeamLogin />);

    await waitFor(
      () => {
        expect(mockLogin).toHaveBeenCalledWith('AXYZ-1234');
      },
      { timeout: 2000 },
    );
  });

  it('opens the QR scanner when the camera button is clicked', async () => {
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle('Ler código QR com câmara'));
    expect(screen.getByTestId('qr-scanner')).toBeInTheDocument();
  });

  it('triggers staff login on NEI account button click', async () => {
    const onStaffLogin = vi.fn();
    mockUseStaffLogin.mockReturnValue(onStaffLogin);
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByRole('button', { name: /Entrar \/ Registar com conta NEI/i }));
    expect(onStaffLogin).toHaveBeenCalled();
  });

  it('extracts the code from a scanned QR URL and auto-submits', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle('Ler código QR com câmara'));
    await user.click(screen.getByText('scan-url'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('AXYZ-1234');
    });
  });

  it('accepts a plain XXXX-XXXX code scanned directly', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle('Ler código QR com câmara'));
    await user.click(screen.getByText('scan-plain'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('AXYZ-1234');
    });
  });

  it('shows an error toast for an invalid scanned QR code', async () => {
    const user = userEvent.setup();
    render(<TeamLogin />);
    await user.click(screen.getByTitle('Ler código QR com câmara'));
    await user.click(screen.getByText('scan-invalid'));

    expect(mockToast.error).toHaveBeenCalledWith('Código QR inválido. Por favor, tente novamente.');
  });
});
