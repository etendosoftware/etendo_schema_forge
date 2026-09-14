/**
 * renderTotalsBlock — balanceFooter / linesLayout fallback (ETP-5210).
 *
 * Commit b3d47d0d1 moved the debit/credit totals for the `inlineEditable`
 * lines layout into a column-aligned row rendered INSIDE InlineLinesPanel
 * (see InlineLinesPanel.balanceFooter.vitest.jsx), and made renderTotalsBlock
 * early-return `null` for that layout so the old standalone BalanceFooterPanel
 * summary block doesn't double-render alongside it. This is exactly the
 * regression Alex's review flagged: for every OTHER linesLayout (the classic
 * DataTable path, which has no column-aligned equivalent yet), renderTotalsBlock
 * MUST keep rendering BalanceFooterPanel as before.
 *
 * Mocks BalanceFooterPanel itself (a thin marker) rather than asserting on its
 * internals — those are already covered by BalanceFooterPanel.vitest.jsx.
 */
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, field) => (field ? data?.[field] : undefined),
}));

vi.mock('../BalanceFooterPanel.jsx', () => ({
  default: (props) => <div data-testid="balance-footer-panel-mock" data-config={JSON.stringify(props.config)} />,
}));

import { renderTotalsBlock } from '../detailViewHelpers.jsx';

const BALANCE_FOOTER_CONFIG = { debitField: 'amtSourceDr', creditField: 'amtSourceCr' };

function callRenderTotalsBlock(overrides = {}) {
  return renderTotalsBlock({
    balanceFooter: BALANCE_FOOTER_CONFIG,
    children: [],
    pendingLine: null,
    editingLine: null,
    lineConfig: [],
    formatAmount: (v) => String(v),
    currency: 'EUR',
    summary: [],
    isDocumentReadOnly: false,
    totalDiscountPct: 0,
    onTotalDiscountChange: vi.fn(),
    ...overrides,
  });
}

describe('renderTotalsBlock — inlineEditable early-return (no double-render)', () => {
  it('returns null when linesLayout is "inlineEditable" and balanceFooter is configured', () => {
    const result = callRenderTotalsBlock({ linesLayout: 'inlineEditable' });
    expect(result).toBeNull();
  });
});

describe('renderTotalsBlock — classic/other layouts still render BalanceFooterPanel (ETP-5210 regression)', () => {
  it('renders BalanceFooterPanel when linesLayout is "classic"', () => {
    const result = callRenderTotalsBlock({ linesLayout: 'classic' });
    render(result);
    expect(screen.getByTestId('balance-footer-panel-mock')).toBeInTheDocument();
  });

  it('renders BalanceFooterPanel when linesLayout is undefined (pre-ETP-5210 callers)', () => {
    const result = callRenderTotalsBlock({ linesLayout: undefined });
    render(result);
    expect(screen.getByTestId('balance-footer-panel-mock')).toBeInTheDocument();
  });

  it('passes the balanceFooter config through to BalanceFooterPanel unchanged', () => {
    const result = callRenderTotalsBlock({ linesLayout: 'classic' });
    render(result);
    const mock = screen.getByTestId('balance-footer-panel-mock');
    expect(JSON.parse(mock.getAttribute('data-config'))).toEqual(BALANCE_FOOTER_CONFIG);
  });
});
