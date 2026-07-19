import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ColorModeToggle } from '@/components/theme/ColorModeToggle';
import { ColorModeProvider } from '@/components/theme/ColorModeProvider';
import { COLOR_MODE_STORAGE_KEY } from '@/components/theme/colorModeContext';

function renderToggle(className?: string) {
  return render(
    <ColorModeProvider>
      <ColorModeToggle className={className} />
    </ColorModeProvider>,
  );
}

describe('ColorModeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => {};
    }
  });

  it('renders with default dark mode title', () => {
    renderToggle();
    expect(screen.getByTitle('Modo claro')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = renderToggle('my-class');
    expect(container.querySelector('.my-class')).toBeInTheDocument();
  });

  it('toggles mode on click of the bulb svg', () => {
    renderToggle();
    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();

    fireEvent.click(svg!, { clientX: 5, clientY: 5 });

    expect(screen.getByTitle('Modo escuro')).toBeInTheDocument();
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('light');
  });

  it('toggles mode via pointer drag past the threshold on the cord grip', () => {
    renderToggle();
    const grip = document.querySelector('circle[cx="16"]');
    expect(grip).not.toBeNull();

    fireEvent.pointerDown(grip!, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(grip!, { clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(grip!, { clientX: 10, clientY: 30, pointerId: 1 });

    expect(screen.getByTitle('Modo escuro')).toBeInTheDocument();
  });

  it('does not toggle when pointer drag stays below the threshold', () => {
    renderToggle();
    const grip = document.querySelector('circle[cx="16"]');
    expect(grip).not.toBeNull();

    fireEvent.pointerDown(grip!, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(grip!, { clientY: 2, pointerId: 1 });
    fireEvent.pointerUp(grip!, { clientX: 1, clientY: 2, pointerId: 1 });

    expect(screen.getByTitle('Modo claro')).toBeInTheDocument();
  });

  it('ignores pointer move events before a pointer down', () => {
    renderToggle();
    const grip = document.querySelector('circle[cx="16"]');
    expect(grip).not.toBeNull();

    fireEvent.pointerMove(grip!, { clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(grip!, { clientX: 10, clientY: 30, pointerId: 1 });

    expect(screen.getByTitle('Modo claro')).toBeInTheDocument();
  });

  it('click does not toggle again if a drag pull was just released above zero', () => {
    renderToggle();
    const svg = document.querySelector('svg');
    const grip = document.querySelector('circle[cx="16"]');
    expect(svg).not.toBeNull();
    expect(grip).not.toBeNull();

    fireEvent.pointerDown(grip!, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(grip!, { clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(grip!, { clientX: 10, clientY: 30, pointerId: 1 });
    expect(screen.getByTitle('Modo escuro')).toBeInTheDocument();

    fireEvent.click(svg!, { clientX: 10, clientY: 10 });
    expect(screen.getByTitle('Modo claro')).toBeInTheDocument();
  });
});
