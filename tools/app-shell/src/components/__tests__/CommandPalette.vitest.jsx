// @covers tools/app-shell/src/components/CommandPalette.jsx
// @covers tools/app-shell/src/lib/globalSearchMenu.js
// Mocks BEFORE any import
const MENU_TRANSLATIONS = vi.hoisted(() => ({
  'General Ledger Configuration': 'Esquema contable',
  'Fiscal Configuration': 'Configuración Fiscal',
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  // A few labels translate to something unrelated to their source text, like the real
  // es_ES menu ("General Ledger Configuration" → "Esquema contable"), or that only match
  // a query once translated ("Fiscal Configuration" → "Configuración Fiscal").
  useMenuLabel: () => (key) => MENU_TRANSLATIONS[key] ?? `translated:${key}`,
}));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/sales-invoice' }),
}));

const mockUseFeatureFlag = vi.hoisted(() => vi.fn(() => false));
const mockUseAuth = vi.hoisted(() => vi.fn(() => ({ capabilities: { isAdminOrClientAdmin: true } })));
vi.mock('@/lib/flags', () => ({
  useFeatureFlag: (...args) => mockUseFeatureFlag(...args),
  ACCT_PROCESS_MONITOR: 'acct-process-monitor',
  PUBLIC_API_KEYS: 'public-api-keys',
  PROOF_OF_CONCEPT_MENU: 'proof-of-concept-menu',
  UNIFIED_CALENDAR_POC: 'unified-calendar-poc',
}));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => mockUseAuth() }));

// Record (vector) results are remote. By default the real hook runs (and finds nothing in
// jsdom); a test that needs record matches sets `vectorSearchOverride.current`.
const vectorSearchOverride = vi.hoisted(() => ({ current: null }));
vi.mock('@/hooks/useVectorSearch.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    useVectorSearch: (args) => vectorSearchOverride.current ?? actual.useVectorSearch(args),
  };
});

// Controlled menu fixture: one visible group with a visible and a hidden item,
// plus one fully hidden group.
// The component at src/components/CommandPalette.jsx imports '../menu.json'
// which resolves to src/menu.json. From this test at src/components/__tests__/,
// that path is '../../menu.json'.
vi.mock('../../menu.json', () => ({
  default: {
    menu: [
      {
        group: 'Sales',
        icon: 'ShoppingCart',
        hidden: false,
        items: [
          { name: 'sales-order', label: 'Sales Order', hidden: false },
          { name: 'acct-process-monitor', label: 'Accounting Process', hidden: false, featureFlag: 'acct-process-monitor', capability: 'isAdminOrClientAdmin' },
          { name: 'api-keys', label: 'Public API Keys', hidden: false, featureFlag: 'public-api-keys', capability: 'isAdminOrClientAdmin' },
          { name: 'deal', label: 'Deal', hidden: true },
        ],
      },
      {
        group: 'Finance',
        icon: 'Calculator',
        hidden: false,
        items: [
          { name: 'general-ledger-configuration', label: 'General Ledger Configuration', hidden: false },
        ],
      },
      {
        group: 'Configuración',
        icon: 'Settings',
        hidden: false,
        items: [
          { name: 'user', label: 'Users', hidden: false },
          { name: 'role', label: 'Roles', hidden: false },
          // Last of its section, like the real menu: only its own name can rank it first.
          { name: 'fiscal-config', label: 'Fiscal Configuration', hidden: false },
        ],
      },
      {
        group: 'Logistics',
        icon: 'Truck',
        hidden: false,
        items: [
          { name: 'goods-shipment', label: 'Albarán', hidden: false },
          { name: 'warehouse', label: 'Warehouse', hidden: false },
        ],
      },
      {
        group: 'Hidden Group',
        icon: 'Package',
        hidden: true,
        items: [{ name: 'secret', label: 'Secret', hidden: false }],
      },
    ],
  },
}));

// Stub global-search primitives with simple passthrough elements
vi.mock('@/components/global-search/GlobalSearchPrimitives.jsx', () => ({
  CommandDialog: ({ open, children }) =>
    open ? <div data-testid="cmd-dialog">{children}</div> : null,
  CommandInput: (props) => <input data-testid="cmd-input" {...props} />,
  CommandList: ({ children }) => <div data-testid="cmd-list">{children}</div>,
  CommandEmpty: ({ children }) => <div data-testid="cmd-empty">{children}</div>,
  CommandGroup: ({ heading, children }) => (
    <div data-testid={`cmd-group-${heading}`}>{children}</div>
  ),
  CommandItem: ({ value, children, onSelect }) => (
    <div data-testid={`cmd-item-${value}`} onClick={onSelect}>
      {children}
    </div>
  ),
  GlobalSearchDialog: ({ open, children }) =>
    open ? <div data-testid="cmd-dialog"><div data-testid="CommandDropdown__8e5d1a">{children}</div></div> : null,
  GlobalSearchInput: (props) => <input data-testid="cmd-input" {...props} />,
  GlobalSearchList: ({ children }) => <div data-testid="cmd-list">{children}</div>,
  GlobalSearchEmpty: ({ children }) => <div data-testid="cmd-empty">{children}</div>,
  GlobalSearchGroup: ({ heading, children }) => (
    <div data-testid={`cmd-group-${heading}`}>{children}</div>
  ),
  GlobalSearchItem: ({ value, children, onSelect, ...props }) => (
    <div {...props} data-global-search-item="true" data-testid={props['data-search-kind'] === 'recent' ? props['data-testid'] : `cmd-item-${value}`} onClick={onSelect}>
      {children}
    </div>
  ),
}));

import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import { useEffect } from 'react';
import { CommandPalette } from '../CommandPalette.jsx';
import { splitSearchHighlight } from '@/lib/globalSearchMenu.js';
import { GlobalSearchProvider, useGlobalSearch } from '@/components/global-search/GlobalSearchContext.jsx';

function openPalette() {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
}

function SetSearchQuery({ value }) {
  const { setQuery } = useGlobalSearch();
  useEffect(() => setQuery(value), [setQuery, value]);
  return null;
}

// Mirrors the top-bar input: forwards its keys to the shared global-search handler.
function SearchInputBridge() {
  const { handleKeyDown } = useGlobalSearch();
  return <input data-testid="bridge-input" onKeyDown={handleKeyDown} />;
}

function renderWithQuery(value) {
  render(
    <GlobalSearchProvider>
      <SetSearchQuery value={value} />
      <SearchInputBridge />
      <CommandPalette />
    </GlobalSearchProvider>,
  );
  openPalette();
}

function renderedWindowNames() {
  return Array.from(document.querySelectorAll('[data-testid^="cmd-group-translated:"] [data-testid^="cmd-item-"]'))
    .map((el) => el.dataset.testid.split(' ').at(-1));
}

async function waitForVectorSearchIdle() {
  await waitFor(() => expect(screen.queryByTestId('vector-search-loading')).not.toBeInTheDocument());
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vectorSearchOverride.current = null;
  });

  it('renders nothing (dialog closed) by default', () => {
    render(<CommandPalette />);
    expect(screen.queryByTestId('cmd-dialog')).not.toBeInTheDocument();
  });

  it('opens on Ctrl+K keydown', () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByTestId('cmd-dialog')).toBeInTheDocument();
  });

  it('closes on Escape from the shared search input handler', () => {
    render(<CommandPalette />);
    openPalette();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('cmd-dialog')).not.toBeInTheDocument();
  });

  it('visible (non-hidden) item is rendered after opening', () => {
    render(<CommandPalette />);
    openPalette();
    // CommandItem value is `${translatedLabel} ${item.label} ${item.name}`
    // translatedLabel = 'translated:Sales Order', label = 'Sales Order', name = 'sales-order'
    const expectedValue = 'translated:Sales Order Sales Order sales-order';
    expect(screen.getByTestId(`cmd-item-${expectedValue}`)).toBeInTheDocument();
  });

  it('hides public API keys when the feature flag is off', () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.queryByText('translated:Public API Keys')).not.toBeInTheDocument();
  });

  it('hides accounting processes when their feature flag is off', () => {
    render(<CommandPalette />);
    openPalette();
    expect(screen.queryByText('translated:Accounting Process')).not.toBeInTheDocument();
  });

  it('shows public API keys only for an admin when the feature flag is on', () => {
    mockUseFeatureFlag.mockReturnValue(true);
    render(<CommandPalette />);
    openPalette();
    expect(screen.getByText('translated:Public API Keys')).toBeInTheDocument();
  });

  it('hides public API keys from a non-admin even when the feature flag is on', () => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockUseAuth.mockReturnValue({ capabilities: { isAdminOrClientAdmin: false } });
    render(<CommandPalette />);
    openPalette();
    expect(screen.queryByText('translated:Public API Keys')).not.toBeInTheDocument();
  });

  it('highlights the matching text in textual search results', async () => {
    render(
      <GlobalSearchProvider>
        <SetSearchQuery value="sales" />
        <CommandPalette />
      </GlobalSearchProvider>,
    );
    openPalette();

    await waitFor(() => {
      expect(screen.getAllByTestId('search-text-highlight').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByTestId('search-text-highlight')[0]).toHaveTextContent(/sales/i);
  });

  it('hidden items are not rendered after opening', () => {
    render(<CommandPalette />);
    openPalette();
    // 'deal' is hidden — should not appear in the document
    const items = document.querySelectorAll('[data-testid^="cmd-item-"]');
    const itemValues = Array.from(items).map((el) => el.dataset.testid);
    // None of the rendered items should contain 'deal' in their testid
    expect(itemValues.some((v) => v.includes('deal'))).toBe(false);
  });

  it('hidden groups are not rendered after opening', () => {
    render(<CommandPalette />);
    openPalette();
    // 'Hidden Group' group heading is translated as 'translated:Hidden Group'
    expect(
      screen.queryByTestId('cmd-group-translated:Hidden Group'),
    ).not.toBeInTheDocument();
  });

  it('item value includes translated label for search', () => {
    render(<CommandPalette />);
    openPalette();
    // The testid is built from the value prop which starts with translatedLabel
    const expectedStart = 'translated:Sales Order';
    const items = document.querySelectorAll('[data-testid^="cmd-item-"]');
    const values = Array.from(items).map((el) => el.dataset.testid);
    expect(values.some((v) => v.includes(expectedStart))).toBe(true);
  });

  it('group heading uses translation', () => {
    render(<CommandPalette />);
    openPalette();
    // The CommandGroup heading for 'Sales' becomes 'translated:Sales'
    expect(screen.getByTestId('cmd-group-translated:Sales')).toBeInTheDocument();
  });

  it('defaults vector search to the current window target and lets the user clear that scope', async () => {
    render(<CommandPalette />);
    openPalette();

    await waitFor(() => {
      expect(screen.getByTestId('vector-search-scope')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('vector-search-scope'));
    expect(screen.getByTestId('vector-search-scope')).toHaveTextContent('allWindows');
  });

  it('treats a cleared top-bar scope as all targets, not an empty search', async () => {
    render(<CommandPalette />);
    openPalette();
    await waitFor(() => expect(screen.getByTestId('vector-search-scope')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('vector-search-target-picker-trigger'));

    document.dispatchEvent(new CustomEvent('schema-forge:vector-search-scope', {
      detail: { pathname: '/sales-invoice', vectorSearchTarget: null },
    }));

    await waitFor(() => {
      const options = screen.getAllByTestId('vector-search-target-option');
      expect(options.length).toBeGreaterThan(0);
      expect(options.every((option) => option.checked)).toBe(true);
    });
  });

  it('keeps the dropdown open when a recent search is confirmed with the keyboard', async () => {
    localStorage.setItem('schema-forge:recent-searches', JSON.stringify([
      { query: 'blanquiceleste', targets: [], timestamp: 1 },
    ]));
    render(
      <GlobalSearchProvider>
        <CommandPalette />
      </GlobalSearchProvider>,
    );
    openPalette();
    await waitFor(() => expect(screen.getByTestId('recent-search-item')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(screen.getByTestId('cmd-dialog')).toBeInTheDocument();
  });

  describe('filters the menu windows by the query', () => {
    it('lists the windows whose name matches, then the rest of the matching section, under one heading', async () => {
      renderWithQuery('Configura');
      await waitFor(() => expect(renderedWindowNames())
        .toEqual(['fiscal-config', 'user', 'role', 'general-ledger-configuration']));
      // Tier 1 (Configuración Fiscal) and tier 2 (the rest of the section) are adjacent,
      // so they render under one "Configuración" heading, not the same heading twice.
      expect(screen.getAllByTestId('cmd-group-translated:Configuración')).toHaveLength(1);
      expect(screen.queryByTestId('cmd-group-translated:Sales')).not.toBeInTheDocument();
    });

    it('matches section and window names ignoring accents and case', async () => {
      renderWithQuery('CONFIGURACION');
      await waitFor(() => expect(renderedWindowNames()).toEqual(['fiscal-config', 'user', 'role']));

      cleanup();
      renderWithQuery('albaran');
      await waitFor(() => expect(renderedWindowNames()).toEqual(['goods-shipment']));
    });

    it('matches the original (untranslated) label and the window name', async () => {
      renderWithQuery('warehouse');
      await waitFor(() => expect(renderedWindowNames()).toEqual(['warehouse']));
    });

    it('does not report no results when only windows match', async () => {
      renderWithQuery('Configura');
      await waitForVectorSearchIdle();
      expect(screen.queryByTestId('cmd-empty')).not.toBeInTheDocument();
    });

    it('reports no results and lists no window when nothing matches', async () => {
      renderWithQuery('zzzqqq');
      await waitForVectorSearchIdle();
      // The debounced search may not have started yet when the idle check passes.
      await waitFor(() => expect(screen.getByTestId('cmd-empty')).toHaveTextContent('noResultsFound'));
      expect(renderedWindowNames()).toEqual([]);
    });

    it('highlights a match whole ignoring accents, case and whitespace runs', () => {
      expect(splitSearchHighlight('Albarán de venta', 'albaran')).toEqual([
        { text: 'Albarán', match: true },
        { text: ' de venta', match: false },
      ]);
      expect(splitSearchHighlight('Albarán  de venta', '  ALBARAN de ')).toEqual([
        { text: 'Albarán  de', match: true },
        { text: ' venta', match: false },
      ]);
    });

    it('keeps every visible window when the query is empty', () => {
      renderWithQuery('');
      expect(renderedWindowNames()).toEqual(['sales-order', 'general-ledger-configuration', 'user', 'role', 'fiscal-config', 'goods-shipment', 'warehouse']);
    });

    // QA ETP-5602: "Configura" matched the SOURCE label of "Esquema contable" (General Ledger
    // Configuration), whose section comes first in menu order, so Enter opened the wrong window.
    // Esquema contable stays in the last tier, behind the matching section's windows.
    it('ranks the matching section\'s windows above windows that match only by source label or route name', async () => {
      renderWithQuery('Configura');
      await waitFor(() => expect(renderedWindowNames())
        .toEqual(['fiscal-config', 'user', 'role', 'general-ledger-configuration']));
      fireEvent.keyDown(screen.getByTestId('bridge-input'), { key: 'Enter' });
      expect(mockNavigate).toHaveBeenCalledWith('/fiscal-config');
      expect(mockNavigate).not.toHaveBeenCalledWith('/general-ledger-configuration');
    });

    it('ranks a translated-label match above a route-name-only match', async () => {
      renderWithQuery('ledger');
      await waitFor(() => expect(renderedWindowNames()).toEqual(['general-ledger-configuration']));
      cleanup();
      renderWithQuery('esquema');
      await waitFor(() => expect(renderedWindowNames()).toEqual(['general-ledger-configuration']));
    });

    // Review S1 (ETP-5602): the tiering must beat menu order, not just coincide with it.
    // "-" appears in route names only (sales-order, general-ledger-configuration,
    // fiscal-config, goods-shipment), plus one translated label added here ("Almacén - central"). The
    // translated match lives in the LAST group, the route-name-only matches in earlier ones,
    // and Logistics splits across tiers 2 and 3, so it renders twice (one `${tier}:${group}` key each).
    it('ranks a translated-label match in a later group above route-name-only matches in earlier groups', async () => {
      MENU_TRANSLATIONS.Warehouse = 'Almacén - central';
      // Keyed by group name alone, the two Logistics groups collide: React only warns, and
      // reconciliation can then reuse the wrong group's items on the next keystroke.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        renderWithQuery('-');
        await waitFor(() => expect(renderedWindowNames())
          .toEqual(['warehouse', 'sales-order', 'general-ledger-configuration', 'fiscal-config', 'goods-shipment']));
        // Not adjacent (tier 1 and tier 3, with other sections between), so not merged.
        expect(screen.getAllByTestId('cmd-group-translated:Logistics')).toHaveLength(2);
        fireEvent.keyDown(screen.getByTestId('bridge-input'), { key: 'Enter' });
        expect(mockNavigate).toHaveBeenCalledWith('/warehouse');
        const duplicateKeyWarnings = consoleError.mock.calls
          .filter((args) => args.some((arg) => String(arg).includes('same key')));
        expect(duplicateKeyWarnings).toEqual([]);
      } finally {
        consoleError.mockRestore();
        delete MENU_TRANSLATIONS.Warehouse;
      }
    });

    // QA ETP-5602 (second round): "configu" listed the Configuración section in menu order,
    // so "Configuración Fiscal" — the one window whose own name matches — came last and Enter
    // opened Organización. A window's own name now outranks its section's name.
    it('ranks a window whose translated name matches above the rest of its matching section', async () => {
      renderWithQuery('configu');
      await waitFor(() => expect(renderedWindowNames())
        .toEqual(['fiscal-config', 'user', 'role', 'general-ledger-configuration']));
      fireEvent.keyDown(screen.getByTestId('bridge-input'), { key: 'Enter' });
      expect(mockNavigate).toHaveBeenCalledWith('/fiscal-config');
    });

    it('opens the first matching window on Enter', async () => {
      renderWithQuery('Configura');
      await waitFor(() => expect(renderedWindowNames()[0]).toBe('fiscal-config'));
      fireEvent.keyDown(screen.getByTestId('bridge-input'), { key: 'Enter' });
      expect(mockNavigate).toHaveBeenCalledWith('/fiscal-config');
    });
  });

  describe('orders window matches above record matches', () => {
    // 'sales-invoice' is a real vector-search target (artifacts/sales-invoice/contract.json).
    const recordMatch = (documentNo, id = 'INV-1') => ({
      target: 'sales-invoice', id, score: 0.9, fields: { documentNo },
    });

    // Record results only resolve to a route once the window contracts have loaded.
    async function waitForRecordResults() {
      await screen.findByTestId('vector-search-scope');
      return screen.findByTestId('cmd-group-exactSearchResults');
    }

    function dropdownItems() {
      return Array.from(document.querySelectorAll('[data-testid="CommandDropdown__8e5d1a"] [data-global-search-item="true"]'));
    }

    it('renders the matching window groups above the record result groups', async () => {
      vectorSearchOverride.current = { matches: [recordMatch('Configura-001')], isLoading: false };
      renderWithQuery('Configura');

      const records = await waitForRecordResults();
      const [windows] = screen.getAllByTestId('cmd-group-translated:Configuración');
      expect(windows.compareDocumentPosition(records) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const items = dropdownItems();
      const firstRecord = items.findIndex((item) => records.contains(item));
      expect(firstRecord).toBeGreaterThan(0);
      expect(items.slice(0, firstRecord).map((item) => item.dataset.testid.split(' ').at(-1)))
        .toEqual(['fiscal-config', 'user', 'role', 'general-ledger-configuration']);
    });

    it('opens the first matching window on Enter even when records also match', async () => {
      vectorSearchOverride.current = { matches: [recordMatch('Configura-001')], isLoading: false };
      renderWithQuery('Configura');
      await waitForRecordResults();

      fireEvent.keyDown(screen.getByTestId('bridge-input'), { key: 'Enter' });

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/fiscal-config');
    });

    it('opens the first record result on Enter when no window matches', async () => {
      vectorSearchOverride.current = {
        matches: [recordMatch('zzzqqq-001', 'INV-1'), recordMatch('zzzqqq-002', 'INV-2')],
        isLoading: false,
      };
      renderWithQuery('zzzqqq');
      await waitForRecordResults();
      expect(renderedWindowNames()).toEqual([]);
      expect(screen.queryByTestId('cmd-empty')).not.toBeInTheDocument();

      fireEvent.keyDown(screen.getByTestId('bridge-input'), { key: 'Enter' });

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/sales-invoice/INV-1');
    });
  });

  // ETP-5602: under "related" results the window tag sat inline after short labels, while
  // in the other groups it looked right-aligned only because long labels filled the row. The
  // similarity score ("74%") was shown on every row and means nothing to users.
  describe('renders every record row through the same layout', () => {
    // Scores split into the three groups (exact by text, semantic, related), not concentrated.
    const match = (id, name, score) => ({ target: 'sales-invoice', id, score, fields: { name } });

    it('right-aligns the window tag in every record group and shows no similarity percentage', async () => {
      vectorSearchOverride.current = {
        matches: [match('1', 'Avilés', 0.74), match('2', 'Foo', 0.8), match('3', 'Bar', 0.6), match('4', 'Baz', 0.58)],
        isLoading: false,
      };
      renderWithQuery('avile');
      // The tag (window label) resolves once the window contracts have loaded.
      await screen.findByTestId('vector-search-scope');
      await screen.findByTestId('cmd-group-exactSearchResults');
      const rows = ['exactSearchResults', 'relevantSearchResults', 'relatedSearchResults']
        .flatMap((group) => Array.from(screen.getByTestId(`cmd-group-${group}`)
          .querySelectorAll('[data-global-search-item="true"]')));
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        const label = within(row).getByTestId('vector-search-result-label');
        const tag = within(row).getByTestId('vector-search-result-tag');
        expect(label).toHaveClass('min-w-0', 'flex-1', 'break-words');
        expect(tag).toHaveClass('ml-auto', 'shrink-0', 'whitespace-nowrap');
        expect(tag).toBe(row.lastElementChild);
        expect(row).not.toHaveTextContent(/\d+\s*%/);
      }
    });
  });

  // The palette's cmdk-root is overflow-hidden and only as wide/tall as the search box and its
  // results, so any picker rendered inside it can be clipped. It must be portaled out of it.
  it('renders the window filter picker outside the palette so the palette cannot clip it', async () => {
    render(<CommandPalette />);
    openPalette();
    fireEvent.click(await screen.findByTestId('vector-search-target-picker-trigger'));

    const picker = await screen.findByTestId('vector-search-target-picker');
    expect(screen.getByTestId('cmd-dialog')).not.toContainElement(picker);
    expect(document.body).toContainElement(picker);
    expect(screen.getAllByTestId('vector-search-target-option').length).toBeGreaterThan(0);
  });

  it('keeps the palette open while using the picker and dismisses only the picker when focus leaves it', async () => {
    render(<><input data-testid="global-search-input" /><CommandPalette /></>);
    openPalette();
    fireEvent.click(await screen.findByTestId('vector-search-target-picker-trigger'));
    const option = (await screen.findAllByTestId('vector-search-target-option'))[0];

    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.getByTestId('cmd-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('vector-search-target-picker')).toBeInTheDocument();

    // Radix dismisses on pointer-down or focus outside; jsdom only drives the focus path.
    // The search input belongs to the palette, so the palette itself stays open.
    act(() => screen.getByTestId('global-search-input').focus());
    await waitFor(() => expect(screen.queryByTestId('vector-search-target-picker')).not.toBeInTheDocument());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.getByTestId('cmd-dialog')).toBeInTheDocument();
  });

  it('closes only the picker, not the palette, on Escape inside the picker', async () => {
    render(<CommandPalette />);
    openPalette();
    fireEvent.click(await screen.findByTestId('vector-search-target-picker-trigger'));
    const option = (await screen.findAllByTestId('vector-search-target-option'))[0];

    fireEvent.keyDown(option, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('vector-search-target-picker')).not.toBeInTheDocument());
    expect(screen.getByTestId('cmd-dialog')).toBeInTheDocument();
  });

  it('keeps the palette open when the picker closes on Escape with focus inside it', async () => {
    render(<CommandPalette />);
    openPalette();
    fireEvent.click(await screen.findByTestId('vector-search-target-picker-trigger'));
    const option = (await screen.findAllByTestId('vector-search-target-option'))[0];
    const checkbox = option.querySelector('input') ?? option;
    checkbox.focus();

    // Keyboard path: the browser fires focusout from the focused checkbox while the
    // picker unmounts, and focus lands on <body> before Radix restores it.
    fireEvent.focusOut(checkbox, { relatedTarget: null });
    fireEvent.keyDown(checkbox, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('vector-search-target-picker')).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByTestId('cmd-dialog')).toBeInTheDocument();
  });

  // Review W2 (ETP-5602): the focusout exception for the picker covers only the picker
  // closing itself. Radix keeps Tab inside the picker, so focus reaches an element outside
  // the palette only programmatically or through assistive technology; when it does, it is
  // still leaving and must close the palette.
  it('closes the palette when focus leaves a picker checkbox for an element outside it', async () => {
    render(
      <>
        <button type="button" data-testid="outside-palette">outside</button>
        <CommandPalette />
      </>,
    );
    openPalette();
    fireEvent.click(await screen.findByTestId('vector-search-target-picker-trigger'));
    const option = (await screen.findAllByTestId('vector-search-target-option'))[0];
    const checkbox = option.querySelector('input') ?? option;
    act(() => checkbox.focus());
    expect(checkbox).toHaveFocus();

    // Not wrapped in act(): act() would flush the picker's dismissal synchronously, so the
    // checkbox would already be gone when the deferred focusout check runs — jsdom-only
    // timing the browser does not have (verified in Chrome).
    screen.getByTestId('outside-palette').focus();

    await waitFor(() => expect(screen.queryByTestId('cmd-dialog')).not.toBeInTheDocument());
  });

  // Review B1 (ETP-5602): a click on a non-focusable spot outside the palette dismisses the
  // picker and leaves focus on <body> — exactly where Esc leaves it. The pointer is what
  // tells them apart: after an outside pointerdown the palette must close, as it does
  // without the picker.
  it('closes the palette when a pointerdown outside it dismisses the picker and focus drops to body', async () => {
    render(
      <>
        <div data-testid="outside-area">outside</div>
        <CommandPalette />
      </>,
    );
    openPalette();
    fireEvent.click(await screen.findByTestId('vector-search-target-picker-trigger'));
    const option = (await screen.findAllByTestId('vector-search-target-option'))[0];
    const checkbox = option.querySelector('input') ?? option;
    act(() => checkbox.focus());
    expect(checkbox).toHaveFocus();

    fireEvent.pointerDown(screen.getByTestId('outside-area'));
    // A non-focusable target: the browser blurs the checkbox and focus lands on <body>.
    checkbox.blur();
    expect(document.activeElement).toBe(document.body);

    await waitFor(() => expect(screen.queryByTestId('cmd-dialog')).not.toBeInTheDocument());
  });

  it('returns the keep-open decision to the top-bar keyboard bridge', () => {
    function KeyboardBridge() {
      const { open, setOpen, handleKeyDown, registerKeyboardHandler } = useGlobalSearch();
      useEffect(() => registerKeyboardHandler(() => ({ keepOpen: true })), [registerKeyboardHandler]);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>open</button>
          <input data-testid="bridge-input" onKeyDown={(event) => {
            const result = handleKeyDown(event);
            if (event.key === 'Enter' && !result?.keepOpen) setOpen(false);
          }} />
          <span data-testid="bridge-state">{String(open)}</span>
        </>
      );
    }
    render(<GlobalSearchProvider><KeyboardBridge /></GlobalSearchProvider>);
    fireEvent.click(screen.getByText('open'));
    fireEvent.keyDown(screen.getByTestId('bridge-input'), { key: 'Enter' });
    expect(screen.getByTestId('bridge-state')).toHaveTextContent('true');
  });
});
