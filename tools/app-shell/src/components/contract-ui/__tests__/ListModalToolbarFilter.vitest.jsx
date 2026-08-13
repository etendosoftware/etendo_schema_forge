// Unit tests for the generic list-modal toolbar dropdown filter
// (ListModalToolbarFilter.jsx). Popover is mocked so the content always renders
// inline (no portal / open state needed); cn and the ui resolver are stubbed.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Popover: render trigger + content inline so options are always in the DOM.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ children }) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({ children }) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...a) => a.filter(Boolean).join(' '),
}));

import { ListModalToolbarFilter } from '../ListModalToolbarFilter.jsx';

// ui echoes the key.
const ui = (key) => key;

const FILTER = {
  key: 'status',
  field: 'status',
  allLabelKey: 'allStatuses',
  options: [
    { value: 'A', labelKey: 'statusActive' },
    { value: 'I', labelKey: 'statusInactive' },
  ],
};

describe('ListModalToolbarFilter', () => {
  it('shows the all-label as the active trigger label when value is null', () => {
    render(<ListModalToolbarFilter filter={FILTER} value={null} onChange={vi.fn()} ui={ui} />);
    const trigger = screen.getByTestId('list-modal-filter-status');
    expect(trigger).toHaveTextContent('allStatuses');
  });

  it('shows the selected option label as the active trigger label', () => {
    render(<ListModalToolbarFilter filter={FILTER} value="A" onChange={vi.fn()} ui={ui} />);
    const trigger = screen.getByTestId('list-modal-filter-status');
    expect(trigger).toHaveTextContent('statusActive');
  });

  it('renders the all option plus every configured option', () => {
    render(<ListModalToolbarFilter filter={FILTER} value={null} onChange={vi.fn()} ui={ui} />);
    expect(screen.getByTestId('list-modal-filter-status-option-all')).toHaveTextContent('allStatuses');
    expect(screen.getByTestId('list-modal-filter-status-option-A')).toHaveTextContent('statusActive');
    expect(screen.getByTestId('list-modal-filter-status-option-I')).toHaveTextContent('statusInactive');
  });

  it('calls onChange(value) when a concrete option is selected', () => {
    const onChange = vi.fn();
    render(<ListModalToolbarFilter filter={FILTER} value={null} onChange={onChange} ui={ui} />);
    fireEvent.click(screen.getByTestId('list-modal-filter-status-option-A'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('calls onChange(null) when the all option is selected', () => {
    const onChange = vi.fn();
    render(<ListModalToolbarFilter filter={FILTER} value="A" onChange={onChange} ui={ui} />);
    fireEvent.click(screen.getByTestId('list-modal-filter-status-option-all'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
