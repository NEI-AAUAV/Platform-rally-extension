import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HomeBottomBanner from '@/pages/home/HomeBottomBanner';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock('@/hooks/useEventTerms', () => ({
  default: () => ({ event: 'rally', checkpoint: 'posto', checkpoints: 'postos' }),
}));

describe('HomeBottomBanner', () => {
  it('renders the CTA with event term and link to team-login', () => {
    render(<HomeBottomBanner />);
    expect(screen.getByText('Pronto para o rally?')).toBeInTheDocument();
    const link = screen.getByText('Entrar agora →');
    expect(link.closest('a')).toHaveAttribute('href', '/team-login');
  });
});
