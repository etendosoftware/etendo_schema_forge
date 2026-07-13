import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

    let resolvePost;
    const postSpy = vi.fn(() => new Promise((resolve) => { resolvePost = resolve; }));
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
    let resolvePost;
    const postSpy = vi.fn(() => new Promise((resolve) => { resolvePost = resolve; }));
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
