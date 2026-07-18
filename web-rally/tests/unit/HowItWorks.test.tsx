import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import HowItWorks, { HowItWorks as HowItWorksNamed } from '@/pages/home/HowItWorks';

describe('HowItWorks', () => {
  it('renders the section heading', () => {
    render(<HowItWorks />);
    expect(screen.getByRole('heading', { name: 'Como funciona' })).toBeInTheDocument();
  });

  it('renders all three steps with titles and bodies', () => {
    render(<HowItWorks />);
    expect(screen.getByText('Entra com a equipa')).toBeInTheDocument();
    expect(
      screen.getByText('Usa o código da tua equipa para aceder ao percurso e ao progresso ao vivo.'),
    ).toBeInTheDocument();

    expect(screen.getByText('Percorre os postos')).toBeInTheDocument();
    expect(
      screen.getByText('Vai a cada tasca, completa o desafio e faz check-in com o QR code.'),
    ).toBeInTheDocument();

    expect(screen.getByText('Sobe na classificação')).toBeInTheDocument();
    expect(
      screen.getByText('Cada posto soma pontos. Acompanha a pontuação e luta pelo pódio.'),
    ).toBeInTheDocument();
  });

  it('renders step numbers 1, 2 and 3', () => {
    render(<HowItWorks />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('exposes both a named and default export referring to the same component', () => {
    expect(HowItWorksNamed).toBe(HowItWorks);
  });

  it('links the section to its heading via aria-labelledby', () => {
    render(<HowItWorks />);
    const heading = screen.getByRole('heading', { name: 'Como funciona' });
    const section = heading.closest('section');
    expect(section).toHaveAttribute('aria-labelledby', 'how-heading');
    expect(heading).toHaveAttribute('id', 'how-heading');
  });
});
