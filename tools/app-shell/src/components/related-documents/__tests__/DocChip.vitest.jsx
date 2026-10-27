// @covers tools/app-shell/src/components/related-documents/DocChip.jsx
// ETP-5756 — in a narrow footer the chip must stay a single-line pill: only the title
// truncates, the amount and status badge never wrap onto a second line.
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DocChip from '../DocChip.jsx';

describe('DocChip', () => {
  const props = { icon: <i />, iconColor: 'text-x', title: 'Pedido #1000008', amount: 3327.5, currency: 'EUR', status: 'CO', statusLabel: 'Completado' };

  it('is a single-line pill: no wrap class, bounded by its container', () => {
    const { container } = render(<DocChip {...props} />);
    const root = container.firstChild;
    expect(root.className).not.toContain('flex-wrap');
    expect(root.className).toContain('max-w-full');
    expect(root.className).toContain('inline-flex');
  });

  it('truncates only the title and exposes the full text as a tooltip', () => {
    render(<DocChip {...props} />);
    const title = screen.getByText('Pedido #1000008');
    expect(title.className).toContain('truncate');
    expect(title.className).toContain('min-w-0');
    expect(title.getAttribute('title')).toBe('Pedido #1000008');
  });

  it('keeps the amount and the status badge from shrinking', () => {
    render(<DocChip {...props} />);
    const badge = screen.getByText('Completado');
    expect(badge.closest('.shrink-0')).not.toBeNull();
    expect(badge.closest('.shrink-0').parentElement.className).toContain('inline-flex');
    expect(screen.getByText(/3[.,]?327/).className).toContain('shrink-0');
  });
});
