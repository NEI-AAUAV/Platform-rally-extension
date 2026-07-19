import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ExtraShotsField from '@/components/forms/shared/ExtraShotsField';

describe('ExtraShotsField', () => {
  it('renders the input with the current value and helper text', () => {
    render(
      <ExtraShotsField
        idPrefix="team-1"
        extraShots={2}
        onChange={vi.fn()}
        maxExtraShots={10}
        maxExtraShotsPerMember={2}
      />,
    );
    expect(screen.getByLabelText('Extra Shots')).toHaveValue(2);
    expect(screen.getByText(/Max: 10 shots/)).toBeInTheDocument();
    expect(screen.getByText(/2 per team member/)).toBeInTheDocument();
  });

  it('calls onChange with the parsed numeric value when edited', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ExtraShotsField
        idPrefix="team-1"
        extraShots={0}
        onChange={handleChange}
        maxExtraShots={10}
        maxExtraShotsPerMember={2}
      />,
    );
    const input = screen.getByLabelText('Extra Shots');
    await user.clear(input);
    await user.type(input, '5');
    expect(handleChange).toHaveBeenCalledWith(5);
  });

  it('falls back to 0 when the input is cleared to a non-numeric value', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <ExtraShotsField
        idPrefix="team-1"
        extraShots={3}
        onChange={handleChange}
        maxExtraShots={10}
        maxExtraShotsPerMember={2}
      />,
    );
    const input = screen.getByLabelText('Extra Shots');
    await user.clear(input);
    expect(handleChange).toHaveBeenLastCalledWith(0);
  });

  it('shows a warning when extraShots exceeds the maximum', () => {
    render(
      <ExtraShotsField
        idPrefix="team-1"
        extraShots={15}
        onChange={vi.fn()}
        maxExtraShots={10}
        maxExtraShotsPerMember={2}
      />,
    );
    expect(screen.getByText(/Exceeds maximum allowed extra shots/)).toBeInTheDocument();
  });

  it('does not show a warning when extraShots is within the maximum', () => {
    render(
      <ExtraShotsField
        idPrefix="team-1"
        extraShots={5}
        onChange={vi.fn()}
        maxExtraShots={10}
        maxExtraShotsPerMember={2}
      />,
    );
    expect(screen.queryByText(/Exceeds maximum allowed extra shots/)).not.toBeInTheDocument();
  });
});
