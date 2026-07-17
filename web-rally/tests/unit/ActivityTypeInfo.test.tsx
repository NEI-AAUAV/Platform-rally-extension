import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ActivityTypeInfo from '@/components/ActivityTypeInfo';

describe('ActivityTypeInfo', () => {
  it('renders info icon closed by default', () => {
    render(<ActivityTypeInfo />);
    expect(screen.queryByText('Tipos de Atividades - Sistema de Pontuação')).not.toBeInTheDocument();
  });

  it('opens the modal when icon is clicked', () => {
    render(<ActivityTypeInfo />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Tipos de Atividades - Sistema de Pontuação')).toBeInTheDocument();
  });

  it('closes modal via close button', () => {
    render(<ActivityTypeInfo />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(screen.queryByText('Tipos de Atividades - Sistema de Pontuação')).not.toBeInTheDocument();
  });

  it('closes modal via X button', () => {
    render(<ActivityTypeInfo />);
    fireEvent.click(screen.getByRole('button'));
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find((b) => b.querySelector('svg')?.classList.contains('lucide-x'));
    if (xButton) fireEvent.click(xButton);
  });

  it('expands and collapses an activity type entry', () => {
    render(<ActivityTypeInfo />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Baseada em Tempo'));
    expect(screen.getByText('Ranking relativo entre todas as equipas')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Baseada em Tempo'));
    expect(screen.queryByText('Ranking relativo entre todas as equipas')).not.toBeInTheDocument();
  });

  it('renders all activity type names', () => {
    render(<ActivityTypeInfo />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Baseada em Tempo')).toBeInTheDocument();
    expect(screen.getByText('Baseada em Pontuação')).toBeInTheDocument();
    expect(screen.getByText('Sim/Não')).toBeInTheDocument();
    expect(screen.getByText('Equipa vs Equipa')).toBeInTheDocument();
    expect(screen.getByText('Geral')).toBeInTheDocument();
  });
});
