import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NoTeamsMessage from '@/pages/team-members/components/NoTeamsMessage';

describe('NoTeamsMessage', () => {
  it('renders the provided description', () => {
    render(<NoTeamsMessage description="Nenhuma equipa disponível" />);
    expect(screen.getByText('Nenhuma equipa encontrada')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma equipa disponível')).toBeInTheDocument();
  });
});
