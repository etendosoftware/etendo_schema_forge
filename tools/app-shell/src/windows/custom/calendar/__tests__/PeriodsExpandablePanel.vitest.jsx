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

// useBulkActionToast (used by the new bulk open/close feature) also calls toast.warning for
// partial-failure results, in addition to the error/success this file already mocked.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

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
import { backgroundUtilities, hoverBackgroundUtilities, countBackgroundUtilities } from '@/test/rowShading.js';

function selectOpenCloseOption(value) {
  fireEvent.change(screen.getByTestId('select-control'), { target: { value } });
}

const PERIOD = { id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'O', 'status$_identifier': 'All Opened', periodNo: 1 };
// documentCategory codes below are the REAL codes for the asserted English text (per
// DOCUMENT_CATEGORY_LABEL_KEYS, generated from the actual DB data) — labels now render via
// ui(DOCUMENT_CATEGORY_LABEL_KEYS[code]) rather than the $_identifier fields (still present on
// some fixtures below only for historical/no-op reasons; the component no longer reads them).
const DOC = {
  id: 'd1',
  documentCategory: 'APC', // -> "AP Credit Memo"
  periodStatus: 'O',
};
const DOC2 = {
  id: 'd2',
  documentCategory: 'ARI', // -> "AR Invoice"
  periodStatus: 'O',
};
const DOC3 = {
  id: 'd3',
  documentCategory: 'MMR', // -> "Material Receipt"
  periodStatus: 'O',
};

beforeEach(() => {
  toast.error.mockClear();
  global.fetch = vi.fn((url) => {
    if (url.includes('/periodControl')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
    }
    if (url.includes('/documents')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC] } }) });
    }
    return Promise.reject(new Error('unexpected url ' + url));
  });
});

describe('PeriodsExpandablePanel', () => {
  it('fetches document rows only after the period row is expanded', async () => {
    render(
      <PeriodsExpandablePanel
        parentId="year1"
        apiBaseUrl="https://api.test"
        data-testid="PeriodsExpandablePanel__test" />
    );
    await waitFor(() => expect(screen.getByText('January 27')).toBeInTheDocument());
    expect(screen.queryByText('Jan-27')).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/documents'), expect.anything());

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));

    await waitFor(() => expect(screen.getByText('AP Credit Memo')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/documents?parentId=p1'), expect.anything());
  });

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

  it('renders document type + status as a readable label and colored badge, not raw codes', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p12" />);
    await waitFor(() => screen.getByText('January 27'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));

    const badge = screen.getByTestId(`document-status-${DOC.id}`).querySelector('[data-testid="tag"]');
    expect(badge).toHaveAttribute('data-variant', 'green'); // periodStatus "O" -> green per enumVariants
    expect(badge).toHaveTextContent('Open');
    expect(screen.queryByText('API')).not.toBeInTheDocument();
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

  it('opens the ProcessParamDialog (not an immediate POST) when Abrir/Cerrar Documento is clicked', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p3" />);
    await waitFor(() => screen.getByText('January 27'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-openclose-d1'));

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['O', 'Open'],
    ['C', 'Closed'],
    ['P', 'Permanently closed'],
  ])('submits {"openClose": "%s"} for the document action when "%s" is selected and confirmed', async (value, _label) => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p3" />);
    await waitFor(() => screen.getByText('January 27'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-openclose-d1'));
    selectOpenCloseOption(value);
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      'https://api.test/documents/d1/action/openClose',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fieldValues: { openClose: value } }),
      })
    ));
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

  it('re-fetches BOTH the periods list AND the expanded period\'s documents after a period action succeeds, not just the periods list', async () => {
    // Regression guard for the C_Period_Process fix (AD Process 167 opens/closes EVERY
    // C_PeriodControl row for the period in one DB transaction): if the acted-on period is
    // currently expanded, its stale documentsByPeriod[id] must be refreshed too. Before the fix,
    // handleDialogConfirm's 'period' branch only called loadPeriods(), so documentsCallCount
    // would have stayed at 1 here instead of advancing to 2.
    const UPDATED_PERIOD = { ...PERIOD, status: 'C', 'status$_identifier': 'All Closed' };
    const UPDATED_DOC = { ...DOC, periodStatus: 'C', 'periodStatus$_identifier': 'Closed' };
    let periodControlCallCount = 0;
    let documentsCallCount = 0;
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes('/periodControl')) {
        periodControlCallCount += 1;
        const data = periodControlCallCount === 1 ? [PERIOD] : [UPDATED_PERIOD];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      if (url.includes('/documents')) {
        documentsCallCount += 1;
        const data = documentsCallCount === 1 ? [DOC] : [UPDATED_DOC];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p16" />);
    await waitFor(() => screen.getByText('January 27'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
    expect(periodControlCallCount).toBe(1);
    expect(documentsCallCount).toBe(1);

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(periodControlCallCount).toBe(2));
    await waitFor(() => expect(documentsCallCount).toBe(2));
    await waitFor(() => {
      const badge = screen.getByTestId(`period-status-${PERIOD.id}`).querySelector('[data-testid="tag"]');
      expect(badge).toHaveTextContent('All Closed');
    });
  });

  it('does not re-fetch documents for a period action when that period is not currently expanded', async () => {
    // Mirrors the `expandedId === id ? loadDocumentsForPeriod(id) : Promise.resolve()` guard —
    // acting on a period that is not the expanded one must not trigger a documents fetch for it.
    let periodControlCallCount = 0;
    let documentsCallCount = 0;
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes('/periodControl')) {
        periodControlCallCount += 1;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      }
      if (url.includes('/documents')) {
        documentsCallCount += 1;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p17" />);
    await waitFor(() => screen.getByText('January 27'));
    expect(periodControlCallCount).toBe(1);
    expect(documentsCallCount).toBe(0); // never expanded, so no documents fetch yet

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(periodControlCallCount).toBe(2));
    // The guard must resolve to a no-op for a period that isn't expanded — documents are never
    // fetched at all in this test.
    expect(documentsCallCount).toBe(0);
  });

  it('invalidates cached documents after a successful action on a collapsed period so re-expanding shows refreshed statuses', async () => {
    const CLOSED_DOC = { ...DOC, periodStatus: 'C' };
    const OPEN_DOC = { ...DOC, periodStatus: 'O' };
    let documentsCallCount = 0;
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes('/periodControl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      }
      if (url.includes('/documents')) {
        documentsCallCount += 1;
        const data = documentsCallCount === 1 ? [CLOSED_DOC] : [OPEN_DOC];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p18" />);
    await waitFor(() => screen.getByText('January 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => {
      const badge = screen.getByTestId('document-status-d1').querySelector('[data-testid="tag"]');
      expect(badge).toHaveTextContent('Closed');
    });
    expect(documentsCallCount).toBe(1);

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => expect(screen.queryByTestId('period-documents-p1')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    selectOpenCloseOption('O');
    fireEvent.click(screen.getByTestId('process-param-confirm'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/periodControl/p1/action/openClose',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fieldValues: { openClose: 'O' } }),
      })
    ));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => expect(documentsCallCount).toBe(2));
    await waitFor(() => {
      const badge = screen.getByTestId('document-status-d1').querySelector('[data-testid="tag"]');
      expect(badge).toHaveTextContent('Open');
      expect(badge).toHaveAttribute('data-variant', 'green');
    });
  });

  it('re-fetches BOTH the affected period\'s documents AND the periods list after a document action succeeds, updating the parent\'s aggregate badge too', async () => {
    // A document's own status changing can flip its parent period's aggregate rollup too
    // (e.g. "All Opened" -> "Mixed" once one document type differs from the rest — same
    // N/O/C/P/M semantics as the period's own enumVariants), so both refetches are required,
    // not just the documents one.
    const UPDATED_DOC = { ...DOC, periodStatus: 'C', 'periodStatus$_identifier': 'Closed' };
    const UPDATED_PERIOD = { ...PERIOD, status: 'M', 'status$_identifier': 'Mixed' };
    let periodControlCallCount = 0;
    let documentsCallCount = 0;
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      }
      if (url.includes('/periodControl')) {
        periodControlCallCount += 1;
        const data = periodControlCallCount === 1 ? [PERIOD] : [UPDATED_PERIOD];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      if (url.includes('/documents')) {
        documentsCallCount += 1;
        const data = documentsCallCount === 1 ? [DOC] : [UPDATED_DOC];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p15" />);
    await waitFor(() => screen.getByText('January 27'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
    expect(documentsCallCount).toBe(1);
    expect(periodControlCallCount).toBe(1);

    fireEvent.click(screen.getByTestId('document-openclose-d1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(documentsCallCount).toBe(2));
    await waitFor(() => expect(periodControlCallCount).toBe(2));
    await waitFor(() => {
      const docBadge = screen.getByTestId(`document-status-${DOC.id}`).querySelector('[data-testid="tag"]');
      expect(docBadge).toHaveTextContent('Closed');
      expect(docBadge).toHaveAttribute('data-variant', 'red'); // periodStatus "C" -> red per enumVariants
    });
    await waitFor(() => {
      const periodBadge = screen.getByTestId(`period-status-${PERIOD.id}`).querySelector('[data-testid="tag"]');
      expect(periodBadge).toHaveTextContent('Mixed');
      expect(periodBadge).toHaveAttribute('data-variant', 'orange'); // status "M" -> orange per enumVariants
    });
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

  it('collapses the period row again on a second click without re-fetching documents', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p4" />);
    await waitFor(() => screen.getByText('January 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
    const fetchCallsAfterExpand = global.fetch.mock.calls.length;

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => expect(screen.queryByTestId('period-documents-p1')).not.toBeInTheDocument());

    // Re-expanding should reuse the cached documents, not re-fetch.
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
    expect(global.fetch.mock.calls.length).toBe(fetchCallsAfterExpand);
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

  it('shows an inline error under the expanded period when the documents fetch fails', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      if (url.includes('/documents')) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return Promise.reject(new Error('unexpected'));
    });
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid="p7" />);
    await waitFor(() => screen.getByText('January 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => expect(screen.getByTestId('period-documents-error-p1')).toBeInTheDocument());
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

describe('PeriodsExpandablePanel — bulk document selection and open/close', () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
    toast.warning.mockClear();
    sessionStorage.clear();
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      }
      if (url.includes('/documents')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC, DOC2, DOC3] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
  });

  async function renderExpanded(testId) {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" data-testid={testId} />);
    await waitFor(() => screen.getByText('January 27'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
  }

  it('shows no bulk action bar until at least one document row is selected', async () => {
    await renderExpanded('b1');
    expect(screen.queryByTestId('document-bulk-bar-p1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('document-select-d1'));
    expect(screen.getByTestId('document-bulk-bar-p1')).toBeInTheDocument();
    // The bulk button itself carries no "(count)" suffix — deliberately removed (ETP-4972
    // live-QA finding: redundant, the pill's own counter segment already shows it). This
    // test file's `render()` wraps every call in a real `LocaleProvider` with real dictionaries
    // (see the file-header comment), so `document-selection-count` reliably reflects the real
    // `ui('selected')` translation, not a raw/untranslated fallback.
    expect(screen.getByTestId('document-selection-count')).toHaveTextContent('1 Selected');
  });

  it('tracks multiple selected rows and shows the correct count', async () => {
    await renderExpanded('b2');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    fireEvent.click(screen.getByTestId('document-select-d3'));

    expect(screen.getByTestId('document-selection-count')).toHaveTextContent('3 Selected');

    // Unselecting one drops the count back down, not to zero.
    fireEvent.click(screen.getByTestId('document-select-d2'));
    expect(screen.getByTestId('document-selection-count')).toHaveTextContent('2 Selected');
  });

  it('clears the selection when the period is collapsed or a different period is expanded', async () => {
    await renderExpanded('b3');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    expect(screen.getByTestId('document-bulk-bar-p1')).toBeInTheDocument();

    // Collapse.
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    // Re-expand — selection must not have survived.
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
    expect(screen.queryByTestId('document-bulk-bar-p1')).not.toBeInTheDocument();
  });

  it('opens the shared ProcessParamDialog (not an immediate POST) when the bulk button is clicked', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    await renderExpanded('b4');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-bulk-openclose-p1'));

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['O', 'Open'],
    ['C', 'Closed'],
    ['P', 'Permanently closed'],
  ])('fires one POST per selected document with {"openClose": "%s"} when "%s" is confirmed', async (value, _label) => {
    const postCalls = [];
    const postSpy = vi.fn((url, opts) => {
      // Only capture POSTs — the bulk action's post-success refresh (loadDocumentsForPeriod +
      // loadPeriods, both GETs) reuses this same mocked fetch too.
      if (opts?.method === 'POST') postCalls.push({ url, body: opts.body });
      if (url.includes('/documents')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC, DOC2, DOC3] } }) });
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    await renderExpanded('b5');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-bulk-openclose-p1'));
    selectOpenCloseOption(value);
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(postCalls.length).toBe(2));
    const expectedBody = JSON.stringify({ fieldValues: { openClose: value } });
    expect(postCalls.map((c) => c.url).sort()).toEqual([
      'https://api.test/documents/d1/action/openClose',
      'https://api.test/documents/d2/action/openClose',
    ]);
    expect(postCalls.every((c) => c.body === expectedBody)).toBe(true);
  });

  it('shows a success toast and clears the selection when all selected documents succeed', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    await renderExpanded('b6');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-bulk-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByTestId('document-bulk-bar-p1')).not.toBeInTheDocument();
  });

  it('surfaces partial failure (one of three fails) via a warning toast, not silently', async () => {
    const postSpy = vi.fn((url) => {
      if (url.includes('/d2/')) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    await renderExpanded('b7');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    fireEvent.click(screen.getByTestId('document-select-d3'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-bulk-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    // 2 succeeded, 1 failed -> a WARNING toast (partial failure), not success or plain error.
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows an error toast (not success) when every selected document fails', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    await renderExpanded('b8');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-bulk-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('refreshes BOTH the documents list and the periods list after the bulk action completes', async () => {
    const UPDATED_DOCS = [
      { ...DOC, periodStatus: 'C', 'periodStatus$_identifier': 'Closed' },
      { ...DOC2, periodStatus: 'C', 'periodStatus$_identifier': 'Closed' },
      DOC3,
    ];
    const UPDATED_PERIOD = { ...PERIOD, status: 'M', 'status$_identifier': 'Mixed' };
    let periodControlCallCount = 0;
    let documentsCallCount = 0;
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST') return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      if (url.includes('/periodControl')) {
        periodControlCallCount += 1;
        const data = periodControlCallCount === 1 ? [PERIOD] : [UPDATED_PERIOD];
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      if (url.includes('/documents')) {
        documentsCallCount += 1;
        const data = documentsCallCount === 1 ? [DOC, DOC2, DOC3] : UPDATED_DOCS;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });

    await renderExpanded('b9');
    expect(documentsCallCount).toBe(1);
    expect(periodControlCallCount).toBe(1);

    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    fireEvent.click(screen.getByTestId('document-bulk-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(documentsCallCount).toBe(2));
    await waitFor(() => expect(periodControlCallCount).toBe(2));
    await waitFor(() => {
      const periodBadge = screen.getByTestId(`period-status-${PERIOD.id}`).querySelector('[data-testid="tag"]');
      expect(periodBadge).toHaveTextContent('Mixed');
    });
  });

  it('disables the bulk button while the batch is in flight, guarding against double-submit', async () => {
    // Two selected documents means Promise.allSettled fires TWO POSTs — each needs its own
    // resolver, or resolving only one leaves the other (and the whole allSettled) pending
    // forever, which would hang this test (the same pitfall as the single-action tests above).
    const resolvers = [];
    const postSpy = vi.fn((url, opts) => {
      if (opts?.method === 'POST') return new Promise((resolve) => { resolvers.push(resolve); });
      if (url.includes('/documents')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC, DOC2, DOC3] } }) });
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
    await renderExpanded('b10');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-bulk-openclose-p1'));
    selectOpenCloseOption('C');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(screen.getByTestId('document-bulk-openclose-p1')).toBeDisabled());
    expect(resolvers.length).toBe(2);

    resolvers.forEach((resolve) => resolve({ ok: true, json: () => Promise.resolve({}) }));
    await waitFor(() => expect(screen.queryByTestId('document-bulk-openclose-p1')).not.toBeInTheDocument());
  });

  it('does not disturb the existing single-row "Abrir/Cerrar Documento" action', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    await renderExpanded('b11');
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('document-openclose-d1'));
    selectOpenCloseOption('O');
    fireEvent.click(screen.getByTestId('process-param-confirm'));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith(
      'https://api.test/documents/d1/action/openClose',
      expect.objectContaining({ body: JSON.stringify({ fieldValues: { openClose: 'O' } }) })
    ));
    // Selecting via checkbox is fully independent — a single-row action must not have touched
    // (or required) any selection state.
    expect(screen.queryByTestId('document-bulk-bar-p1')).not.toBeInTheDocument();
  });
});

describe('PeriodsExpandablePanel — pinning the expanded period to the top', () => {
  const P1 = { id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'O', 'status$_identifier': 'All Opened' };
  const P2 = { id: 'p2', name: 'Feb-27', startingDate: '2027-02-01', status: 'O', 'status$_identifier': 'All Opened' };
  const P3 = { id: 'p3', name: 'Mar-27', startingDate: '2027-03-01', status: 'O', 'status$_identifier': 'All Opened' };

  function renderedPeriodOrder(container) {
    return Array.from(container.querySelectorAll('[data-testid^="period-row-expand-"]'))
      .map((el) => el.getAttribute('data-testid').replace('period-row-expand-', ''));
  }

  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) {
        // Backend returns them in this order today (no explicit sort applied by this panel's
        // own fetch) — the reordering logic must preserve this relative order for every period
        // that is NOT the pinned one.
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [P1, P2, P3] } }) });
      }
      if (url.includes('/documents')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
  });

  it('renders periods in their original (unpinned) order when nothing is expanded', async () => {
    const { container } = render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));
    expect(renderedPeriodOrder(container)).toEqual(['p1', 'p2', 'p3']);
  });

  it('moves a non-first period to the top of the list once it is expanded', async () => {
    const { container } = render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p3'));
    await waitFor(() => screen.getByTestId('period-documents-p3'));

    expect(renderedPeriodOrder(container)).toEqual(['p3', 'p1', 'p2']);
  });

  it('carries the expanded document list and its own DOM subtree along with the reorder (no separate logic needed)', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [P1, P2, P3] } }) });
      if (url.includes('/documents')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });
    const { container } = render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p2'));
    await waitFor(() => screen.getByText('AP Credit Memo'));

    expect(renderedPeriodOrder(container)).toEqual(['p2', 'p1', 'p3']);
    // p2's own expanded documents subtree (and, if selected, its bulk bar) is still nested
    // directly inside p2's own row container — the FIRST rendered period row/group, once
    // reordered — confirming reordering the array alone is sufficient, no separate wiring
    // needed to keep the row and its expanded content together.
    const firstPeriodGroup = container.querySelector('[data-testid="periods-expandable-panel"] > div');
    expect(firstPeriodGroup.querySelector('[data-testid="period-documents-p2"]')).toBeInTheDocument();
  });

  it('moves the pin to a newly expanded period, returning the previous one to its normal sorted position', async () => {
    const { container } = render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p3'));
    await waitFor(() => screen.getByTestId('period-documents-p3'));
    expect(renderedPeriodOrder(container)).toEqual(['p3', 'p1', 'p2']);

    // Expanding a different period moves the pin — only one period is ever "active"/expanded
    // at a time (the existing single-`expandedId` behavior), so p3 automatically loses its
    // expanded state and returns to its original relative position.
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByTestId('period-documents-p1'));
    expect(renderedPeriodOrder(container)).toEqual(['p1', 'p2', 'p3']);
    expect(screen.queryByTestId('period-documents-p3')).not.toBeInTheDocument();
  });

  it('returns to the original order once the pinned period is collapsed', async () => {
    const { container } = render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p2'));
    await waitFor(() => screen.getByTestId('period-documents-p2'));
    expect(renderedPeriodOrder(container)).toEqual(['p2', 'p1', 'p3']);

    fireEvent.click(screen.getByTestId('period-row-expand-p2'));
    await waitFor(() => expect(screen.queryByTestId('period-documents-p2')).not.toBeInTheDocument());
    expect(renderedPeriodOrder(container)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('PeriodsExpandablePanel — shared table styling', () => {
  const P1 = { id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'O', 'status$_identifier': 'All Opened' };
  const P2 = { id: 'p2', name: 'Feb-27', startingDate: '2027-02-01', status: 'O', 'status$_identifier': 'All Opened' };

  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [P1, P2] } }) });
      if (url.includes('/documents')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC, DOC2] } }) });
      return Promise.reject(new Error('unexpected url ' + url));
    });
  });

  function periodRowFor(periodId) {
    return screen.getByTestId(`period-row-expand-${periodId}`)
      .closest('tr');
  }

  it('renders the established table headers and four-cell layout for collapsed period rows', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    const panel = screen.getByTestId('periods-expandable-panel');
    expect(panel.querySelector('table')).toBeInTheDocument();
    expect(panel.querySelector('thead')).toBeInTheDocument();
    expect(panel.querySelector('tbody')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      '',
      'Period',
      'Status',
      'Actions',
    ]);
    expect(periodRowFor('p1').querySelectorAll(':scope > td')).toHaveLength(4);
    expect(periodRowFor('p2').querySelectorAll(':scope > td')).toHaveLength(4);
    expect(periodRowFor('p1').className).toMatch(/hover:bg-muted/);
    expect(periodRowFor('p2').className).toMatch(/hover:bg-muted/);
  });

  it('uses the standard selected-row treatment for the expanded period', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p2'));
    await waitFor(() => screen.getByTestId('period-documents-p2'));

    const p2Row = periodRowFor('p2');
    expect(p2Row.className).toMatch(/\bbg-primary\b/);
    expect(p2Row.className).toMatch(/\bring-focus-ring\b/);
    expect(periodRowFor('p1').className).not.toMatch(/ring-focus-ring/);
  });

  // ETP-4972 — before this ticket, the bulk action bar was an in-flow
  // element rendered as a child of the period row's own markup, so it
  // inherited that row's DOM position/scroll behavior. It now renders
  // through the shared `SelectionToolbar`, which portals straight to
  // `document.body` with true viewport-fixed coordinates — it is no longer
  // a DOM descendant of the period row (`<tr>`) at all, and doesn't need to
  // be: it can never scroll away or be clipped regardless of where the
  // period row ends up in the table (ETP-4948's own Table conversion, see
  // `periodRowFor` above).
  it('renders the bulk action bar independently of the period row via the portaled SelectionToolbar', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
    fireEvent.click(screen.getByTestId('document-select-d1'));

    // The bar is NOT nested inside the period row...
    expect(periodRowFor('p1').querySelector('[data-testid="document-selection-count"]')).toBeNull();
    // ...it lives in SelectionToolbar's own portaled, fixed-position pill.
    const bar = screen.getByTestId('document-selection-count').closest('.selection-toolbar');
    expect(bar).toBeTruthy();
    expect(bar.closest('.fixed')).toBeTruthy();
  });

  it('renders expanded documents in a full-width table row below their period row', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));

    const documentsRow = screen.getByTestId('period-documents-p1');
    expect(documentsRow.tagName).toBe('TR');
    expect(documentsRow.querySelector(':scope > td[colspan="4"]')).toBeInTheDocument();
    expect(documentsRow).toHaveTextContent('AP Credit Memo');
  });

  it('moves the selected-row treatment to the newly expanded period', async () => {
    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('February 27'));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByTestId('period-documents-p1'));
    expect(periodRowFor('p1').className).toMatch(/ring-focus-ring/);

    fireEvent.click(screen.getByTestId('period-row-expand-p2'));
    await waitFor(() => screen.getByTestId('period-documents-p2'));
    expect(periodRowFor('p2').className).toMatch(/ring-focus-ring/);
    expect(periodRowFor('p1').className).not.toMatch(/ring-focus-ring/);
  });
});

describe('PeriodsExpandablePanel — Accept-Language header + real localization fix', () => {
  // Investigated BOTH hypotheses live, not assumed:
  //
  // 1. This panel's raw fetch()/postAction used to send no Accept-Language header at all,
  //    unlike useEntity.js's buildHeaders(). Live verification (real login, real network
  //    capture) showed that even WITH the header correctly sent as es_ES, periodControl/
  //    documents — served through NEO's generic DefaultJsonDataService (classic Openbravo
  //    datasource) — still returned English $_identifier values. The logged-in test user's own
  //    ad_user.default_ad_language (en_US in this DB) is the more likely actual authority for
  //    that datasource's identifier resolution, not the per-request header — so the header
  //    alone was never sufficient for this classic-datasource-backed path.
  // 2. So the real fix is client-side enumLabels — PERIOD_STATUS_LABEL_KEYS /
  //    DOCUMENT_STATUS_LABEL_KEYS / DOCUMENT_CATEGORY_LABEL_KEYS in PeriodsExpandablePanel.jsx
  //    — resolved via ui()/tMenu(), exactly like DataTable.cellRenderers.jsx's renderEnumCell()
  //    does everywhere else in the app. All three dictionaries were generated directly from
  //    the real AD_Ref_List/AD_Ref_List_Trl data already captured in
  //    artifacts/open-close-period-control/schema-raw.json — not hand-guessed.
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
  const DOC_ES = { id: 'd1', documentCategory: 'MMS', periodStatus: 'C' }; // ditto

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

  it('no longer builds an Accept-Language header itself on the documents fetch either', async () => {
    localStorage.setItem('schema-forge-locale', 'es_ES');
    const fetchSpy = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD_ES] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC_ES] } }) });
    });
    global.fetch = fetchSpy;

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('Entrega material'));

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/documents'),
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

  it('renders real Spanish labels for period status, document status, and document category when the locale is es_ES — even with no $_identifier field at all', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD_ES] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC_ES] } }) });
    });

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));

    const periodBadge = screen.getByTestId(`period-status-${PERIOD_ES.id}`).querySelector('[data-testid="tag"]');
    expect(periodBadge).toHaveTextContent('Mixto');
    expect(screen.queryByText('Mixed')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('Entrega material'));
    expect(screen.queryByText('MMS')).not.toBeInTheDocument();

    const docBadge = screen.getByTestId(`document-status-${DOC_ES.id}`).querySelector('[data-testid="tag"]');
    expect(docBadge).toHaveTextContent('Cerrado');
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
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

  it('renders the equivalent English labels under en_US, from the same code-keyed dictionaries', async () => {
    currentTestLocale = 'en_US';
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD_ES] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC_ES] } }) });
    });

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('January 27'));

    const periodBadge = screen.getByTestId(`period-status-${PERIOD_ES.id}`).querySelector('[data-testid="tag"]');
    expect(periodBadge).toHaveTextContent('Mixed');

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('Material Delivery'));
    const docBadge = screen.getByTestId(`document-status-${DOC_ES.id}`).querySelector('[data-testid="tag"]');
    expect(docBadge).toHaveTextContent('Closed');
  });

  it('falls back to the raw code if it is somehow not in the dictionary (e.g. a future/unknown code)', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [{ id: 'p1', name: 'Jan-27', startingDate: '2027-01-01', status: 'ZZZ' }] } }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    });

    render(<PeriodsExpandablePanel parentId="year1" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Enero 27'));

    const periodBadge = screen.getByTestId('period-status-p1').querySelector('[data-testid="tag"]');
    expect(periodBadge).toHaveTextContent('ZZZ');
  });
});

// ── ETP-5030 — selected-row shading ───────────────────────────────────────────
// GROUP A (Tailwind utility on the row element). Before the fix the document
// row had NO selection feedback at all — ticking its checkbox only moved the
// bulk-action bar, the row itself never changed.
//
// This row deliberately carries a background and nothing else: nothing behind it
// paints one (the `pl-8` list container and the outer `border-b` wrapper are
// transparent; the sticky `bg-card` is on the period header, a sibling above,
// not an ancestor), and the row has no hover background of its own. That is why
// the hover case below asserts the ABSENCE of any `hover:bg-*` utility — with
// nothing to repaint over it, the tint is unconditional and survives hover by
// construction. A `hover:bg-*` appearing here later would be the regression.
describe('PeriodsExpandablePanel — ETP-5030 selected-row shading', () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      }
      if (url.includes('/documents')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [DOC, DOC2, DOC3] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
  });

  /** The document row <div> that owns the given document checkbox. */
  const rowOf = (docId) => screen.getByTestId(`document-select-${docId}`).parentElement;

  async function renderExpandedDocuments() {
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Jan-2027'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByTestId('document-select-d1'));
  }

  it('tints ONLY the ticked document row and leaves the others untinted', async () => {
    await renderExpandedDocuments();

    fireEvent.click(screen.getByTestId('document-select-d1'));

    expect(backgroundUtilities(rowOf('d1'))).toEqual(['bg-primary/5']);
    // Negative half: the untouched rows must not have picked up the tint. They
    // keep their layout classes, so the row element is definitely still there.
    expect(backgroundUtilities(rowOf('d2'))).toEqual([]);
    expect(backgroundUtilities(rowOf('d3'))).toEqual([]);
    expect(rowOf('d2').className).toContain('flex items-center gap-2 py-1.5');
  });

  it('removes the tint when the document row is unticked', async () => {
    await renderExpandedDocuments();

    fireEvent.click(screen.getByTestId('document-select-d1'));
    expect(backgroundUtilities(rowOf('d1'))).toEqual(['bg-primary/5']);

    fireEvent.click(screen.getByTestId('document-select-d1'));
    expect(backgroundUtilities(rowOf('d1'))).toEqual([]);
  });

  it('keeps the tint under the pointer: the selected row declares no hover background that could repaint over it', async () => {
    await renderExpandedDocuments();

    fireEvent.click(screen.getByTestId('document-select-d1'));

    const row = rowOf('d1');
    // Exactly one background utility, and no `hover:bg-*` at all — so the tint
    // cannot be covered while the pointer is on the row, which is precisely
    // when the user clicks the checkbox and looks for feedback.
    expect(countBackgroundUtilities(row)).toBe(1);
    expect(hoverBackgroundUtilities(row)).toEqual([]);
  });

  it('drops the tint from every row when the selection is cleared from the bulk bar', async () => {
    await renderExpandedDocuments();

    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    expect(backgroundUtilities(rowOf('d1'))).toEqual(['bg-primary/5']);
    expect(backgroundUtilities(rowOf('d2'))).toEqual(['bg-primary/5']);

    // Collapsing the period clears the selection (existing behaviour), so the
    // tint must not survive a re-expand.
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByTestId('document-select-d1'));

    expect(backgroundUtilities(rowOf('d1'))).toEqual([]);
    expect(backgroundUtilities(rowOf('d2'))).toEqual([]);
  });
});
