import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfigNumberField } from '@/components/activity-form/ConfigNumberField';

describe('ConfigNumberField', () => {
  it('uses the numeric value directly when value is a number', () => {
    render(
      <ConfigNumberField
        id="f1"
        label="Label"
        configKey="max_points"
        value={42}
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Label')).toHaveValue(42);
  });

  it('converts a string value to a number', () => {
    render(
      <ConfigNumberField
        id="f2"
        label="Label"
        configKey="max_points"
        value="55"
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Label')).toHaveValue(55);
  });

  it('falls back to defaultValue when value is undefined', () => {
    render(
      <ConfigNumberField
        id="f3"
        label="Label"
        configKey="max_points"
        value={undefined}
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Label')).toHaveValue(100);
  });

  it('falls back to defaultValue when value is an empty string (falsy)', () => {
    render(
      <ConfigNumberField
        id="f4"
        label="Label"
        configKey="max_points"
        value=""
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Label')).toHaveValue(100);
  });

  it('falls back to defaultValue when value is false (boolean falsy)', () => {
    render(
      <ConfigNumberField
        id="f5"
        label="Label"
        configKey="max_points"
        value={false}
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Label')).toHaveValue(100);
  });

  it('converts a truthy boolean value via Number()', () => {
    render(
      <ConfigNumberField
        id="f6"
        label="Label"
        configKey="max_points"
        value={true}
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Label')).toHaveValue(1);
  });

  it('calls onChange with the configKey and numeric value on change', () => {
    const onChange = vi.fn();
    render(
      <ConfigNumberField
        id="f7"
        label="Label"
        configKey="max_points"
        value={10}
        defaultValue={100}
        placeholder="100"
        onChange={onChange}
      />
    );
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: '77' } });
    expect(onChange).toHaveBeenCalledWith('max_points', 77);
  });

  it('renders helpText when provided', () => {
    render(
      <ConfigNumberField
        id="f8"
        label="Label"
        configKey="max_points"
        value={10}
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
        helpText="Some help text"
      />
    );
    expect(screen.getByText('Some help text')).toBeInTheDocument();
  });

  it('does not render helpText paragraph when not provided', () => {
    render(
      <ConfigNumberField
        id="f9"
        label="Label"
        configKey="max_points"
        value={10}
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('Some help text')).not.toBeInTheDocument();
  });

  it('applies testId as data-testid attribute', () => {
    render(
      <ConfigNumberField
        id="f10"
        label="Label"
        configKey="max_points"
        value={10}
        defaultValue={100}
        placeholder="100"
        onChange={vi.fn()}
        testId="my-test-id"
      />
    );
    expect(screen.getByTestId('my-test-id')).toBeInTheDocument();
  });
});
