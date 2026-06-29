// Mocks must be declared before imports.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/hooks/useNeoResource', () => ({
  getApiBase: () => '',
}));

vi.mock('lucide-react', () => ({
  MoreVertical: () => null,
  ExternalLink: () => null,
  GitMerge: () => null,
  BookOpen: () => null,
}));

// Radix dropdown — passthrough wrappers so menu items render immediately.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled, 'data-testid': dtid, ...rest }) => (
    <button
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled ? 'true' : undefined}
      data-testid={dtid}
      {...rest}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

// Radix tooltip — passthrough wrappers.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }) => <div>{children}</div>,
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovementRowKebab } from '../MovementRowKebab.jsx';

const NOT_POSTED = { id: 'mov-1', posted: 'N' };
const POSTED = { id: 'mov-2', posted: 'Y' };

function renderKebab(movement, overrides = {}) {
  const onReload = vi.fn();
  render(<MovementRowKebab movement={movement} onReload={onReload} {...overrides} />);
  return { onReload };
}

describe('MovementRowKebab — Post action', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Post item absent when already posted
  it('does not render the Post item when posted === "Y"', () => {
    renderKebab(POSTED);
    expect(screen.queryByText('financeAccountMovementsRowPost')).not.toBeInTheDocument();
  });

  // 2. Post item present and enabled when not posted
  it('renders the Post item when posted !== "Y"', () => {
    renderKebab(NOT_POSTED);
    const postItem = screen.getByText('financeAccountMovementsRowPost');
    expect(postItem).toBeInTheDocument();
    // The wrapping button must not be aria-disabled
    const btn = postItem.closest('[role="menuitem"]');
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  });

  // 3. Clicking Post calls fetch with correct URL and method
  it('calls fetch with POST to the correct URL when clicked', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });

    const user = userEvent.setup();
    renderKebab(NOT_POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowPost'));

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/neo/financial-account-detail/transaction/mov-1/action/posted');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  // 4. On success → toast.success + onReload
  it('calls toast.success and onReload on a successful fetch', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ success: true }] } }),
    });

    const user = userEvent.setup();
    const { onReload } = renderKebab(NOT_POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowPost'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledOnce());
    expect(toastSuccess).toHaveBeenCalledWith('documentPosted');
    expect(onReload).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });

  // 5. On failed fetch (ok: false) → toast.error, onReload NOT called
  it('calls toast.error and does not call onReload when fetch returns ok: false', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Server error' }),
    });

    const user = userEvent.setup();
    const { onReload } = renderKebab(NOT_POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowPost'));

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(onReload).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  // 6. On network error (fetch throws) → toast.error
  it('calls toast.error when fetch throws a network error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network failure'));

    const user = userEvent.setup();
    const { onReload } = renderKebab(NOT_POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowPost'));

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(onReload).not.toHaveBeenCalled();
  });

  // 7. While fetching → Post item is disabled (aria-disabled)
  it('disables the Post item while the fetch is in flight', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const user = userEvent.setup();
    renderKebab(NOT_POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowPost'));

    // While in-flight the label changes to the "posting" key
    await waitFor(() =>
      expect(screen.getByText('financeAccountMovementsRowPosting')).toBeInTheDocument()
    );

    const postingBtn = screen.getByText('financeAccountMovementsRowPosting').closest('[role="menuitem"]');
    expect(postingBtn).toHaveAttribute('aria-disabled', 'true');

    // Clean up — resolve the hanging promise
    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() =>
      expect(screen.queryByText('financeAccountMovementsRowPosting')).not.toBeInTheDocument()
    );
  });
});
