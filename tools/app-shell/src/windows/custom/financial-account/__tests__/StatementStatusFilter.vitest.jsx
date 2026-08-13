import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Stub DistinctValuesFilter so we can inspect props instead of mounting the
// real Popover (Radix portals, popper, etc.). We render a minimal surrogate
// that exposes the wired contract: codes, labels, allLabel, current value.
vi.mock('@/components/ui/distinct-values-filter', () => ({
  DistinctValuesFilter: ({ codes, labelFor, allLabel, searchPlaceholder, value, onChange }) => (
    <div data-testid="stub-distinct">
      <div data-testid="all-label">{allLabel}</div>
      <div data-testid="search-placeholder">{searchPlaceholder}</div>
      <div data-testid="current-value">{value ?? '__null__'}</div>
      <ul data-testid="codes">
        {codes.map((c) => (
          <li key={c}>{`${c}::${labelFor(c)}`}</li>
        ))}
      </ul>
      <button type="button" data-testid="trigger-change" onClick={() => onChange('PARTIAL')}>
        change
      </button>
    </div>
  ),
}));

import { StatementStatusFilter } from '../StatementStatusFilter.jsx';

describe('StatementStatusFilter', () => {
  it('passes the 3 known statuses (PENDING / PARTIAL / RECONCILED) in order', () => {
    render(<StatementStatusFilter value={null} onChange={vi.fn()} />);
    const items = screen.getByTestId('codes').textContent;
    expect(items).toContain('PENDING::financeAccountStatementsStatusPending');
    expect(items).toContain('PARTIAL::financeAccountStatementsStatusPartial');
    expect(items).toContain('RECONCILED::financeAccountStatementsStatusReconciled');
  });

  it('wires the allLabel and searchPlaceholder i18n keys', () => {
    render(<StatementStatusFilter value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId('all-label')).toHaveTextContent(
      'financeAccountStatementsFilterAllStatuses',
    );
    expect(screen.getByTestId('search-placeholder')).toHaveTextContent('searchStatuses');
  });

  it('passes the current value through to the underlying filter', () => {
    render(<StatementStatusFilter value="PARTIAL" onChange={vi.fn()} />);
    expect(screen.getByTestId('current-value')).toHaveTextContent('PARTIAL');
  });

  it('renders "__null__" placeholder when value is null', () => {
    render(<StatementStatusFilter value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId('current-value')).toHaveTextContent('__null__');
  });

  it('invokes onChange when the underlying filter triggers a change', async () => {
    const onChange = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<StatementStatusFilter value={null} onChange={onChange} />);
    await user.click(screen.getByTestId('trigger-change'));
    expect(onChange).toHaveBeenCalledWith('PARTIAL');
  });
});
