// @vitest-environment jsdom
// @covers tools/app-shell/src/components/contract-ui/RowExpandToggle.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { RowExpandToggle } from '../RowExpandToggle.jsx';

describe('RowExpandToggle (ETP-5593)', () => {
  it('is a down chevron that rotates 180deg when expanded (vertical, default)', () => {
    const { rerender } = render(<RowExpandToggle expanded={false} onToggle={vi.fn()} data-testid="toggle" />);
    const button = screen.getByTestId('toggle');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-label', 'expand');
    expect(button.style.transform).toBe('');

    rerender(<RowExpandToggle expanded onToggle={vi.fn()} data-testid="toggle" />);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-label', 'collapse');
    expect(button.style.transform).toBe('rotate(180deg)');
  });

  it('is a right chevron that rotates 90deg when expanded (horizontal, tree folders)', () => {
    render(<RowExpandToggle expanded orientation="horizontal" onToggle={vi.fn()} data-testid="toggle" />);
    expect(screen.getByTestId('toggle').style.transform).toBe('rotate(90deg)');
  });

  it('keeps the shared circular outline look', () => {
    render(<RowExpandToggle expanded={false} onToggle={vi.fn()} data-testid="toggle" />);
    const { className } = screen.getByTestId('toggle');
    expect(className).toContain('rounded-full');
    expect(className).toContain('border-[hsl(var(--border-control))]');
    expect(className).toContain('h-7 w-7');
  });

  it('uses a caller label and icon test id when given', () => {
    render(<RowExpandToggle expanded={false} onToggle={vi.fn()} label="More info" iconTestId="my-icon" data-testid="toggle" />);
    expect(screen.getByTestId('toggle')).toHaveAttribute('aria-label', 'More info');
    expect(screen.getByTestId('my-icon')).toBeInTheDocument();
  });

  it('lets the click reach the row unless stopPropagation is set', () => {
    const onRowClick = vi.fn();
    const onToggle = vi.fn();
    const { rerender } = render(
      <div onClick={onRowClick}><RowExpandToggle expanded={false} onToggle={onToggle} data-testid="toggle" /></div>,
    );
    fireEvent.click(screen.getByTestId('toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledTimes(1);

    rerender(<div onClick={onRowClick}><RowExpandToggle expanded={false} stopPropagation onToggle={onToggle} data-testid="toggle" /></div>);
    fireEvent.click(screen.getByTestId('toggle'));
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
