// --- Module mocks (hoisted before the component import) --------------------
//
// ListModalWindow no longer renders DataTable — it renders an in-house grid
// (ListModalGrid) plus a toolbar (back button, dropdown filters, search, "New"),
// a dismissible banner, and per-row edit + inline-toggle actions. The two new
// child components (listModalCells, ListModalToolbarFilter) are stubbed here so
// these tests stay focused on ListModalWindow behaviour; the children get their
// own dedicated test files.

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// react-router-dom: capture the navigate mock so we can assert the back button.
const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

// i18n: useUI echoes the key (so banner / titles assert against the key name);
// useMenuLabel echoes the label.
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (label) => label,
  // useLabel echoes the column name so footer-toggle label assertions are predictable.
  useLabel: () => (column) => column,
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
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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
  ListModalCell: ({ row, col, onToggle }) =>
    col.toggle || col.cellType === 'toggle' ? (
      <button
        type="button"
        data-testid={`cell-toggle-${col.key}-${row.id}`}
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
// form `data`, e.g. the auto-priority value, and drive onChange).
let lastEntityFormProps = null;
vi.mock('../EntityForm.jsx', () => ({
  EntityForm: (props) => {
    lastEntityFormProps = props;
    return <div data-testid="entity-form" />;
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
