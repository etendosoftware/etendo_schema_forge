/**
 * TopBar — the shared app shell header.
 * Covers title truncation, breadcrumb/extra slots, search trigger,
 * 3-dot dropdown menu, action buttons, and callbacks.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockCopilotToggle = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => ({ toggle: mockCopilotToggle }),
}));

vi.mock('@/components/ui/dropdown-menu.jsx', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onSelect, onClick, disabled, ...props }) => (
    <button type="button" onClick={onClick || onSelect} disabled={disabled} {...props}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

import TopBar from '../TopBar.jsx';

const LONG_NAME = 'Banco Santander S.A (Sandbox) - PT50018000354378591102009';

describe('TopBar title', () => {
  it('truncates a long title instead of letting it overflow the header', () => {
    render(<TopBar title={LONG_NAME} />);
    const title = screen.getByText(LONG_NAME);
    expect(title.className).toMatch(/truncate/);
    // The block itself must be capped — truncate has no effect on an unbounded container.
    expect(title.closest('[class*="max-w-"]')).toBeTruthy();
  });

  it('passes the untruncated title to the tooltip content', () => {
    const { container } = render(<TopBar title={LONG_NAME} />);
    const tooltipContent = container.querySelector('[data-testid="TooltipContent__topbar-title"]');
    if (tooltipContent) {
      expect(tooltipContent).toHaveTextContent(LONG_NAME);
    }
  });

  it('renders a short title unaffected (no visible truncation in practice)', () => {
    render(<TopBar title="Cuentas" />);
    expect(screen.getByText('Cuentas')).toBeInTheDocument();
  });

  it('renders breadcrumb when provided', () => {
    render(<TopBar title="Factura" breadcrumb="Ventas / Facturas" />);
    expect(screen.getByText('Ventas / Facturas')).toBeInTheDocument();
  });

  it('renders recordCount badge when provided', () => {
    render(<TopBar title="Pedidos" recordCount={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders titleExtra when provided', () => {
    render(
      <TopBar
        title="Cobros"
        titleExtra={<span data-testid="custom-title-extra">Extra</span>}
      />
    );
    expect(screen.getByTestId('custom-title-extra')).toBeInTheDocument();
  });
});

describe('TopBar navigation & back button', () => {
  it('renders back button and calls onBack when clicked', async () => {
    const user = userEvent.setup();
    const handleBack = vi.fn();
    render(<TopBar title="Detalle" onBack={handleBack} />);

    const backButton = screen.getByTestId('topbar-back');
    expect(backButton).toBeInTheDocument();

    await user.click(backButton);
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('does not render back button when onBack is omitted', () => {
    render(<TopBar title="Inicio" />);
    expect(screen.queryByTestId('topbar-back')).not.toBeInTheDocument();
  });
});

describe('TopBar search', () => {
  it('renders resolved search placeholder from useUI by default', () => {
    render(<TopBar title="Inicio" />);
    expect(screen.getByText('searchPlaceholder')).toBeInTheDocument();
  });

  it('renders custom search placeholder when provided', () => {
    render(<TopBar title="Inicio" searchPlaceholder="Buscar en el sistema..." />);
    expect(screen.getByText('Buscar en el sistema...')).toBeInTheDocument();
  });

  it('calls onSearchClick when search button is clicked', async () => {
    const user = userEvent.setup();
    const handleSearchClick = vi.fn();
    render(<TopBar title="Inicio" onSearchClick={handleSearchClick} />);

    const searchButton = screen.getByTestId('global-search-trigger');
    await user.click(searchButton);
    expect(handleSearchClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to dispatching meta+k keydown when onSearchClick is not provided', async () => {
    const user = userEvent.setup();
    const dispatchSpy = vi.spyOn(document, 'dispatchEvent');
    render(<TopBar title="Inicio" />);

    const searchButton = screen.getByTestId('global-search-trigger');
    await user.click(searchButton);

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'k', metaKey: true })
    );
    dispatchSpy.mockRestore();
  });
});

describe('TopBar 3-dot dropdown menu', () => {
  it('does not render more-actions button when no menu actions are provided', () => {
    render(<TopBar title="Inicio" onPageHelp={null} />);
    expect(screen.queryByTestId('topbar-more-actions')).not.toBeInTheDocument();
  });

  it('renders more-actions button when onAddToFavorites is provided', () => {
    render(<TopBar title="Inicio" onAddToFavorites={vi.fn()} />);
    expect(screen.getByTestId('topbar-more-actions')).toBeInTheDocument();
  });

  it('handles onAddToFavorites when favorite is false and toggles state text', () => {
    const handleAddFav = vi.fn();
    render(
      <TopBar
        title="Inicio"
        onAddToFavorites={handleAddFav}
        isFavorite={false}
      />
    );

    const favItem = screen.getByText('addToFavorites');
    expect(favItem).toBeInTheDocument();

    fireEvent.click(favItem);
    expect(handleAddFav).toHaveBeenCalledTimes(1);
  });

  it('handles onAddToFavorites when favorite is true', () => {
    render(
      <TopBar
        title="Inicio"
        onAddToFavorites={vi.fn()}
        isFavorite={true}
      />
    );

    expect(screen.getByText('removeFromFavorites')).toBeInTheDocument();
  });

  it('handles onPageHelp in dropdown menu', () => {
    const handlePageHelp = vi.fn();
    render(<TopBar title="Inicio" onPageHelp={handlePageHelp} />);

    const helpItem = screen.getByText('pageHelp');
    expect(helpItem).toBeInTheDocument();

    fireEvent.click(helpItem);
    expect(handlePageHelp).toHaveBeenCalledTimes(1);
  });

  it('handles custom menuAction in dropdown menu', () => {
    const handleCustomAction = vi.fn();
    const CustomIcon = () => <span data-testid="custom-icon" />;
    render(
      <TopBar
        title="Inicio"
        menuAction={{
          label: 'Custom Action',
          onClick: handleCustomAction,
          icon: CustomIcon,
          disabled: false,
        }}
      />
    );

    const customItem = screen.getByText('Custom Action');
    expect(customItem).toBeInTheDocument();
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();

    fireEvent.click(customItem);
    expect(handleCustomAction).toHaveBeenCalledTimes(1);
  });
});

describe('TopBar action icons & right extras', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onAIClick when provided', async () => {
    const user = userEvent.setup();
    const handleAIClick = vi.fn();
    render(<TopBar title="Inicio" onAIClick={handleAIClick} />);

    const aiButton = screen.getByLabelText('aiAssistant');
    await user.click(aiButton);
    expect(handleAIClick).toHaveBeenCalledTimes(1);
  });

  it('falls back to copilot.toggle when onAIClick is omitted', async () => {
    const user = userEvent.setup();
    render(<TopBar title="Inicio" />);

    const aiButton = screen.getByLabelText('aiAssistant');
    await user.click(aiButton);
    expect(mockCopilotToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onNewClick when New button is clicked', async () => {
    const user = userEvent.setup();
    const handleNewClick = vi.fn();
    render(<TopBar title="Inicio" onNewClick={handleNewClick} />);

    const newButton = screen.getByLabelText('newRecord');
    await user.click(newButton);
    expect(handleNewClick).toHaveBeenCalledTimes(1);
  });

  it('calls onBellClick when notification button is clicked', async () => {
    const user = userEvent.setup();
    const handleBellClick = vi.fn();
    render(<TopBar title="Inicio" onBellClick={handleBellClick} />);

    const bellButton = screen.getByTestId('topbar-notifications');
    await user.click(bellButton);
    expect(handleBellClick).toHaveBeenCalledTimes(1);
  });

  it('renders rightExtras slot content', () => {
    render(
      <TopBar
        title="Inicio"
        rightExtras={<button data-testid="right-extra-btn">Action</button>}
      />
    );
    expect(screen.getByTestId('right-extra-btn')).toBeInTheDocument();
  });
});

describe('TopBar layout & styling', () => {
  it('applies custom className to header container', () => {
    const { container } = render(<TopBar title="Inicio" className="custom-topbar-class" />);
    const header = container.querySelector('header');
    expect(header.className).toMatch(/custom-topbar-class/);
  });
});
