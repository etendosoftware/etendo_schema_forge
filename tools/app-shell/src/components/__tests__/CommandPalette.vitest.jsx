// @covers tools/app-shell/src/components/CommandPalette.jsx
// @covers tools/app-shell/src/lib/globalSearchMenu.js
// Mocks BEFORE any import

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => `translated:${key}`,
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
}));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => mockUseAuth() }));

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
        group: 'Configuración',
        icon: 'Settings',
        hidden: false,
        items: [
          { name: 'user', label: 'Users', hidden: false },
          { name: 'role', label: 'Roles', hidden: false },
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

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useEffect } from 'react';
import { CommandPalette } from '../CommandPalette.jsx';
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

  describe('window matches (ETP-5602)', () => {
    it('lists only the windows of a section whose name matches the query', async () => {
      renderWithQuery('Configura');
      await waitFor(() => expect(renderedWindowNames()).toEqual(['user', 'role']));
      expect(screen.getByTestId('cmd-group-translated:Configuración')).toBeInTheDocument();
      expect(screen.queryByTestId('cmd-group-translated:Sales')).not.toBeInTheDocument();
    });

    it('matches section and window names ignoring accents and case', async () => {
      renderWithQuery('CONFIGURACION');
      await waitFor(() => expect(renderedWindowNames()).toEqual(['user', 'role']));

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
      expect(screen.getByTestId('cmd-empty')).toHaveTextContent('noResultsFound');
      expect(renderedWindowNames()).toEqual([]);
    });

    it('keeps every visible window when the query is empty', () => {
      renderWithQuery('');
      expect(renderedWindowNames()).toEqual(['sales-order', 'user', 'role', 'goods-shipment', 'warehouse']);
    });

    it('opens the first matching window on Enter', async () => {
      renderWithQuery('Configura');
      await waitFor(() => expect(renderedWindowNames()[0]).toBe('user'));
      fireEvent.keyDown(screen.getByTestId('bridge-input'), { key: 'Enter' });
      expect(mockNavigate).toHaveBeenCalledWith('/user');
    });
  });

  it('anchors the window filter picker to its trigger instead of a fixed panel offset', async () => {
    render(<CommandPalette />);
    openPalette();
    await waitFor(() => expect(screen.getByTestId('vector-search-target-picker-trigger')).toBeInTheDocument());
    const trigger = screen.getByTestId('vector-search-target-picker-trigger');
    fireEvent.click(trigger);
    const picker = screen.getByTestId('vector-search-target-picker');
    expect(picker.className).not.toMatch(/left-\[/);
    expect(picker.parentElement).toContainElement(trigger);
    expect(picker.parentElement.className).toMatch(/\brelative\b/);

    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('vector-search-target-picker')).not.toBeInTheDocument();
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
