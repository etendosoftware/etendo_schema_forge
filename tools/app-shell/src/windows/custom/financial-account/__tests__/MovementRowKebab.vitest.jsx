// Mocks must be declared before imports.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('@/hooks/useNeoResource', () => ({
  getApiBase: () => '',
}));

vi.mock('lucide-react', () => ({
  MoreVertical: () => null,
  ExternalLink: () => null,
  GitMerge: () => null,
  BookOpen: () => null,
  BookX: () => null,
  CheckCircle2: () => null,
  RotateCcw: () => null,
  Trash2: () => null,
  Pencil: () => null,
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
import { setAuthMock } from '@/test/authContextMock.js';
import { expectNoAuthorizationHeader } from '@/test/sessionContract.js';
import userEvent from '@testing-library/user-event';
import { MovementRowKebab } from '../MovementRowKebab.jsx';

// Post (contabilizar) only shows for a Processed, not-yet-posted movement.
const NOT_POSTED = { id: 'mov-1', posted: 'N', processed: true };
const POSTED = { id: 'mov-2', posted: 'Y', processed: true };

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

  // 1b. Post item absent when the movement is not yet processed
  it('does not render the Post item when the movement is not processed', () => {
    renderKebab({ id: 'mov-x', posted: 'N', processed: false });
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
    expect(url).toContain('/sws/neo/financial-account/transaction/mov-1/action/post');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
    expect(JSON.parse(init.body)).toEqual({});
  });

  // 3b. The CSRF header is omitted entirely when no proof is available
  it('omits X-Go-CSRF entirely when no CSRF proof is available', async () => {
    // A session can be authenticated before the CSRF proof lands; the header must
    // be added defensively, never sent as an empty/undefined value.
    setAuthMock({ isAuthenticated: true, csrfToken: null });
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });

    const user = userEvent.setup();
    renderKebab(NOT_POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowPost'));

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(Object.keys(init.headers)).not.toContain('X-Go-CSRF');
    expect(init.credentials).toBe('include');
    expectNoAuthorizationHeader();
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
      status: 422,
      json: async () => ({ message: 'Server error' }),
      text: async () => 'Server error',
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

describe('MovementRowKebab — Unpost action', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Unpost item absent when not posted
  it('does not render the Unpost item when posted !== "Y"', () => {
    renderKebab(NOT_POSTED);
    expect(screen.queryByText('financeAccountMovementsRowUnpost')).not.toBeInTheDocument();
  });

  // 2. Unpost item present and enabled when posted
  it('renders the Unpost item when posted === "Y"', () => {
    renderKebab(POSTED);
    const unpostItem = screen.getByText('financeAccountMovementsRowUnpost');
    expect(unpostItem).toBeInTheDocument();
    // The wrapping button must not be aria-disabled
    const btn = unpostItem.closest('[role="menuitem"]');
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  });

  // 3. Clicking Unpost calls fetch with correct URL and method
  it('calls fetch with POST to the correct unpost URL when clicked', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });

    const user = userEvent.setup();
    renderKebab(POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowUnpost'));

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/sws/neo/financial-account/transaction/mov-2/action/unpost');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
    expectNoAuthorizationHeader();
  });

  // 4. On success → toast.success (reused documentUnposted key) + onReload
  it('calls toast.success and onReload on a successful fetch', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ success: true }] } }),
    });

    const user = userEvent.setup();
    const { onReload } = renderKebab(POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowUnpost'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledOnce());
    expect(toastSuccess).toHaveBeenCalledWith('documentUnposted');
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
    const { onReload } = renderKebab(POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowUnpost'));

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(onReload).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  // 6. On network error (fetch throws) → toast.error
  it('calls toast.error when fetch throws a network error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network failure'));

    const user = userEvent.setup();
    const { onReload } = renderKebab(POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowUnpost'));

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(onReload).not.toHaveBeenCalled();
  });

  // 7. While fetching → Unpost item is disabled (aria-disabled)
  it('disables the Unpost item while the fetch is in flight', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const user = userEvent.setup();
    renderKebab(POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowUnpost'));

    // While in-flight the label changes to the "unposting" key
    await waitFor(() =>
      expect(screen.getByText('financeAccountMovementsRowUnposting')).toBeInTheDocument()
    );

    const unpostingBtn = screen
      .getByText('financeAccountMovementsRowUnposting')
      .closest('[role="menuitem"]');
    expect(unpostingBtn).toHaveAttribute('aria-disabled', 'true');

    // Clean up — resolve the hanging promise
    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() =>
      expect(screen.queryByText('financeAccountMovementsRowUnposting')).not.toBeInTheDocument()
    );
  });

  // 8. No onReload provided — success path must not throw
  it('does not throw when onReload is not provided and the unpost succeeds', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ success: true }] } }),
    });

    const user = userEvent.setup();
    render(<MovementRowKebab movement={POSTED} />);

    await user.click(screen.getByText('financeAccountMovementsRowUnpost'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledOnce());
    expect(toastSuccess).toHaveBeenCalledWith('documentUnposted');
  });

  // 9. Rapid re-click while a request is already in flight must not fire a second request
  it('only sends one fetch call when clicked twice in rapid succession', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const user = userEvent.setup();
    renderKebab(POSTED);

    const item = screen.getByText('financeAccountMovementsRowUnpost').closest('[role="menuitem"]');
    await user.click(item);
    // Second click while the item should already be disabled/in-flight.
    await user.click(screen.getByText('financeAccountMovementsRowUnposting').closest('[role="menuitem"]'));

    expect(globalThis.fetch).toHaveBeenCalledOnce();

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() =>
      expect(screen.queryByText('financeAccountMovementsRowUnposting')).not.toBeInTheDocument()
    );
  });

  // 10. res.ok true but the body cannot be parsed as JSON (e.g. empty response) —
  // matches the pre-existing Post behavior: treated as success.
  it('treats an ok response with an unparsable body as success', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('Unexpected end of JSON input');
      },
    });

    const user = userEvent.setup();
    const { onReload } = renderKebab(POSTED);
    await user.click(screen.getByText('financeAccountMovementsRowUnpost'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledOnce());
    expect(toastSuccess).toHaveBeenCalledWith('documentUnposted');
    expect(onReload).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });

  // 11. movement.posted is undefined (neither 'Y' nor 'N') — Unpost item must stay hidden
  it('does not render the Unpost item when movement.posted is undefined', () => {
    renderKebab({ id: 'mov-3' });
    expect(screen.queryByText('financeAccountMovementsRowUnpost')).not.toBeInTheDocument();
  });
});
