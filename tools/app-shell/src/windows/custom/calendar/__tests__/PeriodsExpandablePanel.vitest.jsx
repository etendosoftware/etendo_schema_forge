import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

function selectOpenCloseOption(value) {
  fireEvent.change(screen.getByTestId('select-control'), { target: { value } });
}

const PERIOD = { id: 'p1', name: 'Jan-2027', status: 'O', 'status$_identifier': 'All Opened', periodNo: 1 };
const DOC = {
  id: 'd1',
  documentCategory: 'API',
  'documentCategory$_identifier': 'AP Credit Memo',
  periodStatus: 'O',
  'periodStatus$_identifier': 'Open',
};
const DOC2 = {
  id: 'd2',
  documentCategory: 'ARI',
  'documentCategory$_identifier': 'AR Invoice',
  periodStatus: 'O',
  'periodStatus$_identifier': 'Open',
};
const DOC3 = {
  id: 'd3',
  documentCategory: 'MMS',
  'documentCategory$_identifier': 'Material Receipt',
  periodStatus: 'O',
  'periodStatus$_identifier': 'Open',
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
        token="tok"
        apiBaseUrl="https://api.test"
        data-testid="PeriodsExpandablePanel__test" />
    );
    await waitFor(() => expect(screen.getByText('Jan-2027')).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/documents'), expect.anything());

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));

    await waitFor(() => expect(screen.getByText('AP Credit Memo')).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/documents?parentId=p1'), expect.anything());
  });

  it('renders period status as a colored badge with the translated label, not the raw code', async () => {
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p11" />);
    await waitFor(() => screen.getByText('Jan-2027'));

    const badge = screen.getByTestId(`period-status-${PERIOD.id}`).querySelector('[data-testid="tag"]');
    expect(badge).toHaveAttribute('data-variant', 'green'); // status "O" -> green per enumVariants
    expect(badge).toHaveTextContent('All Opened');
    expect(screen.queryByText('O')).not.toBeInTheDocument();
  });

  it('renders document type + status as a readable label and colored badge, not raw codes', async () => {
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p12" />);
    await waitFor(() => screen.getByText('Jan-2027'));
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
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [{ id: 'p1', name: 'Jan-2027', status: 'M' }] } }) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    });
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p13" />);
    await waitFor(() => screen.getByText('Jan-2027'));

    const badge = screen.getByTestId('period-status-p1').querySelector('[data-testid="tag"]');
    expect(badge).toHaveAttribute('data-variant', 'orange'); // status "M" -> orange per enumVariants
    expect(badge).toHaveTextContent('M');
  });

  it('scopes the periodControl fetch to the year via the classic Openbravo criteria param, not ?year=', async () => {
    // periodControl's LIST goes through NEO's generic DefaultJsonDataService, which silently
    // ignores an arbitrary `?year=<id>` query param (confirmed live — it returned every period
    // across every year, unfiltered). The real mechanism is the `criteria` JSON-array param.
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p10" />);
    await waitFor(() => screen.getByText('Jan-2027'));

    const expectedCriteria = encodeURIComponent(JSON.stringify([{ fieldName: 'year', operator: 'equals', value: 'year1' }]));
    expect(global.fetch).toHaveBeenCalledWith(
      `https://api.test/periodControl?criteria=${expectedCriteria}`,
      expect.anything()
    );
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/periodControl?year='), expect.anything());
  });

  it('opens the ProcessParamDialog (not an immediate POST) when Abrir/Cerrar Periodo is clicked', async () => {
    const postSpy = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p2" />);
    await waitFor(() => screen.getByText('Jan-2027'));
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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p2" />);
    await waitFor(() => screen.getByText('Jan-2027'));
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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p3" />);
    await waitFor(() => screen.getByText('Jan-2027'));
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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p3" />);
    await waitFor(() => screen.getByText('Jan-2027'));
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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p14" />);
    await waitFor(() => screen.getByText('Jan-2027'));
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
      expect(badge).toHaveAttribute('data-variant', 'neutral'); // status "C" -> neutral per enumVariants
    });
    // The panel itself must never have been torn down for a full reload — it stayed mounted
    // and showed the (stale, then updated) row the whole time, no top-level loading state again.
    expect(screen.queryByTestId('periods-expandable-panel-loading')).not.toBeInTheDocument();
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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p15" />);
    await waitFor(() => screen.getByText('Jan-2027'));
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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p3b" />);
    await waitFor(() => screen.getByText('Jan-2027'));
    global.fetch = postSpy;

    fireEvent.click(screen.getByTestId('period-openclose-p1'));
    fireEvent.click(screen.getByTestId('process-param-cancel'));

    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('collapses the period row again on a second click without re-fetching documents', async () => {
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p4" />);
    await waitFor(() => screen.getByText('Jan-2027'));

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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p5" />);
    expect(screen.getByTestId('periods-expandable-panel-loading')).toBeInTheDocument();
  });

  it('shows an error state (not stuck loading, not the panel) when periodControl fails', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p6" />);
    await waitFor(() => expect(screen.getByTestId('periods-expandable-panel-error')).toBeInTheDocument());
    expect(screen.queryByTestId('periods-expandable-panel')).not.toBeInTheDocument();
  });

  it('shows an inline error under the expanded period when the documents fetch fails', async () => {
    global.fetch = vi.fn((url) => {
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      if (url.includes('/documents')) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      return Promise.reject(new Error('unexpected'));
    });
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p7" />);
    await waitFor(() => screen.getByText('Jan-2027'));

    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => expect(screen.getByTestId('period-documents-error-p1')).toBeInTheDocument());
  });

  it('shows a toast and re-enables the button when Abrir/Cerrar Periodo fails', async () => {
    global.fetch = vi.fn((url, opts) => {
      if (opts?.method === 'POST') return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      if (url.includes('/periodControl')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [PERIOD] } }) });
      return Promise.reject(new Error('unexpected'));
    });
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p8" />);
    await waitFor(() => screen.getByText('Jan-2027'));

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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p9" />);
    await waitFor(() => screen.getByText('Jan-2027'));

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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid="p9b" />);
    await waitFor(() => screen.getByText('Jan-2027'));
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
    render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" data-testid={testId} />);
    await waitFor(() => screen.getByText('Jan-2027'));
    fireEvent.click(screen.getByTestId('period-row-expand-p1'));
    await waitFor(() => screen.getByText('AP Credit Memo'));
  }

  it('shows no bulk action bar until at least one document row is selected', async () => {
    await renderExpanded('b1');
    expect(screen.queryByTestId('document-bulk-bar-p1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('document-select-d1'));
    expect(screen.getByTestId('document-bulk-bar-p1')).toBeInTheDocument();
    // The count suffix on the bulk button is a raw JSX literal (not routed through ui()), so
    // it's a reliable assertion target regardless of whether a LocaleProvider is present —
    // unlike `document-selection-count`, whose text comes entirely from ui('selected'), which
    // falls back to the untranslated key (no {count} substitution) without a real dictionary.
    expect(screen.getByTestId('document-bulk-openclose-p1')).toHaveTextContent('(1)');
  });

  it('tracks multiple selected rows and shows the correct count', async () => {
    await renderExpanded('b2');
    fireEvent.click(screen.getByTestId('document-select-d1'));
    fireEvent.click(screen.getByTestId('document-select-d2'));
    fireEvent.click(screen.getByTestId('document-select-d3'));

    expect(screen.getByTestId('document-bulk-openclose-p1')).toHaveTextContent('(3)');

    // Unselecting one drops the count back down, not to zero.
    fireEvent.click(screen.getByTestId('document-select-d2'));
    expect(screen.getByTestId('document-bulk-openclose-p1')).toHaveTextContent('(2)');
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
  const P1 = { id: 'p1', name: 'Jan-2027', status: 'O', 'status$_identifier': 'All Opened' };
  const P2 = { id: 'p2', name: 'Feb-2027', status: 'O', 'status$_identifier': 'All Opened' };
  const P3 = { id: 'p3', name: 'Mar-2027', status: 'O', 'status$_identifier': 'All Opened' };

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
    const { container } = render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Feb-2027'));
    expect(renderedPeriodOrder(container)).toEqual(['p1', 'p2', 'p3']);
  });

  it('moves a non-first period to the top of the list once it is expanded', async () => {
    const { container } = render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Feb-2027'));

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
    const { container } = render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Feb-2027'));

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
    const { container } = render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Feb-2027'));

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
    const { container } = render(<PeriodsExpandablePanel parentId="year1" token="tok" apiBaseUrl="https://api.test" />);
    await waitFor(() => screen.getByText('Feb-2027'));

    fireEvent.click(screen.getByTestId('period-row-expand-p2'));
    await waitFor(() => screen.getByTestId('period-documents-p2'));
    expect(renderedPeriodOrder(container)).toEqual(['p2', 'p1', 'p3']);

    fireEvent.click(screen.getByTestId('period-row-expand-p2'));
    await waitFor(() => expect(screen.queryByTestId('period-documents-p2')).not.toBeInTheDocument());
    expect(renderedPeriodOrder(container)).toEqual(['p1', 'p2', 'p3']);
  });
});
