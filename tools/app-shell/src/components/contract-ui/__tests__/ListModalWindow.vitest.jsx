// --- Module mocks (hoisted before the component import) --------------------
//
// ListModalWindow no longer renders DataTable — it renders an in-house grid
// (ListModalGrid) plus a toolbar (back button, dropdown filters, search, "New"),
// a dismissible banner, and per-row edit + inline-toggle actions. The two new
// child components (listModalCells, ListModalToolbarFilter) are stubbed here so
// these tests stay focused on ListModalWindow behaviour; the children get their
// own dedicated test files.

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

// Backend error translation: pass-through.
vi.mock('@/lib/backendErrors.js', () => ({
  translateBackendError: (raw) => raw,
}));

// toast: collect calls.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

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

import { ListModalWindow } from '../ListModalWindow.jsx';

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
  neoState.data = [];
  neoState.loading = false;
  neoState.reload = vi.fn();
  lastEntityFormProps = null;
  navigateMock.mockClear();
  vi.restoreAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
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

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
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

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
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

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
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

    const [, opts] = global.fetch.mock.calls[0];
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
    const [, opts] = global.fetch.mock.calls[0];
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
    global.fetch = vi.fn((url) => {
      if (isDimensionRequest(url)) return Promise.resolve(dimensionsResponse());
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  }

  function dimensionRequestCount() {
    return global.fetch.mock.calls.filter(([url]) => isDimensionRequest(url)).length;
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
    global.fetch = vi.fn((url) => {
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
  return global.fetch.mock.calls.filter(([, opts]) => opts?.method === 'DELETE');
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
    global.fetch = vi.fn((url, opts) => {
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
