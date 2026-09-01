// Mocks BEFORE any import

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => `translated:${key}`,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/sales-invoice' }),
}));

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
          { name: 'deal', label: 'Deal', hidden: true },
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

// Stub cmdk primitives with simple passthrough divs/inputs
vi.mock('@/components/ui/command.jsx', () => ({
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
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette.jsx';

function openPalette() {
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
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

  it('visible (non-hidden) item is rendered after opening', () => {
    render(<CommandPalette />);
    openPalette();
    // CommandItem value is `${translatedLabel} ${item.label} ${item.name}`
    // translatedLabel = 'translated:Sales Order', label = 'Sales Order', name = 'sales-order'
    const expectedValue = 'translated:Sales Order Sales Order sales-order';
    expect(screen.getByTestId(`cmd-item-${expectedValue}`)).toBeInTheDocument();
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
});
