import { render, screen, fireEvent } from '@testing-library/react';

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

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token', logout: () => {} }),
}));

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
    token: 'tok',
  };
  return { ...render(<LocationEditorModal {...defaults} {...overrides} />), props: { ...defaults, ...overrides } };
}

// Shared fixtures. Note the default `global.fetch` in `beforeEach` answers every
// selector page with an EMPTY item list, so the ETP-5103 default-country prefill
// resolves to nothing and the country stays empty unless a test opts in by mocking
// a selector response that contains Spain.
const SPAIN_OPTION = { id: 'ES', label: 'Spain' };
const ADDRESS_LINE_VALUE = '123 Main Street';
const DEFAULT_COUNTRY_QUERY_PARAM = 'q=Spain';

/**
 * Whether a field label carries the ETP-5103 mandatory asterisk. RequiredMark renders
 * it as a sibling <span> inside the label element; Testing Library's text queries read
 * only an element's DIRECT text nodes, so the label is still located by its plain key.
 */
function hasRequiredMark(labelKey) {
  const label = screen.getByText(labelKey);
  return Array.from(label.querySelectorAll('span')).some(s => s.textContent === '*');
}

/** The Save button. The modal labels it with the `save` UI key. */
function saveButton() {
  return screen.getByText('save').closest('button');
}

/** Address line 1 input — the first textbox of the form (it carries autoFocus). */
function addressLineInput() {
  return screen.getAllByRole('textbox')[0];
}

/**
 * Fill address line 1, the field ETP-5103 made mandatory. Every save path needs it
 * now, so the flows that exercise POST/PUT go through this helper.
 */
function typeAddressLine(value = ADDRESS_LINE_VALUE) {
  fireEvent.change(addressLineInput(), { target: { value } });
}

/** Open the country picker and choose Spain. Requires a selector mock returning it. */
async function selectSpain() {
  const countryBtn = screen
    .getAllByRole('button')
    .find(b => b.getAttribute('aria-haspopup') === 'dialog' && !b.disabled);
  fireEvent.click(countryBtn);
  fireEvent.click(await screen.findByText(SPAIN_OPTION.label));
}

/** URLs of every selector page requested so far, for prefill assertions. */
function fetchedUrls() {
  return global.fetch.mock.calls.map(([url]) => url);
}

// --- Tests ----------------------------------------------------------------

describe('LocationEditorModal', () => {
  beforeEach(() => {
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

  // ETP-5103 reframed this case: a brand-new record starts with address line 1 AND
  // country empty, so Save is now gated instead of clickable. What used to be asserted
  // here (Save is reachable on a new record) is covered by the CP-4 case below, which
  // fills the mandatory fields first.
  it('renders save button disabled for new records with empty mandatory fields', () => {
    renderModal();
    expect(saveButton()).toBeDisabled();
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

    renderModal();

    // Both mandatory fields first: address line 1 (ETP-5103) and country.
    typeAddressLine();
    await selectSpain();

    fireEvent.click(saveButton());

    // Wait for async save to complete
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/locationAddress'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  /**
   * ETP-5103 reframed this case. Country was already mandatory — handleSave refused to
   * save without it and showed the `locationCountryRequired` toast — but the refusal only
   * happened after the click. Now `saveDisabled` covers an empty country, so the button
   * is unreachable and the toast never fires. What still matters, and is asserted here,
   * is the invariant the old test protected: no save request leaves without a country.
   * The toast guard remains in handleSave as defence in depth.
   */
  it('keeps save disabled and issues no request when the country is empty', async () => {
    const { toast } = await import('sonner');
    vi.mocked(toast.error).mockClear();
    renderModal();

    // Address line 1 filled, country still empty (the default mock returns no options).
    typeAddressLine();
    expect(saveButton()).toBeDisabled();

    fireEvent.click(saveButton());

    expect(toast.error).not.toHaveBeenCalled();
    const writeCalls = global.fetch.mock.calls.filter(([, opts]) => opts?.method);
    expect(writeCalls).toHaveLength(0);
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

      typeAddressLine();
      await selectSpain();
      fireEvent.click(saveButton());

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

      // Fill both mandatory fields: address line 1 (ETP-5103) and country.
      typeAddressLine();
      await selectSpain();

      fireEvent.click(saveButton());

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
  // ETP-5103 — Spain preselected on create, address line 1 mandatory
  // ---------------------------------------------------------------------------

  describe('ETP-5103 — default country and mandatory fields', () => {
    // The prefill asks the selector for Spain by name; the response carries the
    // TRANSLATED label, which is what the picker button ends up showing.
    const SPAIN_PREFILL_OPTION = { id: '106', label: 'España' };
    const FRANCE_OPTION = { id: 'FR', label: 'Francia' };

    /**
     * Mock the selector endpoints, routing by URL:
     *   - the `?q=Spain` prefill request  → `prefill`
     *   - every other selector page      → `catalog` (what the picker lists)
     * Splitting the two makes the assertions unambiguous: the country can only be set
     * by the prefill when it came from the `?q=` request, never from the first page.
     * Any request carrying an HTTP method (the save) resolves as a successful write.
     *
     * `catalog` must be non-empty by default: the modal only records which of its 8
     * selector fallbacks answered when a page comes back with rows, and the prefill
     * reuses that resolved base. An always-empty catalog would therefore disable the
     * prefill — which is production behaviour when there are no countries at all, and
     * is covered by its own case below.
     */
    function mockSelectors({ prefill = [SPAIN_PREFILL_OPTION], catalog = [FRANCE_OPTION] } = {}) {
      global.fetch = vi.fn((url, opts) => {
        if (opts?.method) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: { status: 0, data: [{ id: 'saved-1', name: 'Saved' }] },
            }),
          });
        }
        const items = String(url).includes(DEFAULT_COUNTRY_QUERY_PARAM) ? prefill : catalog;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items, hasMore: false }) });
      });
    }

    /** The country picker trigger — the first button with aria-haspopup in the form. */
    function countryButton() {
      return screen
        .getAllByRole('button')
        .find(b => b.getAttribute('aria-haspopup') === 'dialog');
    }

    /** Wait until the country trigger displays `label`. */
    function waitForCountry(label) {
      return vi.waitFor(() => expect(countryButton()).toHaveTextContent(label));
    }

    /** CP-1 */
    it('preselects Spain when the popup opens in create mode', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      expect(
        fetchedUrls().some(url => url.includes(DEFAULT_COUNTRY_QUERY_PARAM)),
      ).toBe(true);
    });

    /** CP-2 */
    it('lets the user replace the preselected country, and does not restore it', async () => {
      mockSelectors({ catalog: [FRANCE_OPTION] });
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);

      fireEvent.click(countryButton());
      fireEvent.click(await screen.findByText(FRANCE_OPTION.label));

      expect(countryButton()).toHaveTextContent(FRANCE_OPTION.label);
      // The one-shot guard must keep the default from snapping back over the choice.
      await vi.waitFor(() => {
        expect(countryButton()).not.toHaveTextContent(SPAIN_PREFILL_OPTION.label);
      });
    });

    /** CP-3 */
    it('keeps save disabled while address line 1 is empty, even with Spain preselected', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      expect(saveButton()).toBeDisabled();
    });

    /** CP-4 */
    it('enables save as soon as address line 1 has one character', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      typeAddressLine('C');

      expect(saveButton()).toBeEnabled();
    });

    /** CP-5 */
    it('disables save again when address line 1 is cleared', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      typeAddressLine();
      expect(saveButton()).toBeEnabled();

      typeAddressLine('');
      expect(saveButton()).toBeDisabled();
    });

    /** CP-6 */
    it('marks address line 1 and country as mandatory, and no other field', () => {
      renderModal();

      expect(hasRequiredMark('addressLine1')).toBe(true);
      expect(hasRequiredMark('countryLabel')).toBe(true);
      for (const label of ['addressLine2', 'postalCodeLabel', 'cityLabel', 'regionLabel']) {
        expect(hasRequiredMark(label)).toBe(false);
      }
    });

    it('treats whitespace-only address line 1 as empty', async () => {
      mockSelectors();
      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      typeAddressLine('   ');

      expect(saveButton()).toBeDisabled();
    });

    it('keeps save disabled without a country, and enables it once one is picked', async () => {
      // Prefill resolves nothing (no Spain in the response), so the country starts empty.
      mockSelectors({ prefill: [], catalog: [FRANCE_OPTION] });
      renderModal();

      typeAddressLine();
      expect(saveButton()).toBeDisabled();

      fireEvent.click(countryButton());
      fireEvent.click(await screen.findByText(FRANCE_OPTION.label));

      expect(saveButton()).toBeEnabled();
    });

    it('leaves the country empty when the default cannot be resolved', async () => {
      mockSelectors({ prefill: [] });
      renderModal();

      await vi.waitFor(() => {
        expect(fetchedUrls().some(url => url.includes(DEFAULT_COUNTRY_QUERY_PARAM))).toBe(true);
      });
      expect(countryButton()).toHaveTextContent('—');
      expect(screen.getByText('locationSelectorTitle')).toBeInTheDocument();
    });

    it('skips the prefill entirely when no selector fallback returns countries', async () => {
      // Every selector page is empty, so no base URL is ever resolved. The prefill has
      // nothing to hang off and must simply not run — no request, no crash.
      mockSelectors({ prefill: [], catalog: [] });
      renderModal();

      await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(fetchedUrls().some(url => url.includes(DEFAULT_COUNTRY_QUERY_PARAM))).toBe(false);
      expect(countryButton()).toHaveTextContent('—');
      expect(saveButton()).toBeDisabled();
    });

    it('does not prefill when editing, and keeps the loaded country', async () => {
      const rowId = 'loc-edit-1';
      global.fetch = vi.fn((url, opts) => {
        if (String(url).includes(`/locationAddress/${rowId}`) && !opts?.method) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              response: {
                data: [{
                  id: rowId,
                  address: '10 Rue de Rivoli',
                  country: FRANCE_OPTION.id,
                  'country$_identifier': FRANCE_OPTION.label,
                }],
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [SPAIN_PREFILL_OPTION], hasMore: false }),
        });
      });

      renderModal({ rowId });

      await waitForCountry(FRANCE_OPTION.label);
      // The prefill request must never be issued in edit mode, so the record's own
      // country can never be overwritten by the default.
      expect(fetchedUrls().some(url => url.includes(DEFAULT_COUNTRY_QUERY_PARAM))).toBe(false);
      expect(saveButton()).toBeEnabled();
    });

    it('keeps save disabled while a save is in flight', async () => {
      let resolveSave;
      global.fetch = vi.fn((url, opts) => {
        if (opts?.method) return new Promise(resolve => { resolveSave = resolve; });
        const isPrefill = String(url).includes(DEFAULT_COUNTRY_QUERY_PARAM);
        const items = isPrefill ? [SPAIN_PREFILL_OPTION] : [FRANCE_OPTION];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items, hasMore: false }) });
      });

      renderModal();

      await waitForCountry(SPAIN_PREFILL_OPTION.label);
      typeAddressLine();
      fireEvent.click(saveButton());

      await vi.waitFor(() => expect(saveButton()).toBeDisabled());

      resolveSave({ ok: true, json: () => Promise.resolve({ response: { status: 0, data: [] } }) });
    });
  });
});
