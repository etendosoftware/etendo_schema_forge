// ETP-4565 (Pasada1) — failing behavioral coverage proving that, at this
// commit, `SecondaryTableTab`'s add-line bar has NO row-count cap mechanism
// for the `window.secondaryTabs` pattern. `product`, `asset-group` and
// `contacts` (customerAccounting / vendorAccounting) must admit at most one
// record in their accounting tab, mirroring `window.maxDetailLines` for the
// `window.detailEntity` pattern (see docs/ui-customization.md §11) — but
// `secondaryAddLineBar` / `SecondaryTableTab` in `DetailView.jsx` never reads
// `st.maxDetailLines`, so the "+ Add" button stays visible even when the tab
// already has 1 (or more) child rows.
//
// This test is RED on purpose: it asserts the desired fixed behavior (add
// button gone once child count >= st.maxDetailLines) and is expected to fail
// until the fix lands. Do not weaken the assertion to make it pass — the gap
// is real at this commit (see artifacts/__tests__/etp-4565-accounting-tab-
// restrictions.test.js for the matching decisions.json-level assertions).
//
// Mock boilerplate copied from the precedent file (DetailView.secondaryTabs.
// vitest.js) — only what SecondaryTableTab actually touches is mocked.

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ pathname: '/test/123', search: '', hash: '' }),
}));
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/hooks/useEntity', () => ({ useEntity: () => ({ handleChange: vi.fn() }) }));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({}) }));
vi.mock('@/hooks/useCallout', () => ({ useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }) }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ execute: vi.fn(), loading: false }) }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '' }));
vi.mock('@/lib/lineFieldChange.js', () => ({
  buildCalloutFormState: vi.fn(() => ({})),
  extractAuxValues: vi.fn(() => ({})),
  normalizeCalloutQty: vi.fn(),
  normalizeCalloutResponse: vi.fn(() => ({})),
  applyQtyZeroGuard: vi.fn(),
  roundAmounts: vi.fn((v) => v),
  resolveSnapshotIdentifiers: vi.fn(() => ({})),
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createElement as h } from 'react';
import { SecondaryTableTab } from '../DetailView.jsx';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ETP-4565: SecondaryTableTab respects st.maxDetailLines (RED — gap not yet fixed)', () => {
  const makeTable = () => vi.fn(() => h('div', { 'data-testid': 'table' }));

  // Shared defaults — mirrors DetailView.secondaryTabs.vitest.js's baseProps,
  // only what SecondaryTableTab reads.
  const baseProps = (overrides = {}) => ({
    st: { key: 'accounting', Table: makeTable() },
    linesLayout: 'inlineEditable',
    secondaryInlineLinesRef: vi.fn(() => ({ current: null })),
    secondaryHooks: [{ children: [] }],
    stIdx: 0,
    token: 'tok',
    apiBaseUrl: '/api',
    selectorContextByEntity: {},
    openCustomModal: vi.fn(),
    openSecondaryLine: vi.fn(),
    setCustomModalState: vi.fn(),
    selectedSecondaryLine: null,
    setSecondarySelectedRows: vi.fn(),
    enableSecondaryRowDelete: false,
    crud: {},
    onDeleteRow: vi.fn(),
    api: { crud: {} },
    ui: (k) => k,
    extractErrorMessage: vi.fn(),
    secondaryAddRowRef: { current: null },
    addingSecondaryLine: {},
    onAdd: vi.fn(),
    onCancel: vi.fn(),
    catalogs: {},
    hook: { editing: true, selected: {} },
    closingSecondaryLine: false,
    detailPanelTitle: 'Detail',
    onCloseDetailPanel: vi.fn(),
    secondaryLineEdits: null,
    onChange: vi.fn(),
    labelOverrides: {},
    savingLine: false,
    onSaveLine: vi.fn(),
    onDiscardLine: vi.fn(),
    onDeleteLine: vi.fn(),
    loadingLabel: 'Loading',
    saveLabel: 'Save',
    discardLabel: 'Discard',
    deleteLabel: 'Delete',
    onAddLineClick: vi.fn(),
    addLineLabel: 'Add line',
    hideChevron: false,
    secondaryAddLineWrapperRef: { current: null },
    secondaryBarVisible: {},
    secondaryBarClosing: {},
    secondaryBarRects: {},
    secondarySelectedRows: {},
    selectedLabel: 'selected',
    secondaryDeleting: {},
    closeTitle: 'close',
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  });

  it('does NOT render the add-line button once child count reaches st.maxDetailLines (EXPECTED TO FAIL today)', () => {
    const Table = makeTable();
    const st = {
      key: 'accounting',
      Table,
      label: 'Accounting',
      addLineFields: { entry: [{ key: 'fixedAsset', column: 'P_Asset_Acct', type: 'selector', label: 'Fixed Asset' }] },
      // The cap this ticket is about to add support for — a tab already
      // holding 1 child row (== maxDetailLines) must hide its add button.
      maxDetailLines: 1,
    };
    const props = baseProps({
      st,
      // Tab already has one child — the accounting record already exists.
      secondaryHooks: [{ children: [{ id: 'existing-row-1' }] }],
    });

    render(SecondaryTableTab(props));

    // GAP: as of this commit, secondaryAddLineBar/SecondaryTableTab never
    // reads st.maxDetailLines, so the button still renders here — this
    // assertion fails today (RED) and must turn GREEN once the fix lands.
    expect(screen.queryByTestId('action-add-line')).not.toBeInTheDocument();
  });

  it('DOES render the add-line button when child count is below st.maxDetailLines (sanity control — passes both before and after the fix)', () => {
    const Table = makeTable();
    const st = {
      key: 'accounting',
      Table,
      label: 'Accounting',
      addLineFields: { entry: [{ key: 'fixedAsset', column: 'P_Asset_Acct', type: 'selector', label: 'Fixed Asset' }] },
      // maxDetailLines: 2 with 1 existing child — still below the cap.
      // (Using >=1 existing child also avoids the unrelated empty-state
      // branch in SecondaryTableTab, which renders its own plain button
      // with no data-testid when secondaryChildren.length === 0.)
      maxDetailLines: 2,
    };
    const props = baseProps({
      st,
      secondaryHooks: [{ children: [{ id: 'existing-row-1' }] }],
    });

    render(SecondaryTableTab(props));

    expect(screen.getByTestId('action-add-line')).toBeInTheDocument();
  });
});
