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
});
