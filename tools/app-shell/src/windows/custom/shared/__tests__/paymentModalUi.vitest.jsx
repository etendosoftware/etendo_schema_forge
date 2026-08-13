import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DirBadge } from '../paymentModalUi.jsx';

describe('DirBadge', () => {
  it('renders a green badge for direction "in"', () => {
    const { container } = render(<DirBadge dir="in" size={36} />);
    const badge = container.firstChild;
    expect(badge.style.background).toBe('var(--status-success-bg)');
    expect(badge.style.color).toBe('var(--status-success-fg)');
  });

  it('renders a red badge for direction "out"', () => {
    const { container } = render(<DirBadge dir="out" size={36} />);
    const badge = container.firstChild;
    expect(badge.style.background).toBe('var(--status-destructive-bg)');
    expect(badge.style.color).toBe('var(--status-destructive-fg)');
  });

  it('applies custom size', () => {
    const { container } = render(<DirBadge dir="in" size={48} />);
    const badge = container.firstChild;
    expect(badge.style.width).toBe('48px');
    expect(badge.style.height).toBe('48px');
  });

  it('defaults to size 36', () => {
    const { container } = render(<DirBadge dir="in" />);
    const badge = container.firstChild;
    expect(badge.style.width).toBe('36px');
  });

  it('renders an SVG with an arrow', () => {
    const { container } = render(<DirBadge dir="in" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders a downward arrow for "in" and upward arrow for "out"', () => {
    const { container: containerIn } = render(<DirBadge dir="in" />);
    const { container: containerOut } = render(<DirBadge dir="out" />);

    const inPath = containerIn.querySelector('path')?.getAttribute('d');
    const outPath = containerOut.querySelector('path')?.getAttribute('d');

    expect(inPath).toBe('M12 5v14');
    expect(outPath).toBe('M12 19V5');
  });
});
