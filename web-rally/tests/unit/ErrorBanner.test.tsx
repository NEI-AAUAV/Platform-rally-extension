import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ErrorBanner from '@/pages/team-members/components/ErrorBanner';

describe('ErrorBanner', () => {
  it('renders the title', () => {
    render(<ErrorBanner title="Erro ao carregar" error={null} />);
    expect(screen.getByText('Erro ao carregar')).toBeInTheDocument();
  });

  it('renders the message from an Error instance', () => {
    render(<ErrorBanner title="Erro" error={new Error('Something broke')} />);
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('renders a generic message when error is not an Error instance', () => {
    render(<ErrorBanner title="Erro" error={{ some: 'object' }} />);
    expect(screen.getByText('Erro desconhecido')).toBeInTheDocument();
  });
});
