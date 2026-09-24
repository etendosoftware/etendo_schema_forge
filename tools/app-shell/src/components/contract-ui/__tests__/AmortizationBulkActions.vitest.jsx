import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// ETP-5414 — behavioural tests for the amortization bulk "Confirmar"/"Reactivar" wrapper.
//
// The component lives under `artifacts/**`, which `vitest.config.js`'s
// `include: ['src/**/*.vitest.{js,jsx}']` never discovers — so the TEST lives here in
// `src/**` and reaches the component through the `@generated` alias (→ `../../artifacts`,
// declared in both vite.config.js and vitest.config.js). Same convention as
// `MatchedInvoiceBulkActions.vitest.jsx`.
//
// Unlike that sibling test, `BulkDocumentAction` is NOT mocked here: `rowFilter` does its
// own per-row line-validation fetch (the load-bearing bit — see the doc comment on
// `AmortizationBulkActions.jsx`), so the only way to prove the `ok`/`omitted`/`failed`
// shape really comes out right is to drive the real component tree end to end (button →
// dialog → confirm → `handleDone`'s per-row loop). What IS stubbed is everything
// `BulkDocumentAction` itself already has dedicated coverage for: the shadcn UI primitives,
// `useDocumentAction`/`useNeoAction` (the actual per-row action executors) and the lines
// fetch (`useApiFetch`).
//
// `vi.mock` factories are hoisted above every import, so any variable they reference must
// be declared through `vi.hoisted` — a plain `const` throws a TDZ ReferenceError (same
// gotcha documented in BulkDocumentAction.vitest.jsx).
const { UI_MESSAGES } = vi.hoisted(() => ({
  UI_MESSAGES: {
    processExecuted: '{ok} ok, {failed} failed',
    processExecutedWithOmitted: '{ok} ok, {omitted} omitted, {failed} failed',
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => UI_MESSAGES[key] ?? key,
}));

const { mockDocExecute } = vi.hoisted(() => ({ mockDocExecute: vi.fn() }));
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: mockDocExecute }),
}));

const { mockNeoExecute, mockUseNeoAction } = vi.hoisted(() => {
  const mockNeoExecute = vi.fn();
  const mockUseNeoAction = vi.fn(() => ({ execute: mockNeoExecute, loading: false }));
  return { mockNeoExecute, mockUseNeoAction };
});
vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: (...args) => mockUseNeoAction(...args),
}));

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

// ETP-5414 — unlike the sibling `BulkDocumentAction.vitest.jsx`, this Select mock actually
// wires `onValueChange`: with two actions offered (confirm + reactivate) simultaneously,
// `handleOpen` auto-selects only `actions[0]` ('confirm'), so exercising the 'reactivate'
// branch of `rowFilter` on a mixed selection requires a real way to pick the OTHER option.
vi.mock('@/components/ui/select.jsx', () => ({
  Select: ({ children, onValueChange }) => (
    <div
      data-testid="select"
      onClick={(e) => {
        const val = e.target?.getAttribute?.('value');
        if (val && onValueChange) onValueChange(val);
      }}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span>val</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

vi.mock('@/components/ui/label.jsx', () => ({
  Label: ({ children }) => <label>{children}</label>,
}));

const MOD = '@generated/amortization/custom/AmortizationBulkActions.jsx';
const { default: AmortizationBulkActions, buildAmortizationActions } = await import(MOD);
const { default: BulkDocumentAction } = await import('../BulkDocumentAction.jsx');

const STORAGE_KEY = 'bulkActionResult';
// ETP-5414 review — the top-level `labelKey` on `<BulkDocumentAction>` is "process" (drives
// the trigger button AND the dialog title). The per-action `labelKey` inside
// `buildAmortizationActions` is 'confirm' or 'reactivate' (drives only the dropdown option).
const BUTTON_LABEL = 'process';
const CONFIRM_BUTTON = 'accept';

const linesResponse = (lines) => ({
  ok: true,
  json: async () => ({ response: { data: lines } }),
});

const row = (id, name, processed = 'N', posted = 'N') => ({ id, name, processed, posted });

function mountAmortizationBulkActions(rows, extraProps = {}) {
  const clearSelection = vi.fn();
  render(
    <AmortizationBulkActions
      selectedRows={rows}
      clearSelection={clearSelection}
      token="tok"
      apiBaseUrl="/sws/neo/amortization"
      windowName="amortization"
      {...extraProps}
    />,
  );
  return { clearSelection };
}

// Drives the real component tree: opens the modal (the action is auto-selected —
// `handleOpen` sets `selectedAction = actions[0].value`) and confirms. Only correct when
// the desired action is the FIRST one `buildAmortizationActions` returns.
function openAndConfirm(rows, extraProps = {}) {
  const mounted = mountAmortizationBulkActions(rows, extraProps);
  fireEvent.click(screen.getByText(BUTTON_LABEL));
  fireEvent.click(screen.getByText(CONFIRM_BUTTON));
  return mounted;
}

// ETP-5414 — for a mixed selection where BOTH 'confirm' and 'reactivate' are offered,
// explicitly picks the requested option (by its label text, which under the identity-mocked
// `useUI` is the raw i18n key) before confirming.
function openSelectAndConfirm(rows, actionLabel, extraProps = {}) {
  const mounted = mountAmortizationBulkActions(rows, extraProps);
  fireEvent.click(screen.getByText(BUTTON_LABEL));
  const options = [...screen.getByTestId('select').querySelectorAll('option')];
  const option = options.find((o) => o.textContent === actionLabel);
  if (!option) throw new Error(`No "${actionLabel}" option rendered — options were: ${options.map((o) => o.textContent)}`);
  fireEvent.click(option);
  fireEvent.click(screen.getByText(CONFIRM_BUTTON));
  return mounted;
}

async function readPersistedResult() {
  await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());
  return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mockNeoExecute.mockReset();
  mockNeoExecute.mockResolvedValue({ success: true });
  mockDocExecute.mockReset();
  mockApiFetch.mockReset();
  // Fallback path (no `refresh` prop passed by these tests): handleDone arms a
  // setTimeout → window.location.reload(). jsdom throws "Not implemented: navigation"
  // without this stub — same pattern BulkDocumentAction.vitest.jsx uses.
  Object.defineProperty(window, 'location', {
    value: { reload: vi.fn() },
    writable: true,
    configurable: true,
  });
});

describe('buildAmortizationActions — which dropdown actions are offered', () => {
  it('offers ONLY confirm when at least one row is not yet confirmed and none are confirmed', () => {
    const rows = [row('r1', 'A', 'N'), row('r2', 'B', 'N')];
    expect(buildAmortizationActions(rows)).toEqual([
      { value: 'confirm', neoActionName: 'Processed', labelKey: 'confirm' },
    ]);
  });

  it('offers ONLY reactivate when every row is already confirmed', () => {
    const rows = [row('r1', 'A', 'Y'), row('r2', 'B', 'Y')];
    expect(buildAmortizationActions(rows)).toEqual([
      { value: 'reactivate', neoActionName: 'Processed', labelKey: 'reactivate' },
    ]);
  });

  it('offers BOTH confirm and reactivate, confirm first, for a mixed selection', () => {
    const rows = [row('r1', 'A', 'N'), row('r2', 'B', 'Y')];
    expect(buildAmortizationActions(rows)).toEqual([
      { value: 'confirm', neoActionName: 'Processed', labelKey: 'confirm' },
      { value: 'reactivate', neoActionName: 'Processed', labelKey: 'reactivate' },
    ]);
  });

  it('treats a real boolean true as confirmed too (both isConfirmed call sites)', () => {
    expect(buildAmortizationActions([{ id: 'r1', name: 'A', processed: true }])).toEqual([
      { value: 'reactivate', neoActionName: 'Processed', labelKey: 'reactivate' },
    ]);
    expect(buildAmortizationActions([
      { id: 'r1', name: 'A', processed: true },
      { id: 'r2', name: 'B', processed: 'N' },
    ])).toEqual([
      { value: 'confirm', neoActionName: 'Processed', labelKey: 'confirm' },
      { value: 'reactivate', neoActionName: 'Processed', labelKey: 'reactivate' },
    ]);
  });

  it('returns empty array for an empty selection (button stays hidden)', () => {
    expect(buildAmortizationActions([])).toEqual([]);
  });
});

describe('AmortizationBulkActions — wiring into BulkDocumentAction', () => {
  it('renders the button under the "process" label (top-level labelKey)', () => {
    render(
      <AmortizationBulkActions
        selectedRows={[row('r1', 'A', 'N')]}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/sws/neo/amortization"
        windowName="amortization"
      />,
    );
    expect(screen.getByText(BUTTON_LABEL)).toBeInTheDocument();
  });

  it('targets entity="header" in neoAction mode — never the DocAction endpoint', async () => {
    mockApiFetch.mockResolvedValueOnce(linesResponse([{ amortizationPercentage: 10, amortizationAmount: 100 }]));
    openAndConfirm([row('r1', 'A', 'N')]);
    await readPersistedResult();
    expect(mockUseNeoAction).toHaveBeenCalledWith(
      expect.objectContaining({ entityName: 'header' }),
    );
    expect(mockDocExecute).not.toHaveBeenCalled();
  });

  it('renders BOTH Confirmar and Reactivar options for a mixed selection (ETP-5414)', () => {
    mountAmortizationBulkActions([row('r1', 'A', 'N'), row('r2', 'B', 'Y')]);
    fireEvent.click(screen.getByText(BUTTON_LABEL));

    const options = [...screen.getByTestId('select').querySelectorAll('option')];
    expect(options.map((o) => o.textContent)).toEqual(['confirm', 'reactivate']);
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['confirm', 'reactivate']);
  });
});

describe('AmortizationBulkActions — rowFilter "confirm" branch (ETP-5414)', () => {
  it('an already-confirmed row is omitted WITHOUT ever calling the lines fetch for it', async () => {
    // A lone confirmed row would make buildAmortizationActions() return only 'reactivate'
    // and the confirm branch would never run — a companion unconfirmed row makes 'confirm'
    // the first (auto-selected) action.
    mockApiFetch.mockResolvedValueOnce(linesResponse([{ amortizationPercentage: 10, amortizationAmount: 100 }]));
    const rows = [row('r-confirmed', 'Amort Confirmed', 'Y'), row('r-trigger', 'Amort Trigger', 'N')];
    openAndConfirm(rows);

    const result = await readPersistedResult();
    expect(result.omitted).toContainEqual({ documentNo: 'Amort Confirmed', message: 'amortizationBulkAlreadyConfirmed' });
    expect(result.ok).toBe(1);
    expect(result.failed).toEqual([]);

    for (const call of mockApiFetch.mock.calls) {
      expect(call[0]).not.toContain('r-confirmed');
    }
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('parentId=r-trigger'));
  });

  it('a row with zero lines is omitted with amortizationBulkNoLines', async () => {
    mockApiFetch.mockResolvedValueOnce(linesResponse([]));
    openAndConfirm([row('r1', 'Amort R1', 'N')]);

    const result = await readPersistedResult();
    expect(result).toEqual({
      ok: 0,
      omitted: [{ documentNo: 'Amort R1', message: 'amortizationBulkNoLines' }],
      failed: [],
    });
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('/lines?parentId=r1'));
  });

  it('a line with a null amortizationPercentage is omitted with amortizationErrorLinePercentageMissing', async () => {
    mockApiFetch.mockResolvedValueOnce(linesResponse([{ amortizationPercentage: null, amortizationAmount: 50 }]));
    openAndConfirm([row('r1', 'Amort R1', 'N')]);

    const result = await readPersistedResult();
    expect(result.omitted).toEqual([{ documentNo: 'Amort R1', message: 'amortizationErrorLinePercentageMissing' }]);
  });

  it('a line with an empty-string amortizationPercentage is also omitted', async () => {
    mockApiFetch.mockResolvedValueOnce(linesResponse([{ amortizationPercentage: '', amortizationAmount: 50 }]));
    openAndConfirm([row('r1', 'Amort R1', 'N')]);

    const result = await readPersistedResult();
    expect(result.omitted).toEqual([{ documentNo: 'Amort R1', message: 'amortizationErrorLinePercentageMissing' }]);
  });

  it('a line with amortizationAmount <= 0 is omitted with amortizationErrorLineAmountInvalid', async () => {
    mockApiFetch.mockResolvedValueOnce(linesResponse([{ amortizationPercentage: 10, amortizationAmount: 0 }]));
    openAndConfirm([row('r1', 'Amort R1', 'N')]);

    const result = await readPersistedResult();
    expect(result.omitted).toEqual([{ documentNo: 'Amort R1', message: 'amortizationErrorLineAmountInvalid' }]);
  });

  it('a negative amortizationAmount is also invalid', async () => {
    mockApiFetch.mockResolvedValueOnce(linesResponse([{ amortizationPercentage: 10, amortizationAmount: -5 }]));
    openAndConfirm([row('r1', 'Amort R1', 'N')]);

    const result = await readPersistedResult();
    expect(result.omitted).toEqual([{ documentNo: 'Amort R1', message: 'amortizationErrorLineAmountInvalid' }]);
  });

  it('a row with valid lines is NOT omitted and reaches the action call', async () => {
    mockApiFetch.mockResolvedValueOnce(linesResponse([{ amortizationPercentage: 10, amortizationAmount: 100 }]));
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    openAndConfirm([row('r1', 'Amort R1', 'N')]);

    const result = await readPersistedResult();
    expect(result).toEqual({ ok: 1, omitted: [], failed: [] });
    expect(mockNeoExecute).toHaveBeenCalledWith('r1', 'Processed');
  });

  it('a lines-fetch failure is treated as "could not validate" (amortizationBulkValidationFailed, NOT the no-lines key), and does NOT abort the other row in the batch', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url.includes('r-fail')) throw new Error('network down');
      return linesResponse([{ amortizationPercentage: 5, amortizationAmount: 20 }]);
    });
    const rows = [row('r-fail', 'Amort Fail', 'N'), row('r-ok', 'Amort Ok', 'N')];
    openAndConfirm(rows);

    const result = await readPersistedResult();
    // ETP-5414 review — a fetch/parse failure is a DIFFERENT fact from a document that
    // genuinely has zero lines, and must carry its own key, not amortizationBulkNoLines.
    expect(result.omitted).toEqual([{ documentNo: 'Amort Fail', message: 'amortizationBulkValidationFailed' }]);
    expect(result.ok).toBe(1);
    expect(result.failed).toEqual([]);
    expect(mockNeoExecute).toHaveBeenCalledWith('r-ok', 'Processed');
  });

  it('a mixed selection (1 valid, 1 already-confirmed, 1 no-lines) produces the correct ok/omitted/failed shape', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url.includes('r-valid')) return linesResponse([{ amortizationPercentage: 10, amortizationAmount: 100 }]);
      if (url.includes('r-nolines')) return linesResponse([]);
      throw new Error(`unexpected url ${url}`);
    });
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    const rows = [
      row('r-valid', 'Amort Valid', 'N'),
      row('r-confirmed', 'Amort Confirmed', 'Y'),
      row('r-nolines', 'Amort NoLines', 'N'),
    ];
    openAndConfirm(rows);

    const result = await readPersistedResult();
    expect(result.ok).toBe(1);
    expect(result.failed).toEqual([]);
    expect(result.omitted).toHaveLength(2);
    expect(result.omitted).toContainEqual({ documentNo: 'Amort Confirmed', message: 'amortizationBulkAlreadyConfirmed' });
    expect(result.omitted).toContainEqual({ documentNo: 'Amort NoLines', message: 'amortizationBulkNoLines' });
    expect(mockNeoExecute).toHaveBeenCalledWith('r-valid', 'Processed');
    expect(mockNeoExecute).toHaveBeenCalledTimes(1);
  });

  it('the toast/result row label uses row.name, not the raw id — including for a failed action call', async () => {
    mockApiFetch.mockResolvedValueOnce(linesResponse([{ amortizationPercentage: 10, amortizationAmount: 100 }]));
    mockNeoExecute.mockResolvedValueOnce({ success: false, message: 'boom' });
    openAndConfirm([row('a1b2c3', 'Amortización Enero', 'N')]);

    const result = await readPersistedResult();
    expect(result.failed).toEqual([{ documentNo: 'Amortización Enero', message: 'boom' }]);
  });
});

// ETP-5414 — the new "Reactivar" branch. Unlike 'confirm', it makes NO lines fetch at all
// (see the docblock in AmortizationBulkActions.jsx): every test here asserts `mockApiFetch`
// was never called, on top of the omitted/ok classification.
describe('AmortizationBulkActions — rowFilter "reactivate" branch (ETP-5414)', () => {
  it('a confirmed, non-posted row is eligible: reaches the action call with NO lines fetch and NO unpost call', async () => {
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    // A lone confirmed+not-posted row makes buildAmortizationActions() return ONLY
    // 'reactivate' — it is auto-selected as actions[0], no explicit select needed.
    openAndConfirm([row('r1', 'Amort R1', 'Y', 'N')]);

    const result = await readPersistedResult();
    expect(result).toEqual({ ok: 1, omitted: [], failed: [] });
    expect(mockNeoExecute).toHaveBeenCalledWith('r1', 'Processed');
    // `runPreUnpost` short-circuits on `!isPosted(record)` — the ONLY neoAction call for
    // this row is the main 'Processed' one, never 'unpost'.
    expect(mockNeoExecute).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  // ETP-5414 reversal — a posted row is no longer pre-blocked by `rowFilter` at all (the
  // `isPosted` check and its `amortizationBulkPosted` key were removed entirely from
  // AmortizationBulkActions.jsx). It is eligible exactly like any other confirmed row; what
  // happens to its accounting is decided at EXECUTION time by `preUnpostActions`, covered in
  // the dedicated "unpost-then-reactivate execution flow" describe block below.
  it('a confirmed, ALREADY-posted row is NO LONGER omitted by rowFilter — it is eligible with NO lines fetch', async () => {
    // Also a lone row: confirmed+posted still makes 'reactivate' the only (and thus
    // auto-selected) action.
    mockNeoExecute.mockResolvedValue({ success: true });
    openAndConfirm([row('r1', 'Amort Posted', 'Y', 'Y')]);

    const result = await readPersistedResult();
    expect(result).toEqual({ ok: 1, omitted: [], failed: [] });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('a NOT-confirmed row is omitted with amortizationBulkNotConfirmed when reactivate is explicitly chosen, with NO lines fetch', async () => {
    // Needs a companion confirmed row so 'reactivate' is even offered; 'confirm' is
    // offered too (and would be auto-selected), so this explicitly picks 'reactivate'.
    const rows = [row('r-notconfirmed', 'Amort NotConfirmed', 'N', 'N'), row('r-confirmed', 'Amort Confirmed', 'Y', 'N')];
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    openSelectAndConfirm(rows, 'reactivate');

    const result = await readPersistedResult();
    expect(result.omitted).toEqual([{ documentNo: 'Amort NotConfirmed', message: 'amortizationBulkNotConfirmed' }]);
    expect(result.ok).toBe(1);
    expect(result.failed).toEqual([]);
    expect(mockNeoExecute).toHaveBeenCalledWith('r-confirmed', 'Processed');
    expect(mockNeoExecute).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  // ETP-5414 reversal — only the not-confirmed row is omitted now. The posted row is
  // eligible and reaches execution (unpost then reactivate) — see below for the
  // ok/failed split on the posted row's OWN outcome.
  it('a mixed-eligibility reactivate batch (ok / not-confirmed / posted) produces the correct ok/omitted counts with NO lines fetch at all', async () => {
    mockNeoExecute.mockResolvedValue({ success: true });
    const rows = [
      row('r-ok', 'Amort OK', 'Y', 'N'),
      row('r-notconf', 'Amort NotConf', 'N', 'N'),
      row('r-posted', 'Amort Posted', 'Y', 'Y'),
    ];
    // Confirm is also offered (r-notconf is unconfirmed) and would be auto-selected —
    // explicitly select reactivate instead.
    openSelectAndConfirm(rows, 'reactivate');

    const result = await readPersistedResult();
    expect(result.ok).toBe(2);
    expect(result.failed).toEqual([]);
    expect(result.omitted).toEqual([{ documentNo: 'Amort NotConf', message: 'amortizationBulkNotConfirmed' }]);
    expect(mockNeoExecute).toHaveBeenCalledWith('r-ok', 'Processed');
    expect(mockNeoExecute).toHaveBeenCalledWith('r-posted', 'unpost');
    expect(mockNeoExecute).toHaveBeenCalledWith('r-posted', 'Processed');
    // r-ok: 1 call (Processed only, not posted). r-posted: 2 calls (unpost + Processed).
    expect(mockNeoExecute).toHaveBeenCalledTimes(3);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ETP-5414 — the unpost-then-reactivate execution flow itself, per the file's top docblock:
// `preUnpostActions={['reactivate']}` makes `runRow` call `neoAction.execute(id, 'unpost')`
// before the main `Processed` call for any POSTED row selected for reactivate (via
// `runPreUnpost` in `lib/preUnpost.js`). This is deliberately exercised through the real
// mounted `BulkDocumentAction` (not a `rowFilter`-only unit test) because the interesting
// behaviour lives in `runRow`, not in `rowFilter` — `rowFilter` no longer knows about
// `posted` at all.
describe('AmortizationBulkActions — unpost-then-reactivate execution flow (ETP-5414)', () => {
  it('a posted row: unpost succeeds, then Processed runs, in that order — row ends up ok', async () => {
    mockNeoExecute.mockResolvedValue({ success: true });
    openAndConfirm([row('r1', 'Amort Posted', 'Y', 'Y')]);

    const result = await readPersistedResult();
    expect(result).toEqual({ ok: 1, omitted: [], failed: [] });
    // Both calls go through the same mock, so array order IS call order: unpost first.
    expect(mockNeoExecute.mock.calls).toEqual([
      ['r1', 'unpost'],
      ['r1', 'Processed'],
    ]);
  });

  it('a posted row whose unpost FAILS lands in failed with the server message — Processed is never called', async () => {
    mockNeoExecute.mockImplementation(async (id, actionName) => {
      if (actionName === 'unpost') return { success: false, message: 'accounting settled' };
      return { success: true };
    });
    openAndConfirm([row('r1', 'Amort Posted', 'Y', 'Y')]);

    const result = await readPersistedResult();
    expect(result.ok).toBe(0);
    expect(result.omitted).toEqual([]);
    expect(result.failed).toEqual([{ documentNo: 'Amort Posted', message: 'accounting settled' }]);
    expect(mockNeoExecute).toHaveBeenCalledWith('r1', 'unpost');
    expect(mockNeoExecute).not.toHaveBeenCalledWith('r1', 'Processed');
    expect(mockNeoExecute).toHaveBeenCalledTimes(1);
  });

  it('one posted row failing its unpost does NOT abort a sibling not-posted row\'s success in the same batch', async () => {
    mockNeoExecute.mockImplementation(async (id, actionName) => {
      if (id === 'r-posted-fail' && actionName === 'unpost') {
        return { success: false, message: 'cannot unpost' };
      }
      return { success: true };
    });
    const rows = [
      row('r-posted-fail', 'Amort PostedFail', 'Y', 'Y'),
      row('r-notposted-ok', 'Amort NotPostedOk', 'Y', 'N'),
    ];
    openAndConfirm(rows);

    const result = await readPersistedResult();
    expect(result.ok).toBe(1);
    expect(result.omitted).toEqual([]);
    expect(result.failed).toEqual([{ documentNo: 'Amort PostedFail', message: 'cannot unpost' }]);
    expect(mockNeoExecute).toHaveBeenCalledWith('r-posted-fail', 'unpost');
    expect(mockNeoExecute).not.toHaveBeenCalledWith('r-posted-fail', 'Processed');
    expect(mockNeoExecute).toHaveBeenCalledWith('r-notposted-ok', 'Processed');
    expect(mockNeoExecute).not.toHaveBeenCalledWith('r-notposted-ok', 'unpost');
  });
});

// ETP-5414 — the new second bulk button, "Contabilizar" (post). It reuses
// `buildPostActions`/`postRowFilter` from `BulkDocumentAction.jsx` VERBATIM (see the file's
// top docblock) — these tests prove THIS window's wiring (a second, unmodified
// `<BulkDocumentAction>` instance) reaches those generic exports correctly, not re-test the
// generic pair itself (already covered by BulkDocumentAction's own suite and by
// sales-invoice/purchase-invoice, which use the exact same pair). Both `<BulkDocumentAction>`
// instances render `ui(labelKey)` as their trigger text ('process' vs 'post' under the
// identity-mocked `useUI`), so `screen.getByText('post')` unambiguously targets the second
// instance without any extra disambiguation.
describe('AmortizationBulkActions — bulk "Contabilizar" (post) button (ETP-5414)', () => {
  it('renders a "post" button distinct from the "process" button when a row is processed and not posted', () => {
    mountAmortizationBulkActions([row('r1', 'Amort R1', 'Y', 'N')]);
    expect(screen.getByText('post')).toBeInTheDocument();
    // The confirm/reactivate button (top-level labelKey 'process') offers only 'reactivate'
    // for this row (processed:'Y') but still renders — proves the two are independent mounts.
    expect(screen.getByText('process')).toBeInTheDocument();
  });

  it('does NOT render the post button when no row in the selection is eligible for it (mirrors buildPostActions\' own empty-array case)', () => {
    // Not processed and not posted — ineligible for post under postRowFilter/buildPostActions.
    mountAmortizationBulkActions([row('r1', 'Amort R1', 'N', 'N')]);
    expect(screen.queryByText('post')).not.toBeInTheDocument();
  });

  it('a processed, not-posted row is eligible: reaches the "post" action call', async () => {
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    mountAmortizationBulkActions([row('r1', 'Amort R1', 'Y', 'N')]);
    fireEvent.click(screen.getByText('post'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    const result = await readPersistedResult();
    expect(result).toEqual({ ok: 1, omitted: [], failed: [] });
    expect(mockNeoExecute).toHaveBeenCalledWith('r1', 'post');
  });

  it('an already-posted row is omitted with bulkRowAlreadyPosted', async () => {
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    // A companion eligible row keeps the "post" button offered/auto-selectable.
    const rows = [row('r-posted', 'Amort Posted', 'Y', 'Y'), row('r-eligible', 'Amort Eligible', 'Y', 'N')];
    mountAmortizationBulkActions(rows);
    fireEvent.click(screen.getByText('post'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    const result = await readPersistedResult();
    expect(result.omitted).toEqual([{ documentNo: 'Amort Posted', message: 'bulkRowAlreadyPosted' }]);
    expect(result.ok).toBe(1);
    expect(result.failed).toEqual([]);
    expect(mockNeoExecute).toHaveBeenCalledWith('r-eligible', 'post');
    expect(mockNeoExecute).toHaveBeenCalledTimes(1);
  });

  it('a not-yet-processed row is omitted with bulkRowNotCompleted', async () => {
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    const rows = [row('r-unprocessed', 'Amort Unprocessed', 'N', 'N'), row('r-eligible', 'Amort Eligible', 'Y', 'N')];
    mountAmortizationBulkActions(rows);
    fireEvent.click(screen.getByText('post'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    const result = await readPersistedResult();
    expect(result.omitted).toEqual([{ documentNo: 'Amort Unprocessed', message: 'bulkRowNotCompleted' }]);
    expect(result.ok).toBe(1);
    expect(mockNeoExecute).toHaveBeenCalledWith('r-eligible', 'post');
    expect(mockNeoExecute).toHaveBeenCalledTimes(1);
  });

  it('uses row.name (not id) as the label for an omitted post row', async () => {
    mockNeoExecute.mockResolvedValueOnce({ success: true });
    const rows = [row('r-posted-id', 'Amortización Posteada', 'Y', 'Y'), row('r-eligible', 'Amort Eligible', 'Y', 'N')];
    mountAmortizationBulkActions(rows);
    fireEvent.click(screen.getByText('post'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    const result = await readPersistedResult();
    expect(result.omitted).toContainEqual({ documentNo: 'Amortización Posteada', message: 'bulkRowAlreadyPosted' });
  });

  it('uses row.name (not id) as the label for a FAILED post action call', async () => {
    mockNeoExecute.mockResolvedValueOnce({ success: false, message: 'accounting error' });
    mountAmortizationBulkActions([row('a1b2c3', 'Amortización Febrero', 'Y', 'N')]);
    fireEvent.click(screen.getByText('post'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    const result = await readPersistedResult();
    expect(result.failed).toEqual([{ documentNo: 'Amortización Febrero', message: 'accounting error' }]);
  });
});

// ETP-5414 — proves the Fragment wrap around the two `<BulkDocumentAction>` instances didn't
// accidentally couple them: both render off the SAME `selectedRows`, but each computes its
// own `buildActions`/`rowFilter` independently.
describe('AmortizationBulkActions — process and post buttons coexist (ETP-5414)', () => {
  it('both "process" and "post" buttons render simultaneously for a mixed selection, and the post button executes independently of confirm/reactivate', async () => {
    mockNeoExecute.mockResolvedValue({ success: true });
    const rows = [
      row('r-unconfirmed', 'Amort Unconfirmed', 'N', 'N'), // eligible for confirm only
      row('r-confirmed-unposted', 'Amort ConfirmedUnposted', 'Y', 'N'), // eligible for reactivate AND post
    ];
    mountAmortizationBulkActions(rows);

    expect(screen.getByText('process')).toBeInTheDocument();
    expect(screen.getByText('post')).toBeInTheDocument();

    // Run ONLY the post button: the unconfirmed row is not processed at all, so it's
    // omitted under postRowFilter — while the confirm/reactivate button (never clicked in
    // this test) is left untouched, proving the post mount's own eligibility computation
    // (and its own `neoAction`/execution) is unaffected by the sibling mount.
    fireEvent.click(screen.getByText('post'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    const result = await readPersistedResult();
    expect(result.ok).toBe(1);
    expect(result.omitted).toEqual([{ documentNo: 'Amort Unconfirmed', message: 'bulkRowNotCompleted' }]);
    expect(mockNeoExecute).toHaveBeenCalledWith('r-confirmed-unposted', 'post');
    expect(mockNeoExecute).not.toHaveBeenCalledWith('r-confirmed-unposted', 'Processed');
  });
});

// Item 10 — regression guard for BulkDocumentAction.jsx's generic `Promise.resolve(rowFilter(...))`
// wrap. The pre-existing tests in BulkDocumentAction.test.js/.vitest.jsx already prove every
// EXISTING sync rowFilter (post/unpost/reactivate) is unaffected; this is one extra, minimal,
// in-file check that a plain sync rowFilter still works through the real (unmocked) component.
describe('BulkDocumentAction — sync rowFilter still works after the async Promise.resolve wrap', () => {
  it('a trivial sync rowFilter (`() => true`) still lets every row through', async () => {
    render(
      <BulkDocumentAction
        selectedRows={[{ id: 'r1', documentStatus: 'DR' }]}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        rowFilter={() => true}
      />,
    );
    fireEvent.click(screen.getByText('bulkCompletion'));
    fireEvent.click(screen.getByText(CONFIRM_BUTTON));

    const result = await readPersistedResult();
    expect(result).toEqual({ ok: 1, omitted: [], failed: [] });
  });
});
