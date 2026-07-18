import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeAll } from 'vitest';
import { useForm, FormProvider } from 'react-hook-form';
import HomeLayoutSettings from '@/pages/settings/components/HomeLayoutSettings';
import { DEFAULT_HOME_LAYOUT } from '@/lib/homeLayout';

beforeAll(() => {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver;
});

function Wrapper({ disabled }: { readonly disabled?: boolean }) {
  const methods = useForm({
    defaultValues: {
      home_layout: DEFAULT_HOME_LAYOUT,
      ticker_items_list: [{ value: 'ITEM ONE' }, { value: 'ITEM TWO' }],
    },
  });
  return (
    <FormProvider {...methods}>
      <form>
        <HomeLayoutSettings disabled={disabled} />
      </form>
    </FormProvider>
  );
}

describe('HomeLayoutSettings', () => {
  it('renders section labels for all home sections', () => {
    render(<Wrapper />);
    expect(screen.getByText('Layout da Página Inicial')).toBeInTheDocument();
    expect(screen.getByText('Cabeçalho principal')).toBeInTheDocument();
    expect(screen.getAllByText('Faixa de destaques (ticker)').length).toBeGreaterThan(0);
    expect(screen.getByText('Banner final')).toBeInTheDocument();
  });

  it('renders ticker item inputs with their values', () => {
    render(<Wrapper />);
    expect(screen.getByLabelText('Item 1 da faixa de destaques')).toHaveValue('ITEM ONE');
    expect(screen.getByLabelText('Item 2 da faixa de destaques')).toHaveValue('ITEM TWO');
  });

  it('toggles section visibility switch', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const toggle = screen.getByLabelText('Mostrar secção Cabeçalho principal');
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it('adds a new ticker item on button click', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    await user.click(screen.getByRole('button', { name: /Adicionar item/i }));
    expect(screen.getByLabelText('Item 3 da faixa de destaques')).toBeInTheDocument();
  });

  it('removes a ticker item on trash button click', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const removeButtons = screen.getAllByLabelText('Remover item');
    await user.click(removeButtons[0]!);
    expect(screen.queryByLabelText('Item 2 da faixa de destaques')).not.toBeInTheDocument();
  });

  it('disables reorder and add buttons when disabled prop is set', () => {
    render(<Wrapper disabled />);
    expect(screen.getByRole('button', { name: /Adicionar item/i })).toBeDisabled();
    expect(screen.getAllByLabelText('Reordenar')[0]).toBeDisabled();
    expect(screen.getByLabelText('Item 1 da faixa de destaques')).toBeDisabled();
    expect(screen.getAllByLabelText('Remover item')[0]).toBeDisabled();
  });

  it('falls back to raw section key when label is missing', () => {
    function CustomWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: [{ key: 'unknown_section', visible: true }],
          ticker_items_list: [],
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings />
          </form>
        </FormProvider>
      );
    }
    render(<CustomWrapper />);
    expect(screen.getByText('unknown_section')).toBeInTheDocument();
    expect(screen.getByLabelText('Mostrar secção unknown_section')).toBeInTheDocument();
  });

  it('renders with no home_layout value (defaults to empty array)', () => {
    function EmptyWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: undefined,
          ticker_items_list: [],
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings />
          </form>
        </FormProvider>
      );
    }
    render(<EmptyWrapper />);
    expect(screen.getByText('Layout da Página Inicial')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mostrar secção/)).not.toBeInTheDocument();
  });

  it('renders ticker item with empty value fallback when field value is undefined', () => {
    function UndefinedValueWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: DEFAULT_HOME_LAYOUT,
          ticker_items_list: [{ value: undefined }],
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings />
          </form>
        </FormProvider>
      );
    }
    render(<UndefinedValueWrapper />);
    expect(screen.getByLabelText('Item 1 da faixa de destaques')).toHaveValue('');
  });

  it('disables adding a ticker item once MAX_TICKER_ITEMS is reached', () => {
    function MaxTickerWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: DEFAULT_HOME_LAYOUT,
          ticker_items_list: Array.from({ length: 20 }, (_, i) => ({ value: `Item ${i}` })),
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings />
          </form>
        </FormProvider>
      );
    }
    render(<MaxTickerWrapper />);
    expect(screen.getByRole('button', { name: /Adicionar item/i })).toBeDisabled();
  });

  it('types into a ticker item input and updates its value', async () => {
    const user = userEvent.setup();
    render(<Wrapper />);
    const input = screen.getByLabelText('Item 1 da faixa de destaques');
    await user.clear(input);
    await user.type(input, 'NEW VALUE');
    expect(input).toHaveValue('NEW VALUE');
  });

  it('applies custom className', () => {
    function ClassNameWrapper() {
      const methods = useForm({
        defaultValues: {
          home_layout: DEFAULT_HOME_LAYOUT,
          ticker_items_list: [],
        },
      });
      return (
        <FormProvider {...methods}>
          <form>
            <HomeLayoutSettings className="custom-class" />
          </form>
        </FormProvider>
      );
    }
    const { container } = render(<ClassNameWrapper />);
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});
