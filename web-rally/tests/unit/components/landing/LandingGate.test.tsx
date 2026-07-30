import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import LandingGate from '@/components/landing/LandingGate';
import type { Branding } from '@/lib/branding';

const base: Branding = {
  eventName: 'Carnaval 2026',
  eventSubtitle: 'Competição de Equipas',
  accentColor: '#dc2626',
  bannerSrc: '/banner.jpg',
  logoSrc: '',
  faviconHref: '/rally/favicon.ico',
  customFaviconUrl: '',
  themeColor: '#dc2626',
};

const make = (over: Partial<Branding> = {}): Branding => ({ ...base, ...over });
const noop = () => {};

describe('LandingGate', () => {
  test('renders event name and subtitle', () => {
    render(<LandingGate branding={make()} onStaffLogin={noop} />);
    expect(screen.getByRole('heading', { name: 'Carnaval 2026' })).toBeInTheDocument();
    expect(screen.getByText('Competição de Equipas')).toBeInTheDocument();
  });

  test('omits the subtitle when unset', () => {
    render(<LandingGate branding={make({ eventSubtitle: '' })} onStaffLogin={noop} />);
    expect(screen.queryByText('Competição de Equipas')).not.toBeInTheDocument();
  });

  test('staff login triggers the OIDC sign-in callback', () => {
    const onStaffLogin = vi.fn();
    render(<LandingGate branding={make()} onStaffLogin={onStaffLogin} />);
    fireEvent.click(screen.getByRole('button', { name: /Login Staff/i }));
    expect(onStaffLogin).toHaveBeenCalledTimes(1);
  });

  test('team login uses the default team-login path', () => {
    render(<LandingGate branding={make()} onStaffLogin={noop} />);
    const team = screen.getByRole('link', { name: /Login Equipa/i });
    expect(team).toHaveAttribute('href', '/rally/team-login');
  });

  test('team login href is overridable', () => {
    render(<LandingGate branding={make()} onStaffLogin={noop} teamLoginHref="/custom" />);
    expect(screen.getByRole('link', { name: /Login Equipa/i })).toHaveAttribute('href', '/custom');
  });

  test('shows a monogram from initials when there is no logo', () => {
    render(<LandingGate branding={make({ logoSrc: '' })} onStaffLogin={noop} />);
    // "Carnaval 2026" -> initials "C2"
    expect(screen.getByText('C2')).toBeInTheDocument();
  });

  test('renders the logo image when a logo URL is set', () => {
    render(<LandingGate branding={make({ logoSrc: '/logo.png' })} onStaffLogin={noop} />);
    const logo = screen.getByAltText('Carnaval 2026 logo');
    expect(logo).toHaveAttribute('src', '/logo.png');
  });

  test('renders the banner and hides it after a load error', () => {
    render(<LandingGate branding={make()} onStaffLogin={noop} />);
    const banner = screen.getByAltText('Carnaval 2026 banner');
    expect(banner).toHaveAttribute('src', '/banner.jpg');
    fireEvent.error(banner);
    expect(screen.queryByAltText('Carnaval 2026 banner')).not.toBeInTheDocument();
  });
});
