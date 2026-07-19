import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PenaltiesFieldset from '@/components/forms/shared/PenaltiesFieldset';

describe('PenaltiesFieldset', () => {
  const penaltyValues = { vomit: 5, not_drinking: 3 };

  it('renders nothing for penalty inputs when both flags are false', () => {
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{}}
        onChange={vi.fn()}
        penaltyValues={penaltyValues}
        showVomitPenalty={false}
        showNotDrinkingPenalty={false}
      />
    );
    expect(screen.queryByLabelText('Vomit penalty count')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Not drinking penalty count')).not.toBeInTheDocument();
    expect(screen.getByText(/Total penalty:/)).toBeInTheDocument();
  });

  it('renders vomit penalty input when showVomitPenalty is true', () => {
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{}}
        onChange={vi.fn()}
        penaltyValues={penaltyValues}
        showVomitPenalty={true}
        showNotDrinkingPenalty={false}
      />
    );
    expect(screen.getByLabelText('Vomit penalty count')).toBeInTheDocument();
    expect(screen.getByText(/Vomit penalty \(5 pts each\)/)).toBeInTheDocument();
  });

  it('renders not-drinking penalty input when showNotDrinkingPenalty is true', () => {
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{}}
        onChange={vi.fn()}
        penaltyValues={penaltyValues}
        showVomitPenalty={false}
        showNotDrinkingPenalty={true}
      />
    );
    expect(screen.getByLabelText('Not drinking penalty count')).toBeInTheDocument();
    expect(screen.getByText(/Not drinking penalty \(3 pts each\)/)).toBeInTheDocument();
  });

  it('defaults vomit input value to 0 when penalties.vomit is undefined', () => {
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{}}
        onChange={vi.fn()}
        penaltyValues={penaltyValues}
        showVomitPenalty={true}
        showNotDrinkingPenalty={false}
      />
    );
    expect(screen.getByLabelText('Vomit penalty count')).toHaveValue(0);
  });

  it('uses the provided vomit penalty value', () => {
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{ vomit: 2 }}
        onChange={vi.fn()}
        penaltyValues={penaltyValues}
        showVomitPenalty={true}
        showNotDrinkingPenalty={false}
      />
    );
    expect(screen.getByLabelText('Vomit penalty count')).toHaveValue(2);
  });

  it('calls onChange with updated vomit value on input change', () => {
    const onChange = vi.fn();
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{ vomit: 1, not_drinking: 2 }}
        onChange={onChange}
        penaltyValues={penaltyValues}
        showVomitPenalty={true}
        showNotDrinkingPenalty={false}
      />
    );
    fireEvent.change(screen.getByLabelText('Vomit penalty count'), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith({ vomit: 4, not_drinking: 2 });
  });

  it('falls back to 0 when vomit input change produces NaN', () => {
    const onChange = vi.fn();
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{ vomit: 1 }}
        onChange={onChange}
        penaltyValues={penaltyValues}
        showVomitPenalty={true}
        showNotDrinkingPenalty={false}
      />
    );
    fireEvent.change(screen.getByLabelText('Vomit penalty count'), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith({ vomit: 0 });
  });

  it('defaults not-drinking input value to 0 when penalties.not_drinking is undefined', () => {
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{}}
        onChange={vi.fn()}
        penaltyValues={penaltyValues}
        showVomitPenalty={false}
        showNotDrinkingPenalty={true}
      />
    );
    expect(screen.getByLabelText('Not drinking penalty count')).toHaveValue(0);
  });

  it('calls onChange with updated not_drinking value on input change', () => {
    const onChange = vi.fn();
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{ vomit: 1, not_drinking: 2 }}
        onChange={onChange}
        penaltyValues={penaltyValues}
        showVomitPenalty={false}
        showNotDrinkingPenalty={true}
      />
    );
    fireEvent.change(screen.getByLabelText('Not drinking penalty count'), {
      target: { value: '7' },
    });
    expect(onChange).toHaveBeenCalledWith({ vomit: 1, not_drinking: 7 });
  });

  it('falls back to 0 when not_drinking input change produces NaN', () => {
    const onChange = vi.fn();
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{ not_drinking: 3 }}
        onChange={onChange}
        penaltyValues={penaltyValues}
        showVomitPenalty={false}
        showNotDrinkingPenalty={true}
      />
    );
    fireEvent.change(screen.getByLabelText('Not drinking penalty count'), {
      target: { value: 'xyz' },
    });
    expect(onChange).toHaveBeenCalledWith({ not_drinking: 0 });
  });

  it('computes total penalty from both vomit and not_drinking counts', () => {
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{ vomit: 2, not_drinking: 3 }}
        onChange={vi.fn()}
        penaltyValues={penaltyValues}
        showVomitPenalty={true}
        showNotDrinkingPenalty={true}
      />
    );
    // 2*5 + 3*3 = 19
    expect(screen.getByText(/19/)).toBeInTheDocument();
  });

  it('computes total penalty as 0 when penalties object is empty', () => {
    render(
      <PenaltiesFieldset
        idPrefix="test"
        penalties={{}}
        onChange={vi.fn()}
        penaltyValues={penaltyValues}
        showVomitPenalty={false}
        showNotDrinkingPenalty={false}
      />
    );
    expect(screen.getByText(/Total penalty:/).textContent).toContain('0');
  });
});
