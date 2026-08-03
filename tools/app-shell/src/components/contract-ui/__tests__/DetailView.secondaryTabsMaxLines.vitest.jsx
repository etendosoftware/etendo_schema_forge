// ETP-4565 — regression coverage for `SecondaryTableTab`'s add-line row-count
// cap on the `window.secondaryTabs` pattern. `product`, `asset-group` and
// `contacts` (customerAccounting / vendorAccounting) must admit at most one
// record in their accounting tab, mirroring `window.maxDetailLines` for the
// `window.detailEntity` pattern (see docs/ui-customization.md §11) —
// `secondaryAddLineBar` / `SecondaryTableTab` in `DetailView.jsx` reads
// `st.maxDetailLines` and hides the "+ Add" button once the tab already has
// as many child rows as the cap allows.
//
// These tests guard that behavior: the add button must stay hidden once
// child count >= st.maxDetailLines (see artifacts/__tests__/etp-4565-
// accounting-tab-restrictions.test.js for the matching decisions.json-level
// assertions). Do not weaken these assertions — they are the regression
// backstop for the gating logic.
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

describe('ETP-4565: SecondaryTableTab respects st.maxDetailLines', () => {
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

  it('does NOT render the add-line button once child count reaches st.maxDetailLines', () => {
    const Table = makeTable();
    const st = {
      key: 'accounting',
      Table,
      label: 'Accounting',
      addLineFields: { entry: [{ key: 'fixedAsset', column: 'P_Asset_Acct', type: 'selector', label: 'Fixed Asset' }] },
      // A tab already holding 1 child row (== maxDetailLines) must hide its
      // add button.
      maxDetailLines: 1,
    };
    const props = baseProps({
      st,
      // Tab already has one child — the accounting record already exists.
      secondaryHooks: [{ children: [{ id: 'existing-row-1' }] }],
    });

    render(SecondaryTableTab(props));

    // secondaryAddLineBar/SecondaryTableTab reads st.maxDetailLines, so the
    // button is correctly absent once the cap is reached.
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
