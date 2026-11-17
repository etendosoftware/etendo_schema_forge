// @covers tools/app-shell/src/components/contract-ui/SegmentedTabs.jsx
//
// The shared segmented control (ETP-5736): ListView's subset tabs and custom windows' top bars.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SegmentedTabs from '../SegmentedTabs.jsx';

const ITEMS = [
  { key: 'all', label: 'Todos', testId: 'tab-all' },
  { key: 'invoice', label: 'Factura', testId: 'tab-invoice' },
  { key: 'credit', label: 'Rectificativa', testId: 'tab-credit' },
];

function renderTabs(props = {}) {
  const onChange = vi.fn();
  render(<SegmentedTabs items={ITEMS} active={1} onChange={onChange} ariaLabel="Filtros" {...props} />);
  return onChange;
}

describe('SegmentedTabs', () => {
  it('renders one labelled group with a button per item, by test id', () => {
    renderTabs();
    const group = screen.getByRole('group', { name: 'Filtros' });
    expect(group).toHaveClass('h-10');
    expect(group.querySelectorAll('button')).toHaveLength(3);
    expect(screen.getByTestId('tab-invoice')).toHaveTextContent('Factura');
  });

  it('raises only the active item on a card', () => {
    renderTabs();
    expect(screen.getByTestId('tab-invoice')).toHaveClass('bg-card', 'shadow-sm');
    expect(screen.getByTestId('tab-all')).not.toHaveClass('bg-card');
    expect(screen.getByTestId('tab-credit')).not.toHaveClass('bg-card');
  });

  it('sizes every tab at 32px with the Figma line height', () => {
    renderTabs();
    for (const { testId } of ITEMS) {
      expect(screen.getByTestId(testId)).toHaveClass('h-8', 'text-sm', 'leading-6', 'font-medium');
    }
  });

  it('reports the clicked index', () => {
    const onChange = renderTabs();
    fireEvent.click(screen.getByTestId('tab-credit'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('never submits an enclosing form', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <SegmentedTabs items={ITEMS} active={0} onChange={() => {}} ariaLabel="Filtros" />
      </form>,
    );
    fireEvent.click(screen.getByTestId('tab-invoice'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not forward unknown props to the DOM', () => {
    renderTabs({ 'data-testid': 'SegmentedTabs__hash' });
    expect(screen.queryByTestId('SegmentedTabs__hash')).toBeNull();
  });

  it('renders an empty group when there are no items', () => {
    renderTabs({ items: [] });
    expect(screen.getByRole('group', { name: 'Filtros' }).querySelectorAll('button')).toHaveLength(0);
  });

  describe('per-item count badge', () => {
    it('renders a decorative badge plus visually hidden accessible text with the count label', () => {
      renderTabs({ items: [{ ...ITEMS[0], count: 12, countLabel: '12 documents', countTestId: 'count-all' }, ITEMS[1]] });
      const badge = screen.getByTestId('count-all');
      expect(badge).toHaveTextContent('12');
      expect(badge).toHaveAttribute('aria-hidden', 'true');
      expect(badge).not.toHaveAttribute('aria-label');
      const button = screen.getByTestId('tab-all');
      expect(button).toContainElement(badge);
      const hidden = button.querySelector('.sr-only');
      expect(hidden).toHaveTextContent(', 12 documents');
    });

    it('falls back to the bare number as hidden text when there is no countLabel', () => {
      renderTabs({ items: [{ ...ITEMS[0], count: 7, countTestId: 'count-all' }] });
      expect(screen.getByTestId('tab-all').querySelector('.sr-only')).toHaveTextContent(', 7');
    });

    it('renders a zero count (0 is a number, not "no count")', () => {
      renderTabs({ items: [{ ...ITEMS[0], count: 0, countTestId: 'count-all' }] });
      expect(screen.getByTestId('count-all')).toHaveTextContent('0');
    });

    it('renders exactly the label when the item has no count', () => {
      renderTabs({ items: [ITEMS[0]] });
      const button = screen.getByTestId('tab-all');
      expect(button.querySelector('span')).toBeNull();
      expect(button.querySelector('.sr-only')).toBeNull();
      expect(button).toHaveTextContent(/^Todos$/);
    });

    it('renders no badge while the count is null (still loading)', () => {
      renderTabs({ items: [{ ...ITEMS[0], count: null, countTestId: 'count-all' }] });
      expect(screen.queryByTestId('count-all')).toBeNull();
      expect(screen.getByTestId('tab-all')).toHaveTextContent(/^Todos$/);
    });

    it('still calls onChange with the index when the badge itself is clicked', () => {
      const onChange = renderTabs({ items: [ITEMS[0], { ...ITEMS[1], count: 3, countTestId: 'count-invoice' }] });
      fireEvent.click(screen.getByTestId('count-invoice'));
      expect(onChange).toHaveBeenCalledWith(1);
    });
  });
});
