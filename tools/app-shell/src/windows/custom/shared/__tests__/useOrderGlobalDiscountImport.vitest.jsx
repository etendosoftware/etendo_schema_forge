// @covers tools/app-shell/src/windows/custom/shared/useOrderGlobalDiscountImport.jsx

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, indeterminate: _indeterminate, onChange, disabled, 'data-testid': _ignored, ...rest }) => (
    <input
      type="checkbox"
      data-testid="checkbox"
      checked={checked || false}
      disabled={disabled || false}
      onChange={onChange || (() => {})}
      {...rest}
    />
  ),
}));

import { render, renderHook, screen, fireEvent } from '@testing-library/react';
import useOrderGlobalDiscountImport from '../useOrderGlobalDiscountImport.jsx';

function hookProps() {
  return renderHook(() => useOrderGlobalDiscountImport()).result.current;
}

/**
 * A `selection` as ImportLinesModal builds it. `orders` = [{ id, pct }] (documentNo = id).
 */
function selection({ orders = [], invoicePct = null, invoiceHasLines = false, invoiceStateKnown = true, carryOn, selectedCount = 1 } = {}) {
  const docs = orders.map(o => ({ id: o.id, documentNo: o.id }));
  return {
    selectedDocuments: docs,
    selectedDocIds: new Set(docs.map(d => d.id)),
    selectedCount,
    documents: docs,
    sharedContext: {
      orderDiscountMap: Object.fromEntries(orders.map(o => [o.id, o.pct])),
      invoiceGlobalDiscount: invoicePct,
      invoiceHasLines,
      invoiceStateKnown,
    },
    extraState: carryOn === undefined ? undefined : { carryGlobalDiscount: carryOn },
    setExtraState: vi.fn(),
  };
}

function renderPanel(sel) {
  const node = hookProps().renderSelectionPanel(sel);
  render(<div data-testid="host">{node}</div>);
  return node;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useOrderGlobalDiscountImport — document row', () => {
  it.each([
    [10, 'importGlobalDiscountTag:{"pct":"10"}'],
    [0, null],
    [undefined, null],
  ])('order at %s %% → tag %s', (pct, expected) => {
    const sel = selection({ orders: [{ id: 'SO-A', pct }] });
    render(<div data-testid="host">{hookProps().renderDocAdornment({ id: 'SO-A' }, sel)}</div>);
    const tag = screen.queryByTestId('ImportGlobalDiscount__tag');
    if (expected) {
      expect(tag).toHaveTextContent(expected);
      // The Figma pill colours, literally: a token-based background (bg-sidebar-accent, #F0F3FF)
      // disappeared against a selected row (#F1F5F9).
      expect(tag.className).toContain('bg-[#EBEFFF]');
      expect(tag.className).toContain('text-[#2B48BC]');
      expect(tag.className).not.toMatch(/(^| )bg-sidebar-accent|(^| )bg-muted/);
      // Readable in dark mode too: the light literals get dark-theme fallbacks.
      expect(tag.className).toContain('dark:bg-primary/25');
      expect(tag.className).toContain('dark:text-sidebar-accent-foreground');
    } else expect(tag).toBeNull();
  });
});

describe('useOrderGlobalDiscountImport — selection panel', () => {
  it('renders nothing when no selected order carries a % and the invoice has none', () => {
    expect(renderPanel(selection({ orders: [{ id: 'SO-A', pct: 0 }] }))).toBeNull();
  });

  it('renders nothing (no toggle, no warning) when the invoice header or lines could not be read', () => {
    expect(renderPanel(selection({ orders: [{ id: 'SO-A', pct: 10 }], invoiceStateKnown: false }))).toBeNull();
  });

  it.each([
    {
      name: 'mixed, invoice without %',
      sel: { orders: [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }] },
      texts: ['importGlobalDiscountMixedTitle', 'importGlobalDiscountMixedBody'],
      // Generic body (QA): no order list, and nothing appended — one key, one line.
      absent: ['SO-A', 'SO-B', 'importGlobalDiscountMixedBodyKeepsInvoice', 'importGlobalDiscountKeepsInvoice'],
    },
    {
      name: 'mixed, invoice with %',
      sel: { orders: [{ id: 'SO-A', pct: 10 }, { id: 'SO-B', pct: 0 }], invoicePct: 5 },
      texts: ['importGlobalDiscountMixedTitle', 'importGlobalDiscountMixedBodyKeepsInvoice:{"invoicePct":"5"}'],
      absent: ['SO-A', 'importGlobalDiscountKeepsInvoice'],
    },
    {
      name: 'invoice 5 % vs orders 0 %',
      sel: { orders: [{ id: 'SO-A', pct: 0 }], invoicePct: 5 },
      texts: [
        'importGlobalDiscountInvoiceMismatchTitle:{"invoicePct":"5"}',
        'importGlobalDiscountInvoiceMismatchBody:{"pct":"0","invoicePct":"5"}',
      ],
      absent: ['importGlobalDiscountKeepsInvoice'],
    },
    {
      name: 'invoice 5 % vs orders 10 %',
      sel: { orders: [{ id: 'SO-A', pct: 10 }], invoicePct: 5 },
      texts: [
        'importGlobalDiscountInvoiceMismatchTitle:{"invoicePct":"5"}',
        'importGlobalDiscountInvoiceMismatchBody:{"pct":"10","invoicePct":"5"}',
      ],
      absent: ['importGlobalDiscountKeepsInvoice'],
    },
    {
      name: 'invoice without % but with lines',
      sel: { orders: [{ id: 'SO-A', pct: 10 }], invoiceHasLines: true },
      texts: [
        'importGlobalDiscountInvoiceHasLinesTitle',
        'importGlobalDiscountInvoiceHasLinesBody:{"pct":"10"}',
      ],
      absent: ['importGlobalDiscountKeepsInvoice'],
    },
  ])('warning ($name): title and its one-key body, no toggle', ({ sel, texts, absent = [] }) => {
    renderPanel(selection(sel));
    const warning = screen.getByTestId('ImportGlobalDiscount__warning');
    for (const text of texts) expect(warning.textContent).toContain(text);
    for (const text of absent) expect(warning.textContent).not.toContain(text);
    expect(screen.queryByTestId('ImportGlobalDiscount__switch')).toBeNull();
  });

  it.each([
    { carryOn: true, invoicePct: null, subtitle: 'importGlobalDiscountCarryApplies' },
    { carryOn: true, invoicePct: 10, subtitle: 'importGlobalDiscountCarryMatchesInvoice:{"pct":"10"}' },
    { carryOn: false, invoicePct: null, subtitle: 'importGlobalDiscountCarryOff' },
    { carryOn: false, invoicePct: 10, subtitle: 'importGlobalDiscountKeepsInvoice:{"invoicePct":"10"}' },
  ])('toggle ON=$carryOn, invoice %=$invoicePct → subtitle $subtitle', ({ carryOn, invoicePct, subtitle }) => {
    renderPanel(selection({ orders: [{ id: 'SO-A', pct: 10 }], invoicePct, carryOn }));
    const toggle = screen.getByTestId('ImportGlobalDiscount__toggle');
    expect(toggle).toHaveTextContent('importGlobalDiscountCarryTitle:{"pct":"10"}');
    expect(toggle.querySelector('p')).toHaveTextContent(subtitle);
    expect(screen.getByTestId('ImportGlobalDiscount__switch')).toHaveAttribute('aria-checked', String(carryOn));
  });

  it('turning the toggle off stores carryGlobalDiscount=false in the modal extra state', () => {
    const sel = selection({ orders: [{ id: 'SO-A', pct: 10 }], carryOn: true });
    renderPanel(sel);
    fireEvent.click(screen.getByTestId('ImportGlobalDiscount__switch'));
    const updater = sel.setExtraState.mock.calls[0][0];
    expect(updater({ other: 1, carryGlobalDiscount: true })).toEqual({ other: 1, carryGlobalDiscount: false });
  });
});

// ETP-5828 QA MCP-2 — both directions import with ONE importOrderLines call that carries the
// discount server-side: the hook writes nothing from the browser (no afterImport header PATCH).
describe('useOrderGlobalDiscountImport — no browser-side write', () => {
  it('offers no afterImport', () => {
    expect(hookProps().afterImport).toBeUndefined();
  });
});

describe('useOrderGlobalDiscountImport — success toast', () => {
  it.each([
    { name: 'carried, one line', args: { count: 1, afterImportResult: { carried: true, pct: 10 } }, expected: { message: 'importGlobalDiscountImportedOne:{"count":1,"pct":"10"}' } },
    { name: 'carried, many lines', args: { count: 2, afterImportResult: { carried: true, pct: 10 } }, expected: { message: 'importGlobalDiscountImportedMany:{"count":2,"pct":"10"}' } },
    { name: 'carried on a partial import', args: { count: 1, partial: true, afterImportResult: { carried: true, pct: 10 } }, expected: null },
    // QA: the order import never falls back to the generic «Líneas importadas desde pedido».
    { name: 'not carried, one line', args: { count: 1, afterImportResult: { carried: false } }, expected: { message: 'importGlobalDiscountNotCarriedOne:{"count":1}' } },
    { name: 'not carried, many lines', args: { count: 3, afterImportResult: { carried: false } }, expected: { message: 'importGlobalDiscountNotCarriedMany:{"count":3}' } },
    { name: 'not carried on a partial import', args: { count: 1, partial: true, afterImportResult: { carried: false } }, expected: null },
  ])('$name', ({ args, expected }) => {
    expect(hookProps().getSuccessToast(args)).toEqual(expected);
  });
});
