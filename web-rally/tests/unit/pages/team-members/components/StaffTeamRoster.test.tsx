import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import StaffTeamRoster from '@/pages/team-members/components/StaffTeamRoster';
import type { TeamMemberResponse, DetailedTeam } from '@/client';

vi.mock('@/components/qr/QRCodeDisplay', () => ({
  default: ({ accessCode }: { accessCode: string }) => <div data-testid="qr">{accessCode}</div>,
}));

describe('StaffTeamRoster', () => {
  const members = [
    { id: 1, name: 'Alice', email: 'alice@x.com', is_captain: true },
    { id: 2, name: 'Bob', is_captain: false },
  ] as TeamMemberResponse[];

  it('renders member list with names and captain badge', () => {
    render(
      <StaffTeamRoster teamName="Team A" teamMembers={members} teamData={undefined} />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Capitão')).toBeInTheDocument();
    expect(screen.getByText(/Team A/)).toBeInTheDocument();
  });

  it('renders empty state when no members', () => {
    render(<StaffTeamRoster teamName="Team A" teamMembers={[]} teamData={undefined} />);
    expect(screen.getByText('Nenhum membro registado')).toBeInTheDocument();
  });

  it('renders undefined members gracefully', () => {
    render(<StaffTeamRoster teamName={undefined} teamMembers={undefined} teamData={undefined} />);
    expect(screen.getByText('Membros da Equipa')).toBeInTheDocument();
  });

  it('renders QR code when teamData is provided', () => {
    render(
      <StaffTeamRoster
        teamName="Team A"
        teamMembers={members}
        teamData={{ access_code: 'ABCD-1234' } as unknown as DetailedTeam}
      />,
    );
    expect(screen.getByTestId('qr')).toHaveTextContent('ABCD-1234');
  });
});
