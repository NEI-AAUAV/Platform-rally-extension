import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import NotesField from '@/components/forms/shared/NotesField';

describe('NotesField', () => {
  it('renders the label wired to the textarea via idPrefix', () => {
    render(<NotesField idPrefix="eval" notes="" onChange={vi.fn()} />);

    const textarea = screen.getByLabelText('Notas (opcional)');
    expect(textarea).toHaveAttribute('id', 'eval-notes');
  });

  it('renders the current notes value', () => {
    render(<NotesField idPrefix="eval" notes="existing note" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Notas (opcional)')).toHaveValue('existing note');
  });

  it('calls onChange with the typed value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<NotesField idPrefix="eval" notes="" onChange={onChange} />);

    await user.type(screen.getByLabelText('Notas (opcional)'), 'hi');

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 'h');
  });
});
