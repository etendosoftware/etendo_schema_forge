// @covers tools/app-shell/src/windows/custom/calendar/PeriodsExpandablePanel.jsx
// @covers tools/app-shell/src/windows/custom/calendar/PeriodsBulkDialogs.jsx
// @covers tools/app-shell/src/windows/custom/calendar/periodsBulkOpenClose.js
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocaleProvider } from '@/i18n';
import userEvent from '@testing-library/user-event';
import enUS from '../../../../locales/en_US.json';
import esES from '../../../../locales/es_ES.json';

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

let apiFetchMock = vi.fn();
let gridColumnViewsEnabled = false;
vi.mock('@/auth/useApiFetch.js', async () => (await import('@/test/gridViewTestDoubles.jsx')).apiFetchHookMock(() => apiFetchMock));
vi.mock('@/lib/flags', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridFlagsMock(() => gridColumnViewsEnabled));

const __dirname = dirname(fileURLToPath(import.meta.url));
const fiscalCalendarDecisions = JSON.parse(readFileSync(
  join(__dirname, '../../../../../../../artifacts/fiscal-calendar/decisions.json'),
  'utf8',
));

// Labels now render via ui()/tMenu() (dictionary.genericLabels) instead of server
// $_identifier strings (see PeriodsExpandablePanel.jsx's own comment for why) — so these
// tests need a real LocaleProvider + real locale JSON, same convention as *.i18n.vitest.jsx
// elsewhere in this repo, rather than a mocked identity `ui()` that would hide a missing/
// misspelled key. `render()` here transparently wraps every existing call site in this file
// (no per-test-file changes needed) at `currentTestLocale`, which defaults to 'en_US' so all
// of this file's pre-existing English fixture text keeps matching unchanged; the dedicated
// locale-propagation describe block below switches it to 'es_ES' for its own tests.
const DICTIONARIES = { en_US: enUS, es_ES: esES };
let currentTestLocale = 'en_US';
function render(ui) {
  return rtlRender(<LocaleProvider locale={currentTestLocale} dictionaries={DICTIONARIES}>{ui}</LocaleProvider>);
}

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

// Real Tag renders a plain <span> with no data-testid passthrough (it only reads
// variant/label/children/className) — mock it the same way DataTable.cellRenderers.vitest.jsx
// does, so tests can assert on the rendered variant + label without depending on Tag internals.
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label, variant }) => <span data-testid="tag" data-variant={variant}>{label}</span>,
}));

// The confirm/result dialogs render through plain HTML stand-ins (Radix portals are noise in JSDOM).
vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2 data-testid="process-param-dialog-title">{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));
import { toast } from 'sonner';
import PeriodsExpandablePanel from '../PeriodsExpandablePanel.jsx';

const PERIOD = { id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'O', 'status$_identifier': 'All Opened', periodNo: 1 };

beforeEach(() => {
  gridColumnViewsEnabled = false;
  toast.error.mockClear();
  apiFetchMock = vi.fn((url) => {
    if (url.includes('/periodControl')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
    }
    return Promise.reject(new Error('unexpected url ' + url));
  });
});

describe('PeriodsExpandablePanel', () => {
  it('does not request preferences or expose grid controls when the flag is off', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await screen.findByTestId('period-name-p1');
    expect(screen.queryByTestId('grid-view-controls')).not.toBeInTheDocument();
    expect(apiFetchMock.mock.calls.some(([url]) => url.includes('/grid-views/'))).toBe(false);
  });

  it('keeps selection and row confirmation after hiding the status column, and saves only on request', async () => {
    gridColumnViewsEnabled = true;
    apiFetchMock = vi.fn((url) => url.includes('/grid-views/')
      ? Promise.resolve({ ok: true, status: 204 })
      : Promise.resolve({ ok: true, json: async () => ({ response: { data: [PERIOD] } }) }));
    const user = userEvent.setup();
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(apiFetchMock).toHaveBeenCalledWith('/sws/neo/grid-views/open-close-period-control/periodControl', { baseUrl: '' });
    await user.click(screen.getByTestId('grid-view-columns-trigger'));
    await user.click(screen.getByTestId('grid-view-column-status'));
    expect(screen.queryByTestId('column-header-status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('row-p1').querySelector('input[type="checkbox"]'));
    expect(screen.getByTestId('period-bulk-close')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('period-close-p1'));
    expect(screen.getByTestId('periods-bulk-confirm-names')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('periods-bulk-confirm-cancel'));
    expect(apiFetchMock.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false);
    await user.click(screen.getByTestId('grid-view-save'));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(true));
    const [url, options] = apiFetchMock.mock.calls.find(([, request]) => request.method === 'PUT');
    expect(url).toBe('/sws/neo/grid-views/open-close-period-control/periodControl');
    expect(JSON.parse(options.body).columns).toContainEqual(expect.objectContaining({ id: 'list:field:status', visible: false }));
  });

  it('keeps a read-only role without selection or row actions when grid controls are enabled', async () => {
    gridColumnViewsEnabled = true;
    apiFetchMock = vi.fn((url) => url.includes('/grid-views/')
      ? Promise.resolve({ ok: true, status: 204 })
      : Promise.resolve({ ok: true, json: async () => ({ response: { data: [PERIOD] } }) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" readOnly />);
    await waitFor(() => expect(screen.getByTestId('grid-view-columns-trigger')).toBeEnabled());
    expect(screen.queryByTestId('period-row-actions-p1')).not.toBeInTheDocument();
    expect(screen.getByTestId('row-p1').querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('renders the full localized month from startingDate instead of the persisted short period name', async () => {
    const julyToJunePeriod = { id: 'june', name: 'Jan-27', startingDate: '2028-06-01', status: 'O' };
    apiFetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [julyToJunePeriod] } }),
    }));

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);

    await waitFor(() => expect(screen.getByTestId('period-name-june')).toHaveTextContent('June 28'));
    expect(screen.queryByText('Jan-27')).not.toBeInTheDocument();
  });

  // ETP-4948 QA finding, now fixed: FiscalYearPeriodsHandler.createPeriod (July-June range) sets
  // the 13th "adjustment" period's startingDate to June 30 of the fiscal-year end — the same
  // month/year as the regular 12th period's June 1 startingDate. formatPeriodName() only ever
  // reads month+year (never day), so both rows used to render the exact same text. The fix reads
  // the period's own `periodType` (already present on the row, set by the backend) and renders a
  // distinguishing "Adjustment Period" badge next to the 13th period's name — the regular period
  // is untouched (renamed from the "KNOWN GAP" test, which documented the ambiguity; it no longer
  // exists).
  it('renders a distinguishing badge for the July-June 13th adjustment period, not the regular June period', async () => {
    const regularJune = { id: 'p12', name: 'Jun-28', startingDate: '2028-06-01', status: 'O', periodNo: 12, periodType: 'S' };
    const adjustment = { id: 'p13', name: '13th Period - 28', startingDate: '2028-06-30', status: 'O', periodNo: 13, periodType: 'A' };
    apiFetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [regularJune, adjustment] } }),
    }));

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);

    await waitFor(() => expect(screen.getByTestId('period-name-p12')).toHaveTextContent('June 28'));
    // Both rows still show the same month/year (day is deliberately never part of the label —
    // see the previous test) but the 13th period now also carries the adjustment badge, and the
    // regular period must NOT.
    expect(screen.getByTestId('period-name-p13')).toHaveTextContent('June 28');
    expect(screen.getByTestId('period-adjustment-badge-p13')).toHaveTextContent('Adjustment Period');
    expect(screen.queryByTestId('period-adjustment-badge-p12')).not.toBeInTheDocument();
  });

  it('renders period status as a colored badge with the translated label, not the raw code', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p11" />);
    await waitFor(() => screen.getByText('January 27'));

    const badge = screen.getByTestId(`period-status-${PERIOD.id}`).querySelector('[data-testid="tag"]');
    expect(badge).toHaveAttribute('data-variant', 'green'); // status "O" -> green per enumVariants
    expect(badge).toHaveTextContent('Open');
    expect(screen.queryByText('O')).not.toBeInTheDocument();
  });

  // ETP-5592 renamed the labels and kept the colours (same as decisions.json enumVariants).
  it.each([
    ['N', 'neutral', 'Never opened'],
    ['O', 'green', 'Open'],
    ['M', 'orange', 'Mixed'],
    ['C', 'red', 'Closed'],
    ['P', 'red', 'Permanently closed'],
  ])('renders status %s as a %s tag labelled "%s"', async (status, variant, label) => {
    apiFetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [{ ...PERIOD, status }] } }),
    }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('January 27'));

    const badge = screen.getByTestId('period-status-p1').querySelector('[data-testid="tag"]');
    expect(badge).toHaveAttribute('data-variant', variant);
    expect(badge.textContent).toBe(label);
  });

  it('requests periods chronologically while retaining the classic criteria filter for the selected year', async () => {
    // periodControl's LIST goes through NEO's generic DefaultJsonDataService, which silently
    // ignores an arbitrary `?year=<id>` query param (confirmed live — it returned every period
    // across every year, unfiltered). The real mechanism is the `criteria` JSON-array param.
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p10" />);
    await waitFor(() => screen.getByText('January 27'));

    const expectedCriteria = encodeURIComponent(JSON.stringify([{ fieldName: 'year', operator: 'equals', value: 'year1' }]));
    expect(apiFetchMock).toHaveBeenCalledWith(
      `https://api.test/periodControl?criteria=${expectedCriteria}&_sortBy=startingDate asc`,
      expect.anything()
    );
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/periodControl?year='), expect.anything());
  });

  it('declares the Create Periods fiscal-year range before the adjustment choice', () => {
    const params = fiscalCalendarDecisions.window.processOverrides.processNow.params;
    const [fiscalYearRange, createAdjustment] = params;

    expect(fiscalYearRange).toMatchObject({
      key: 'FISCALYEARSTART',
      type: 'select',
      label: 'Fiscal Year Range',
      required: true,
    });
    expect(fiscalYearRange.options.map(({ value }) => value)).toEqual(['JANUARY', 'APRIL', 'JULY', 'OCTOBER']);
    expect(params.map(({ key }) => key)).toEqual(['FISCALYEARSTART', 'CREATEADJUSTMENT']);
    expect(createAdjustment.key).toBe('CREATEADJUSTMENT');
  });

  it('offers no row actions and no selection to a read-only role (ETP-5830)', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" readOnly data-testid="p2" />);
    await waitFor(() => screen.getByText('January 27'));

    expect(screen.queryByTestId('period-row-actions-p1')).not.toBeInTheDocument();
    expect(screen.getByTestId('periods-expandable-panel').querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('shows a loading indicator while periodControl is still pending', () => {
    apiFetchMock = vi.fn(() => new Promise(() => {})); // never resolves
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p5" />);
    expect(screen.getByTestId('periods-expandable-panel-loading')).toBeInTheDocument();
  });

  it('shows an error state (not stuck loading, not the panel) when periodControl fails', async () => {
    apiFetchMock = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p6" />);
    await waitFor(() => expect(screen.getByTestId('periods-expandable-panel-error')).toBeInTheDocument());
    expect(screen.queryByTestId('periods-expandable-panel')).not.toBeInTheDocument();
  });

  it('shows an empty state that points to "Create Periods" when the year has no periods (ETP-5592)', async () => {
    apiFetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);

    const empty = await screen.findByTestId('periods-empty');
    expect(empty).toHaveTextContent(enUS.genericLabels.periodsEmptyTitle);
    expect(empty).toHaveTextContent(enUS.genericLabels.periodsEmptyDescription);
  });

  it('reports the number of periods as the tab count (ETP-5592)', async () => {
    const onCount = vi.fn();
    apiFetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [PERIOD, { ...PERIOD, id: 'p2', startingDate: '2027-02-01' }] } }),
    }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" onCount={onCount} />);

    await waitFor(() => expect(onCount).toHaveBeenCalledWith(2));
  });
});

describe('PeriodsExpandablePanel — row actions (ETP-5592)', () => {
  let posts;
  let listCalls;
  let rows;
  let failPost;
  let holdPost;

  beforeEach(() => {
    currentTestLocale = 'en_US';
    toast.success.mockClear();
    posts = [];
    listCalls = 0;
    rows = [PERIOD];
    failPost = false;
    holdPost = null;
    apiFetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'POST') {
        posts.push({ url, body: JSON.parse(options.body), headers: options.headers });
        if (holdPost) return holdPost;
        if (failPost) {
          return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ status: 'error', message: 'Boom' }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) });
      }
      if (url.includes('/periodControl')) {
        listCalls += 1;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: rows } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
  });

  async function renderPanel() {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('January 27'));
  }

  it.each([
    ['N', ['open', 'close', 'close-permanent']],
    ['O', ['close', 'close-permanent']],
    ['M', ['open', 'close', 'close-permanent']],
    ['C', ['open', 'close-permanent']],
    ['P', []],
  ])('offers only the transitions that change a %s period', async (status, links) => {
    rows = [{ ...PERIOD, status }];
    await renderPanel();

    const offered = ['open', 'close', 'close-permanent']
      .filter((link) => screen.queryByTestId(`period-${link}-p1`));
    expect(offered).toEqual(links);
  });

  it('asks for confirmation first, naming the period, and posts nothing on cancel', async () => {
    await renderPanel();

    fireEvent.click(screen.getByTestId('period-close-p1'));

    expect(screen.getByText(enUS.genericLabels.periodsBulkConfirmCloseTitleOne)).toBeInTheDocument();
    expect(screen.getByTestId('periods-bulk-confirm-names')).toHaveTextContent('January 27');
    // The "one at a time, in date order" note only makes sense for several periods.
    expect(screen.queryByTestId('periods-bulk-confirm-body')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('periods-bulk-confirm-cancel'));
    expect(screen.queryByTestId('periods-bulk-confirm-names')).not.toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it.each([
    ['N', 'open', 'O', 'periodsBulkOpenedToastOne'],
    ['O', 'close', 'C', 'periodsBulkClosedToastOne'],
    ['O', 'close-permanent', 'P', 'periodsBulkPermanentlyClosedToastOne'],
  ])('a %s period\'s "%s" link posts {"openClose": "%s"} once confirmed', async (status, link, action, toastKey) => {
    rows = [{ ...PERIOD, status }];
    await renderPanel();

    fireEvent.click(screen.getByTestId(`period-${link}-p1`));
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(enUS.genericLabels[toastKey]));
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe('https://api.test/periodControl/p1/action/openClose');
    expect(posts[0].body).toEqual({ fieldValues: { openClose: action } });
    // The panel itself sets no header; useApiFetch owns them.
    expect(posts[0].headers).toBeUndefined();
  });

  it('warns that a permanent close cannot be undone, with a destructive confirm button', async () => {
    await renderPanel();

    fireEvent.click(screen.getByTestId('period-close-permanent-p1'));

    expect(screen.getByTestId('periods-bulk-confirm-body')).toHaveTextContent(
      enUS.genericLabels.periodsBulkConfirmPermanentBody,
    );
    expect(screen.getByTestId('periods-bulk-confirm-ok')).toHaveAttribute('variant', 'destructive');
  });

  it('re-fetches the periods list (not a full page reload) after a row action, updating the status tag', async () => {
    await renderPanel();
    expect(listCalls).toBe(1);
    rows = [{ ...PERIOD, status: 'C' }];

    fireEvent.click(screen.getByTestId('period-close-p1'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => expect(listCalls).toBe(2));
    await waitFor(() => {
      const badge = screen.getByTestId('period-status-p1').querySelector('[data-testid="tag"]');
      expect(badge).toHaveTextContent('Closed');
      expect(badge).toHaveAttribute('data-variant', 'red');
    });
    // The panel stayed mounted: no top-level loading state again.
    expect(screen.queryByTestId('periods-expandable-panel-loading')).not.toBeInTheDocument();
  });

  it('lists the translated backend error when a row action fails', async () => {
    failPost = true;
    await renderPanel();

    fireEvent.click(screen.getByTestId('period-close-p1'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => expect(screen.getByTestId('periods-bulk-result-p1')).toHaveAttribute('data-outcome', 'failed'));
    expect(screen.getByTestId('periods-bulk-result-p1')).toHaveTextContent('Boom');
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId('period-close-p1')).not.toBeDisabled();
  });

  it('disables every row link while a run is in flight, guarding against double-submit', async () => {
    let resolvePost;
    holdPost = new Promise((resolve) => { resolvePost = resolve; });
    await renderPanel();

    fireEvent.click(screen.getByTestId('period-close-p1'));
    fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    await waitFor(() => expect(screen.getByTestId('period-close-p1')).toBeDisabled());
    expect(screen.getByTestId('period-close-permanent-p1')).toBeDisabled();

    fireEvent.click(screen.getByTestId('period-close-p1'));
    expect(screen.queryByTestId('periods-bulk-confirm-names')).not.toBeInTheDocument();
    expect(posts).toHaveLength(1);

    await act(async () => {
      resolvePost({ ok: true, json: () => Promise.resolve({}) });
    });
    await waitFor(() => expect(screen.getByTestId('period-close-p1')).not.toBeDisabled());
  });

  it('keeps the bulk selection when a single row is acted on', async () => {
    rows = [PERIOD, { ...PERIOD, id: 'p2', name: 'Feb-27', startingDate: '2027-02-01' }];
    await renderPanel();
    fireEvent.click(screen.getByTestId('row-p2').querySelector('input[type="checkbox"]'));
    expect(screen.getByTestId('period-selection-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('period-close-p1'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.getByTestId('period-selection-count')).toHaveTextContent('1');
  });
});

describe('PeriodsExpandablePanel — refresh on cross-component neo:processSuccess event', () => {
  // "Create Periods" runs in a different React subtree (the generated YearPage from the
  // fiscal-calendar spec). Its success handler (useEntity.js's handleProcess) dispatches a
  // generic `window` CustomEvent on ANY successful process, regardless of which spec/entity
  // fired it — this panel listens for it and refreshes its own periods list when the event's
  // recordId matches its own parentId (the year id), same convention as
  // AmortizationLinesTable.jsx (filters on recordId only, not entity).
  it('re-fetches the periods list when a matching neo:processSuccess event is dispatched', async () => {
    let periodControlCallCount = 0;
    apiFetchMock = vi.fn((url) => {
      if (url.includes('/periodControl')) {
        periodControlCallCount += 1;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="ev1" />);
    await waitFor(() => screen.getByText('January 27'));
    expect(periodControlCallCount).toBe(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('neo:processSuccess', {
        detail: { process: 'createPeriods', entity: 'year', recordId: 'year1' },
      }));
    });

    await waitFor(() => expect(periodControlCallCount).toBe(2));
  });

  it('does not re-fetch when the event\'s recordId does not match this panel\'s parentId', async () => {
    let periodControlCallCount = 0;
    apiFetchMock = vi.fn((url) => {
      if (url.includes('/periodControl')) {
        periodControlCallCount += 1;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="ev2" />);
    await waitFor(() => screen.getByText('January 27'));
    expect(periodControlCallCount).toBe(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('neo:processSuccess', {
        detail: { process: 'createPeriods', entity: 'year', recordId: 'other-year' },
      }));
    });

    // No refetch was triggered for a record that isn't this panel's own year.
    expect(periodControlCallCount).toBe(1);
  });

  it('removes the neo:processSuccess listener on unmount', async () => {
    apiFetchMock = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="ev3" />);
    await waitFor(() => screen.getByText('January 27'));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('neo:processSuccess', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});

describe('PeriodsExpandablePanel — shared table', () => {
  it('renders on the shared DataTable: Period and Status columns, no fixed Actions column', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('January 27'));

    const panel = screen.getByTestId('periods-expandable-panel');
    expect(panel.querySelector('table')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(expect.arrayContaining(['Period', 'Status']));
    expect(headers).not.toContain('Actions');
    expect(screen.getByTestId('row-p1')).toBeInTheDocument();
  });
});

describe('PeriodsExpandablePanel — Accept-Language header + real localization fix', () => {
  // Investigated BOTH hypotheses live, not assumed:
  //
  // 1. This panel's raw fetch()/postAction used to send no Accept-Language header at all,
  //    unlike useEntity.js's buildHeaders(). Live verification (real login, real network
  //    capture) showed that even WITH the header correctly sent as es_ES, periodControl —
  //    served through NEO's generic DefaultJsonDataService (classic Openbravo datasource) —
  //    still returned English $_identifier values. The logged-in test user's own
  //    ad_user.default_ad_language (en_US in this DB) is the more likely actual authority for
  //    that datasource's identifier resolution, not the per-request header — so the header
  //    alone was never sufficient for this classic-datasource-backed path.
  // 2. So the real fix is client-side enumLabels — PERIOD_STATUS_LABEL_KEYS in
  //    PeriodsExpandablePanel.jsx — resolved via ui()/tMenu(), exactly like
  //    DataTable.cellRenderers.jsx's renderEnumCell() does everywhere else in the app. The
  //    dictionary was generated directly from the real AD_Ref_List/AD_Ref_List_Trl data already
  //    captured in artifacts/open-close-period-control/schema-raw.json — not hand-guessed.
  //
  // ETP-4948 REVIEW follow-up: this panel's own hand-rolled buildLocaleHeaders() (which built
  // the Accept-Language/Authorization headers itself) was removed entirely in favor of the
  // canonical `apiFetch` (@/auth/useApiFetch.js), which now sends both automatically on every
  // request — see CLAUDE.md's mandatory "Authenticated Requests" policy. That means this panel
  // itself no longer builds ANY header, so the header-sending assertions below now confirm the
  // absence of manual header-building here (delegated to useApiFetch, which owns its own tests)
  // rather than re-testing a header this component no longer constructs. The label-translation
  // tests further below are the real regression guard this describe block exists for, and are
  // unaffected — Spanish labels still render correctly regardless of what (or whether)
  // $_identifier says.
  const PERIOD_ES = { id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'M' }; // no $_identifier on purpose

  beforeEach(() => {
    currentTestLocale = 'es_ES';
  });

  afterEach(() => {
    localStorage.removeItem('schema-forge-locale');
    currentTestLocale = 'en_US';
  });

  it('no longer builds an Accept-Language header itself on the periodControl fetch (delegated to useApiFetch)', async () => {
    localStorage.setItem('schema-forge-locale', 'es_ES');
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD_ES] } }) }));
    apiFetchMock = fetchSpy;

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/periodControl'),
      {}
    );
  });

  it('does not need a stored locale to fetch (locale resolution is useApiFetch\'s concern, not this component\'s)', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) }));
    apiFetchMock = fetchSpy;

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      {}
    );
  });

  it('renders real Spanish labels for period status when the locale is es_ES — even with no $_identifier field at all', async () => {
    apiFetchMock = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD_ES] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));

    const periodBadge = screen.getByTestId(`period-status-${PERIOD_ES.id}`).querySelector('[data-testid="tag"]');
    expect(periodBadge).toHaveTextContent('Mixto');
    expect(screen.queryByText('Mixed')).not.toBeInTheDocument();
  });

  it('renders a July-to-June period from startingDate in Spanish rather than its persisted short name', async () => {
    const julyToJunePeriod = { id: 'june', name: 'Jan-27', startingDate: '2028-06-01', status: 'O' };
    apiFetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [julyToJunePeriod] } }),
    }));

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);

    await waitFor(() => expect(screen.getByTestId('period-name-june')).toHaveTextContent('Junio 28'));
    expect(screen.queryByText('Jan-27')).not.toBeInTheDocument();
  });

  it('renders the equivalent English label under en_US, from the same code-keyed dictionary', async () => {
    currentTestLocale = 'en_US';
    apiFetchMock = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD_ES] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('January 27'));

    const periodBadge = screen.getByTestId(`period-status-${PERIOD_ES.id}`).querySelector('[data-testid="tag"]');
    expect(periodBadge).toHaveTextContent('Mixed');
  });

  it('falls back to the raw code if it is somehow not in the dictionary (e.g. a future/unknown code)', async () => {
    apiFetchMock = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [{ id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'ZZZ' }] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));

    const periodBadge = screen.getByTestId('period-status-p1').querySelector('[data-testid="tag"]');
    expect(periodBadge).toHaveTextContent('ZZZ');
  });
});

describe('PeriodsExpandablePanel — bulk open/close (ETP-5682)', () => {
  const JAN = { id: 'jan', name: 'Jan-27', startingDate: '2027-01-01', status: 'C' };
  const FEB = { id: 'feb', name: 'Feb-27', startingDate: '2027-02-01', status: 'C' };
  const MAR = { id: 'mar', name: 'Mar-27', startingDate: '2027-03-01', status: 'N' };
  const APR = { id: 'apr', name: 'Apr-27', startingDate: '2027-04-01', status: 'O' };
  const MAY = { id: 'may', name: 'May-27', startingDate: '2027-05-01', status: 'P' };
  let posts;
  let listCalls;
  let failingIds;

  beforeEach(() => {
    currentTestLocale = 'en_US';
    toast.success.mockClear();
    toast.info.mockClear();
    posts = [];
    listCalls = 0;
    failingIds = new Set();
    apiFetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'POST') {
        const id = url.match(/periodControl\/([^/]+)\/action\/openClose/)[1];
        posts.push({ id, body: JSON.parse(options.body) });
        if (failingIds.has(id)) {
          return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ status: 'error', message: `Boom ${id}` }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'success' }) });
      }
      if (url.includes('/periodControl')) {
        listCalls += 1;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [JAN, FEB, MAR, APR, MAY] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
  });

  // DataTable's own checkboxes: the header one selects all, each row has its own.
  function checkbox(testId) {
    if (testId === 'period-select-all') {
      return screen.getByTestId('periods-expandable-panel').querySelector('thead input[type="checkbox"]');
    }
    return screen.getByTestId(testId.replace('period-select-', 'row-')).querySelector('input[type="checkbox"]');
  }

  function tick(testId) {
    fireEvent.click(checkbox(testId));
  }

  async function renderPanel() {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="bulk" />);
    await waitFor(() => screen.getByText('January 27'));
  }

  it('shows no bulk bar until a period is selected, and never lets a permanently closed period be selected', async () => {
    await renderPanel();

    expect(screen.queryByTestId('period-bulk-open')).not.toBeInTheDocument();
    expect(checkbox('period-select-may')).toBeDisabled();
    expect(checkbox('period-select-jan')).not.toBeDisabled();

    tick('period-select-jan');
    expect(screen.getByTestId('period-bulk-open')).toBeInTheDocument();
    expect(screen.getByTestId('period-selection-count')).toHaveTextContent('1');
  });

  it('select-all selects every period except the permanently closed one', async () => {
    await renderPanel();

    tick('period-select-all');

    for (const id of ['jan', 'feb', 'mar', 'apr']) expect(checkbox(`period-select-${id}`)).toBeChecked();
    expect(checkbox('period-select-may')).not.toBeChecked();
    expect(screen.getByTestId('period-selection-count')).toHaveTextContent('4');
  });

  it('posts nothing when the confirmation is cancelled', async () => {
    await renderPanel();
    tick('period-select-jan');

    fireEvent.click(screen.getByTestId('period-bulk-open'));
    expect(screen.getByTestId('periods-bulk-confirm-names')).toHaveTextContent('January 27');
    fireEvent.click(screen.getByTestId('periods-bulk-confirm-cancel'));

    expect(screen.queryByTestId('periods-bulk-confirm-names')).not.toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it('opens the selected periods one by one in date order and lists every period when one fails', async () => {
    failingIds.add('feb');
    await renderPanel();
    // Ticked out of date order on purpose.
    tick('period-select-mar');
    tick('period-select-jan');
    tick('period-select-feb');

    fireEvent.click(screen.getByTestId('period-bulk-open'));
    expect(screen.getByTestId('periods-bulk-confirm-names')).toHaveTextContent('January 27, February 27, March 27');
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => screen.getByTestId('periods-bulk-result-list'));
    expect(posts.map((p) => p.id)).toEqual(['jan', 'feb', 'mar']);
    expect(posts.every((p) => p.body.fieldValues.openClose === 'O')).toBe(true);

    expect(screen.getByTestId('periods-bulk-result-jan')).toHaveAttribute('data-outcome', 'ok');
    expect(screen.getByTestId('periods-bulk-result-feb')).toHaveAttribute('data-outcome', 'failed');
    expect(screen.getByTestId('periods-bulk-result-feb')).toHaveTextContent('February 27');
    expect(screen.getByTestId('periods-bulk-result-feb')).toHaveTextContent('Boom feb');
    expect(screen.getByTestId('periods-bulk-result-mar')).toHaveAttribute('data-outcome', 'ok');
    expect(toast.success).not.toHaveBeenCalled();

    // Selection cleared and the list reloaded once after the run.
    expect(screen.queryByTestId('period-bulk-open')).not.toBeInTheDocument();
    expect(listCalls).toBe(2);
  });

  it('skips periods already in the target state and shows a success toast when nothing failed', async () => {
    await renderPanel();
    tick('period-select-jan');
    tick('period-select-apr');

    fireEvent.click(screen.getByTestId('period-bulk-open'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(posts.map((p) => p.id)).toEqual(['jan']);
    // One opened and one skipped: both counts read in the singular.
    expect(toast.success).toHaveBeenCalledWith(
      enUS.genericLabels.periodsBulkOpenedToastOne + enUS.genericLabels.periodsBulkSkippedSuffixOne,
    );
    expect(screen.queryByTestId('periods-bulk-result-list')).not.toBeInTheDocument();
  });

  it('words the confirmation and the toast in the singular for one period and in the plural for several', async () => {
    await renderPanel();
    tick('period-select-jan');
    fireEvent.click(screen.getByTestId('period-bulk-open'));
    expect(screen.getByText(enUS.genericLabels.periodsBulkConfirmOpenTitleOne)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('periods-bulk-confirm-cancel'));

    tick('period-select-feb');
    fireEvent.click(screen.getByTestId('period-bulk-open'));
    expect(screen.getByText(enUS.genericLabels.periodsBulkConfirmOpenTitle.replace('{count}', '2'))).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith(enUS.genericLabels.periodsBulkOpenedToast.replace('{count}', '2'));
  });

  it('posts nothing and says so when every selected period is already in the target state', async () => {
    await renderPanel();
    tick('period-select-jan');
    tick('period-select-feb');

    fireEvent.click(screen.getByTestId('period-bulk-close'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
    expect(toast.info).toHaveBeenCalledWith(enUS.genericLabels.periodsBulkNothingToClose);
    expect(toast.success).not.toHaveBeenCalled();
    expect(posts).toHaveLength(0);
  });

  it('closes with the C action', async () => {
    await renderPanel();
    tick('period-select-apr');

    fireEvent.click(screen.getByTestId('period-bulk-close'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('periods-bulk-confirm-ok'));
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(posts).toEqual([{ id: 'apr', body: { fieldValues: { openClose: 'C' } } }]);
  });
});
