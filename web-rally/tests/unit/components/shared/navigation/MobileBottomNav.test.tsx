import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MobileBottomNav } from '@/components/shared/navigation/MobileBottomNav'

const { mockUseUserStore, mockUseRallySettings, mockUseTeamAuth, mockUseGuideAccess, mockPathname } =
  vi.hoisted(() => ({
    mockUseUserStore: vi.fn(),
    mockUseRallySettings: vi.fn(),
    mockUseTeamAuth: vi.fn(),
    mockUseGuideAccess: vi.fn(),
    mockPathname: { current: '/team-progress' },
  }))

vi.mock('@/stores/useUserStore', () => ({
  useUserStore: (selector: (s: unknown) => unknown) => mockUseUserStore(selector),
}))

vi.mock('@/hooks/useRallySettings', () => ({
  default: () => mockUseRallySettings(),
}))

vi.mock('@/hooks/useTeamAuth', () => ({
  default: () => mockUseTeamAuth(),
}))

vi.mock('@/hooks/useGuideAccess', () => ({
  default: () => mockUseGuideAccess(),
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: mockPathname.current }),
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('MobileBottomNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseUserStore.mockImplementation((selector) => selector({ scopes: undefined }))
    mockUseRallySettings.mockReturnValue({
      settings: { show_score_mode: 'visible', show_checkpoint_map: false, badges_enabled: true },
    })
    mockUseGuideAccess.mockReturnValue({ showGuideFeature: false })
  })

  it('shows all 6 team destinations for a signed-in team, incl. Equipa and Definições', () => {
    mockUseTeamAuth.mockReturnValue({
      isAuthenticated: true,
      team: { access_code: 'ABC-123' },
    })
    mockPathname.current = '/team-progress'

    render(<MobileBottomNav />)

    expect(screen.getByText('Progresso')).toBeInTheDocument()
    expect(screen.getByText('Pontos')).toBeInTheDocument()
    expect(screen.getByText('Conquistas')).toBeInTheDocument()
    expect(screen.getByText('Equipa')).toBeInTheDocument()
    expect(screen.getByText('Definições')).toBeInTheDocument()
  })

  it('lights the Progresso tab at /team-progress', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true, team: undefined })
    mockPathname.current = '/team-progress'

    render(<MobileBottomNav />)

    const progresso = screen.getByText('Progresso').closest('a')
    expect(progresso).toHaveClass('rally-accent')
  })

  it('lights the Progresso tab at "/" via its alias, before the redirect lands', () => {
    mockUseTeamAuth.mockReturnValue({ isAuthenticated: true, team: undefined })
    mockPathname.current = '/'

    render(<MobileBottomNav />)

    const progresso = screen.getByText('Progresso').closest('a')
    expect(progresso).toHaveClass('rally-accent')
  })
})
