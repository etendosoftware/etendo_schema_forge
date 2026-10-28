// @covers tools/app-shell/src/components/contract-ui/ListModalWindow.jsx
// @covers tools/app-shell/src/components/contract-ui/RefreshButton.jsx
// @covers tools/app-shell/src/components/contract-ui/listModalColumnWidth.js
// --- Module mocks (hoisted before the component import) --------------------
//
// ListModalWindow no longer renders DataTable — it renders an in-house grid
// (ListModalGrid) plus a toolbar (back button, dropdown filters, search, "New"),
// a dismissible banner, and per-row edit + inline-toggle actions. The two new
// child components (listModalCells, ListModalToolbarFilter) are stubbed here so
// these tests stay focused on ListModalWindow behaviour; the children get their
// own dedicated test files.

import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Keep the request boundary stable while allowing each case to route API answers.
let apiFetchMock = vi.fn();
let gridColumnViewsEnabled = false;
vi.mock('@/auth/useApiFetch.js', async () => {
  const { useMemo } = await import('react');
  return { useApiFetch: (baseUrl = '') => useMemo(() => (path, options = {}) =>
    apiFetchMock(`${options.baseUrl ?? baseUrl}${path}`, options), [baseUrl]) };
});
vi.mock('@/lib/flags', () => ({
  GRID_COLUMN_VIEWS: 'grid-column-views',
  useFeatureFlag: () => gridColumnViewsEnabled,
}));

// react-router-dom: capture the navigate mock so we can assert the back button.
const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

// i18n: useUI echoes the key (so banner / titles assert against the key name);
// useMenuLabel echoes the label.
vi.mock('@/i18n', () => ({
  // Echoes the key. When the caller interpolates a `count` (the bulk-delete selection
  // bar's "N selected" pill, the bulk confirm dialog) the count is appended, so the
  // selection counter is assertable without shipping real translations into the test.
  useUI: () => (key, params) => (params?.count != null ? `${key} (${params.count})` : key),
  useMenuLabel: () => (label) => label,
  // useLabel echoes the column name so footer-toggle label assertions are predictable.
  useLabel: () => (column) => column,
  // ListSortPopover (added to the toolbar in ETP-4921) resolves each menu entry through
  // resolveColumnLabel, which reads the active locale.
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

// Auth: token comes from context unless passed as a prop.
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'ctx-token' }),
}));

// Page meta is a no-op side effect in tests.
vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => {},
}));

// Backend error translation: the real module (useEntity's extractErrorMessage reads
// messageKeys / messageParams through it), with translateBackendError replaced by a spy that
// passes a plain message through and marks a KEYED refusal as translated — so a test can tell
// that a refusal went through the shared reader, with the keys, and not straight to the screen.
vi.mock('@/lib/backendErrors.js', async (importOriginal) => ({
  ...(await importOriginal()),
  translateBackendError: vi.fn((raw, _t, options) => (
    options?.messageKeys?.length ? `translated:${options.messageKeys.join('+')}` : raw
  )),
}));

// toast: collect calls.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));

// useNeoResource is driven per-test via this mutable holder.
const neoState = { data: [], loading: false, reload: vi.fn() };
vi.mock('@/hooks/useNeoResource.js', () => ({
  useNeoResource: () => neoState,
  getApiBase: () => '',
}));

// resolveIdentifier (real-ish): $_identifier wins, else the raw value.
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[`${key}$_identifier`] ?? row?.[key],
}));

// cn: join truthy class fragments.
vi.mock('@/lib/utils', () => ({
  cn: (...a) => a.filter(Boolean).join(' '),
}));

// Stub the in-house grid cell registry. Exposes a button that triggers
// onToggle(row, col, true) so the inline-toggle PATCH path can be asserted
// without pulling in the real Switch / resolveIdentifier UI deps.
vi.mock('../listModalCells.jsx', () => ({
  ListModalCell: ({ row, col, onToggle, readOnly }) =>
    col.toggle || col.cellType === 'toggle' ? (
      <button
        type="button"
        data-testid={`cell-toggle-${col.key}-${row.id}`}
        data-readonly={String(!!readOnly)}
        onClick={() => onToggle?.(row, col, true)}
      >
        toggle
      </button>
    ) : (
      <span data-testid={`cell-${col.key}-${row.id}`}>{String(row?.[col.key] ?? '')}</span>
    ),
  cellAlignClass: () => 'text-left',
}));

// Stub the toolbar dropdown filter. Renders a button per declared option that
// calls onChange(value); an "all" button calls onChange(null).
vi.mock('../ListModalToolbarFilter.jsx', () => ({
  ListModalToolbarFilter: ({ filter, onChange }) => (
    <div data-testid={`toolbar-filter-${filter.key}`}>
      <button
        type="button"
        data-testid={`toolbar-filter-${filter.key}-all`}
        onClick={() => onChange?.(null)}
      >
        all
      </button>
      {(filter.options ?? []).map((o) => (
        <button
          key={String(o.value)}
          type="button"
          data-testid={`toolbar-filter-${filter.key}-option-${o.value}`}
          onClick={() => onChange?.(o.value)}
        >
          {String(o.value)}
        </button>
      ))}
    </div>
  ),
}));

// Lightweight EntityForm stub: records props (so tests can read the seeded
// form `data`, e.g. the auto-priority value, and drive onChange) and renders a
// marker per received field, so tests can assert which descriptors actually
// reached the form (accounting-dimension gating).
let lastEntityFormProps = null;
vi.mock('../EntityForm.jsx', () => ({
  EntityForm: (props) => {
    lastEntityFormProps = props;
    return (
      <div data-testid="entity-form">
        {(props.fields ?? []).map(f => (
          <span key={f.key} data-testid={`form-field-${f.key}`} />
        ))}
      </div>
    );
  },
}));

import { toast } from 'sonner';
import { translateBackendError } from '@/lib/backendErrors.js';
import { ListModalWindow } from '../ListModalWindow.jsx';
import { columnWidthStyle, cellContentMaxWidth, CELL_PADDING_X } from '../listModalColumnWidth.js';

const API_BASE = 'http://neo.test';
const ENTITY = 'etgoMatchRuleHeader';

const COLUMNS = [
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'priority', column: 'Priority', type: 'number', inlineEdit: true },
  { key: 'active', column: 'IsActive', type: 'boolean', toggle: true },
];

const FIELDS = [
  { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
  { key: 'priority', column: 'Priority', type: 'number', section: 'general' },
];

const SECTIONS = [{ key: 'general' }];

function renderWindow(overrides = {}) {
  const props = {
    entity: ENTITY,
    entityLabel: 'Match Rules',
    columns: COLUMNS,
    fields: FIELDS,
    sections: SECTIONS,
    filters: ['name'],
    config: {},
    api: { baseUrl: '/sws/neo/match-rule' },
    apiBaseUrl: API_BASE,
    token: 'tok-123',
    ...overrides,
  };
  return render(<ListModalWindow {...props} />);
}

function rowCount() {
  return screen.queryAllByTestId(/^list-modal-row-/).length;
}

beforeEach(() => {
  gridColumnViewsEnabled = false;
  neoState.data = [];
  neoState.loading = false;
  neoState.reload = vi.fn();
  lastEntityFormProps = null;
  navigateMock.mockClear();
  vi.restoreAllMocks();
  apiFetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
});

describe('ListModalWindow — toolbar & banner', () => {
  it('renders the "+ New" button (newRecord label by default)', () => {
    renderWindow();
    expect(screen.getByTestId('list-modal-new')).toBeInTheDocument();
    expect(screen.getByText('newRecord')).toBeInTheDocument();
  });

  it('renders the search input when filters are configured', () => {
    renderWindow({ filters: ['name'] });
    expect(screen.getByTestId('list-modal-search')).toBeInTheDocument();
  });

  it('renders the back button', () => {
    renderWindow();
    expect(screen.getByTestId('list-modal-back')).toBeInTheDocument();
  });

  it('renders the banner text when config.bannerKey is set', () => {
    renderWindow({ config: { bannerKey: 'matchRuleBanner' } });
    expect(screen.getByText('matchRuleBanner')).toBeInTheDocument();
  });

  it('does not render a banner when config.bannerKey is absent', () => {
    renderWindow();
    expect(screen.queryByText('matchRuleBanner')).not.toBeInTheDocument();
  });

  it('dismisses the banner when the dismiss button is clicked', () => {
    renderWindow({ config: { bannerKey: 'matchRuleBanner' } });
    expect(screen.getByText('matchRuleBanner')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('list-modal-banner-dismiss'));
    expect(screen.queryByText('matchRuleBanner')).not.toBeInTheDocument();
  });
});

// ETP-4921 — this window draws its own toolbar, so it never inherited ListView's refresh
// button nor ListView's refresh progress bar. Both were added back explicitly; these two
// blocks lock the wiring (reload handler) and the gate (rows already on screen).
describe('ListModalWindow — refresh button', () => {
  it('renders the shared refresh control in the toolbar', () => {
    renderWindow();
    expect(screen.getByTestId('finance-refresh-button')).toBeInTheDocument();
  });

  it('labels it from useUI("refresh") rather than a hardcoded string', () => {
    renderWindow();
    expect(screen.getByTestId('finance-refresh-button')).toHaveAttribute('aria-label', 'refresh');
  });

  it('sits between the sort popover and the "+ New" button', () => {
    renderWindow();
    const refresh = screen.getByTestId('finance-refresh-button');
    const create = screen.getByTestId('list-modal-new');
    // Node.DOCUMENT_POSITION_FOLLOWING === 4 → create comes after refresh.
    expect(refresh.compareDocumentPosition(create) & 4).toBeTruthy();
  });

  it('calls the useNeoResource reload when clicked', () => {
    neoState.data = [{ id: '1', name: 'Alpha' }];
    renderWindow();
    expect(neoState.reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('finance-refresh-button'));
    expect(neoState.reload).toHaveBeenCalledTimes(1);
  });

  it('refetches without unmounting the rows already on screen', () => {
    neoState.data = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
    ];
    renderWindow();
    fireEvent.click(screen.getByTestId('finance-refresh-button'));
    // The click is a pure refetch: the grid must not be torn down or reset to the skeleton.
    expect(rowCount()).toBe(2);
  });
});

describe('ListModalWindow — refresh progress bar', () => {
  it('shows the progress bar while refreshing over rows already on screen', () => {
    neoState.data = [{ id: '1', name: 'Alpha' }];
    neoState.loading = true;
    renderWindow();
    expect(screen.getByTestId('list-modal-progress-bar')).toBeInTheDocument();
    // Rows stay mounted during the refresh — that is the whole point of the bar.
    expect(rowCount()).toBe(1);
  });

  it('hides it on the very first fetch, where the skeletons are the indicator', () => {
    neoState.data = [];
    neoState.loading = true;
    renderWindow();
    expect(screen.queryByTestId('list-modal-progress-bar')).not.toBeInTheDocument();
    expect(rowCount()).toBe(0);
  });

  it('hides it once the fetch settles', () => {
    neoState.data = [{ id: '1', name: 'Alpha' }];
    neoState.loading = false;
    renderWindow();
    expect(screen.queryByTestId('list-modal-progress-bar')).not.toBeInTheDocument();
  });

  it('uses its own testid, not the default ListView one', () => {
    neoState.data = [{ id: '1', name: 'Alpha' }];
    neoState.loading = true;
    renderWindow();
    expect(screen.queryByTestId('list-progress-bar')).not.toBeInTheDocument();
  });
});

describe('ListModalWindow — back button', () => {
  it('calls navigate(-1) when no backTo is configured', () => {
    renderWindow();
    fireEvent.click(screen.getByTestId('list-modal-back'));
    expect(navigateMock).toHaveBeenCalledWith(-1);
  });

  it('calls navigate(config.backTo) when backTo is configured', () => {
    renderWindow({ config: { backTo: '/cuentas' } });
    fireEvent.click(screen.getByTestId('list-modal-back'));
    expect(navigateMock).toHaveBeenCalledWith('/cuentas');
  });
});

describe('ListModalWindow — grid rows', () => {
  it('renders one row per loaded record', () => {
    neoState.data = [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
    ];
    renderWindow();
    expect(rowCount()).toBe(2);
    expect(screen.getByTestId('list-modal-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-row-2')).toBeInTheDocument();
  });
});

describe('ListModalWindow — create modal', () => {
  it('opens the modal (dialog title) when "+ New" is clicked', () => {
    renderWindow({ config: { titleKey: 'matchRuleNewTitle' } });
    expect(screen.queryByText('matchRuleNewTitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('list-modal-new'));
    expect(screen.getByText('matchRuleNewTitle')).toBeInTheDocument();
  });

  it('falls back to createRecord title when no titleKey is configured', () => {
    renderWindow();
    fireEvent.click(screen.getByTestId('list-modal-new'));
    // The dialog heading (not the submit button, which also defaults to createRecord)
    // shows the fallback title.
    expect(screen.getByRole('heading', { name: 'createRecord' })).toBeInTheDocument();
  });
});

describe('ListModalWindow — edit modal', () => {
  it('opens the edit modal when a row edit button is clicked', () => {
    neoState.data = [{ id: 'ROW-42', name: 'Existing' }];
    renderWindow({ config: { editTitleKey: 'matchRuleEditTitle' } });
    expect(screen.queryByText('matchRuleEditTitle')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('list-modal-edit-ROW-42'));
    expect(screen.getByText('matchRuleEditTitle')).toBeInTheDocument();
  });
});

describe('ListModalWindow — search filtering', () => {
  it('filters rows by the configured filter columns', () => {
    neoState.data = [
      { id: '1', name: 'Alpha rule' },
      { id: '2', name: 'Beta rule' },
    ];
    renderWindow({ filters: ['name'] });
    // Initially both rows are shown.
    expect(rowCount()).toBe(2);

    const searchBox = screen.getByTestId('list-modal-search');
    fireEvent.change(searchBox, { target: { value: 'Alpha' } });

    // Only the matching row should remain in the grid.
    expect(rowCount()).toBe(1);
    expect(screen.getByTestId('list-modal-row-1')).toBeInTheDocument();
    expect(screen.queryByTestId('list-modal-row-2')).not.toBeInTheDocument();
  });
});

describe('ListModalWindow — toolbar dropdown filter', () => {
  it('narrows the rows by exact match on the filter field', () => {
    neoState.data = [
      { id: '1', name: 'Alpha', status: 'A' },
      { id: '2', name: 'Beta', status: 'B' },
      { id: '3', name: 'Gamma', status: 'A' },
    ];
    renderWindow({
      config: {
        toolbarFilters: [
          {
            key: 'status',
            field: 'status',
            allLabelKey: 'allStatuses',
            options: [
              { value: 'A', labelKey: 'statusA' },
              { value: 'B', labelKey: 'statusB' },
            ],
          },
        ],
      },
    });
    // No filter applied → all three rows.
    expect(rowCount()).toBe(3);

    // Select status A → only the two matching rows.
    fireEvent.click(screen.getByTestId('toolbar-filter-status-option-A'));
    expect(rowCount()).toBe(2);
    expect(screen.getByTestId('list-modal-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-row-3')).toBeInTheDocument();
    expect(screen.queryByTestId('list-modal-row-2')).not.toBeInTheDocument();

    // Reset to "all" → all three rows again.
    fireEvent.click(screen.getByTestId('toolbar-filter-status-all'));
    expect(rowCount()).toBe(3);
  });
});

describe('ListModalWindow — save method selection', () => {
  it('POSTs to {apiBaseUrl}/{entity} when creating a new record', async () => {
    renderWindow();
    fireEvent.click(screen.getByTestId('list-modal-new'));

    // Seed the required field via the stubbed EntityForm onChange.
    await act(async () => {
      lastEntityFormProps.onChange('name', 'New rule');
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-submit'));
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/${ENTITY}`);
    expect(opts.method).toBe('POST');
  });

  it('PUTs to {apiBaseUrl}/{entity}/{id} when editing an existing record', async () => {
    neoState.data = [{ id: 'ROW-42', name: 'Existing' }];
    renderWindow();

    // Open the edit modal via the row hover edit button.
    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-edit-ROW-42'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-submit'));
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/${ENTITY}/ROW-42`);
    expect(opts.method).toBe('PUT');
  });
});

describe('ListModalWindow — inline toggle', () => {
  it('PATCHes {apiBaseUrl}/{entity}/{id} with the toggled field value', async () => {
    neoState.data = [{ id: 'ROW-7', name: 'A', active: false }];
    renderWindow();

    await act(async () => {
      fireEvent.click(screen.getByTestId('cell-toggle-active-ROW-7'));
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = apiFetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/${ENTITY}/ROW-7`);
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ active: true });
  });
});

describe('ListModalWindow — auto-priority seeding', () => {
  it('seeds the create form with max(priority)+step', async () => {
    neoState.data = [
      { id: '1', name: 'A', priority: 10 },
      { id: '2', name: 'B', priority: 20 },
    ];
    renderWindow({
      fields: [
        { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
        { key: 'priority', column: 'Priority', type: 'number', section: 'general' },
      ],
      config: { autoPriorityField: 'priority', autoPriorityStep: 10 },
    });

    fireEvent.click(screen.getByTestId('list-modal-new'));

    // The stubbed EntityForm receives the seeded form data.
    expect(lastEntityFormProps.data.priority).toBe(30);
  });

  it('seeds priority via the body sent to fetch on save', async () => {
    neoState.data = [
      { id: '1', name: 'A', priority: 10 },
      { id: '2', name: 'B', priority: 20 },
    ];
    renderWindow({
      fields: [
        { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
        { key: 'priority', column: 'Priority', type: 'number', section: 'general' },
      ],
      config: { autoPriorityField: 'priority', autoPriorityStep: 10 },
    });

    fireEvent.click(screen.getByTestId('list-modal-new'));
    await act(async () => {
      lastEntityFormProps.onChange('name', 'New');
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-submit'));
    });

    const [, opts] = apiFetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.priority).toBe(30);
  });
});

describe('ListModalWindow — auto-priority ordering', () => {
  // Read the rendered grid rows in DOM order and return their id suffixes.
  function renderedRowIds() {
    return screen
      .queryAllByTestId(/^list-modal-row-/)
      .map((el) => el.getAttribute('data-testid').replace('list-modal-row-', ''));
  }

  it('renders rows in ascending priority order when config.autoPriorityField is set', () => {
    // Unsorted on arrival: priorities 20, 30, 10.
    neoState.data = [
      { id: 'p20', name: 'Twenty', priority: 20 },
      { id: 'p30', name: 'Thirty', priority: 30 },
      { id: 'p10', name: 'Ten', priority: 10 },
    ];
    renderWindow({ config: { autoPriorityField: 'priority' } });
    // Should render sorted ascending: 10, 20, 30.
    expect(renderedRowIds()).toEqual(['p10', 'p20', 'p30']);
  });

  it('preserves the original row order when config.autoPriorityField is not set', () => {
    neoState.data = [
      { id: 'p20', name: 'Twenty', priority: 20 },
      { id: 'p30', name: 'Thirty', priority: 30 },
      { id: 'p10', name: 'Ten', priority: 10 },
    ];
    renderWindow({ config: {} });
    // No sorting applied — original (unsorted) order is preserved.
    expect(renderedRowIds()).toEqual(['p20', 'p30', 'p10']);
  });

  it('sinks rows with a missing/non-numeric priority to the end (stable)', () => {
    neoState.data = [
      { id: 'p20', name: 'Twenty', priority: 20 },
      { id: 'missing', name: 'NoPriority' }, // missing priority → sinks
      { id: 'p10', name: 'Ten', priority: 10 },
      { id: 'nan', name: 'BadPriority', priority: 'abc' }, // non-numeric → sinks
    ];
    renderWindow({ config: { autoPriorityField: 'priority' } });
    // Numeric rows ascending first (10, 20), then the non-finite ones in
    // their original relative order (missing before nan).
    expect(renderedRowIds()).toEqual(['p10', 'p20', 'missing', 'nan']);
  });
});

describe('ListModalWindow — modal header subtitle', () => {
  it('renders the subtitle when config.subtitleKey is set', () => {
    renderWindow({ config: { titleKey: 'matchRuleNewTitle', subtitleKey: 'matchRuleNewSubtitle' } });
    fireEvent.click(screen.getByTestId('list-modal-new'));
    const sub = screen.getByTestId('list-modal-subtitle');
    expect(sub).toBeInTheDocument();
    expect(sub).toHaveTextContent('matchRuleNewSubtitle');
  });

  it('does not render a subtitle when no subtitleKey is configured', () => {
    renderWindow();
    fireEvent.click(screen.getByTestId('list-modal-new'));
    expect(screen.queryByTestId('list-modal-subtitle')).not.toBeInTheDocument();
  });
});

describe('ListModalWindow — modal body grid (sectionGrid)', () => {
  it('passes the configured column count per section to EntityForm', () => {
    renderWindow({ config: { sectionGrid: { general: 3 } } });
    fireEvent.click(screen.getByTestId('list-modal-new'));
    // The (single, general) EntityForm should receive cols=3.
    expect(lastEntityFormProps.cols).toBe(3);
    // Optional fields are NOT suffixed with "(opcional)" in the modal (Figma-aligned).
    expect(lastEntityFormProps.optionalSuffix).toBeFalsy();
  });

  it('defaults to 3 columns when no sectionGrid is configured', () => {
    renderWindow();
    fireEvent.click(screen.getByTestId('list-modal-new'));
    expect(lastEntityFormProps.cols).toBe(3);
  });
});

describe('ListModalWindow — footer toggle', () => {
  const TOGGLE_FIELDS = [
    { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
    { key: 'createTransaction', column: 'CreateTransaction', type: 'checkbox', section: 'general' },
  ];

  it('renders the footer toggle (switch + label) instead of placing it in the grid', () => {
    renderWindow({ fields: TOGGLE_FIELDS, config: { footerToggleField: 'createTransaction' } });
    fireEvent.click(screen.getByTestId('list-modal-new'));
    expect(screen.getByTestId('list-modal-footer-toggle-createTransaction')).toBeInTheDocument();
    // The toggle field must NOT be among the fields handed to the body EntityForm.
    expect(lastEntityFormProps.fields.some(f => f.key === 'createTransaction')).toBe(false);
  });

  it('updates the form data when the footer toggle is switched on', async () => {
    renderWindow({ fields: TOGGLE_FIELDS, config: { footerToggleField: 'createTransaction' } });
    fireEvent.click(screen.getByTestId('list-modal-new'));
    await act(async () => {
      lastEntityFormProps.onChange('name', 'Rule A');
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-footer-toggle-createTransaction'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-submit'));
    });
    const [, opts] = apiFetchMock.mock.calls[0];
    expect(JSON.parse(opts.body).createTransaction).toBe(true);
  });
});

describe('ListModalWindow — submit button', () => {
  it('disables submit while required fields are missing and enables once filled', async () => {
    renderWindow();
    fireEvent.click(screen.getByTestId('list-modal-new'));
    const submit = screen.getByTestId('list-modal-submit');
    // `name` is required and unset → disabled.
    expect(submit).toBeDisabled();
    await act(async () => {
      lastEntityFormProps.onChange('name', 'Filled');
    });
    expect(screen.getByTestId('list-modal-submit')).toBeEnabled();
  });

  it('uses the configured submitLabelKey for the create button', () => {
    renderWindow({ config: { submitLabelKey: 'matchRuleSubmitCreate' } });
    fireEvent.click(screen.getByTestId('list-modal-new'));
    expect(screen.getByTestId('list-modal-submit')).toHaveTextContent('matchRuleSubmitCreate');
  });
});

describe('ListModalWindow — accounting-dimension gating (ETP-4950)', () => {
  // A dimension descriptor is recognised by its AD column alone, so these fields need no
  // per-window opt-in: `C_Project_ID` is the project dimension everywhere in Etendo.
  const DIMENSION_FIELDS = [
    { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
    { key: 'project', column: 'C_Project_ID', type: 'selector', section: 'dimensions' },
  ];
  const DIMENSION_SECTIONS = [
    { key: 'general', label: 'sectionGeneral' },
    { key: 'dimensions', label: 'sectionDimensions' },
  ];

  const isDimensionRequest = (url) => String(url).includes('action=activeDimensions');

  // Route the `?action=activeDimensions` GET to `dimensionsResponse`; everything else gets the
  // generic ok/{} answer the other suites rely on.
  function mockFetch(dimensionsResponse) {
    apiFetchMock = vi.fn((url) => {
      if (isDimensionRequest(url)) return Promise.resolve(dimensionsResponse());
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  }

  function dimensionRequestCount() {
    return apiFetchMock.mock.calls.filter(([url]) => isDimensionRequest(url)).length;
  }

  it('hides a dimension field whose dimension is not active in the Accounting Schema', async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ response: { data: { dimensions: ['product'] } } }),
    }));
    renderWindow({ fields: DIMENSION_FIELDS, sections: DIMENSION_SECTIONS });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    // Project is not among the active dimensions → dropped from the form...
    await waitFor(() => {
      expect(screen.queryByTestId('form-field-project')).not.toBeInTheDocument();
    });
    // ...while the non-dimension field is untouched.
    expect(screen.getByTestId('form-field-name')).toBeInTheDocument();
  });

  it('drops the section heading once the section has no visible field left', async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ response: { data: { dimensions: ['product'] } } }),
    }));
    renderWindow({ fields: DIMENSION_FIELDS, sections: DIMENSION_SECTIONS });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('list-modal-section-dimensions')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('list-modal-section-general')).toBeInTheDocument();
  });

  it('keeps a dimension field whose dimension IS active', async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ response: { data: { dimensions: ['project', 'product'] } } }),
    }));
    renderWindow({ fields: DIMENSION_FIELDS, sections: DIMENSION_SECTIONS });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    await waitFor(() => expect(dimensionRequestCount()).toBe(1));
    expect(screen.getByTestId('form-field-project')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-section-dimensions')).toBeInTheDocument();
  });

  it('keeps the product field when product is the active dimension', async () => {
    // The QA finding: with only `product` active, the product field must survive the gate.
    // `M_Product_ID` is the product dimension, so the answer `['product']` keeps it — the very
    // same answer that drops `project` in the first test of this suite.
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ response: { data: { dimensions: ['product'] } } }),
    }));
    renderWindow({
      fields: [
        { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
        { key: 'product', column: 'M_Product_ID', type: 'selector', section: 'dimensions' },
      ],
      sections: DIMENSION_SECTIONS,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    await waitFor(() => expect(dimensionRequestCount()).toBe(1));
    expect(screen.getByTestId('form-field-product')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-section-dimensions')).toBeInTheDocument();
  });

  it('fails open: keeps the dimension field when the dimensions request is not ok', async () => {
    mockFetch(() => ({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    renderWindow({ fields: DIMENSION_FIELDS, sections: DIMENSION_SECTIONS });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    await waitFor(() => expect(dimensionRequestCount()).toBe(1));
    expect(screen.getByTestId('form-field-project')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-section-dimensions')).toBeInTheDocument();
  });

  it('fails open: keeps the dimension field when the dimensions request throws', async () => {
    apiFetchMock = vi.fn((url) => {
      if (isDimensionRequest(url)) return Promise.reject(new Error('network down'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderWindow({ fields: DIMENSION_FIELDS, sections: DIMENSION_SECTIONS });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    await waitFor(() => expect(dimensionRequestCount()).toBe(1));
    expect(screen.getByTestId('form-field-project')).toBeInTheDocument();
  });

  it('does not request the active dimensions when no field carries a dimension column', async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ response: { data: { dimensions: [] } } }),
    }));
    // The default FIELDS are Name + Priority — no dimension column, so gating is skipped
    // entirely and the window costs no extra request.
    renderWindow();

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    expect(dimensionRequestCount()).toBe(0);
    expect(screen.getByTestId('form-field-name')).toBeInTheDocument();
  });

  it('does not request the active dimensions for a contact-only form', async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ response: { data: { dimensions: [] } } }),
    }));
    renderWindow({
      fields: [
        { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
        { key: 'bpartner', column: 'C_BPartner_ID', type: 'selector', section: 'general' },
      ],
      sections: [{ key: 'general', label: 'sectionGeneral' }],
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    // The contact IS a gated dimension, but it never triggers the fetch on its own: dozens of
    // windows carry `C_BPartner_ID` without implementing `?action=activeDimensions`. No request
    // means `activeDimensions` stays unknown, so gating fails open and the contact stays visible.
    expect(dimensionRequestCount()).toBe(0);
    expect(screen.getByTestId('form-field-bpartner')).toBeInTheDocument();
  });

  it('hides every dimension field when the tenant has all dimensions switched off', async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ response: { data: { dimensions: [] } } }),
    }));
    renderWindow({
      fields: [
        ...DIMENSION_FIELDS,
        { key: 'product', column: 'M_Product_ID', type: 'selector', section: 'dimensions' },
        { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', section: 'dimensions' },
      ],
      sections: DIMENSION_SECTIONS,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('list-modal-section-dimensions')).not.toBeInTheDocument();
    });
    for (const key of ['project', 'product', 'costcenter']) {
      expect(screen.queryByTestId(`form-field-${key}`)).not.toBeInTheDocument();
    }
    expect(screen.getByTestId('form-field-name')).toBeInTheDocument();
  });

  it('excludes a hidden dimension field from the required-field gate', async () => {
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ response: { data: { dimensions: [] } } }),
    }));
    renderWindow({
      fields: [
        { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
        { key: 'project', column: 'C_Project_ID', type: 'selector', required: true, section: 'dimensions' },
      ],
      sections: DIMENSION_SECTIONS,
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('list-modal-new'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('form-field-project')).not.toBeInTheDocument();
    });

    // Only the visible required field remains, so filling it must enable the submit —
    // a hidden dimension can never be filled and would otherwise deadlock the modal.
    await act(async () => {
      lastEntityFormProps.onChange('name', 'Rule A');
    });
    expect(screen.getByTestId('list-modal-submit')).toBeEnabled();
  });
});

// --- Multi-select + bulk delete helpers ------------------------------------
//
// `Checkbox` (app-shell-core) puts the forwarded `data-testid` on its <label> and the
// state (`checked` / `aria-checked="mixed"`) on the sr-only <input> inside it, so every
// assertion and every click goes through that inner input.
function checkboxInput(testId) {
  return screen.getByTestId(testId).querySelector('input');
}

function selectAllInput() {
  return checkboxInput('list-modal-select-all');
}

function rowSelectInput(id) {
  return checkboxInput(`list-modal-select-${id}`);
}

// Text of the floating selection pill, or null when the pill is not rendered.
// `BulkDeleteSelectionBar` renders through `SelectionToolbar`, which is `visible`
// only while count > 0 — so a null here means "nothing is selected".
function selectionPillText() {
  return screen.queryByTestId('bulk-delete-selection-count')?.textContent ?? null;
}

function deleteCalls() {
  return apiFetchMock.mock.calls.filter(([, opts]) => opts?.method === 'DELETE');
}

const TWO_ROWS = [
  { id: 'ROW-1', name: 'Alpha rule', active: true },
  { id: 'ROW-2', name: 'Beta rule', active: true },
];

describe('ListModalWindow — multi-select + bulk delete', () => {
  it('renders the checkbox column and shows the selection pill with the checked count', () => {
    neoState.data = TWO_ROWS;
    renderWindow();

    // Header checkbox + one per row.
    expect(screen.getByTestId('list-modal-select-all-head')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-select-all')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-select-cell-ROW-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-select-ROW-2')).toBeInTheDocument();

    // Nothing checked yet → no floating pill.
    expect(selectionPillText()).toBeNull();

    fireEvent.click(rowSelectInput('ROW-1'));

    expect(rowSelectInput('ROW-1')).toBeChecked();
    expect(rowSelectInput('ROW-2')).not.toBeChecked();
    expect(selectionPillText()).toBe('selected (1)');
    expect(screen.getByTestId('bulk-delete-selection-trigger')).toBeInTheDocument();
  });

  it('select-all checks every visible row, and clicking it again clears the selection', () => {
    neoState.data = TWO_ROWS;
    renderWindow();

    fireEvent.click(selectAllInput());
    expect(rowSelectInput('ROW-1')).toBeChecked();
    expect(rowSelectInput('ROW-2')).toBeChecked();
    expect(selectAllInput()).toBeChecked();
    expect(selectionPillText()).toBe('selected (2)');

    fireEvent.click(selectAllInput());
    expect(rowSelectInput('ROW-1')).not.toBeChecked();
    expect(rowSelectInput('ROW-2')).not.toBeChecked();
    expect(selectionPillText()).toBeNull();
  });

  it('select-all only spans the rows the active search leaves visible', () => {
    neoState.data = TWO_ROWS;
    renderWindow({ filters: ['name'] });

    fireEvent.change(screen.getByTestId('list-modal-search'), { target: { value: 'Alpha' } });
    expect(rowCount()).toBe(1);

    fireEvent.click(selectAllInput());
    // Only the visible row got checked — the filtered-out one is not silently selected.
    expect(selectionPillText()).toBe('selected (1)');
    expect(rowSelectInput('ROW-1')).toBeChecked();
    expect(screen.queryByTestId('list-modal-select-ROW-2')).not.toBeInTheDocument();
  });

  it('puts the header checkbox in the indeterminate state when only some rows are checked', () => {
    neoState.data = TWO_ROWS;
    renderWindow();

    // 1 of 2 → someSelected → aria-checked="mixed" on the inner input.
    fireEvent.click(rowSelectInput('ROW-1'));
    expect(selectAllInput()).toHaveAttribute('aria-checked', 'mixed');

    // 2 of 2 → allSelected → no longer indeterminate.
    fireEvent.click(rowSelectInput('ROW-2'));
    expect(selectAllInput()).toHaveAttribute('aria-checked', 'true');

    // 0 of 2 → neither.
    fireEvent.click(selectAllInput());
    expect(selectAllInput()).toHaveAttribute('aria-checked', 'false');
  });

  it('confirming the bulk delete issues one DELETE per selected row and reloads the list', async () => {
    neoState.data = TWO_ROWS;
    renderWindow();

    fireEvent.click(selectAllInput());

    await act(async () => {
      fireEvent.click(screen.getByTestId('bulk-delete-selection-trigger'));
    });
    // The confirm dialog is owned by useBulkRowDelete and rendered by the window.
    expect(screen.getByTestId('bulk-delete-confirm')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('bulk-delete-confirm'));
    });

    const urls = deleteCalls().map(([url]) => url).sort();
    expect(urls).toEqual([
      `${API_BASE}/${ENTITY}/ROW-1`,
      `${API_BASE}/${ENTITY}/ROW-2`,
    ]);
    await waitFor(() => expect(neoState.reload).toHaveBeenCalled());
    // Everything succeeded → the selection is cleared and the pill disappears.
    await waitFor(() => expect(selectionPillText()).toBeNull());
  });

  it('prunes the selection when a search hides the checked row', () => {
    neoState.data = TWO_ROWS;
    renderWindow({ filters: ['name'] });

    fireEvent.click(rowSelectInput('ROW-1'));
    expect(selectionPillText()).toBe('selected (1)');

    // Searching for the OTHER row hides the checked one — it must not stay silently
    // selected (and thus deletable) while invisible.
    fireEvent.change(screen.getByTestId('list-modal-search'), { target: { value: 'Beta' } });

    expect(rowCount()).toBe(1);
    expect(screen.queryByTestId('list-modal-select-ROW-1')).not.toBeInTheDocument();
    expect(selectionPillText()).toBeNull();
  });

  it('keeps only the failed rows checked after a partial bulk-delete failure', async () => {
    neoState.data = TWO_ROWS;
    // ROW-2's DELETE fails; ROW-1's succeeds.
    apiFetchMock = vi.fn((url, opts) => {
      if (opts?.method === 'DELETE' && String(url).endsWith('/ROW-2')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: { message: 'row is referenced' } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    renderWindow();

    fireEvent.click(selectAllInput());
    expect(selectionPillText()).toBe('selected (2)');

    await act(async () => {
      fireEvent.click(screen.getByTestId('bulk-delete-selection-trigger'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('bulk-delete-confirm'));
    });

    expect(deleteCalls()).toHaveLength(2);
    // One row went through → the list is reloaded...
    await waitFor(() => expect(neoState.reload).toHaveBeenCalled());
    // ...and the failed row stays checked so the user can retry just that one.
    await waitFor(() => expect(selectionPillText()).toBe('selected (1)'));
    expect(rowSelectInput('ROW-2')).toBeChecked();
    expect(rowSelectInput('ROW-1')).not.toBeChecked();
  });
});

describe('ListModalWindow — read-only window access (ETP-4950)', () => {
  const READ_ONLY = { readOnly: true };

  it('hides every write affordance when window.readOnly is true', () => {
    neoState.data = TWO_ROWS;
    renderWindow({ window: READ_ONLY, config: { allowClone: true } });

    // Toolbar create action.
    expect(screen.queryByTestId('list-modal-new')).not.toBeInTheDocument();
    // Per-row actions (the whole actions cell is gone).
    for (const id of ['ROW-1', 'ROW-2']) {
      expect(screen.queryByTestId(`list-modal-edit-${id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`list-modal-clone-${id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`list-modal-delete-${id}`)).not.toBeInTheDocument();
    }
    // Selection column + floating bulk-delete pill.
    expect(screen.queryByTestId('list-modal-select-all')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-modal-select-all-head')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-modal-select-ROW-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-modal-select-cell-ROW-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bulk-delete-selection-bar')).not.toBeInTheDocument();
    expect(selectionPillText()).toBeNull();
    // The rows themselves are still listed — read-only means read, not blank.
    expect(rowCount()).toBe(2);
  });

  it('renders every write affordance when no window config is passed', () => {
    neoState.data = TWO_ROWS;
    renderWindow({ config: { allowClone: true } });

    expect(screen.getByTestId('list-modal-new')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-edit-ROW-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-clone-ROW-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-delete-ROW-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-select-all')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-select-ROW-1')).toBeInTheDocument();

    // ...and the selection bar does show up once a row is checked (so the negative
    // assertions above are not vacuous).
    fireEvent.click(rowSelectInput('ROW-1'));
    expect(screen.getByTestId('bulk-delete-selection-bar')).toBeInTheDocument();
    expect(selectionPillText()).toBe('selected (1)');
  });

  it('renders every write affordance when window.readOnly is explicitly false', () => {
    neoState.data = TWO_ROWS;
    renderWindow({ window: { readOnly: false }, config: { allowClone: true } });

    expect(screen.getByTestId('list-modal-new')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-edit-ROW-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-delete-ROW-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-select-all')).toBeInTheDocument();
  });

  it('forwards readOnly to the grid cells so the inline toggle is locked', () => {
    neoState.data = [{ id: 'ROW-7', name: 'A', active: false }];

    const { unmount } = renderWindow({ window: READ_ONLY });
    expect(screen.getByTestId('cell-toggle-active-ROW-7')).toHaveAttribute('data-readonly', 'true');
    unmount();

    renderWindow();
    expect(screen.getByTestId('cell-toggle-active-ROW-7')).toHaveAttribute('data-readonly', 'false');
  });
});

// The grid header resolved `tMenu(col.label)` only, so it showed the raw AD label
// ("Overdue Payment Days Rule") while the advanced filter of the same window — and every
// standard list — showed the window's field label (labelOverrides / per-window label slice).
describe('ListModalWindow — grid header labels', () => {
  it('resolves the header through the field-label chain before the raw AD label', () => {
    renderWindow({
      columns: [{ key: 'days', column: 'NetDays', type: 'number', label: 'Overdue Payment Days Rule' }],
    });
    // useLabel is mocked to echo the column name.
    expect(screen.getByText('NetDays')).toBeInTheDocument();
    expect(screen.queryByText('Overdue Payment Days Rule')).not.toBeInTheDocument();
  });

  it('keeps an explicit labelKey ahead of the field label', () => {
    renderWindow({
      columns: [{ key: 'days', column: 'NetDays', type: 'number', labelKey: 'daysHeaderKey' }],
    });
    expect(screen.getByText('daysHeaderKey')).toBeInTheDocument();
  });
});

// templateConfig opt-in keys (modalVariant, hideBackButton, hideSearch, newButtonVariant,
// rowClickEdit). Every key is off by default: a window that declares none keeps the historical
// match-rule look, which the earlier describes guard.
describe('ListModalWindow — templateConfig opt-ins', () => {
  const ROWS = [
    { id: 'ROW-1', name: 'Alpha', priority: 10, active: true },
    { id: 'ROW-2', name: 'Beta', priority: 20, active: false },
  ];

  beforeEach(() => {
    neoState.data = ROWS;
  });

  describe('modalVariant', () => {
    it('opens the compact popup (and not the default modal) when "compact"', () => {
      renderWindow({ config: { modalVariant: 'compact' } });
      fireEvent.click(screen.getByTestId('list-modal-new'));
      expect(screen.getByTestId('list-modal-compact-dialog')).toBeInTheDocument();
      expect(screen.queryByTestId('DialogContent__19eda5')).not.toBeInTheDocument();
    });

    it('opens the default modal (and not the compact popup) when absent', () => {
      renderWindow();
      fireEvent.click(screen.getByTestId('list-modal-new'));
      expect(screen.getByTestId('DialogContent__19eda5')).toBeInTheDocument();
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
    });

    it('compact: hands the popup the fields in section order', () => {
      renderWindow({
        config: { modalVariant: 'compact' },
        sections: [{ key: 'second' }, { key: 'general' }],
        fields: [
          { key: 'name', column: 'Name', type: 'text', section: 'general' },
          { key: 'code', column: 'Code', type: 'text', section: 'second' },
          { key: 'note', column: 'Note', type: 'text' }, // no section → 'general'
        ],
      });
      fireEvent.click(screen.getByTestId('list-modal-new'));
      const order = screen.getAllByTestId(/^form-field-/).map((el) => el.dataset.testid);
      expect(order).toEqual(['form-field-code', 'form-field-name', 'form-field-note']);
    });

    it('compact: create shows the create title, edit the edit title, and both submit as "save"', () => {
      renderWindow({ config: { modalVariant: 'compact', titleKey: 'ptNew', editTitleKey: 'ptEdit' } });
      fireEvent.click(screen.getByTestId('list-modal-new'));
      expect(screen.getByRole('heading', { name: 'ptNew' })).toBeInTheDocument();
      expect(screen.getByTestId('list-modal-submit')).toHaveTextContent('save');
      fireEvent.click(screen.getByTestId('list-modal-cancel'));
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('list-modal-edit-ROW-1'));
      expect(screen.getByRole('heading', { name: 'ptEdit' })).toBeInTheDocument();
      expect(screen.getByTestId('list-modal-submit')).toHaveTextContent('save');
    });

    it('default modal: create still submits as "createRecord"', () => {
      renderWindow();
      fireEvent.click(screen.getByTestId('list-modal-new'));
      expect(screen.getByTestId('list-modal-submit')).toHaveTextContent('createRecord');
    });

    it('compact: an explicit submitLabelKey still wins on create', () => {
      renderWindow({ config: { modalVariant: 'compact', submitLabelKey: 'ptCreate' } });
      fireEvent.click(screen.getByTestId('list-modal-new'));
      expect(screen.getByTestId('list-modal-submit')).toHaveTextContent('ptCreate');
    });
  });

  describe('hideBackButton', () => {
    it('hides the back button when true', () => {
      renderWindow({ config: { hideBackButton: true } });
      expect(screen.queryByTestId('list-modal-back')).not.toBeInTheDocument();
    });

    it('keeps the back button (labelled by backLabelKey) when false', () => {
      renderWindow({ config: { hideBackButton: false, backLabelKey: 'backToSetup' } });
      expect(screen.getByTestId('list-modal-back')).toHaveTextContent('backToSetup');
    });
  });

  describe('hideSearch', () => {
    it('hides the search box even with searchable filters when true', () => {
      renderWindow({ filters: ['name'], config: { hideSearch: true } });
      expect(screen.queryByTestId('list-modal-search')).not.toBeInTheDocument();
    });

    it('keeps the search box when false', () => {
      renderWindow({ filters: ['name'], config: { hideSearch: false } });
      expect(screen.getByTestId('list-modal-search')).toBeInTheDocument();
    });

    it('still has no search box when there are no filters', () => {
      renderWindow({ filters: [] });
      expect(screen.queryByTestId('list-modal-search')).not.toBeInTheDocument();
    });
  });

  describe('newButtonVariant', () => {
    it('"primary" draws the primary-blue New button', () => {
      renderWindow({ config: { newButtonVariant: 'primary' } });
      const cls = screen.getByTestId('list-modal-new').className.split(/\s+/);
      expect(cls).toEqual(expect.arrayContaining(['bg-primary', 'pl-3', 'pr-4']));
      expect(cls).not.toContain('bg-[hsl(var(--foreground))]');
    });

    it('absent keeps the historical ink New button', () => {
      renderWindow();
      const cls = screen.getByTestId('list-modal-new').className;
      expect(cls).toContain('bg-[hsl(var(--foreground))]');
      expect(cls).not.toContain('bg-primary ');
    });

    it('an unknown value falls back to the historical button', () => {
      renderWindow({ config: { newButtonVariant: 'ghost' } });
      expect(screen.getByTestId('list-modal-new').className).toContain('bg-[hsl(var(--foreground))]');
    });
  });

  describe('rowClickEdit', () => {
    const EDIT = { rowClickEdit: true, editTitleKey: 'ptEdit' };

    it('a row click opens that row in the edit modal', () => {
      renderWindow({ config: EDIT });
      const row = screen.getByTestId('list-modal-row-ROW-2');
      expect(row.className).toContain('cursor-pointer');
      fireEvent.click(screen.getByTestId('cell-name-ROW-2'));
      expect(screen.getByRole('heading', { name: 'ptEdit' })).toBeInTheDocument();
      expect(lastEntityFormProps.data).toMatchObject({ id: 'ROW-2', name: 'Beta' });
    });

    it('opens the compact popup when combined with modalVariant compact', () => {
      renderWindow({ config: { ...EDIT, modalVariant: 'compact' } });
      fireEvent.click(screen.getByTestId('list-modal-row-ROW-1'));
      expect(screen.getByTestId('list-modal-compact-dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'ptEdit' })).toBeInTheDocument();
    });

    it('a row click does nothing when the key is absent', () => {
      renderWindow({ config: { editTitleKey: 'ptEdit' } });
      const row = screen.getByTestId('list-modal-row-ROW-1');
      expect(row.className).not.toContain('cursor-pointer');
      fireEvent.click(row);
      expect(screen.queryByRole('heading', { name: 'ptEdit' })).not.toBeInTheDocument();
    });

    it('ticking the selection checkbox does not open the row', () => {
      renderWindow({ config: EDIT });
      fireEvent.click(rowSelectInput('ROW-1'));
      expect(screen.queryByRole('heading', { name: 'ptEdit' })).not.toBeInTheDocument();
      // ...and the selection itself still happened.
      expect(rowSelectInput('ROW-1')).toBeChecked();
      expect(selectionPillText()).not.toBeNull();
    });

    it('a click anywhere in the selection cell does not open the row', () => {
      renderWindow({ config: EDIT });
      fireEvent.click(screen.getByTestId('list-modal-select-cell-ROW-1'));
      expect(screen.queryByRole('heading', { name: 'ptEdit' })).not.toBeInTheDocument();
    });

    it('a hover action (delete) does not also open the edit modal', () => {
      renderWindow({ config: EDIT });
      fireEvent.click(screen.getByTestId('list-modal-delete-ROW-1'));
      expect(screen.queryByRole('heading', { name: 'ptEdit' })).not.toBeInTheDocument();
    });

    it('the hover edit action opens the edit modal once, for its own row', () => {
      renderWindow({ config: EDIT });
      fireEvent.click(screen.getByTestId('list-modal-edit-ROW-1'));
      expect(screen.getAllByRole('heading', { name: 'ptEdit' })).toHaveLength(1);
      expect(lastEntityFormProps.data).toMatchObject({ id: 'ROW-1' });
    });

    it('a read-only role gets no row-click edit', () => {
      renderWindow({ config: EDIT, window: { readOnly: true } });
      const row = screen.getByTestId('list-modal-row-ROW-1');
      expect(row.className).not.toContain('cursor-pointer');
      fireEvent.click(row);
      expect(screen.queryByRole('heading', { name: 'ptEdit' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
    });
  });
});

// templateConfig.listVariant: "compact" — the Figma compact list density and toolbar chrome.
describe('ListModalWindow — listVariant', () => {
  const ROWS = [{ id: 'ROW-1', name: 'Alpha', priority: 10, active: true }];
  const classesOf = (el) => el.className.split(/\s+/);
  const headerCell = () => screen.getByText('Name').closest('th');
  const dataCell = () => screen.getByTestId('cell-name-ROW-1').closest('td');
  const TOOLBAR_COMPACT = ['bg-card', 'shadow-[0_1px_2px_hsl(var(--foreground)/0.05)]'];

  beforeEach(() => {
    neoState.data = ROWS;
  });

  it('compact: 40px rows with no vertical padding and the 32px checkbox column', () => {
    renderWindow({ config: { listVariant: 'compact' } });
    expect(classesOf(dataCell())).toEqual(expect.arrayContaining(['h-10', 'py-0']));
    expect(classesOf(screen.getByTestId('list-modal-select-cell-ROW-1'))).toEqual(
      expect.arrayContaining(['w-8', 'pl-2', 'pr-0']),
    );
    expect(classesOf(screen.getByTestId('list-modal-select-all-head'))).toEqual(
      expect.arrayContaining(['w-8', 'pl-2', 'pr-0']),
    );
    expect(classesOf(headerCell())).toContain('tracking-[-0.005em]');
  });

  it('absent: the default density classes', () => {
    renderWindow();
    const cell = classesOf(dataCell());
    expect(cell).toContain('py-3');
    expect(cell).not.toContain('py-0');
    expect(classesOf(screen.getByTestId('list-modal-select-cell-ROW-1'))).toEqual(
      expect.arrayContaining(['w-10', 'px-3']),
    );
    expect(classesOf(headerCell())).not.toContain('tracking-[-0.005em]');
  });

  it('compact: white fill + xs shadow on the refresh and sort buttons, and the Filtros padding', () => {
    renderWindow({ config: { listVariant: 'compact' } });
    expect(classesOf(screen.getByTestId('finance-refresh-button'))).toEqual(expect.arrayContaining(TOOLBAR_COMPACT));
    expect(classesOf(screen.getByTestId('list-sort-toggle'))).toEqual(expect.arrayContaining(TOOLBAR_COMPACT));
    expect(classesOf(screen.getByTestId('list-modal-advanced-filter'))).toEqual(
      expect.arrayContaining([...TOOLBAR_COMPACT, 'gap-2', 'pl-3', 'pr-4']),
    );
  });

  it('absent: the toolbar buttons keep their own classes (RefreshButton without className)', () => {
    renderWindow();
    const refresh = screen.getByTestId('finance-refresh-button');
    expect(refresh.className).toBe(
      'h-10 w-10 flex items-center justify-center rounded-lg border border-border text-[#828FA3] hover:bg-[hsl(var(--muted))] transition-colors',
    );
    expect(classesOf(screen.getByTestId('list-sort-toggle'))).not.toContain('bg-card');
    expect(classesOf(screen.getByTestId('list-modal-advanced-filter'))).not.toContain('pl-3');
  });

  it('is independent from modalVariant (a compact list keeps the default modal)', () => {
    renderWindow({ config: { listVariant: 'compact' } });
    fireEvent.click(screen.getByTestId('list-modal-new'));
    expect(screen.getByTestId('DialogContent__19eda5')).toBeInTheDocument();
    expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
  });
});

// Column widths: `minWidth` (decisions columnWidth) fixes the column's starting width, `maxWidth`
// (columnMaxWidth) truncates its content, and an empty spacer column takes the free width.
describe('ListModalWindow — column widths', () => {
  const ROWS = [{ id: 'ROW-1', name: 'Alpha', priority: 10, active: true }];
  const WIDE = [
    { key: 'name', column: 'Name', type: 'string', minWidth: 164, maxWidth: 240 },
    { key: 'priority', column: 'Priority', type: 'number', minWidth: 124 },
  ];

  beforeEach(() => {
    neoState.data = ROWS;
  });

  it('minWidth sets width and minWidth on the header and on every cell of the column', () => {
    renderWindow({ columns: WIDE });
    const th = screen.getByText('Priority').closest('th');
    const td = screen.getByTestId('cell-priority-ROW-1').closest('td');
    for (const el of [th, td]) {
      expect(el.style.width).toBe('124px');
      expect(el.style.minWidth).toBe('124px');
    }
  });

  // The cap applies to the whole CELL frame: the truncating wrapper sits inside the cell's
  // 24px horizontal padding, so it gets maxWidth − 24 (240 → 216). Capping the wrapper at the
  // declared value let a 164 / max 240 column grow to 264 (QA BUG-2).
  it('maxWidth wraps the cell content in a truncating div capped at maxWidth minus the cell padding', () => {
    renderWindow({ columns: WIDE });
    const wrapper = screen.getByTestId('cell-name-ROW-1').parentElement;
    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper).toHaveClass('truncate');
    expect(wrapper.style.maxWidth).toBe('216px');
    expect(wrapper.closest('td').style.width).toBe('164px');
  });

  it('the content cap is the same in the compact list (same horizontal padding)', () => {
    renderWindow({ columns: WIDE, config: { listVariant: 'compact' } });
    expect(screen.getByTestId('cell-name-ROW-1').parentElement.style.maxWidth).toBe('216px');
  });

  // listModalColumnWidth.js: the cell FRAME is sized at minWidth whatever maxWidth says, and the
  // content cap (maxWidth minus the 24px cell padding) never goes negative.
  it('sizes the cell frame at minWidth only, and floors the content cap at 0', () => {
    expect(CELL_PADDING_X).toBe(24);
    expect(columnWidthStyle({ minWidth: 164, maxWidth: 240 })).toEqual({ width: 164, minWidth: 164 });
    expect(columnWidthStyle({ maxWidth: 240 })).toBeUndefined();
    expect(cellContentMaxWidth({ maxWidth: 20 })).toBe(0);
  });

  it('a column without maxWidth renders its content directly in the cell', () => {
    renderWindow({ columns: WIDE });
    expect(screen.getByTestId('cell-priority-ROW-1').parentElement.tagName).toBe('TD');
  });

  it('renders the spacer header and cell when some column declares minWidth', () => {
    renderWindow({ columns: WIDE });
    expect(screen.getByTestId('list-modal-spacer-head')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-spacer-cell')).toBeInTheDocument();
  });

  it('no declared width: no inline width, no spacer', () => {
    renderWindow();
    const th = screen.getByText('Name').closest('th');
    expect(th.style.width).toBe('');
    expect(screen.queryByTestId('list-modal-spacer-head')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-modal-spacer-cell')).not.toBeInTheDocument();
  });

  it('a maxWidth alone does not add the spacer', () => {
    renderWindow({ columns: [{ key: 'name', column: 'Name', type: 'string', maxWidth: 240 }] });
    expect(screen.queryByTestId('list-modal-spacer-head')).not.toBeInTheDocument();
  });

  it('the empty-state cell spans the spacer column too', () => {
    neoState.data = [];
    const { rerender } = renderWindow({ columns: WIDE });
    // 2 columns + checkbox + spacer + actions.
    expect(screen.getByTestId('list-modal-empty')).toHaveAttribute('colspan', '5');
    rerender(
      <ListModalWindow
        entity={ENTITY} entityLabel="Match Rules" columns={WIDE.map(({ minWidth, ...c }) => c)}
        fields={FIELDS} sections={SECTIONS} filters={['name']} config={{}}
        api={{ baseUrl: '/sws/neo/match-rule' }} apiBaseUrl={API_BASE} token="tok-123" />,
    );
    expect(screen.getByTestId('list-modal-empty')).toHaveAttribute('colspan', '4');
  });
});

// --- Shared helpers for the deep-link / save-gate / refusal / keyboard describes -----------

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  const res = { ok, status, json: () => Promise.resolve(body) };
  res.clone = () => jsonResponse(body, { ok, status });
  return res;
}

function writeCalls(method) {
  return apiFetchMock.mock.calls.filter(([, opts]) => opts?.method === method);
}

function getCalls() {
  return apiFetchMock.mock.calls.filter(([, opts]) => !opts?.method || opts.method === 'GET');
}

function clearToasts() {
  toast.error.mockClear();
  toast.success.mockClear();
  toast.dismiss.mockClear();
}

// Deep link `/<window>/:recordId`: the list renders with that record's edit modal open.
describe('ListModalWindow — deep link', () => {
  const WINDOW = 'match-rule';
  const ROWS = [{ id: 'A', name: 'Alpha', priority: 10 }];
  const DEEP = { windowName: WINDOW, config: { modalVariant: 'compact', editTitleKey: 'ruleEdit' } };
  const deepProps = (overrides = {}) => ({
    entity: ENTITY, entityLabel: 'Match Rules', columns: COLUMNS, fields: FIELDS, sections: SECTIONS,
    filters: ['name'], api: { baseUrl: '/sws/neo/match-rule' }, apiBaseUrl: API_BASE, token: 'tok-123',
    ...DEEP, ...overrides,
  });

  beforeEach(() => {
    neoState.data = ROWS;
    clearToasts();
  });

  describe('a record in the list', () => {
    it('opens it in the compact edit popup without a request', () => {
      renderWindow({ ...DEEP, recordId: 'A' });
      expect(screen.getByTestId('list-modal-compact-dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'ruleEdit' })).toBeInTheDocument();
      expect(lastEntityFormProps.data).toMatchObject({ id: 'A', name: 'Alpha' });
      expect(apiFetchMock).not.toHaveBeenCalled();
    });

    it('opens the default edit modal for a window without the compact variant', () => {
      renderWindow({ ...DEEP, config: { editTitleKey: 'ruleEdit' }, recordId: 'A' });
      expect(screen.getByRole('heading', { name: 'ruleEdit' })).toBeInTheDocument();
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
    });

    it('matches the id as a string', () => {
      neoState.data = [{ id: 42, name: 'Numeric' }];
      renderWindow({ ...DEEP, recordId: '42' });
      expect(lastEntityFormProps.data).toMatchObject({ id: 42 });
    });

    it('waits for the list to load before resolving the record', () => {
      neoState.loading = true;
      neoState.data = [];
      const { rerender } = render(<ListModalWindow {...deepProps({ recordId: 'A' })} />);
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
      expect(apiFetchMock).not.toHaveBeenCalled();

      neoState.loading = false;
      neoState.data = ROWS;
      rerender(<ListModalWindow {...deepProps({ recordId: 'A' })} />);
      expect(screen.getByTestId('list-modal-compact-dialog')).toBeInTheDocument();
      expect(apiFetchMock).not.toHaveBeenCalled();
    });
  });

  describe('a record outside the list', () => {
    it('reads it by id (GET {entity}/{id}) and opens it', async () => {
      apiFetchMock = vi.fn(() => Promise.resolve(jsonResponse({ response: { data: [{ id: 'B', name: 'Beta' }] } })));
      renderWindow({ ...DEEP, recordId: 'B' });
      await waitFor(() => expect(screen.getByTestId('list-modal-compact-dialog')).toBeInTheDocument());
      expect(getCalls()).toHaveLength(1);
      expect(getCalls()[0][0]).toBe(`${API_BASE}/${ENTITY}/B`);
      expect(lastEntityFormProps.data).toMatchObject({ id: 'B', name: 'Beta' });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('URL-encodes the record id in the request path', async () => {
      apiFetchMock = vi.fn(() => Promise.resolve(jsonResponse({ response: { data: [{ id: 'a/b' }] } })));
      renderWindow({ ...DEEP, recordId: 'a/b' });
      await waitFor(() => expect(getCalls()[0]?.[0]).toBe(`${API_BASE}/${ENTITY}/a%2Fb`));
    });

    it('a record the server does not return toasts and drops back to the list URL', async () => {
      apiFetchMock = vi.fn(() => Promise.resolve(jsonResponse({ response: { data: [] } })));
      renderWindow({ ...DEEP, recordId: 'ZZ' });
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('recordNotFoundTitle'));
      expect(navigateMock).toHaveBeenCalledWith(`/${WINDOW}`, { replace: true });
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
    });

    it('a non-ok response is treated as not found', async () => {
      apiFetchMock = vi.fn(() => Promise.resolve(jsonResponse({ error: { message: 'nope' } }, { ok: false, status: 404 })));
      renderWindow({ ...DEEP, recordId: 'ZZ' });
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('recordNotFoundTitle'));
      expect(navigateMock).toHaveBeenCalledWith(`/${WINDOW}`, { replace: true });
    });

    it('a failed request is treated as not found', async () => {
      apiFetchMock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
      renderWindow({ ...DEEP, recordId: 'ZZ' });
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('recordNotFoundTitle'));
      expect(navigateMock).toHaveBeenCalledWith(`/${WINDOW}`, { replace: true });
    });

    it('does not toast after the window unmounted', async () => {
      let resolve;
      apiFetchMock = vi.fn(() => new Promise((r) => { resolve = r; }));
      const { unmount } = renderWindow({ ...DEEP, recordId: 'ZZ' });
      await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
      unmount();
      resolve(jsonResponse({ response: { data: [] } }));
      await new Promise((r) => setTimeout(r, 0));
      expect(toast.error).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe('a read-only role', () => {
    it('just shows the list: no popup, no request, no redirect', () => {
      renderWindow({ ...DEEP, recordId: 'A', window: { readOnly: true } });
      expect(screen.getByTestId('list-modal-row-A')).toBeInTheDocument();
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
      expect(apiFetchMock).not.toHaveBeenCalled();
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('does not read a record outside the list either', () => {
      renderWindow({ ...DEEP, recordId: 'ZZ', window: { readOnly: true } });
      expect(apiFetchMock).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('closing the popup', () => {
    it('Cancel resets the URL to the list', () => {
      renderWindow({ ...DEEP, recordId: 'A' });
      fireEvent.click(screen.getByTestId('list-modal-cancel'));
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
      expect(navigateMock).toHaveBeenCalledWith(`/${WINDOW}`, { replace: true });
    });

    it('the X button resets the URL to the list', () => {
      renderWindow({ ...DEEP, recordId: 'A' });
      fireEvent.click(screen.getByTestId('list-modal-close'));
      expect(navigateMock).toHaveBeenCalledWith(`/${WINDOW}`, { replace: true });
    });

    it('does not reopen the popup while the URL still carries the same recordId', () => {
      const { rerender } = render(<ListModalWindow {...deepProps({ recordId: 'A' })} />);
      fireEvent.click(screen.getByTestId('list-modal-cancel'));
      rerender(<ListModalWindow {...deepProps({ recordId: 'A' })} />);
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
    });

    it('reopens the same record when the URL went back to the list and visits it again (no remount)', () => {
      const { rerender } = render(<ListModalWindow {...deepProps({ recordId: 'A' })} />);
      fireEvent.click(screen.getByTestId('list-modal-cancel'));
      rerender(<ListModalWindow {...deepProps({ recordId: undefined })} />);
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
      rerender(<ListModalWindow {...deepProps({ recordId: 'A' })} />);
      expect(screen.getByTestId('list-modal-compact-dialog')).toBeInTheDocument();
      expect(lastEntityFormProps.data).toMatchObject({ id: 'A' });
    });

    it('closing a popup opened without a recordId does not navigate', () => {
      renderWindow(DEEP);
      fireEvent.click(screen.getByTestId('list-modal-new'));
      fireEvent.click(screen.getByTestId('list-modal-cancel'));
      expect(screen.queryByTestId('list-modal-compact-dialog')).not.toBeInTheDocument();
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('does not navigate when the window name is unknown', () => {
      renderWindow({ ...DEEP, windowName: undefined, recordId: 'A' });
      fireEvent.click(screen.getByTestId('list-modal-cancel'));
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});

// Client save gate: a modal field breaking its declared numeric rules (min / integer) blocks the
// save — no request — with ONE message, in the modal's error box; the field's own blur toast
// (same text, id numeric-field-<key>) is withdrawn.
describe('ListModalWindow — client save gate', () => {
  const GATE_FIELDS = [
    { key: 'name', column: 'Name', type: 'text', required: true, section: 'general' },
    { key: 'days', column: 'NetDays', type: 'number', required: true, section: 'general', min: 0, max: 365, integer: true, stepper: true },
  ];
  const ROWS = [{ id: 'ROW-1', name: 'Alpha', days: 5 }];

  beforeEach(() => {
    neoState.data = ROWS;
    clearToasts();
  });

  for (const [variant, config] of [['default', {}], ['compact', { modalVariant: 'compact' }]]) {
    describe(`${variant} modal`, () => {
      async function editWith(value) {
        renderWindow({ fields: GATE_FIELDS, config });
        fireEvent.click(screen.getByTestId('list-modal-edit-ROW-1'));
        await act(async () => { lastEntityFormProps.onChange('days', value); });
        await act(async () => { fireEvent.click(screen.getByTestId('list-modal-submit')); });
      }

      it('a decimal in an integer field sends no request and shows one message', async () => {
        await editWith('10.5');
        expect(writeCalls('PUT')).toHaveLength(0);
        expect(apiFetchMock).not.toHaveBeenCalled();
        expect(screen.getAllByText('fieldIntegerError')).toHaveLength(1);
        expect(toast.error).not.toHaveBeenCalled();
        expect(toast.dismiss).toHaveBeenCalledWith('numeric-field-days');
      });

      it('a value below min sends no request and shows one message', async () => {
        await editWith('-1');
        expect(apiFetchMock).not.toHaveBeenCalled();
        expect(screen.getAllByText('fieldMinValueError')).toHaveLength(1);
        expect(toast.dismiss).toHaveBeenCalledWith('numeric-field-days');
      });

      it('a valid value saves and dismisses nothing', async () => {
        await editWith('12');
        expect(writeCalls('PUT')).toHaveLength(1);
        expect(JSON.parse(writeCalls('PUT')[0][1].body)).toMatchObject({ days: '12' });
        expect(toast.dismiss).not.toHaveBeenCalled();
      });

      it('editing the field clears the gate message', async () => {
        await editWith('10.5');
        await act(async () => { lastEntityFormProps.onChange('days', '10'); });
        expect(screen.queryByText('fieldIntegerError')).not.toBeInTheDocument();
      });
    });
  }
});

// A backend refusal is read with useEntity's extractErrorMessage(res, ui): the NEO body's
// messageKeys / messageParams reach translateBackendError (mocked above to mark a keyed
// refusal as `translated:<keys>`). Modal errors live in the box only; the inline toggle and the
// single delete report through a toast only.
describe('ListModalWindow — backend refusal translation', () => {
  const REFUSAL = {
    error: {
      message: 'The number of days must be a whole number, got 10.5',
      messageKeys: ['ETGO_PaymentTermDaysInvalid'],
      messageParams: { value: '10.5' },
    },
  };
  const TRANSLATED = 'translated:ETGO_PaymentTermDaysInvalid';
  const ROWS = [{ id: 'ROW-1', name: 'Alpha', priority: 10, active: false }];

  beforeEach(() => {
    neoState.data = ROWS;
    clearToasts();
    translateBackendError.mockClear();
    apiFetchMock = vi.fn(() => Promise.resolve(jsonResponse(REFUSAL, { ok: false, status: 400 })));
  });

  function expectKeyedTranslation() {
    expect(translateBackendError).toHaveBeenCalledWith(
      REFUSAL.error.message,
      expect.any(Function),
      expect.objectContaining({ messageKeys: ['ETGO_PaymentTermDaysInvalid'], messageParams: { value: '10.5' } }),
    );
  }

  for (const [variant, config] of [['default', {}], ['compact', { modalVariant: 'compact' }]]) {
    it(`${variant} modal: a refused create shows the translated text in the box, no toast`, async () => {
      renderWindow({ config });
      fireEvent.click(screen.getByTestId('list-modal-new'));
      await act(async () => { lastEntityFormProps.onChange('name', 'New rule'); });
      await act(async () => { fireEvent.click(screen.getByTestId('list-modal-submit')); });
      expect(writeCalls('POST')).toHaveLength(1);
      await waitFor(() => expect(screen.getByText(TRANSLATED)).toBeInTheDocument());
      expect(screen.queryByText(REFUSAL.error.message)).not.toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
      expectKeyedTranslation();
    });

    it(`${variant} modal: a refused update shows the translated text in the box, no toast`, async () => {
      renderWindow({ config });
      fireEvent.click(screen.getByTestId('list-modal-edit-ROW-1'));
      await act(async () => { fireEvent.click(screen.getByTestId('list-modal-submit')); });
      expect(writeCalls('PUT')).toHaveLength(1);
      await waitFor(() => expect(screen.getByText(TRANSLATED)).toBeInTheDocument());
      expect(toast.error).not.toHaveBeenCalled();
      expectKeyedTranslation();
    });
  }

  it('a plain (unkeyed) refusal still reaches the box through the same reader', async () => {
    apiFetchMock = vi.fn(() => Promise.resolve(jsonResponse({ error: { message: 'Name too long' } }, { ok: false, status: 400 })));
    renderWindow();
    fireEvent.click(screen.getByTestId('list-modal-edit-ROW-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('list-modal-submit')); });
    await waitFor(() => expect(screen.getByText('Name too long')).toBeInTheDocument());
    expect(translateBackendError).toHaveBeenCalled();
  });

  it('a refused inline toggle PATCH toasts the translated text', async () => {
    renderWindow();
    await act(async () => { fireEvent.click(screen.getByTestId('cell-toggle-active-ROW-1')); });
    expect(writeCalls('PATCH')).toHaveLength(1);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(TRANSLATED));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expectKeyedTranslation();
  });

  it('a refused single delete toasts the translated text once', async () => {
    renderWindow();
    fireEvent.click(screen.getByTestId('list-modal-delete-ROW-1'));
    await act(async () => { fireEvent.click(screen.getByTestId('list-modal-delete-confirm')); });
    expect(writeCalls('DELETE')).toHaveLength(1);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(TRANSLATED));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expectKeyedTranslation();
  });
});

// rowClickEdit rows are focusable; Enter / Space open the edit modal only when the ROW itself
// has focus — a key pressed on the checkbox, a toggle or a hover action belongs to that control.
describe('ListModalWindow — row keyboard open', () => {
  const ROWS = [{ id: 'ROW-1', name: 'Alpha', priority: 10, active: false }];
  const EDIT = { rowClickEdit: true, editTitleKey: 'ptEdit' };
  const editOpen = () => screen.queryByRole('heading', { name: 'ptEdit' });

  beforeEach(() => {
    neoState.data = ROWS;
  });

  it('makes rowClickEdit rows focusable', () => {
    renderWindow({ config: EDIT });
    expect(screen.getByTestId('list-modal-row-ROW-1')).toHaveAttribute('tabindex', '0');
  });

  it('leaves rows unfocusable without rowClickEdit or for a read-only role', () => {
    const { unmount } = renderWindow();
    expect(screen.getByTestId('list-modal-row-ROW-1')).not.toHaveAttribute('tabindex');
    unmount();
    renderWindow({ config: EDIT, window: { readOnly: true } });
    expect(screen.getByTestId('list-modal-row-ROW-1')).not.toHaveAttribute('tabindex');
  });

  for (const key of ['Enter', ' ']) {
    it(`${JSON.stringify(key)} on the focused row opens it`, () => {
      renderWindow({ config: EDIT });
      fireEvent.keyDown(screen.getByTestId('list-modal-row-ROW-1'), { key });
      expect(editOpen()).toBeInTheDocument();
      expect(lastEntityFormProps.data).toMatchObject({ id: 'ROW-1' });
    });
  }

  it('another key on the row does nothing', () => {
    renderWindow({ config: EDIT });
    fireEvent.keyDown(screen.getByTestId('list-modal-row-ROW-1'), { key: 'a' });
    expect(editOpen()).not.toBeInTheDocument();
  });

  it('Enter on the selection checkbox does not open the row', () => {
    renderWindow({ config: EDIT });
    fireEvent.keyDown(rowSelectInput('ROW-1'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('list-modal-select-cell-ROW-1'), { key: ' ' });
    expect(editOpen()).not.toBeInTheDocument();
  });

  it('Enter on a toggle cell does not open the row', () => {
    renderWindow({ config: EDIT });
    fireEvent.keyDown(screen.getByTestId('cell-toggle-active-ROW-1'), { key: 'Enter' });
    expect(editOpen()).not.toBeInTheDocument();
  });

  it('Enter on a hover action does not open the row', () => {
    renderWindow({ config: EDIT });
    fireEvent.keyDown(screen.getByTestId('list-modal-delete-ROW-1'), { key: 'Enter' });
    expect(editOpen()).not.toBeInTheDocument();
  });
});

describe('ListModalWindow — personal grid views', () => {
  const scope = `/sws/neo/grid-views/match-rule/${ENTITY}`;
  const columnId = (key) => {
    const column = COLUMNS.find((item) => item.key === key);
    return `list:ad:${column.column}:field:${key}`;
  };
  const savedView = {
    version: 1,
    surface: 'list',
    columns: [
      { id: columnId('name'), visible: true, order: 1, width: 240 },
      { id: columnId('priority'), visible: true, order: 0, width: 160 },
      { id: columnId('active'), visible: false, order: 2 },
    ],
  };

  beforeEach(() => {
    gridColumnViewsEnabled = true;
    neoState.data = [{ id: 'GRID-1', name: 'Rule', priority: 10, active: true }];
    apiFetchMock.mockImplementation(async (url, options = {}) => {
      if (url === scope) {
        return { ok: true, status: 200, json: async () => options.method === 'PUT'
          ? JSON.parse(options.body) : savedView };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
  });

  it('restores visibility, order and widths without removing selection or edit actions', async () => {
    renderWindow({ windowName: 'match-rule' });
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(apiFetchMock).toHaveBeenCalledWith(scope, expect.objectContaining({ baseUrl: '' }));
    const row = screen.getByTestId('list-modal-row-GRID-1');
    const cells = [...row.querySelectorAll('[data-testid^="cell-"]')];
    expect(cells.map((cell) => cell.getAttribute('data-testid'))).toEqual([
      'cell-priority-GRID-1', 'cell-name-GRID-1',
    ]);
    expect(screen.getByTestId('cell-name-GRID-1').closest('td')).toHaveStyle({ width: '240px' });
    fireEvent.click(screen.getByTestId('list-modal-select-GRID-1'));
    expect(within(row).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('list-modal-edit-GRID-1'));
    expect(screen.getByTestId('list-modal-submit')).toBeInTheDocument();
    expect(lastEntityFormProps.data.name).toBe('Rule');
  });

  it('saves a keyboard width change explicitly without writing the business record', async () => {
    renderWindow({ windowName: 'match-rule' });
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(screen.getByTestId('grid-view-save')).toBeDisabled();
    fireEvent.keyDown(screen.getAllByRole('separator')[0], { key: 'ArrowRight' });
    expect(screen.getByTestId('grid-view-save')).toBeEnabled();
    fireEvent.click(screen.getByTestId('grid-view-save'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([url, options]) =>
      url === scope && options.method === 'PUT')).toBe(true));
    const [, request] = apiFetchMock.mock.calls.find(([url, options]) => url === scope && options.method === 'PUT');
    expect(JSON.parse(request.body).columns.find((column) => column.id === columnId('priority')).width).toBe(170);
    expect(apiFetchMock.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1);
  });

  it('reorders visible data columns by keyboard while leaving selection first', async () => {
    renderWindow({ windowName: 'match-rule' });
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'moveGridColumn' })[1], {
      key: 'ArrowLeft', altKey: true, shiftKey: true,
    });
    const row = screen.getByTestId('list-modal-row-GRID-1');
    expect([...row.querySelectorAll('[data-testid^="cell-"]')].map((cell) => cell.getAttribute('data-testid')))
      .toEqual(['cell-name-GRID-1', 'cell-priority-GRID-1']);
    expect(row.firstElementChild).toContainElement(screen.getByTestId('list-modal-select-GRID-1'));
    expect(screen.getByTestId('grid-view-save')).toBeEnabled();
  });

  it('disables personalization and makes no view request when the shared flag is off', () => {
    gridColumnViewsEnabled = false;
    renderWindow({ windowName: 'match-rule' });
    expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('cell-toggle-active-GRID-1')).toBeInTheDocument();
  });

  it('fails closed for an ambiguous identity while preserving the current list', () => {
    renderWindow({ windowName: 'another-window', api: { baseUrl: '/sws/neo/match-rule' } });
    expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('list-modal-row-GRID-1')).toBeInTheDocument();
  });

  it('uses the explicit API spec when no route window name is supplied', async () => {
    renderWindow({ api: { specName: 'match-rule', baseUrl: '/sws/neo/match-rule' } });
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(apiFetchMock).toHaveBeenCalledWith(scope, expect.objectContaining({ baseUrl: '' }));
  });

  it('does not derive a persistence identity from an API URL alone', () => {
    renderWindow();
    expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('list-modal-row-GRID-1')).toBeInTheDocument();
  });

  // A window that declares columnWidth / columnMaxWidth (emitted as minWidth / maxWidth): while a
  // personal view is ACTIVE the view sizes every column (user width, else the view default, which
  // is the declared minWidth) in a fixed table layout — so neither the declared frame style, the
  // content cap nor the spacer column apply.
  describe('with declared column widths', () => {
    const WIDE_COLUMNS = [
      { key: 'name', column: 'Name', type: 'string', minWidth: 164, maxWidth: 240 },
      { key: 'priority', column: 'Priority', type: 'number', inlineEdit: true, minWidth: 124 },
      { key: 'active', column: 'IsActive', type: 'boolean', toggle: true },
    ];
    // The user resized only the name column; priority / active keep the view default.
    const wideView = {
      version: 1,
      surface: 'list',
      columns: [
        { id: columnId('name'), visible: true, order: 0, width: 200 },
        { id: columnId('priority'), visible: true, order: 1 },
        { id: columnId('active'), visible: true, order: 2 },
      ],
    };

    beforeEach(() => {
      apiFetchMock.mockImplementation(async (url, options = {}) => (url === scope
        ? { ok: true, status: 200, json: async () => (options.method === 'PUT' ? JSON.parse(options.body) : wideView) }
        : { ok: true, status: 200, json: async () => ({}) }));
    });

    async function renderActive(overrides = {}) {
      const utils = renderWindow({ windowName: 'match-rule', columns: WIDE_COLUMNS, ...overrides });
      await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
      return utils;
    }

    const headerOf = (label) => screen.getByText(label).closest('th');

    it('sizes header and cell by the user width, not the declared fixed width', async () => {
      await renderActive();
      const th = headerOf('Name');
      const td = screen.getByTestId('cell-name-GRID-1').closest('td');
      for (const el of [th, td]) {
        expect(el.style.width).toBe('200px');
        expect(el.style.minWidth).toBe('');
      }
    });

    it('falls back to the view default — the declared minWidth — for a column the user did not resize', async () => {
      await renderActive();
      expect(headerOf('Priority').style.width).toBe('124px');
      expect(screen.getByTestId('cell-toggle-active-GRID-1').closest('td').style.width).toBe('160px');
      expect(screen.getByTestId('cell-toggle-active-GRID-1').closest('td').style.minWidth).toBe('');
    });

    it('does not cap the cell content at the declared maxWidth', async () => {
      await renderActive();
      const content = screen.getByTestId('cell-name-GRID-1');
      expect(content.parentElement.tagName).toBe('TD');
      expect(content.closest('td').querySelector('.truncate')).toBeNull();
    });

    it('renders no spacer column', async () => {
      await renderActive();
      expect(screen.queryByTestId('list-modal-spacer-head')).not.toBeInTheDocument();
      expect(screen.queryByTestId('list-modal-spacer-cell')).not.toBeInTheDocument();
    });

    it('the empty-state colSpan counts no spacer (3 columns + checkbox + actions)', async () => {
      neoState.data = [];
      renderWindow({ windowName: 'match-rule', columns: WIDE_COLUMNS });
      await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
      expect(screen.queryByTestId('list-modal-spacer-head')).not.toBeInTheDocument();
      expect(screen.getByTestId('list-modal-empty')).toHaveAttribute('colspan', '5');
    });

    it('fixes the table width to the columns plus a 40px checkbox column and the actions column', async () => {
      await renderActive();
      const table = screen.getByRole('table');
      expect(table.style.tableLayout).toBe('fixed');
      // 200 (name, user) + 124 (priority, default = minWidth) + 160 (active, no width) + 40 + 80.
      expect(table.style.width).toBe('604px');
    });

    it('counts the checkbox column as 32px in the compact list', async () => {
      await renderActive({ config: { listVariant: 'compact' } });
      expect(screen.getByRole('table').style.width).toBe('596px');
    });

    it('without an active view the declared widths, cap and spacer apply unchanged', () => {
      gridColumnViewsEnabled = false;
      renderWindow({ windowName: 'match-rule', columns: WIDE_COLUMNS });
      expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
      const td = screen.getByTestId('cell-name-GRID-1').closest('td');
      expect(td.style.width).toBe('164px');
      expect(td.style.minWidth).toBe('164px');
      expect(screen.getByTestId('cell-name-GRID-1').parentElement.style.maxWidth).toBe('216px');
      expect(screen.getByTestId('list-modal-spacer-head')).toBeInTheDocument();
      expect(screen.getByRole('table').style.tableLayout).toBe('');
    });
  });

  it('keeps default columns and exposes retry when loading the saved view fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('offline'));
    renderWindow({ windowName: 'match-rule' });
    await waitFor(() => expect(screen.getByTestId('grid-view-status')).toHaveTextContent('gridViewLoadFailed'));
    expect(screen.getByTestId('grid-view-save')).toBeDisabled();
    expect(screen.getByTestId('cell-toggle-active-GRID-1')).toBeInTheDocument();
    expect(screen.getByTestId('list-modal-edit-GRID-1')).toBeInTheDocument();
  });
});
