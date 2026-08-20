// Coverage-recovery suite (ETP-4346 batch 2): targets the uncovered popup-style
// selectors in ReportViewerPage.jsx — SelectorPopup (popup-single inputStyle),
// PopupMultiSelector (popup inputStyle), the default inline SearchInput dropdown
// path (non-drawer, non-warehouse-arrow), and the cross-frame postMessage /
// print / auto-default-loading branches of ReportViewer that the existing
// suites (ReportViewerPage.vitest.jsx, ReportViewerPage.helpers.vitest.jsx)
// do not exercise.

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom does not implement IntersectionObserver — SelectorPopup's infinite
// scroll sentinel needs a stub so the component can mount.
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
};

let mockSearchParams = new URLSearchParams({ report: 'report-1' });
const mockSetSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    token: 'test-token',
    selectedRole: { orgList: [] },
    selectedOrg: { id: 'org1' },
  }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
  }),
}));

vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/date-field', () => ({
  DateField: () => <input type="date" data-testid="date-field" />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

import ReportViewerPage from '../ReportViewerPage.jsx';

const BASE_REPORT = {
  id: 'report-1',
  title: { en_US: 'Report With Selectors' },
  type: 'listing',
  category: 'finance',
  outputs: ['pdf'],
};

function makeReportsListResponse(report) {
  return {
    ok: true,
    json: () => Promise.resolve([report]),
  };
}

function makeSelectorResponse(items, extra = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({ items, ...extra }),
  };
}

describe('ReportViewerPage — popup-single selector (SelectorPopup)', () => {
  const POPUP_REPORT = {
    ...BASE_REPORT,
    parameters: [
      {
        name: 'acctId',
        type: 'search',
        selector: 'account',
        inputStyle: 'popup-single',
        label: { en_US: 'Account' },
        section: 'primary',
      },
    ],
  };

  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-1' });
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the popup, loads options, and selects one', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(POPUP_REPORT));
      if (typeof url === 'string' && url.includes('/sws/report-selectors/account')) {
        return Promise.resolve(makeSelectorResponse([{ id: 'a1', name: 'Cash' }, { id: 'a2', name: 'Bank' }]));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument());

    // Opens the button which triggers the popup with the placeholder button text
    await user.click(screen.getByText('selectPlaceholder'));

    // The popup shows a search input and, once fetch resolves, the option list
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
      expect(screen.getByText('Bank')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cash'));

    // After selecting, the popup (with its option list) closes and the
    // selector button now shows "Cash" as its own display value instead.
    await waitFor(() => {
      expect(screen.queryByText('noResults')).not.toBeInTheDocument();
      expect(screen.getByText('Cash')).toBeInTheDocument();
    });
    // Only one "Cash" node remains — the popup list item is gone.
    expect(screen.getAllByText('Cash')).toHaveLength(1);
  });

  it('shows noResults when the popup search returns nothing', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(POPUP_REPORT));
      if (typeof url === 'string' && url.includes('/sws/report-selectors/account')) {
        return Promise.resolve(makeSelectorResponse([]));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument());
    await user.click(screen.getByText('selectPlaceholder'));

    await waitFor(() => {
      expect(screen.getByText('noResults')).toBeInTheDocument();
    });
  });

  it('closes the popup via the X button without selecting', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(POPUP_REPORT));
      return Promise.resolve(makeSelectorResponse([{ id: 'a1', name: 'Cash' }]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument());
    await user.click(screen.getByText('selectPlaceholder'));

    await waitFor(() => expect(screen.getByText('Cash')).toBeInTheDocument());

    // The header close button (X icon) is the first button in the popup header
    const closeButtons = screen.getAllByRole('button');
    const headerClose = closeButtons.find((b) => b.querySelector('[data-testid="X__3c998a"]'));
    await user.click(headerClose);

    await waitFor(() => {
      expect(screen.queryByText('Cash')).not.toBeInTheDocument();
    });
  });

  it('clears a previously selected popup-single value', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(POPUP_REPORT));
      return Promise.resolve(makeSelectorResponse([{ id: 'a1', name: 'Cash' }]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument());
    await user.click(screen.getByText('selectPlaceholder'));
    await waitFor(() => expect(screen.getByText('Cash')).toBeInTheDocument());
    await user.click(screen.getByText('Cash'));

    await waitFor(() => {
      // The clear (X) button next to the display value appears once a value is set
      const clearButtons = screen.getAllByTestId('X__3c998a');
      expect(clearButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('filters popup options by typing a search query', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(POPUP_REPORT));
      if (typeof url === 'string' && url.includes('q=Ban')) {
        return Promise.resolve(makeSelectorResponse([{ id: 'a2', name: 'Bank' }]));
      }
      return Promise.resolve(makeSelectorResponse([{ id: 'a1', name: 'Cash' }, { id: 'a2', name: 'Bank' }]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument());
    await user.click(screen.getByText('selectPlaceholder'));
    await waitFor(() => expect(screen.getByText('Cash')).toBeInTheDocument());

    const searchInputs = screen.getAllByPlaceholderText('Search...');
    await user.type(searchInputs[0], 'Ban');

    await waitFor(() => {
      expect(screen.getByText('Bank')).toBeInTheDocument();
    });
  });

  it('shows a validation error when a required popup-single param is empty on submit', async () => {
    const reqReport = {
      ...BASE_REPORT,
      parameters: [
        {
          name: 'acctId', type: 'search', selector: 'account', inputStyle: 'popup-single',
          label: { en_US: 'Account' }, section: 'primary', required: true,
        },
      ],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(reqReport));
      return Promise.resolve(makeSelectorResponse([]));
    });
    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      expect(screen.getByText('required')).toBeInTheDocument();
    });
  });

  it('passes dependsOn extraParams (account schema) when opening a dependent popup with a resolved dependency', async () => {
    const dependentReport = {
      ...BASE_REPORT,
      parameters: [
        {
          name: 'schemaId', type: 'text',
          label: { en_US: 'Schema' }, section: 'primary',
        },
        {
          name: 'acctId', type: 'search', selector: 'account', inputStyle: 'popup-single',
          label: { en_US: 'Account' }, section: 'primary', dependsOn: 'schemaId',
        },
      ],
    };
    let capturedUrl = null;
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(dependentReport));
      if (typeof url === 'string' && url.includes('/sws/report-selectors/account')) {
        capturedUrl = url;
        return Promise.resolve(makeSelectorResponse([{ id: 'a1', name: 'Cash' }]));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Account')).toBeInTheDocument());

    // Set the dependency value first so the dependsOn lookup resolves to a truthy value
    await user.type(screen.getByText('Schema').nextSibling, 'SCHEMA-1');

    await user.click(screen.getByText('selectPlaceholder'));

    await waitFor(() => {
      expect(capturedUrl).toBeTruthy();
    });
    expect(capturedUrl).toContain('selectedAcctSchemaId=SCHEMA-1');
  });
});

describe('ReportViewerPage — popup multi-select (PopupMultiSelector)', () => {
  const MULTI_REPORT = {
    ...BASE_REPORT,
    parameters: [
      {
        name: 'bpIds', type: 'search', selector: 'businessPartner', inputStyle: 'popup',
        label: { en_US: 'Partners' }, section: 'primary',
      },
    ],
  };

  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-1' });
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the modal, toggles checkboxes, and confirms the selection', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(MULTI_REPORT));
      if (typeof url === 'string' && url.includes('businessPartner')) {
        return Promise.resolve(makeSelectorResponse([{ id: 'bp1', name: 'Acme' }, { id: 'bp2', name: 'Globex' }]));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getAllByText('Partners').length).toBeGreaterThanOrEqual(1));

    // "+" button opens the modal — its text is the label when nothing confirmed yet
    const openButton = screen.getAllByText('Partners').find((el) => el.closest('button'));
    await user.click(openButton);

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
      expect(screen.getByText('Globex')).toBeInTheDocument();
    });

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);
    await user.click(checkboxes[1]);

    await user.click(screen.getByText('OK'));

    // Confirmed tags should now show the partner names
    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
      expect(screen.getByText('Globex')).toBeInTheDocument();
    });
  });

  it('cancels the modal without confirming any selection', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(MULTI_REPORT));
      return Promise.resolve(makeSelectorResponse([{ id: 'bp1', name: 'Acme' }]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getAllByText('Partners').length).toBeGreaterThanOrEqual(1));
    const openButton = screen.getAllByText('Partners').find((el) => el.closest('button'));
    await user.click(openButton);

    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());

    // The sidebar now also has a top "cancel" action (data-testid="action-cancel")
    // that reads the same 'cancel' i18n key — disambiguate by picking the
    // modal's own cancel button (a plain <button> with no data-testid).
    const cancelButtons = screen.getAllByText('cancel');
    const modalCancelButton = cancelButtons
      .map((el) => el.closest('button'))
      .find((btn) => btn && !btn.hasAttribute('data-testid'));
    expect(modalCancelButton).toBeTruthy();
    await user.click(modalCancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    });
  });

  it('removes a confirmed tag and clears all confirmed items', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(MULTI_REPORT));
      return Promise.resolve(makeSelectorResponse([{ id: 'bp1', name: 'Acme' }]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getAllByText('Partners').length).toBeGreaterThanOrEqual(1));
    const openButton = screen.getAllByText('Partners').find((el) => el.closest('button'));
    await user.click(openButton);
    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    await user.click(screen.getByText('OK'));

    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());

    // clearAll button appears once confirmed items exist
    await user.click(screen.getByText('clearAll'));

    await waitFor(() => {
      expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    });
  });

  it('shows "N more" indicator when more than 3 partners are confirmed', async () => {
    const user = userEvent.setup();
    const manyPartners = Array.from({ length: 5 }, (_, i) => ({ id: `bp${i}`, name: `Partner ${i}` }));
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(MULTI_REPORT));
      return Promise.resolve(makeSelectorResponse(manyPartners));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getAllByText('Partners').length).toBeGreaterThanOrEqual(1));
    const openButton = screen.getAllByText('Partners').find((el) => el.closest('button'));
    await user.click(openButton);
    await waitFor(() => expect(screen.getByText('Partner 0')).toBeInTheDocument());

    const checkboxes = screen.getAllByRole('checkbox');
    for (const cb of checkboxes) {
      await user.click(cb);
    }
    await user.click(screen.getByText('OK'));

    await waitFor(() => {
      expect(screen.getByText('andNMore')).toBeInTheDocument();
    });
  });
});

describe('ReportViewerPage — inline SearchInput dropdown (default, non-drawer)', () => {
  const SEARCH_REPORT = {
    ...BASE_REPORT,
    parameters: [
      {
        name: 'bpId', type: 'search', selector: 'businessPartner',
        label: { en_US: 'Business Partner' }, section: 'primary',
      },
    ],
  };

  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-1' });
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows dropdown options after typing 2+ chars and selects one', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(SEARCH_REPORT));
      if (typeof url === 'string' && url.includes('businessPartner')) {
        return Promise.resolve(makeSelectorResponse([{ id: 'bp1', name: 'Acme Corp' }]));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Business Partner')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Search Business Partner…');
    await user.type(input, 'Ac');

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Acme Corp'));

    await waitFor(() => {
      expect(input).toHaveValue('Acme Corp');
    });
  });

  it('clears the value when the text input is emptied', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(SEARCH_REPORT));
      return Promise.resolve(makeSelectorResponse([{ id: 'bp1', name: 'Acme Corp' }]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Business Partner')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Search Business Partner…');
    await user.type(input, 'Ac');
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    await user.click(screen.getByText('Acme Corp'));
    await waitFor(() => expect(input).toHaveValue('Acme Corp'));

    await user.clear(input);
    expect(input).toHaveValue('');
  });

  it('renders multi-select tags and clears them when clear button is clicked', async () => {
    const multiSearchReport = {
      ...BASE_REPORT,
      parameters: [
        {
          name: 'bpIds', type: 'search', selector: 'businessPartner', multi: true,
          label: { en_US: 'Partners' }, section: 'primary',
        },
      ],
    };
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(multiSearchReport));
      if (typeof url === 'string' && url.includes('businessPartner')) {
        return Promise.resolve(makeSelectorResponse([{ id: 'bp1', name: 'Acme' }, { id: 'bp2', name: 'Globex' }]));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Partners')).toBeInTheDocument());

    const input = screen.getByPlaceholderText('Search Partners…');
    await user.type(input, 'Ac');
    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());
    await user.click(screen.getByText('Acme'));

    // Tag chip for Acme should now appear (multi mode keeps the input open for more selections)
    await waitFor(() => {
      expect(screen.getAllByText('Acme').length).toBeGreaterThanOrEqual(1);
    });

    // Clicking the &times; on the tag removes it
    const removeButtons = screen.getAllByText('×');
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('Acme')).not.toBeInTheDocument();
    });
  });

  it('shows the dropdown-toggle arrow for the warehouse selector and toggles it', async () => {
    const warehouseReport = {
      ...BASE_REPORT,
      parameters: [
        {
          name: 'M_Warehouse_ID', type: 'search', selector: 'warehouse', inputStyle: 'dropdown',
          label: { en_US: 'Warehouse' }, section: 'primary',
        },
      ],
    };
    const user = userEvent.setup();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(warehouseReport));
      if (typeof url === 'string' && url.includes('warehouse')) {
        return Promise.resolve(makeSelectorResponse([{ id: 'w1', name: 'Main WH' }]));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Warehouse')).toBeInTheDocument());

    // minLength=0 (dropdown inputStyle) triggers a fetch on focus without typing
    const input = screen.getByPlaceholderText('Search Warehouse…');
    await user.click(input);

    await waitFor(() => {
      expect(screen.getByText('Main WH')).toBeInTheDocument();
    });

    // The chevron toggle button is also present for the warehouse selector (non-multi)
    const toggle = screen.getByLabelText('Toggle Warehouse options');
    expect(toggle).toBeInTheDocument();
    await user.click(toggle);
  });
});

describe('ReportViewerPage — ReportViewer cross-frame + print + auto-default branches', () => {
  const AUTO_DEFAULT_REPORT = {
    ...BASE_REPORT,
    parameters: [
      {
        name: 'warehouseId', type: 'search', selector: 'warehouse', autoDefault: true,
        label: { en_US: 'Warehouse' }, section: 'primary',
      },
    ],
  };

  beforeEach(() => {
    mockSearchParams = new URLSearchParams({ report: 'report-1' });
    mockSetSearchParams.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-loads the default value for a param with autoDefault:true', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(AUTO_DEFAULT_REPORT));
      if (typeof url === 'string' && url.includes('/sws/report-selectors/warehouse')) {
        return Promise.resolve(makeSelectorResponse([{ id: 'w1', name: 'Main Warehouse' }]));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Warehouse')).toBeInTheDocument());

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Search Warehouse…');
      expect(input).toHaveValue('Main Warehouse');
    });
  });

  it('handles fetch errors gracefully during auto-default resolution', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(AUTO_DEFAULT_REPORT));
      if (typeof url === 'string' && url.includes('/sws/report-selectors/warehouse')) {
        return Promise.reject(new Error('network down'));
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('Warehouse')).toBeInTheDocument());
    // Should not crash; input remains empty since the auto-default fetch failed
    const input = screen.getByPlaceholderText('Search Warehouse…');
    expect(input).toHaveValue('');
  });

  // Regression test (ETP — DrillDownViewer `ui is not defined`): DrillDownViewer
  // (ReportViewerPage.jsx ~line 1030) used `ui(f.labelKey)` / `ui('loadingDetails')`
  // / `ui('detailReport')` in its render without ever calling `useUI()` inside
  // that component's own scope — it silently relied on `ui` from the enclosing
  // ReportViewer closure, which does NOT apply to a separately-declared function
  // component. This threw `ReferenceError: ui is not defined` the first time either
  // drilldown dialog (aging or trial-balance) was opened, crashing the render tree
  // with a blank screen. Fixed by declaring `const ui = useUI();` at the top of
  // DrillDownViewer. These tests mount the real dialog via the same postMessage
  // wiring a real drill-down click uses, and assert the format buttons + iframe
  // title render via ui() without throwing.
  it('opens the aging-drilldown dialog and renders DrillDownViewer without throwing, with ui()-driven labels', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(BASE_REPORT));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>detail</body></html>') });
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'aging-drilldown', bpId: 'bp-42', bpName: 'Acme Corp' },
      }));
    });

    // Dialog opens and DrillDownViewer mounts and renders — no ReferenceError.
    // Scope to the dialog since the sidebar export actions also render "PDF".
    let dialog;
    await waitFor(() => {
      dialog = screen.getByTestId('dialog');
      expect(within(dialog).getByText('PDF')).toBeInTheDocument();
    });
    expect(within(dialog).getByText('Excel')).toBeInTheDocument();
    expect(within(dialog).getByText('CSV')).toBeInTheDocument();
    // The "Vista Previa" button was removed from DrillDownViewer's format
    // selector (only PDF/Excel/CSV remain, matching the main ReportViewer).
    expect(within(dialog).queryByText('preview')).toBeNull();
    expect(within(dialog).getByTitle('detailReport')).toBeInTheDocument();

    // The render request went to the base report (no targetReportId override).
    await waitFor(() => {
      const renderCalls = globalThis.fetch.mock.calls.filter(([u]) => typeof u === 'string' && u.includes('/render'));
      expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    });
    expect(globalThis.fetch.mock.calls.some(([u]) => typeof u === 'string' && u.includes(`/api/reports/${BASE_REPORT.id}/render`))).toBe(true);
  });

  it('opens the trial-balance-drilldown dialog (targeting report-general-ledger) and renders DrillDownViewer without throwing, with ui()-driven labels', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(BASE_REPORT));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>detail</body></html>') });
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'trial-balance-drilldown', accountId: 'acc-1', accountName: 'Cash', accountValue: '1100' },
      }));
    });

    let dialog;
    await waitFor(() => {
      dialog = screen.getByTestId('dialog');
      expect(within(dialog).getByText('PDF')).toBeInTheDocument();
    });
    expect(within(dialog).getByText('Excel')).toBeInTheDocument();
    expect(within(dialog).getByText('CSV')).toBeInTheDocument();
    // The "Vista Previa" button was removed from DrillDownViewer's format
    // selector (only PDF/Excel/CSV remain, matching the main ReportViewer).
    expect(within(dialog).queryByText('preview')).toBeNull();
    expect(within(dialog).getByTitle('detailReport')).toBeInTheDocument();

    // targetReportId overrides the reportId used for the render request.
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.some(([u]) => typeof u === 'string' && u.includes('/api/reports/report-general-ledger/render'))).toBe(true);
    });
  });

  it('opens the invoice in a new tab on postMessage("navigate-invoice") defaulting to sales-invoice', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(BASE_REPORT));
      return Promise.resolve(makeSelectorResponse([]));
    });

    const openSpy = vi.fn();
    const originalOpen = window.open;
    window.open = openSpy;

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'navigate-invoice', invoiceId: 'inv-99' },
    }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    const [url, target] = openSpy.mock.calls[0];
    expect(url).toMatch(/\/sales-invoice\/inv-99$/);
    expect(target).toBe('_blank');

    // No embedded modal opens anymore — the invoice navigates in a real new tab.
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

    window.open = originalOpen;
  });

  it('opens the invoice in a new tab respecting an explicit docWindow from the postMessage', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(BASE_REPORT));
      return Promise.resolve(makeSelectorResponse([]));
    });

    const openSpy = vi.fn();
    const originalOpen = window.open;
    window.open = openSpy;

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'navigate-invoice', invoiceId: 'inv-88', docWindow: 'purchase-invoice' },
    }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    const [url, target] = openSpy.mock.calls[0];
    expect(url).toMatch(/\/purchase-invoice\/inv-88$/);
    expect(target).toBe('_blank');

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

    window.open = originalOpen;
  });

  it('ignores unrelated postMessage payloads', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(BASE_REPORT));
      return Promise.resolve(makeSelectorResponse([]));
    });

    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'something-else' } }));
    window.dispatchEvent(new MessageEvent('message', { data: null }));

    // No dialog should have opened
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('calls contentWindow.print() when the iframe has rendered content', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(BASE_REPORT));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>content</body></html>'), blob: () => Promise.resolve(new Blob()) });
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      const renderCalls = globalThis.fetch.mock.calls.filter(([u]) => typeof u === 'string' && u.includes('/render'));
      expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    });

    const iframe = screen.getByTitle('report');
    // Stub contentDocument/contentWindow so handlePrint's happy path runs
    const printSpy = vi.fn();
    Object.defineProperty(iframe, 'contentDocument', {
      value: { body: { innerHTML: '<p>content</p>' } },
      configurable: true,
    });
    Object.defineProperty(iframe, 'contentWindow', {
      value: { print: printSpy },
      configurable: true,
    });

    await user.click(screen.getByText('print'));
    expect(printSpy).toHaveBeenCalled();
  });

  it('opens a new window and writes the cached preview HTML when the iframe body is empty', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(BASE_REPORT));
      if (typeof url === 'string' && url.includes('/render')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('<html><body>cached</body></html>'), blob: () => Promise.resolve(new Blob()) });
      }
      return Promise.resolve(makeSelectorResponse([]));
    });

    const fakeWindow = {
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      print: vi.fn(),
      close: vi.fn(),
      onload: null,
    };
    const openSpy = vi.fn(() => fakeWindow);
    const originalOpen = window.open;
    window.open = openSpy;

    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('runReport')).toBeInTheDocument());
    await user.click(screen.getByText('runReport'));
    await waitFor(() => {
      const renderCalls = globalThis.fetch.mock.calls.filter(([u]) => typeof u === 'string' && u.includes('/render'));
      expect(renderCalls.length).toBeGreaterThanOrEqual(1);
    });

    // Force the "iframe has no rendered body" branch of handlePrint deterministically —
    // jsdom's about:blank + onload write timing makes the real DOM state non-empty by
    // the time the click fires, so stub contentDocument.body.innerHTML to '' explicitly.
    const iframe = screen.getByTitle('report');
    Object.defineProperty(iframe, 'contentDocument', {
      value: { body: { innerHTML: '' } },
      configurable: true,
    });

    await user.click(screen.getByText('print'));

    expect(openSpy).toHaveBeenCalledWith('', '_blank', 'width=1200,height=800');
    expect(fakeWindow.document.write).toHaveBeenCalledWith('<html><body>cached</body></html>');
    fakeWindow.onload();
    expect(fakeWindow.print).toHaveBeenCalled();
    expect(fakeWindow.close).toHaveBeenCalled();

    window.open = originalOpen;
  });

  it('does nothing on print when there is no rendered content and no cached preview', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/reports') return Promise.resolve(makeReportsListResponse(BASE_REPORT));
      return Promise.resolve(makeSelectorResponse([]));
    });
    const openSpy = vi.fn();
    const originalOpen = window.open;
    window.open = openSpy;

    const user = userEvent.setup();
    render(<ReportViewerPage />);
    await waitFor(() => expect(screen.getByText('print')).toBeInTheDocument());
    await user.click(screen.getByText('print'));

    expect(openSpy).not.toHaveBeenCalled();
    window.open = originalOpen;
  });
});
