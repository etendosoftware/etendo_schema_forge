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
});
