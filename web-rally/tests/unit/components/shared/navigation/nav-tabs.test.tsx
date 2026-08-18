import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import NavTabs from '@/components/shared/navigation/nav-tabs'

const {
  mockUseNavAudience,
  mockUseRallySettings,
  mockUseGuideAccess,
  mockStaffLogin,
  mockPathname,
} = vi.hoisted(() => ({
  mockUseNavAudience: vi.fn(),
  mockUseRallySettings: vi.fn(),
  mockUseGuideAccess: vi.fn(),
  mockStaffLogin: vi.fn(),
  mockPathname: { current: '/scoreboard' },
}))

vi.mock('@/hooks/useNavAudience', () => ({ default: () => mockUseNavAudience() }))
vi.mock('@/hooks/useRallySettings', () => ({ default: () => mockUseRallySettings() }))
vi.mock('@/hooks/useGuideAccess', () => ({ default: () => mockUseGuideAccess() }))
vi.mock('@/hooks/useLoginLink', () => ({ default: () => mockStaffLogin }))
vi.mock('@/hooks/useEventTerms', () => ({ default: () => ({ checkpoints: 'postos' }) }))
vi.mock('@/hooks/useClickOutside', () => ({ default: () => {} }))
vi.mock('@/hooks/useBackDismiss', () => ({ useBackDismiss: () => {} }))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: mockPathname.current }),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const audience = (over: Record<string, unknown> = {}) => ({
  isAdminOrManager: false,
  isStaff: false,
  isGuide: false,
  isPrivileged: false,
  isTeamAuthenticated: false,
  isDualRole: false,
  viewMode: 'staff' as const,
  toggleViewMode: vi.fn(),
  showTeamView: false,
  scopes: undefined as string[] | undefined,
  ...over,
})

const openDrawer = () => fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
const drawer = () => screen.getByRole('dialog', { hidden: true })

describe('NavTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname.current = '/scoreboard'
    mockUseRallySettings.mockReturnValue({
      settings: { show_score_mode: 'visible', show_checkpoint_map: false, badges_enabled: true },
    })
    mockUseGuideAccess.mockReturnValue({ showGuideFeature: true })
    mockUseNavAudience.mockReturnValue(audience())
  })

  it('renders management routes both inline (lg) and inside the Gestão dropdown', () => {
    mockUseNavAudience.mockReturnValue(
      audience({ isAdminOrManager: true, isPrivileged: true, scopes: ['admin'] }),
    )

    render(<NavTabs />)

    // Inline variant (hidden below lg) plus the dropdown trigger coexist.
    expect(screen.getByRole('button', { name: /Gestão/ })).toBeInTheDocument()
    const inlineAdmin = screen.getAllByText('Admin').map((el) => el.closest('li'))
    expect(inlineAdmin.some((li) => li?.className.includes('lg:block'))).toBe(true)
  })

  it('omits the Gestão section entirely when there are no management routes', () => {
    render(<NavTabs />)

    expect(screen.queryByRole('button', { name: /Gestão/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Gestão')).not.toBeInTheDocument()
  })

  it('keeps the logged-out auth block in the drawer footer, out of the scrolling list', () => {
    render(<NavTabs />)
    openDrawer()

    const list = within(drawer()).getByRole('list')
    expect(within(list).queryByText('Iniciar sessão')).not.toBeInTheDocument()

    const loginButton = within(drawer()).getByText('Iniciar sessão')
    expect(loginButton.closest('ul')).toBeNull()
  })

  it('does not render the auth block for a signed-in user', () => {
    mockUseNavAudience.mockReturnValue(audience({ isTeamAuthenticated: true, showTeamView: true }))

    render(<NavTabs />)
    openDrawer()

    expect(within(drawer()).queryByText('Iniciar sessão')).not.toBeInTheDocument()
  })

  it('closes the drawer when a link is followed', () => {
    mockUseNavAudience.mockReturnValue(audience({ isTeamAuthenticated: true, showTeamView: true }))

    render(<NavTabs />)
    openDrawer()
    expect(drawer()).toHaveAttribute('open')

    const drawerList = within(drawer()).getByRole('list')
    fireEvent.click(within(drawerList).getByText('Progresso'))

    expect(drawer()).not.toHaveAttribute('open')
  })

  it('shows the event identity in the drawer header when branding is supplied', () => {
    render(<NavTabs branding={{ eventName: 'Rally NEI', logoSrc: '' }} />)
    openDrawer()

    expect(within(drawer()).getByText('Rally NEI')).toBeInTheDocument()
  })
})
