import { render, screen, fireEvent } from '@testing-library/react';
import { setAuthMock } from '@/test/authContextMock.js';
import { declareCookieSession, expectNoAuthorizationHeader } from '@/test/sessionContract.js';

// --- Global stubs for browser APIs not available in jsdom -----------------

globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  X: (props) => <span data-testid="icon-x" {...props} />,
  Loader2: (props) => <span data-testid="loader" {...props} />,
  Search: (props) => <span data-testid="icon-search" {...props} />,
  ChevronDown: (props) => <span data-testid="icon-chevron" {...props} />,
  Check: (props) => <span data-testid="icon-check" {...props} />,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

setAuthMock({ isAuthenticated: true, csrfToken: 'test-csrf', logout: () => {} });

// --- Import under test ----------------------------------------------------

import LocationEditorModal from '../LocationEditorModal.jsx';
import { toast } from 'sonner';

// --- Helpers --------------------------------------------------------------

function renderModal(overrides = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onSaved: vi.fn(),
    rowId: null,
    bpId: 'bp-1',
    apiBase: '/api/contacts',
    // ETP-4576: a `token` prop is still passed deliberately — even when a caller
    // hands one down, no Authorization header may reach the wire.
    token: 'tok',
  };
  return { ...render(<LocationEditorModal {...defaults} {...overrides} />), props: { ...defaults, ...overrides } };
}

// --- Tests ----------------------------------------------------------------

describe('LocationEditorModal', () => {
  beforeEach(() => {
    // ETP-4576 — declare the scheme this suite asserts on: the builders read the
    // active scheme, and src/test/setup.js resets it to the bearer default before
    // every test, so a suite expecting the CSRF proof has to say so.
    declareCookieSession();
    setAuthMock({ isAuthenticated: true, csrfToken: 'test-csrf', logout: () => {} });
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [], hasMore: false }),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <LocationEditorModal
        open={false}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        bpId="bp-1"
        apiBase="/api"
        token="tok"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the modal when open', () => {
    renderModal();
    expect(screen.getByText('locationSelectorTitle')).toBeInTheDocument();
  });

  it('renders address form fields', () => {
    renderModal();
    expect(screen.getByText('addressLine1')).toBeInTheDocument();
    expect(screen.getByText('postalCodeLabel')).toBeInTheDocument();
    expect(screen.getByText('cityLabel')).toBeInTheDocument();
    expect(screen.getByText('countryLabel')).toBeInTheDocument();
    expect(screen.getByText('regionLabel')).toBeInTheDocument();
  });

  it('renders save and cancel buttons', () => {
    renderModal();
    expect(screen.getByText('save')).toBeInTheDocument();
    // There are multiple cancel elements — the close X button and the cancel button
    expect(screen.getAllByText('cancel').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onClose when cancel button is clicked', () => {
    const { props } = renderModal();
    const cancelButtons = screen.getAllByText('cancel');
    // The text "cancel" button in the footer
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('renders shipping and invoicing checkboxes', () => {
    renderModal();
    // useLabel returns the key itself
    expect(screen.getByText('IsShipTo')).toBeInTheDocument();
    expect(screen.getByText('IsBillTo')).toBeInTheDocument();
  });

  it('renders the shipping/invoicing checkboxes as the shared SquareCheckbox', () => {
    renderModal();
    const shipping = screen.getByTestId('SquareCheckbox__location-shipping');
    const invoicing = screen.getByTestId('SquareCheckbox__location-invoicing');
    expect(shipping.tagName).toBe('INPUT');
    expect(shipping).toHaveAttribute('type', 'checkbox');
    expect(invoicing).toHaveAttribute('type', 'checkbox');
    // Both start from form.shipToAddress / invoiceToAddress (default true on a new location).
    expect(shipping.checked).toBe(true);
    expect(invoicing.checked).toBe(true);
  });

  it('toggling the shipping checkbox updates the form (shipToAddress → IsShipTo)', () => {
    renderModal();
    const shipping = screen.getByTestId('SquareCheckbox__location-shipping');
    expect(shipping.checked).toBe(true);
    fireEvent.click(shipping);
    expect(shipping.checked).toBe(false);
  });

  it('toggling the invoicing checkbox updates the form (invoiceToAddress → IsBillTo)', () => {
    renderModal();
    const invoicing = screen.getByTestId('SquareCheckbox__location-invoicing');
    expect(invoicing.checked).toBe(true);
    fireEvent.click(invoicing);
    expect(invoicing.checked).toBe(false);
  });

  it('does not render remove location button', () => {
    renderModal({ rowId: 'loc-123' });
    expect(screen.queryByText('removeLocation')).not.toBeInTheDocument();
  });

  it('renders all text input fields for address entry', () => {
    renderModal();
    const inputs = screen.getAllByRole('textbox');
    // address, address2, postalCode, city = 4 text inputs
    expect(inputs.length).toBeGreaterThanOrEqual(4);
  });

  it('renders checkboxes for shipping and invoicing', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(2);
    // Both default to checked
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it('renders country and region selector buttons with aria-haspopup', () => {
    renderModal();
    const buttons = screen.getAllByRole('button');
    const haspopupBtns = buttons.filter(b => b.getAttribute('aria-haspopup') === 'dialog');
    expect(haspopupBtns.length).toBe(2); // country + region
  });

  it('region selector is disabled when no country is selected', () => {
    renderModal();
    const buttons = screen.getAllByRole('button');
    const disabledBtns = buttons.filter(b => b.disabled);
    // The region button should be disabled since no country is set
    expect(disabledBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('shows selectCountryFirst text in region button when no country selected', () => {
    renderModal();
    expect(screen.getByText('selectCountryFirst')).toBeInTheDocument();
  });

  it('calls close when X button is clicked', () => {
    const { props } = renderModal();
    // The close X button has aria-label "close"
    const closeBtn = screen.getByLabelText('close');
    fireEvent.click(closeBtn);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('calls fetch with correct URL for stock data when editing', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [{ id: 'loc-1', address: '123 Main St', country: 'ES', 'country$_identifier': 'Spain' }] }, items: [], hasMore: false }),
      }),
    );

    renderModal({ rowId: 'loc-1' });

    // Should fetch the record details + selectors
    await screen.findByText('locationSelectorTitle');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('renders save button that is not disabled for new records', () => {
    renderModal();
    const saveBtn = screen.getByText('save');
    expect(saveBtn.closest('button')).not.toBeDisabled();
  });

  it('allows typing in address fields', async () => {
    renderModal();
    const inputs = screen.getAllByRole('textbox');
    // First textbox is the address field (autoFocus)
    fireEvent.change(inputs[0], { target: { value: '123 Main Street' } });
    expect(inputs[0].value).toBe('123 Main Street');
  });

  it('allows toggling shipping checkbox off', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    fireEvent.click(checkboxes[0]);
    expect(checkboxes[0]).not.toBeChecked();
  });

  it('allows toggling invoicing checkbox off', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[1]).toBeChecked();
    fireEvent.click(checkboxes[1]);
    expect(checkboxes[1]).not.toBeChecked();
  });

  it('opens country picker when country button is clicked', () => {
    renderModal();
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.getAttribute('aria-haspopup') === 'dialog' && !b.disabled);
    fireEvent.click(countryBtn);
    // Country picker shows a search input with placeholder
    expect(screen.getByPlaceholderText('countrySearchPlaceholder')).toBeInTheDocument();
  });

  it('calls onSaved on successful save when creating a new record', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({
        response: { status: 0, data: [{ id: 'new-loc-1', name: 'New Location' }] },
        items: [],
        hasMore: false,
      }),
    };

    global.fetch = vi.fn((url) => {
      if (url.includes('/locationAddress') && !url.includes('selectors')) {
        return Promise.resolve(mockResponse);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
      });
    });

    const { props } = renderModal();

    // We need to set a country first (required for save)
    // Click the country button to open picker
    const buttons = screen.getAllByRole('button');
    const countryBtn = buttons.find(b => b.getAttribute('aria-haspopup') === 'dialog' && !b.disabled);
    fireEvent.click(countryBtn);

    // Wait for country picker to appear, then click Spain
    const spainBtn = await screen.findByText('Spain');
    fireEvent.click(spainBtn);

    // Now click save
    fireEvent.click(screen.getByText('save'));

    // Wait for async save to complete
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/locationAddress'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows toast error when saving without country', async () => {
    const { toast } = await import('sonner');
    renderModal();

    // Click save without selecting a country
    fireEvent.click(screen.getByText('save'));

    expect(toast.error).toHaveBeenCalledWith('locationCountryRequired');
  });

  it('disables save button during initial loading when editing', () => {
    global.fetch = vi.fn(() =>
      // Never resolve to keep initialLoading = true
      new Promise(() => {}),
    );

    renderModal({ rowId: 'loc-123' });

    const saveBtn = screen.getByText('save').closest('button');
    expect(saveBtn).toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // showBackendMessages — PUT (edit) path
  // ---------------------------------------------------------------------------

  describe('showBackendMessages — PUT (edit existing record)', () => {
    /**
     * Render an edit modal with a pre-loaded record that includes country='ES'.
     * The GET response populates the form so the Save button is immediately enabled.
     * The PUT response carries the messages we want to test.
     */
    async function renderAndSaveExisting(rowId, putMessages, onParentRefresh) {
      const { toast } = await import('sonner');
      vi.mocked(toast.success).mockClear();
      vi.mocked(toast.error).mockClear();
      vi.mocked(toast.warning).mockClear();
      vi.mocked(toast.info).mockClear();

      const onSaved = vi.fn();

      global.fetch = vi.fn((url, opts) => {
        // Initial GET of the existing record — populate form with country so save is enabled
        if (url.includes(`/locationAddress/${rowId}`) && (!opts?.method || opts.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: {
                data: [{
                  id: rowId,
                  address: '123 Main St',
                  country: 'ES',
                  'country$_identifier': 'Spain',
                }],
              },
            }),
          });
        }
        // PUT — save response carries messages
        if (url.includes(`/locationAddress/${rowId}`) && opts?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { data: [{ id: rowId, messages: putMessages }] },
            }),
          });
        }
        // Selector calls (countries)
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });

      renderModal({ rowId, onSaved, onParentRefresh });

      // Wait for initialLoading to finish (the spinner disappears and form fields appear)
      await screen.findByText('save', {}, { timeout: 3000 });
      // Wait until the country button is enabled (country='ES' was loaded)
      await vi.waitFor(() => {
        const btns = screen.getAllByRole('button');
        const countryBtn = btns.find(b => b.getAttribute('aria-haspopup') === 'dialog');
        expect(countryBtn).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('save'));

      // Wait for the save to complete (onSaved is called after PUT finishes)
      await vi.waitFor(() => {
        expect(onSaved).toHaveBeenCalled();
      }, { timeout: 3000 });

      return { toast, onSaved };
    }

    it('calls toast.warning and onSaved for warning message', async () => {
      const onParentRefresh = vi.fn();
      const { toast, onSaved } = await renderAndSaveExisting(
        'loc-warn',
        [{ type: 'warning', title: 'NIF warning', text: 'desc' }],
        onParentRefresh,
      );
      expect(toast.warning).toHaveBeenCalledWith('NIF warning', { description: 'desc' });
      expect(onSaved).toHaveBeenCalled();
      expect(onParentRefresh).toHaveBeenCalled();
    });

    it('calls toast.error and onSaved for error message', async () => {
      const onParentRefresh = vi.fn();
      const { toast, onSaved } = await renderAndSaveExisting(
        'loc-err',
        [{ type: 'error', title: 'VIES error' }],
        onParentRefresh,
      );
      expect(toast.error).toHaveBeenCalledWith('VIES error', { description: undefined });
      expect(onSaved).toHaveBeenCalled();
    });

    it('calls toast.success and onSaved for success message', async () => {
      const onParentRefresh = vi.fn();
      const { toast, onSaved } = await renderAndSaveExisting(
        'loc-ok',
        [{ type: 'success', title: 'Valid NIF' }],
        onParentRefresh,
      );
      expect(toast.success).toHaveBeenCalledWith('Valid NIF', { description: undefined });
      expect(onSaved).toHaveBeenCalled();
    });

    it('calls toast.info for unknown message type with title', async () => {
      const onParentRefresh = vi.fn();
      const { toast } = await renderAndSaveExisting(
        'loc-info',
        [{ type: 'foo', title: 'Info msg' }],
        onParentRefresh,
      );
      expect(toast.info).toHaveBeenCalledWith('Info msg', { description: undefined });
    });

    it('does NOT call onParentRefresh when messages array is empty', async () => {
      const onParentRefresh = vi.fn();
      const { onSaved } = await renderAndSaveExisting('loc-empty', [], onParentRefresh);
      expect(onParentRefresh).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // showBackendMessages — POST (create) path
  // ---------------------------------------------------------------------------

  describe('showBackendMessages — POST (create new record)', () => {
    beforeEach(() => {
      vi.mocked(toast.success).mockClear();
      vi.mocked(toast.error).mockClear();
      vi.mocked(toast.warning).mockClear();
      vi.mocked(toast.info).mockClear();
    });

    /**
     * Render a create modal, select Spain as country, click save, and wait for POST.
     */
    async function renderAndSaveNew(postResponseData, onSaved, onParentRefresh) {
      global.fetch = vi.fn((url, opts) => {
        if (url.includes('/locationAddress') && !url.includes('selectors') && opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { status: 0, data: [postResponseData] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });

      renderModal({ onSaved, onParentRefresh });

      const buttons = screen.getAllByRole('button');
      const countryBtn = buttons.find(b => b.getAttribute('aria-haspopup') === 'dialog' && !b.disabled);
      fireEvent.click(countryBtn);
      const spainBtn = await screen.findByText('Spain');
      fireEvent.click(spainBtn);
      fireEvent.click(screen.getByText('save'));

      await vi.waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/locationAddress'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    }

    it('calls toast.success and onSaved with new record id for success message', async () => {
      const onSaved = vi.fn();
      const onParentRefresh = vi.fn();

      await renderAndSaveNew(
        { id: 'new-loc-99', name: 'Madrid, Calle Mayor', messages: [{ type: 'success', title: 'ok' }] },
        onSaved,
        onParentRefresh,
      );

      await vi.waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('ok', { description: undefined });
      });
      expect(onSaved).toHaveBeenCalledWith('new-loc-99', 'Madrid, Calle Mayor');
      expect(onParentRefresh).toHaveBeenCalled();
    });

    it('calls onSaved without toast when POST response has no messages', async () => {
      const onSaved = vi.fn();
      const onParentRefresh = vi.fn();

      await renderAndSaveNew(
        { id: 'new-loc-100', name: 'Barcelona' },
        onSaved,
        onParentRefresh,
      );

      await vi.waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith('new-loc-100', 'Barcelona');
      });
      expect(onParentRefresh).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  it('allows typing in postal code and city fields', () => {
    renderModal();
    const inputs = screen.getAllByRole('textbox');
    // address=inputs[0], address2=inputs[1], postalCode=inputs[2], city=inputs[3]
    fireEvent.change(inputs[2], { target: { value: '28001' } });
    expect(inputs[2].value).toBe('28001');
    fireEvent.change(inputs[3], { target: { value: 'Madrid' } });
    expect(inputs[3].value).toBe('Madrid');
  });

  it('calls onClose when backdrop overlay is clicked', () => {
    const { props, container } = renderModal();
    // The modal's outermost div is the backdrop
    const backdrop = container.firstChild;
    // The backdrop click should not close because the inner div stops propagation;
    // but clicking the close X should
    const closeBtn = screen.getByLabelText('close');
    fireEvent.click(closeBtn);
    expect(props.onClose).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // saveMode="location" (plain C_Location) — ETP-4526
  // ---------------------------------------------------------------------------

  describe('saveMode="location" and showAddressTypeCheckboxes=false', () => {
    it('does NOT render the shipping/invoicing checkboxes', () => {
      renderModal({ saveMode: 'location', showAddressTypeCheckboxes: false });
      expect(
        screen.queryByTestId('SquareCheckbox__location-shipping'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('SquareCheckbox__location-invoicing'),
      ).not.toBeInTheDocument();
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });

    it('CREATE (rowId null) POSTs to `${apiBase}/location` with no businessPartner and no address-type flags', async () => {
      global.fetch = vi.fn((url, opts) => {
        if (url.includes('/location') && !url.includes('selectors') && opts?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { status: 0, data: [{ id: 'new-c-loc-1', name: 'Madrid, Calle Mayor' }] },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });

      const onSaved = vi.fn();
      renderModal({
        rowId: null,
        saveMode: 'location',
        showAddressTypeCheckboxes: false,
        apiBase: '/api/warehouse',
        onSaved,
      });

      // Select a country (required for save)
      const buttons = screen.getAllByRole('button');
      const countryBtn = buttons.find(
        (b) => b.getAttribute('aria-haspopup') === 'dialog' && !b.disabled,
      );
      fireEvent.click(countryBtn);
      const spainBtn = await screen.findByText('Spain');
      fireEvent.click(spainBtn);

      fireEvent.click(screen.getByText('save'));

      let postCall;
      await vi.waitFor(() => {
        postCall = global.fetch.mock.calls.find(
          ([url, opts]) => opts?.method === 'POST',
        );
        expect(postCall).toBeDefined();
      });

      const [postUrl, postOpts] = postCall;
      // Plain C_Location endpoint — no parentId query, no /locationAddress segment.
      expect(postUrl).toBe('/api/warehouse/location');
      expect(postUrl).not.toContain('parentId');
      expect(postUrl).not.toContain('locationAddress');

      const body = JSON.parse(postOpts.body);
      // No BP link and no address-type flags in location mode.
      expect(body).not.toHaveProperty('businessPartner');
      expect(body).not.toHaveProperty('shipToAddress');
      expect(body).not.toHaveProperty('invoiceToAddress');
      expect(body.country).toBe('ES');

      await vi.waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith('new-c-loc-1', 'Madrid, Calle Mayor');
      });
    });

    it('EDIT (rowId set) PUTs to `${apiBase}/location/{rowId}`', async () => {
      const rowId = 'c-loc-77';
      global.fetch = vi.fn((url, opts) => {
        // Initial GET-by-id to prefill the form (populate country so save is enabled)
        if (url.includes(`/location/${rowId}`) && (!opts?.method || opts.method === 'GET')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: {
                data: [{
                  id: rowId,
                  address: '123 Main St',
                  country: 'ES',
                  'country$_identifier': 'Spain',
                }],
              },
            }),
          });
        }
        // PUT edit
        if (url.includes(`/location/${rowId}`) && opts?.method === 'PUT') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { data: [{ id: rowId, name: 'Updated Location' }] },
            }),
          });
        }
        // Selectors
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });

      const onSaved = vi.fn();
      renderModal({
        rowId,
        saveMode: 'location',
        showAddressTypeCheckboxes: false,
        apiBase: '/api/warehouse',
        onSaved,
      });

      await screen.findByText('save', {}, { timeout: 3000 });
      await vi.waitFor(() => {
        const btns = screen.getAllByRole('button');
        const countryBtn = btns.find((b) => b.getAttribute('aria-haspopup') === 'dialog');
        expect(countryBtn).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('save'));

      let putCall;
      await vi.waitFor(() => {
        putCall = global.fetch.mock.calls.find(
          ([url, opts]) => opts?.method === 'PUT',
        );
        expect(putCall).toBeDefined();
      });

      const [putUrl, putOpts] = putCall;
      expect(putUrl).toBe('/api/warehouse/location/c-loc-77');
      expect(putUrl).not.toContain('locationAddress');

      const body = JSON.parse(putOpts.body);
      expect(body).not.toHaveProperty('businessPartner');
      expect(body).not.toHaveProperty('shipToAddress');
      expect(body).not.toHaveProperty('invoiceToAddress');

      await vi.waitFor(() => {
        expect(onSaved).toHaveBeenCalledWith('c-loc-77', 'Updated Location');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // ETP-4576 — cookie-session auth transport
  // ---------------------------------------------------------------------------

  describe('auth transport (ETP-4576)', () => {
    /** Stubs every request; selectors return Spain so the country picker works. */
    function stubFetch() {
      global.fetch = vi.fn((url, opts) => {
        if (url.includes('/locationAddress') && !url.includes('selectors')
            && (opts?.method === 'POST' || opts?.method === 'PUT')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { status: 0, data: [{ id: 'loc-x', name: 'Madrid' }] },
            }),
          });
        }
        if (url.includes('/locationAddress/loc-edit')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: {
                data: [{
                  id: 'loc-edit',
                  address: '123 Main St',
                  country: 'ES',
                  'country$_identifier': 'Spain',
                }],
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'ES', label: 'Spain' }], hasMore: false }),
        });
      });
    }

    /** Selects Spain (required for save) then clicks Save on a create modal. */
    async function selectSpainAndSave() {
      const buttons = screen.getAllByRole('button');
      const countryBtn = buttons.find(
        (b) => b.getAttribute('aria-haspopup') === 'dialog' && !b.disabled,
      );
      fireEvent.click(countryBtn);
      const spainBtn = await screen.findByText('Spain');
      fireEvent.click(spainBtn);
      fireEvent.click(screen.getByText('save'));
    }

    function callByMethod(method) {
      return global.fetch.mock.calls.find(([, opts]) => (opts?.method ?? 'GET') === method);
    }

    it("sends credentials: 'include' and no Authorization on the selector and record GETs", async () => {
      stubFetch();
      renderModal({ rowId: 'loc-edit' });

      await screen.findByText('save', {}, { timeout: 3000 });
      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());

      const getCalls = global.fetch.mock.calls.filter(
        ([, opts]) => (opts?.method ?? 'GET') === 'GET',
      );
      expect(getCalls.length).toBeGreaterThan(0);
      for (const [, opts] of getCalls) {
        expect(opts.credentials).toBe('include');
        // GET is a safe method — the CSRF proof must not be attached to it.
        expect(Object.keys(opts.headers ?? {})).not.toContain('X-Go-CSRF');
      }
      expectNoAuthorizationHeader();
    });

    it('sends X-Go-CSRF on the create POST', async () => {
      stubFetch();
      renderModal();
      await selectSpainAndSave();

      await vi.waitFor(() => expect(callByMethod('POST')).toBeDefined());
      const [, opts] = callByMethod('POST');
      expect(opts.credentials).toBe('include');
      expect(opts.headers['X-Go-CSRF']).toBe('test-csrf');
      expectNoAuthorizationHeader();
    });

    it('sends X-Go-CSRF on the edit PUT', async () => {
      stubFetch();
      renderModal({ rowId: 'loc-edit' });

      await screen.findByText('save', {}, { timeout: 3000 });
      await vi.waitFor(() => {
        const btns = screen.getAllByRole('button');
        const countryBtn = btns.find((b) => b.getAttribute('aria-haspopup') === 'dialog');
        expect(countryBtn).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText('save'));

      await vi.waitFor(() => expect(callByMethod('PUT')).toBeDefined());
      const [, opts] = callByMethod('PUT');
      expect(opts.credentials).toBe('include');
      expect(opts.headers['X-Go-CSRF']).toBe('test-csrf');
      expectNoAuthorizationHeader();
    });

    it('omits X-Go-CSRF entirely when no CSRF proof is available', async () => {
      // A session can be authenticated before the CSRF proof lands; the header must
      // be added defensively, never sent as an empty/undefined value.
      setAuthMock({ isAuthenticated: true, csrfToken: null, logout: () => {} });
      stubFetch();
      renderModal();
      await selectSpainAndSave();

      await vi.waitFor(() => expect(callByMethod('POST')).toBeDefined());
      const [, opts] = callByMethod('POST');
      expect(Object.keys(opts.headers)).not.toContain('X-Go-CSRF');
      expect(opts.credentials).toBe('include');
      expectNoAuthorizationHeader();
    });
  });
});
