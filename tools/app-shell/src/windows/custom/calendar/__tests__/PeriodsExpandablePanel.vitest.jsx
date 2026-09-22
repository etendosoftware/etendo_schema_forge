import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocaleProvider } from '@/i18n';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';
import enUS from '../../../../locales/en_US.json';
import esES from '../../../../locales/es_ES.json';

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

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

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

// Real Tag renders a plain <span> with no data-testid passthrough (it only reads
// variant/label/children/className) — mock it the same way DataTable.cellRenderers.vitest.jsx
// does, so tests can assert on the rendered variant + label without depending on Tag internals.
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label, variant }) => <span data-testid="tag" data-variant={variant}>{label}</span>,
}));

// PeriodsExpandablePanel renders the real (unmocked) ProcessParamDialog to collect the
// required openClose choice — but Radix Select cannot run in JSDOM, so its underlying UI
// primitives are mocked with plain HTML equivalents, exactly like ProcessParamDialog.vitest.jsx
// does. process-param-* testids/values (not translated label text) drive the interaction below,
// so these tests don't depend on a LocaleProvider being present.
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
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => (
    <select value={value ?? ''} onChange={(e) => onValueChange?.(e.target.value)} data-testid="select-control">
      {children}
    </select>
  ),
  SelectTrigger: ({ children, ...props }) => <span {...props}>{children}</span>,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

import { toast } from 'sonner';
import PeriodsExpandablePanel from '../PeriodsExpandablePanel.jsx';

function selectOpenCloseOption(value) {
  fireEvent.change(screen.getByTestId('select-control'), { target: { value } });
}

const PERIOD = { id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'O', 'status$_identifier': 'All Opened', periodNo: 1 };

beforeEach(() => {
  toast.error.mockClear();
  global.fetch = vi.fn((url) => {
    if (url.includes('/periodControl')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
    }
    return Promise.reject(new Error('unexpected url ' + url));
  });
});

describe('PeriodsExpandablePanel', () => {
  it('renders the full localized month from startingDate instead of the persisted short period name', async () => {
    const julyToJunePeriod = { id: 'june', name: 'Jan-27', startingDate: '2028-06-01', status: 'O' };
    global.fetch = vi.fn(() => Promise.resolve({
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
    global.fetch = vi.fn(() => Promise.resolve({
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
    expect(badge).toHaveTextContent('All Opened');
    expect(screen.queryByText('O')).not.toBeInTheDocument();
  });

  it('falls back to the raw code when the $_identifier field is absent (e.g. an older mock/handler)', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [{ id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'M' }] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p13" />);
    await waitFor(() => screen.getByText('January 27'));

    const badge = screen.getByTestId('period-status-p1').querySelector('[data-testid="tag"]');
    expect(badge).toHaveAttribute('data-variant', 'orange'); // status "M" -> orange per enumVariants
    expect(badge).toHaveTextContent('M');
  });

  it('requests periods chronologically while retaining the classic criteria filter for the selected year', async () => {
    // periodControl's LIST goes through NEO's generic DefaultJsonDataService, which silently
    // ignores an arbitrary `?year=<id>` query param (confirmed live — it returned every period
    // across every year, unfiltered). The real mechanism is the `criteria` JSON-array param.
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p10" />);
    await waitFor(() => screen.getByText('January 27'));

    const expectedCriteria = encodeURIComponent(JSON.stringify([{ fieldName: 'year', operator: 'equals', value: 'year1' }]));
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.test/periodControl?criteria=${expectedCriteria}&_sortBy=startingDate asc`,
      expect.anything()
    );
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/periodControl?year='), expect.anything());
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
    expect(fiscalYearRange.options.map(({ value }) => value)).toEqual(['JANUARY', 'JULY']);
    expect(params.map(({ key }) => key)).toEqual(['FISCALYEARSTART', 'CREATEADJUSTMENT']);
    expect(createAdjustment.key).toBe('CREATEADJUSTMENT');
  });

  it('opens the ProcessParamDialog (not an immediate POST) when Abrir/Cerrar Periodo is clicked', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p2" />);
    await waitFor(() => screen.getByText('January 27'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('period-openclose-p1'));

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['O', 'Open'],
    ['C', 'Closed'],
    ['P', 'Permanently closed'],
  ])('submits {"openClose": "%s"} for the period action when "%s" is selected and confirmed', async (value, _label) => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p2" />);
    await waitFor(() => screen.getByText('January 27'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    selectOpenCloseOption(value);
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      'https://api.test/periodControl/p1/action/openClose',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fieldValues: { openClose: value } }),
      })
    ));
    // The dialog must close after a successful confirm, not linger on screen.
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('re-fetches the periods list (not a full page reload) after a period action succeeds, updating the status badge', async () => {
    const UPDATED_PERIOD = { ...PERIOD, status: 'C', 'status$_identifier': 'All Closed' };
    let periodControlCallCount = 0;
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes('/periodControl')) {
        periodControlCallCount += 1;
        const data = periodControlCallCount === 1 ? [PERIOD] : [UPDATED_PERIOD];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p14" />);
    await waitFor(() => screen.getByText('January 27'));
    expect(periodControlCallCount).toBe(1);

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    // The periods list is fetched again — never a full page reload (no window.location.reload,
    // no full-panel loading flash) — and the badge reflects whatever the refetch returns.
    await waitFor(() => expect(periodControlCallCount).toBe(2));
    await waitFor(() => {
      const badge = screen.getByTestId(`period-status-${PERIOD.id}`).querySelector('[data-testid="tag"]');
      expect(badge).toHaveTextContent('All Closed');
       expect(badge).toHaveAttribute('data-variant', 'red'); // status "C" -> red per enumVariants
    });
    // The panel itself must never have been torn down for a full reload — it stayed mounted
    // and showed the (stale, then updated) row the whole time, no top-level loading state again.
    expect(screen.queryByTestId('periods-expandable-panel-loading')).not.toBeInTheDocument();
  });

  it('cancelling the dialog does not submit any request', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p3b" />);
    await waitFor(() => screen.getByText('January 27'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    fireEvent.click(screen.getByTestId('process-param-cancel'));

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('shows a loading indicator while periodControl is still pending', () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p5" />);
    expect(screen.getByTestId('periods-expandable-panel-loading')).toBeInTheDocument();
  });

  it('shows an error state (not stuck loading, not the panel) when periodControl fails', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p6" />);
    await waitFor(() => expect(screen.getByTestId('periods-expandable-panel-error')).toBeInTheDocument());
    expect(screen.queryByTestId('periods-expandable-panel')).not.toBeInTheDocument();
  });

  it('shows a toast and re-enables the button when Abrir/Cerrar Periodo fails', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      return Promise.reject(new Error('unexpected'));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p8" />);
    await waitFor(() => screen.getByText('January 27'));

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('period-openclose-p1')).not.toBeDisabled());
  });

  it('disables Abrir/Cerrar Periodo while the request is in flight, guarding against double-submit', async () => {
    global.fetch.mockImplementationOnce((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      return Promise.reject(new Error('unexpected'));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p9" />);
    await waitFor(() => screen.getByText('January 27'));

    // Only the POST is held pending by the test — the post-success periodControl refetch
    // (a GET) must resolve immediately, or the pending flag (cleared only after that refetch
    // settles) would hang forever and this test would never see the button re-enable.
    let resolvePost;
    const postSpy = vi.fn((url, opts) => {
      if (opts?.method === 'POST') return new Promise((resolve) => { resolvePost = resolve; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
    });
    global.fetch = postSpy;

    const button = screen.getByTestId('period-openclose-p1');
    fireEvent.click(button);
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));
    await waitFor(() => expect(button).toBeDisabled());

    // The dialog already closed on confirm — a disabled native <button> does not dispatch
    // click handlers at all (jsdom mirrors real browser behavior), so these are no-ops.
    fireEvent.click(button);
    fireEvent.click(button);
    expect(postSpy).toHaveBeenCalledTimes(1);

    resolvePost({ ok: true, json: () => Promise.resolve({}) });
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('confirming again while the previous request for the same row is still pending does not open a second dialog', async () => {
    // Same as above: only the POST is held pending — the post-success refetch (GET) resolves
    // immediately so it doesn't block the pending flag from ever clearing.
    let resolvePost;
    const postSpy = vi.fn((url, opts) => {
      if (opts?.method === 'POST') return new Promise((resolve) => { resolvePost = resolve; });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p9b" />);
    await waitFor(() => screen.getByText('January 27'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    selectOpenCloseOption('P');
    fireEvent.click(screen.getByTestId('process-param-confirm'));
    await waitFor(() => expect(screen.getByTestId('period-openclose-p1')).toBeDisabled());

    // The trigger button is disabled while pending, so re-clicking it must not reopen the dialog.
    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    expect(postSpy).toHaveBeenCalledTimes(1);

    resolvePost({ ok: true, json: () => Promise.resolve({}) });
    await waitFor(() => expect(screen.getByTestId('period-openclose-p1')).not.toBeDisabled());
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
    global.fetch = vi.fn((url) => {
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
    global.fetch = vi.fn((url) => {
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
    global.fetch = vi.fn((url) => {
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

describe('PeriodsExpandablePanel — shared table styling', () => {
  const P1 = { id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'O', 'status$_identifier': 'All Opened' };
  const P2 = { id: 'p2', name: 'Feb-27', startingDate: '2027-02-01', status: 'O', 'status$_identifier': 'All Opened' };

  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [P1, P2] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });
  });

  function periodRowFor(periodId) {
    return screen.getByTestId(`period-name-${periodId}`).closest('tr');
  }

  it('renders the established table headers and three-cell layout for period rows', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    const panel = screen.getByTestId('periods-expandable-panel');
    expect(panel.querySelector('table')).toBeInTheDocument();
    expect(panel.querySelector('thead')).toBeInTheDocument();
    expect(panel.querySelector('tbody')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Period',
      'Status',
      'Actions',
    ]);
    expect(periodRowFor('p1').querySelectorAll(':scope > td')).toHaveLength(3);
    expect(periodRowFor('p2').querySelectorAll(':scope > td')).toHaveLength(3);
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
    global.fetch = fetchSpy;

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/periodControl'),
      {}
    );
  });

  it('no longer builds an Accept-Language header itself on the openClose POST action either', async () => {
    localStorage.setItem('schema-forge-locale', 'es_ES');
    const postSpy = vi.fn((url, opts) => {
      if (opts?.method === 'POST') return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD_ES] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    });
    global.fetch = postSpy;
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('/action/openClose'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fieldValues: { openClose: 'C' } }),
      })
    ));
    // No `headers` key at all on the POST options — the component only sets method/body,
    // never headers, matching postAction(apiFetch, path, fieldValues)'s implementation.
    const [, postOptions] = postSpy.mock.calls.find(([url]) => url.includes('/action/openClose'));
    expect(postOptions.headers).toBeUndefined();
  });

  it('does not need a stored locale to fetch (locale resolution is useApiFetch\'s concern, not this component\'s)', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) }));
    global.fetch = fetchSpy;

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      {}
    );
  });

  it('renders real Spanish labels for period status when the locale is es_ES — even with no $_identifier field at all', async () => {
    global.fetch = vi.fn((url) => {
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
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ response: { data: [julyToJunePeriod] } }),
    }));

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);

    await waitFor(() => expect(screen.getByTestId('period-name-june')).toHaveTextContent('Junio 28'));
    expect(screen.queryByText('Jan-27')).not.toBeInTheDocument();
  });

  it('renders the equivalent English label under en_US, from the same code-keyed dictionary', async () => {
    currentTestLocale = 'en_US';
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD_ES] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('January 27'));

    const periodBadge = screen.getByTestId(`period-status-${PERIOD_ES.id}`).querySelector('[data-testid="tag"]');
    expect(periodBadge).toHaveTextContent('Mixed');
  });

  it('falls back to the raw code if it is somehow not in the dictionary (e.g. a future/unknown code)', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [{ id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'ZZZ' }] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));

    const periodBadge = screen.getByTestId('period-status-p1').querySelector('[data-testid="tag"]');
    expect(periodBadge).toHaveTextContent('ZZZ');
  });
});
