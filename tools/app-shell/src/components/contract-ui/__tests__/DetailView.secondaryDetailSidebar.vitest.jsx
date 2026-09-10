/**
 * ETP-5245 — an inlineEditable secondary tab must NEVER open a side detail panel.
 *
 * A child tab with a `Form` used to render it as a `w-[48rem]` sidebar next to the
 * tab's table whenever a line was selected. On Producto > Costo that squeezed the
 * grid to ~500px, wrapped the column headers onto two lines and forced a horizontal
 * scrollbar — while duplicating fields the row already edits in place.
 *
 * The rule "an inline-editable tab edits in the row, never in a side form" existed,
 * but only on the row-click ENTRY point (`resolveSecondaryRowClickHandler`). The
 * panel's own render guard and the empty-state's `detailSidebarOpen` twin checked
 * only `st.Form && !st.Panel` plus a selection, so any other route to a selected
 * line reopened it — including `closingSecondaryLine`, which is window-global and
 * not scoped to the tab being rendered. The guard now lives at the render site
 * (`shouldShowSecondaryDetailSidebar`), so the panel is impossible for an
 * inline-editable tab whatever sets the selection.
 *
 * Both directions are pinned: a NON-inline tab must keep its panel, its
 * Save/Discard and its Delete button, and an inline tab must keep the affordances
 * that replace them (per-cell autosave via onUpdateRow, row delete via onDeleteRow).
 *
 * Mock set mirrors DetailView.rowClickAndLabel.vitest.js — importing DetailView.jsx
 * pulls in the whole component tree.
 */
// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by
// DetailView.extractedHelpers.vitest.js so the module loads in isolation and
// we can import the extracted pure helpers directly.
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

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({ handleChange: vi.fn() }),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({}),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn(), loading: false }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));

vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: () => null,
}));

vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null }));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));

vi.mock('@/lib/lineFieldChange.js', () => ({
  buildCalloutFormState: vi.fn(() => ({})),
  extractAuxValues: vi.fn(() => ({})),
  normalizeCalloutQty: vi.fn(),
  normalizeCalloutResponse: vi.fn(() => ({})),
  applyQtyZeroGuard: vi.fn(),
  roundAmounts: vi.fn((v) => v),
  resolveSnapshotIdentifiers: vi.fn(() => ({})),
}));

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));


import React from 'react';
import { render } from '@testing-library/react';
import { SecondaryTableTab, shouldShowSecondaryDetailSidebar } from '../DetailView.jsx';

// The real Producto > Costo tab: a child table plus a generated CostingForm.
const COSTING_COLUMNS = [
  { key: 'cost', column: 'Cost', type: 'amount', label: 'Cost' },
  { key: 'startingDate', column: 'DateFrom', type: 'date', label: 'Starting Date' },
  { key: 'endingDate', column: 'DateTo', type: 'date', label: 'Ending Date' },
];

let tableProps;
const ProbeTable = (p) => { tableProps = p; return <div data-testid="probe-table" />; };
const ProbeForm = () => <div data-testid="probe-form" />;

const COSTING_TAB = {
  key: 'costing',
  label: 'Costing',
  Table: ProbeTable,
  Form: ProbeForm,
  addLineFields: { entry: COSTING_COLUMNS },
};

function tabProps(overrides = {}) {
  return {
    st: COSTING_TAB,
    stIdx: 0,
    windowName: 'product',
    linesLayout: 'inlineEditable',
    secondaryInlineLinesRef: () => ({ current: null }),
    secondaryHooks: [{ children: [{ id: 'C1', cost: 10 }] }],
    token: 't',
    apiBaseUrl: '/api',
    selectorContextByEntity: {},
    catalogs: {},
    api: {},
    crud: {},
    ui: (key) => key,
    hook: { editing: true, selected: {} },
    labelOverrides: {},
    extractErrorMessage: vi.fn(),
    enableSecondaryRowDelete: false,
    selectedSecondaryLine: null,
    secondaryLineEdits: null,
    closingSecondaryLine: false,
    addingSecondaryLine: {},
    savingLine: false,
    secondaryAddRowRef: { current: null },
    secondaryAddRowSeed: {},
    secondaryChildDefaults: {},
    hideChevron: false,
    secondaryBarVisible: {},
    secondaryBarClosing: {},
    secondaryDeleting: {},
    secondarySelectedRows: {},
    setSecondarySelectedRows: vi.fn(),
    setCustomModalState: vi.fn(),
    detailPanelTitle: 'Costing Detail',
    addLineLabel: 'add',
    selectedLabel: 'selected',
    loadingLabel: 'loading',
    saveLabel: 'save',
    discardLabel: 'discard',
    deleteLabel: 'delete',
    closeTitle: 'close',
    openCustomModal: vi.fn(),
    openSecondaryLine: vi.fn(),
    onDeleteRow: vi.fn(),
    onCloseDetailPanel: vi.fn(),
    onChange: vi.fn(),
    onAdd: vi.fn(),
    onCancel: vi.fn(),
    onAddLineClick: vi.fn(),
    onSaveLine: vi.fn(),
    onDiscardLine: vi.fn(),
    onDeleteLine: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

const hasPanel = (result) => Boolean(result.container.querySelector('[data-testid="probe-form"]'));

describe('SecondaryTableTab — no side detail panel on an inlineEditable tab (ETP-5245)', () => {
  beforeEach(() => { tableProps = undefined; });

  it('does not render the panel when one of its lines is selected', () => {
    const result = render(<SecondaryTableTab {...tabProps({
      selectedSecondaryLine: { id: 'C1', _tabKey: 'costing' },
    })} />);
    expect(hasPanel(result)).toBe(false);
  });

  it('does not render the panel while the window-global closing flag is set', () => {
    // `closingSecondaryLine` is NOT scoped to this tab — before the fix it alone
    // was enough to open the panel on every Form tab in the window.
    const result = render(<SecondaryTableTab {...tabProps({ closingSecondaryLine: true })} />);
    expect(hasPanel(result)).toBe(false);
  });

  it('keeps the tab table full width (no sibling panel node at all)', () => {
    const result = render(<SecondaryTableTab {...tabProps({
      selectedSecondaryLine: { id: 'C1', _tabKey: 'costing' },
    })} />);
    expect(result.container.querySelector('.w-\\[48rem\\]')).toBeNull();
  });

  it('still refuses to hand the table a row-click handler (entry-point guard intact)', () => {
    render(<SecondaryTableTab {...tabProps()} />);
    expect(tableProps.onRowClick).toBeUndefined();
  });

  it('keeps the row-level delete the panel would otherwise be needed for', () => {
    // The panel carried its own Delete button; an inlineEditable tab deletes from
    // the row's hover trash instead, so removing the panel strands no action.
    render(<SecondaryTableTab {...tabProps()} />);
    expect(typeof tableProps.onDeleteRow).toBe('function');
    expect(typeof tableProps.onUpdateRow).toBe('function');
  });

  it('still shows the empty-state illustration when the tab has no rows', () => {
    // The empty state yields to an open panel; with the panel gone it must render.
    const result = render(<SecondaryTableTab {...tabProps({
      secondaryHooks: [{ children: [] }],
      selectedSecondaryLine: { id: 'C1', _tabKey: 'costing' },
    })} />);
    expect(hasPanel(result)).toBe(false);
    expect(result.container.querySelector('[data-testid="probe-table"]')).toBeNull();
  });
});

describe('SecondaryTableTab — a non-inline tab keeps its side detail panel', () => {
  it('renders the panel for the selected line when linesLayout is not inlineEditable', () => {
    const result = render(<SecondaryTableTab {...tabProps({
      linesLayout: 'readOnly',
      selectedSecondaryLine: { id: 'C1', _tabKey: 'costing' },
    })} />);
    expect(hasPanel(result)).toBe(true);
  });

  it('renders the panel while it slides out', () => {
    const result = render(<SecondaryTableTab {...tabProps({
      linesLayout: 'readOnly',
      closingSecondaryLine: true,
    })} />);
    expect(hasPanel(result)).toBe(true);
  });

  it('opens it from a row click, which is the only entry point', () => {
    render(<SecondaryTableTab {...tabProps({ linesLayout: 'readOnly' })} />);
    expect(typeof tableProps.onRowClick).toBe('function');
  });
});

describe('shouldShowSecondaryDetailSidebar', () => {
  const st = { key: 'costing', Form: ProbeForm };
  const selected = { id: 'C1', _tabKey: 'costing' };

  it('is false for every inlineEditable case', () => {
    expect(shouldShowSecondaryDetailSidebar({
      linesLayout: 'inlineEditable', st, selectedSecondaryLine: selected, closingSecondaryLine: false,
    })).toBe(false);
    expect(shouldShowSecondaryDetailSidebar({
      linesLayout: 'inlineEditable', st, selectedSecondaryLine: null, closingSecondaryLine: true,
    })).toBe(false);
  });

  it('is false for a Panel tab, or a tab with no Form, whatever the layout', () => {
    expect(shouldShowSecondaryDetailSidebar({
      linesLayout: 'readOnly', st: { key: 'costing' }, selectedSecondaryLine: selected,
    })).toBe(false);
    expect(shouldShowSecondaryDetailSidebar({
      linesLayout: 'readOnly', st: { ...st, Panel: ProbeForm }, selectedSecondaryLine: selected,
    })).toBe(false);
  });

  it('is false when the selected line belongs to another tab', () => {
    expect(shouldShowSecondaryDetailSidebar({
      linesLayout: 'readOnly', st, selectedSecondaryLine: { id: 'A1', _tabKey: 'accounting' },
    })).toBe(false);
  });

  it('is true only for a non-inline Form tab with its own line selected or closing', () => {
    expect(shouldShowSecondaryDetailSidebar({
      linesLayout: 'readOnly', st, selectedSecondaryLine: selected,
    })).toBe(true);
    expect(shouldShowSecondaryDetailSidebar({
      linesLayout: 'readOnly', st, selectedSecondaryLine: null, closingSecondaryLine: true,
    })).toBe(true);
  });
});
