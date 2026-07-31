import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  auth: { current: {} as Record<string, unknown> },
  navigate: vi.fn(),
}));

vi.mock('react-oidc-context', () => ({
  useAuth: () => h.auth.current,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => h.navigate,
}));

import AuthCallback from '@/pages/auth/callback';
import { getResumeValue, setResumeValue } from '@/lib/authResumeStore';

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('shows the loading state while auth is loading', () => {
    h.auth.current = { isLoading: true, isAuthenticated: false, error: undefined };
    render(<AuthCallback />);
    expect(screen.getByText('A concluir sessão…')).toBeInTheDocument();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('navigates to the stored return url and clears it when authenticated', () => {
    setResumeValue('rally_auth_return_url', '/postos/42');
    h.auth.current = { isLoading: false, isAuthenticated: true, error: undefined };
    render(<AuthCallback />);
    expect(h.navigate).toHaveBeenCalledWith({ to: '/postos/42', replace: true });
    expect(getResumeValue('rally_auth_return_url')).toBeNull();
  });

  it('navigates home when authenticated with no stored return url', () => {
    h.auth.current = { isLoading: false, isAuthenticated: true, error: undefined };
    render(<AuthCallback />);
    expect(h.navigate).toHaveBeenCalledWith({ to: '/', replace: true });
  });

  it('navigates home and shows an error message when auth errors', () => {
    h.auth.current = {
      isLoading: false,
      isAuthenticated: false,
      error: { message: 'invalid_grant' },
    };
    render(<AuthCallback />);
    expect(h.navigate).toHaveBeenCalledWith({ to: '/', replace: true });
    expect(screen.getByText('Erro de autenticação: invalid_grant')).toBeInTheDocument();
  });

  it('does nothing when not loading, not authenticated, and no error yet', () => {
    h.auth.current = { isLoading: false, isAuthenticated: false, error: undefined };
    render(<AuthCallback />);
    expect(h.navigate).not.toHaveBeenCalled();
    expect(screen.getByText('A concluir sessão…')).toBeInTheDocument();
  });
});
