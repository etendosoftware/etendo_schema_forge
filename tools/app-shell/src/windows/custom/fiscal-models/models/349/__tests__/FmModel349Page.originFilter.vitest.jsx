// ETP-5027 — the 349 operators table's "Origen" column and the filter its link
// installs on the destination tab.
//
// Two distinct fixes are pinned here:
//
//   1. A RECTIFICATIVE operator row resolves its Origen count from the
//      `rectifications` dataset, never from `originByNif`. Corrective invoices are
//      deliberately absent from `liveInvoices`, so the old lookup silently made a
//      corrective row inherit the invoice count of the REGULAR row sharing its
//      (nif, key) — a wrong number presented as fact.
//   2. The Origen link now FILTERS the destination tab (invoices for regular rows,
//      rectifications for corrective ones) at the same (nif, key) grain the count is
//      aggregated under, so the list and the number always agree.
//
// Mocking conventions follow FmModel349Page.rectifications.vitest.jsx, except that
// SourcesTab is rendered (as a row count + row list) rather than nulled — the whole
// point of the invoices-tab assertions is WHICH sources reach it.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue(false),
}));
vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({ pdfUrl: null, loading: false, generatePdf: vi.fn(), clearPdf: vi.fn() }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: () => null,
  Tabs: ({ tabs, active, onSelect }) => React.createElement(
    'div',
    { role: 'tablist' },
    tabs.map(t => React.createElement(
      'button',
      {
        key: t.id, role: 'tab', 'data-tab-id': t.id,
        'aria-selected': String(t.id === active),
        onClick: () => onSelect(t.id),
      },
      t.label
    ))
  ),
  Banner: () => null,
}));
// SourcesTab is generic (303 renders it too) and receives the ALREADY-FILTERED
// list as `decl.sources`. Surfacing the refs it got is exactly the contract the
// invoices-tab filter must satisfy.
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: ({ decl }) => React.createElement(
    'div',
    { 'data-testid': 'sources-tab', 'data-count': String((decl.sources ?? []).length) },
    (decl.sources ?? []).map(s => React.createElement('span', { key: s.ref, 'data-testid': `source-${s.ref}` }, s.ref))
  ),
  IncidentsTab: ({ onGoToSources }) => React.createElement(
    'button',
    { 'data-testid': 'incidents-go-to-sources', onClick: onGoToSources },
    'go'
  ),
}));
vi.mock('../../../FmOverlays.jsx', () => ({ PresentModal: () => null, FileGenModal: () => null }));
vi.mock('../../../../../../components/contract-ui/DocumentPreview.jsx', () => ({ DocumentPreview: () => null }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('lucide-react', () => ({
  Download: () => null, FileDown: () => null, CircleCheck: () => null, Search: () => null,
  RefreshCw: () => null, Globe: () => null, Eye: () => null, MoreVertical: () => null,
  ChevronDown: () => null, ChevronRight: () => null, Users: () => null, FileEdit: () => null,
  Clock: () => null, TriangleAlert: () => null, Folder: () => null, ReceiptText: () => null,
  Calculator: () => null, PenLine: () => null, ShieldAlert: () => null, Info: () => null,
  OctagonAlert: () => null, ArrowLeft: () => null, FileText: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, X: () => null, Check: () => null,
  FileCheck: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';

const NIF = 'IT12345678901';

// Two operator rows for the SAME VAT number under DIFFERENT AEAT349 keys, plus a
// corrective row that shadows the first. This is the exact shape both bugs needed.
const OP_E       = { bpId: 'bp-1', nif: NIF, name: 'Bramini Vino S.r.l.', key: 'E', base: '1000.00', vies: 'valid', rectificative: false };
const OP_S       = { bpId: 'bp-1', nif: NIF, name: 'Bramini Vino S.r.l.', key: 'S', base: '400.00',  vies: 'valid', rectificative: false };
const OP_E_RECT  = { bpId: 'bp-1', nif: NIF, name: 'Bramini Vino S.r.l.', key: 'E', base: '-30.00',  vies: 'valid', rectificative: true };

// Three regular sales invoices under (NIF, 'E') and one under (NIF, 'S').
const INVOICES = [
  { ref: 'F-1', nifIva: NIF, key: 'E', type: 'Venta' },
  { ref: 'F-2', nifIva: NIF, key: 'E', type: 'Venta' },
  { ref: 'F-3', nifIva: NIF, key: 'E', type: 'Venta' },
  { ref: 'F-9', nifIva: NIF, key: 'S', type: 'Venta' },
];

// A single goods-only sale correction -> contributes to key 'E' only.
const RECTIF_E = {
  ref: 'NC-01', date: '2026-05-05', type: 'Venta', party: 'Bramini Vino S.r.l.',
  nifIva: NIF, originalRef: '10000067', declaredYear: '2025', declaredPeriod: '1T',
  baseProducts: '-30.00', baseServices: '0.00',
};

const makeDecl = (precomputed = {}) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'pending', nif: 'B12345678',
  operators: [], invoices: [], rectifications: [],
  incidents: { blocking: 0 },
  _precomputed: { operators: [], invoices: [], rectifications: [], ...precomputed },
});

const defaultProps = { onBack: vi.fn(), onStatusChange: vi.fn(), token: 'tok', apiBaseUrl: '/api' };

const operatorRows = () => Array.from(document.querySelectorAll('.fm-table tbody tr'));
const originCell = (rowIdx) => operatorRows()[rowIdx].querySelector('.fm-origin-link');
const originText = (rowIdx) => operatorRows()[rowIdx].querySelectorAll('td')[
  operatorRows()[rowIdx].querySelectorAll('td').length - 1
]?.textContent;
const tab = (id) => screen.getAllByRole('tab').find(b => b.getAttribute('data-tab-id') === id);
const activeTabId = () => screen.getAllByRole('tab').find(b => b.getAttribute('aria-selected') === 'true')?.getAttribute('data-tab-id');

beforeEach(() => vi.clearAllMocks());

// ── (1) Origen column: rectificative rows resolve from `rectifications` ───────

describe('FmModel349Page — Origen column on rectificative rows (ETP-5027)', () => {
  it('THE BUG: a corrective row shows its OWN count, not the regular row\'s for the same nif+key', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ operators: [OP_E, OP_E_RECT], invoices: INVOICES, rectifications: [RECTIF_E] })}
        {...defaultProps}
      />
    );
    // The regular (NIF, 'E') row is backed by THREE invoices.
    expect(originCell(0).textContent).toBe('3 facturas venta');
    // The corrective row shares that (nif, key) but is backed by ONE rectification.
    // Reading '3 facturas venta' here is precisely the silent misattribution.
    expect(originCell(1).textContent).toBe('1 factura venta');
  });

  it('falls back to the em-dash when no rectification matches — NEVER to the invoice count', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ operators: [OP_E, OP_E_RECT], invoices: INVOICES, rectifications: [] })}
        {...defaultProps}
      />
    );
    expect(originCell(0).textContent).toBe('3 facturas venta');
    // No link at all on the corrective row, and no inherited number in the cell.
    expect(originCell(1)).toBeNull();
    expect(originText(1)).not.toContain('3');
    expect(originText(1)).toContain('—');
  });

  it('a rectification under a DIFFERENT key does not back the row', () => {
    // Services-only sale correction -> key 'S', so the (NIF, 'E') corrective row
    // must stay unresolved even though the VAT number matches.
    const servicesOnly = { ...RECTIF_E, baseProducts: '0.00', baseServices: '-30.00' };
    render(
      <FmModel349Page
        decl={makeDecl({ operators: [OP_E_RECT], invoices: INVOICES, rectifications: [servicesOnly] })}
        {...defaultProps}
      />
    );
    expect(originCell(0)).toBeNull();
  });

  describe('key derivation from type x non-zero base', () => {
    const cases = [
      ['Venta',  'products', 'E'],
      ['Venta',  'services', 'S'],
      ['Compra', 'products', 'A'],
      ['Compra', 'services', 'I'],
    ];

    it.each(cases)('a %s correction with a non-zero %s base lands under key %s', (type, side, key) => {
      const rectification = {
        ...RECTIF_E, type,
        baseProducts: side === 'products' ? '-30.00' : '0.00',
        baseServices: side === 'services' ? '-30.00' : '0.00',
      };
      render(
        <FmModel349Page
          decl={makeDecl({ operators: [{ ...OP_E_RECT, key }], invoices: [], rectifications: [rectification] })}
          {...defaultProps}
        />
      );
      const expected = type === 'Compra' ? '1 factura compra' : '1 factura venta';
      expect(originCell(0).textContent).toBe(expected);
    });

    it('a MIXED goods+services correction counts under BOTH keys', () => {
      const mixed = { ...RECTIF_E, type: 'Venta', baseProducts: '-30.00', baseServices: '-12.00' };
      render(
        <FmModel349Page
          decl={makeDecl({
            operators: [{ ...OP_E_RECT, key: 'E' }, { ...OP_E_RECT, key: 'S' }],
            invoices: [], rectifications: [mixed],
          })}
          {...defaultProps}
        />
      );
      expect(originCell(0).textContent).toBe('1 factura venta');
      expect(originCell(1).textContent).toBe('1 factura venta');
    });

    it('a zero-zero correction is a no-op and is attributed to no key at all', () => {
      const noop = { ...RECTIF_E, baseProducts: '0.00', baseServices: '0' };
      render(
        <FmModel349Page
          decl={makeDecl({ operators: [OP_E_RECT], invoices: INVOICES, rectifications: [noop] })}
          {...defaultProps}
        />
      );
      expect(originCell(0)).toBeNull();
    });

    it('an unrecognised type is attributed to no key', () => {
      const weird = { ...RECTIF_E, type: 'Otro' };
      render(
        <FmModel349Page
          decl={makeDecl({ operators: [OP_E_RECT], invoices: INVOICES, rectifications: [weird] })}
          {...defaultProps}
        />
      );
      expect(originCell(0)).toBeNull();
    });
  });

  it('a preset op.origin string still wins for a corrective row (legacy/mock shape)', () => {
    render(
      <FmModel349Page
        decl={makeDecl({
          operators: [{ ...OP_E_RECT, origin: '2 facturas compra' }],
          invoices: INVOICES, rectifications: [RECTIF_E],
        })}
        {...defaultProps}
      />
    );
    expect(originCell(0).textContent).toBe('2 facturas compra');
  });

  it('regular rows are unaffected — they keep resolving from the invoices dataset', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ operators: [OP_E, OP_S], invoices: INVOICES, rectifications: [RECTIF_E] })}
        {...defaultProps}
      />
    );
    expect(originCell(0).textContent).toBe('3 facturas venta');
    expect(originCell(1).textContent).toBe('1 factura venta');
  });
});

// ── (2) Origen link installs a per-operator filter on the destination tab ─────

describe('FmModel349Page — Origen filter on the invoices tab (ETP-5027)', () => {
  function renderWithBoth() {
    return render(
      <FmModel349Page
        decl={makeDecl({ operators: [OP_E, OP_S, OP_E_RECT], invoices: INVOICES, rectifications: [RECTIF_E] })}
        {...defaultProps}
      />
    );
  }

  it('clicking Origen switches to the invoices tab and narrows it to that (nif, key)', () => {
    renderWithBoth();
    fireEvent.click(originCell(0));

    expect(activeTabId()).toBe('invoices');
    // 3 of the 4 invoices: the same-NIF/different-key 'S' invoice is excluded.
    expect(screen.getByTestId('sources-tab')).toHaveAttribute('data-count', '3');
    expect(screen.queryByTestId('source-F-9')).not.toBeInTheDocument();
  });

  it('the same-NIF row under another key filters to ITS own invoice', () => {
    renderWithBoth();
    fireEvent.click(originCell(1));
    expect(screen.getByTestId('sources-tab')).toHaveAttribute('data-count', '1');
    expect(screen.getByTestId('source-F-9')).toBeInTheDocument();
  });

  it('the chip shows the filtered count and clears the filter when clicked', () => {
    renderWithBoth();
    fireEvent.click(originCell(0));

    const chip = screen.getByTestId('fm349-invoice-origin-filter-chip');
    expect(chip.querySelector('.fm-toolbar__count-badge').textContent).toBe('3');

    fireEvent.click(chip);
    expect(screen.queryByTestId('fm349-invoice-origin-filter-chip')).not.toBeInTheDocument();
    // Unfiltered again: all four invoices are back.
    expect(screen.getByTestId('sources-tab')).toHaveAttribute('data-count', '4');
  });

  it('renders the FILTER-SPECIFIC empty state, distinct from the generic no-rows one', () => {
    // A preset `origin` string that no live invoice backs -> filter matches nothing.
    render(
      <FmModel349Page
        decl={makeDecl({
          operators: [{ ...OP_E, nif: 'ES-OTHER', origin: '1 factura venta' }],
          invoices: INVOICES, rectifications: [],
        })}
        {...defaultProps}
      />
    );
    fireEvent.click(originCell(0));

    expect(screen.getByTestId('fm349-invoice-origin-filter-empty')).toBeInTheDocument();
    expect(screen.getByTestId('fm349-invoice-origin-filter-empty').textContent)
      .toContain('fm.m349.invoices.filter.empty');
    // The generic SourcesTab is not rendered at all in this state.
    expect(screen.queryByTestId('sources-tab')).not.toBeInTheDocument();
  });

  it('clears when the user leaves the tab', () => {
    renderWithBoth();
    fireEvent.click(originCell(0));
    expect(screen.getByTestId('fm349-invoice-origin-filter-chip')).toBeInTheDocument();

    fireEvent.click(tab('operators'));
    fireEvent.click(tab('invoices'));
    expect(screen.queryByTestId('fm349-invoice-origin-filter-chip')).not.toBeInTheDocument();
    expect(screen.getByTestId('sources-tab')).toHaveAttribute('data-count', '4');
  });

  it('clicking Origen for a DIFFERENT operator replaces the filter rather than stacking it', () => {
    renderWithBoth();
    fireEvent.click(originCell(0));
    expect(screen.getByTestId('sources-tab')).toHaveAttribute('data-count', '3');

    fireEvent.click(tab('operators'));
    fireEvent.click(originCell(1));
    expect(screen.getByTestId('sources-tab')).toHaveAttribute('data-count', '1');
    expect(screen.getByTestId('source-F-9')).toBeInTheDocument();
  });

  it('the Incidencias go-to-sources jump lands UNFILTERED', () => {
    renderWithBoth();
    fireEvent.click(originCell(0));
    fireEvent.click(tab('incidents'));
    fireEvent.click(screen.getByTestId('incidents-go-to-sources'));

    expect(activeTabId()).toBe('invoices');
    expect(screen.queryByTestId('fm349-invoice-origin-filter-chip')).not.toBeInTheDocument();
    expect(screen.getByTestId('sources-tab')).toHaveAttribute('data-count', '4');
  });
});

describe('FmModel349Page — Origen filter on the rectifications tab (ETP-5027)', () => {
  const RECTIF_OTHER = {
    ...RECTIF_E, ref: 'NC-02', nifIva: 'FR99999999999', originalRef: '10000099',
  };
  const RECTIF_SERVICES = {
    ...RECTIF_E, ref: 'NC-03', originalRef: '10000068',
    baseProducts: '0.00', baseServices: '-12.00',
  };

  function renderRectif(extraRectifs = []) {
    return render(
      <FmModel349Page
        decl={makeDecl({
          operators: [OP_E_RECT, { ...OP_E_RECT, key: 'S' }],
          invoices: INVOICES,
          rectifications: [RECTIF_E, RECTIF_OTHER, ...extraRectifs],
        })}
        {...defaultProps}
      />
    );
  }

  const rectifRefs = () => Array.from(document.querySelectorAll('.fm-table tbody tr'))
    .map(tr => tr.textContent);

  it('clicking Origen switches to the rectifications tab and narrows it to that (nif, key)', () => {
    renderRectif([RECTIF_SERVICES]);
    fireEvent.click(originCell(0));

    expect(activeTabId()).toBe('rectif');
    const rows = rectifRefs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('NC-01');
    // Different NIF and same-NIF/different-key rows are both excluded.
    expect(rows[0]).not.toContain('NC-02');
    expect(rows[0]).not.toContain('NC-03');
  });

  it('a mixed goods+services correction survives the filter under BOTH keys', () => {
    const mixed = { ...RECTIF_E, ref: 'NC-04', baseProducts: '-30.00', baseServices: '-12.00' };
    render(
      <FmModel349Page
        decl={makeDecl({
          operators: [OP_E_RECT, { ...OP_E_RECT, key: 'S' }],
          // RECTIF_OTHER (different NIF) must be filtered OUT under both keys, so a
          // no-op filter cannot make this assertion pass by accident.
          invoices: [], rectifications: [mixed, RECTIF_OTHER],
        })}
        {...defaultProps}
      />
    );
    fireEvent.click(originCell(0));           // key 'E'
    let rows = rectifRefs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('NC-04');

    fireEvent.click(tab('operators'));
    fireEvent.click(originCell(1));           // key 'S'
    rows = rectifRefs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('NC-04');
  });

  it('the chip shows the filtered count and clears on click', () => {
    renderRectif();
    fireEvent.click(originCell(0));

    const chip = screen.getByTestId('fm349-rectif-origin-filter-chip');
    expect(chip.querySelector('.fm-toolbar__count-badge').textContent).toBe('1');

    fireEvent.click(chip);
    expect(screen.queryByTestId('fm349-rectif-origin-filter-chip')).not.toBeInTheDocument();
    expect(rectifRefs()).toHaveLength(2);
  });

  it('renders the filter-specific empty state when no rectification matches', () => {
    render(
      <FmModel349Page
        decl={makeDecl({
          operators: [{ ...OP_E_RECT, key: 'A', origin: '1 factura compra' }],
          invoices: [], rectifications: [RECTIF_E],
        })}
        {...defaultProps}
      />
    );
    fireEvent.click(originCell(0));

    expect(screen.getByTestId('fm349-rectif-origin-filter-empty')).toBeInTheDocument();
    expect(screen.getByTestId('fm349-rectif-origin-filter-empty').textContent)
      .toContain('fm.m349.rectif.filter.empty');
    // Not the generic "no rectifications at all" message — there ARE rows.
    expect(screen.queryByText('fm.m349.rectif.empty')).not.toBeInTheDocument();
  });

  it('clears when the user leaves the tab', () => {
    renderRectif();
    fireEvent.click(originCell(0));
    expect(screen.getByTestId('fm349-rectif-origin-filter-chip')).toBeInTheDocument();

    fireEvent.click(tab('operators'));
    fireEvent.click(tab('rectif'));
    expect(screen.queryByTestId('fm349-rectif-origin-filter-chip')).not.toBeInTheDocument();
    expect(rectifRefs()).toHaveLength(2);
  });
});

// ── (3) the `tab` field keeps the two filters apart ──────────────────────────

describe('FmModel349Page — origin filter is scoped to its own tab (ETP-5027)', () => {
  const OPS = [OP_E, OP_E_RECT];
  const DECL = makeDecl({ operators: OPS, invoices: INVOICES, rectifications: [RECTIF_E] });

  it('an invoices filter never leaks into the rectifications tab', () => {
    render(<FmModel349Page decl={DECL} {...defaultProps} />);
    fireEvent.click(originCell(0));                       // regular row -> invoices filter
    expect(screen.getByTestId('fm349-invoice-origin-filter-chip')).toBeInTheDocument();

    fireEvent.click(tab('rectif'));
    expect(screen.queryByTestId('fm349-rectif-origin-filter-chip')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.fm-table tbody tr')).toHaveLength(1);
  });

  it('a rectifications filter never leaks into the invoices tab', () => {
    render(<FmModel349Page decl={DECL} {...defaultProps} />);
    fireEvent.click(originCell(1));                       // corrective row -> rectif filter
    expect(screen.getByTestId('fm349-rectif-origin-filter-chip')).toBeInTheDocument();

    fireEvent.click(tab('invoices'));
    expect(screen.queryByTestId('fm349-invoice-origin-filter-chip')).not.toBeInTheDocument();
    expect(screen.getByTestId('sources-tab')).toHaveAttribute('data-count', '4');
  });
});
