// ETP-5255 regression — the Modelo 303 manualData autosave must save SINGLE-FLIGHT.
//
// The bug: the debounced autosave of `identChecks`/`manualOverrides` cleared its pending TIMER
// on every re-run but never guarded the REQUEST. When a PUT outlived the 800 ms debounce and
// the user kept editing, a second PUT went out while the first was still open.
//
// What makes this window's version worse than the sibling cases in the same ticket:
// `FiscalDeclCrudHandler#handleDeclPut` bypasses the generic service and never compares
// `updated`, so overlapping writes here raise no 409 at all — the later one silently overwrites
// the earlier. There is therefore no error on screen, no error in the log, and nothing to
// retry: the only observable is missing data. `persistManualData` PUTs to
// `/fiscal303/declarations?id=…` with the id as a QUERY PARAM, so no optimistic-locking token
// is meaningfully attached on this path either — these tests deliberately assert nothing about
// one.
//
// So the assertions below are REQUEST COUNTS and REQUEST BODIES under a server whose latency
// the test controls, never the presence of a ref, a flag or a `setTimeout`. A predecessor
// suite elsewhere in this ticket asserted the component's source text and passed identically
// with the bug live and with it fixed — see CLAUDE.md on ETP-4958.
//
// `persistManualData` is kept REAL (only its siblings in `fiscalModelsUtils` are stubbed) and
// `globalThis.fetch` is doubled underneath it, so what is counted is what would hit the wire.
//
// Four properties are exercised separately, because a fix that satisfies any three of them
// while breaking the fourth is a plausible mistake:
//
//   1. No edit is LOST — a save requested mid-flight is replayed with the NEWEST value, not the
//      snapshot that was current when it was queued.
//   2. No two PUTs OVERLAP.
//   3. A queued save that has become INELIGIBLE is DROPPED — deliberately the opposite of (1),
//      because once the declaration is filed with the AEAT its stored content must match what
//      was filed. (1) and (3) must both be asserted or a later change will "fix" one by
//      breaking the other.
//   4. The in-flight guard can never get STUCK — a failed save must not silence autosave for
//      the rest of the session, which is a worse outcome than the duplicate write the guard
//      removes.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

// `persistManualData` is deliberately NOT stubbed — it is the code path under test. Its
// siblings are, for the same reasons the established 303 suites stub them: they either hit the
// network on mount or sleep for 900 ms in their demo fallback.
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: vi.fn().mockResolvedValue(null),
    generate303File: vi.fn().mockResolvedValue({ ok: false }),
    checkModified303: vi.fn(),
    fetchDeclarationIncidents: vi.fn().mockResolvedValue(null),
  };
});
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  SummaryCard: () => null,
  Tabs: () => null,
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => null,
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null, HistoryTab: () => null,
}));

// The edit trigger. `onIdentChange` is the page's own identification-field callback (the same
// one the real FmBoxes303 calls), so driving it exercises the genuine state update the autosave
// effect watches. 'nif' is used rather than 'motivo_rectificacion', which has extra
// box-108 side effects irrelevant here.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ onIdentChange }) => React.createElement('input', {
    'data-testid': 'ident-nif',
    onChange: (e) => onIdentChange('nif', e.target.value),
  }),
}));

// PresentModal mock: a button that reports the plain manual `submitted` path, which is how the
// declaration gets filed mid-flight in the eligibility test below.
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm }) => React.createElement(
    'button',
    { 'data-testid': 'present-confirm-submitted', onClick: () => onConfirm({ status: 'submitted' }) },
    'confirm-submitted',
  ),
  FileGenModal303: () => null,
  ConfigDrawer: () => null,
  CompareDrawer: () => null,
}));
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: () => null,
  isMissingDefaultIaeActivity: () => false,
}));
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null, Landmark: () => null,
}));

import FmModel303Page from '../FmModel303Page.jsx';
import { jsonResponse } from '@/test/realApiFetch.js';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
};

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/fiscal-models';

/** The 800 ms the autosave debounces by, plus a margin. */
const DEBOUNCE_MS = 800;

/**
 * A `fetch` double that holds every PUT open until the test releases it, and answers everything
 * else immediately.
 *
 * Holding only the PUTs is what makes this deterministic: the page also issues unrelated GETs
 * on mount (`fetchOrgIdent`), so a naive "resolve the oldest pending request" double would
 * release one of those instead of the autosave under test.
 */
function installServer({ putStatus = 200 } = {}) {
  const openPuts = [];
  globalThis.fetch = vi.fn((_url, options = {}) => {
    if (String(options.method || 'GET').toUpperCase() === 'PUT') {
      return new Promise((resolve) => { openPuts.push(resolve); });
    }
    return Promise.resolve(jsonResponse({ response: { data: [] } }));
  });
  return {
    /** Releases the oldest open PUT. */
    async settleNextPut() {
      const resolve = openPuts.shift();
      if (!resolve) throw new Error('settleNextPut(): no PUT is open');
      await act(async () => {
        resolve(jsonResponse({ manualDataApplied: true }, { ok: putStatus < 400, status: putStatus }));
        await Promise.resolve();
      });
    },
    get openPutCount() { return openPuts.length; },
  };
}

/** A `fetch` double that answers PUTs immediately with `status`. */
function installImmediateServer(status = 200) {
  globalThis.fetch = vi.fn((_url, options = {}) => {
    if (String(options.method || 'GET').toUpperCase() === 'PUT') {
      return Promise.resolve(jsonResponse(
        { manualDataApplied: status < 400 }, { ok: status < 400, status },
      ));
    }
    return Promise.resolve(jsonResponse({ response: { data: [] } }));
  });
}

/** The recorded PUTs — the manualData autosave is the only PUT this page ever issues. */
function putCalls() {
  return globalThis.fetch.mock.calls.filter(
    ([, options]) => String(options?.method || '').toUpperCase() === 'PUT',
  );
}

/** The `manualData.identification.nif` a recorded PUT carried. */
function nifOf(call) {
  return JSON.parse(call[1].body).manualData.identification.nif;
}

function renderPage(props = {}) {
  return render(
    <FmModel303Page
      decl={BASE_DECL}
      token={TOKEN}
      apiBaseUrl={API_BASE_URL}
      onBack={vi.fn()}
      onStatusChange={vi.fn()}
      {...props}
    />,
  );
}

/** Types a new identification value — the user edit the autosave reacts to. */
function editNif(value) {
  fireEvent.change(screen.getByTestId('ident-nif'), { target: { value } });
}

/** Lets the debounce elapse and the resulting async save reach `fetch`. */
async function elapseDebounce() {
  await act(async () => { await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 50); });
}

/**
 * Files the declaration through the manual "Presentado" path.
 *
 * Not wrapped in `act`: the two clicks have to be flushed one after the other, since the second
 * targets a modal the first one mounts. Inside a single `act` scope both updates would be
 * batched until the scope exits and the modal would not exist yet.
 */
function submitDeclaration() {
  const submitBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.submit'));
  if (!submitBtn) throw new Error('submitDeclaration(): the submit action is not on screen');
  fireEvent.click(submitBtn);
  fireEvent.click(screen.getByTestId('present-confirm-submitted'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FmModel303Page — single-flight manualData autosave (ETP-5255)', () => {
  // THE regression, and the property a wrong fix breaks. The queued replay must read the
  // LATEST value, not the payload that was current when it was queued: the mechanism is a
  // boolean pending flag plus a `manualDataLatest` ref, and a fix that queued the payload
  // instead would send 'B' here and silently lose 'C'.
  it('replays a mid-flight edit with the newest value, losing nothing', async () => {
    const server = installServer();
    renderPage();

    editNif('A');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('A');

    // The first PUT is still open. Two further edits arrive; both must be queued, not sent.
    editNif('B');
    await elapseDebounce();
    editNif('C');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    await server.settleNextPut();

    // Exactly TWO PUTs in total — and the second carries 'C', the newest value, not the 'B'
    // that was current when the queue was first armed.
    expect(putCalls()).toHaveLength(2);
    expect(nifOf(putCalls()[1])).toBe('C');

    // Sequential by construction: the replay only started after the first PUT settled.
    expect(server.openPutCount).toBe(1);

    // And nothing further is emitted once the queue has drained.
    await server.settleNextPut();
    await elapseDebounce();
    expect(putCalls()).toHaveLength(2);
  });

  // The plain no-overlap half, asserted on its own: a save requested while a PUT is open must
  // issue no request at all until the first settles.
  it('issues no request while a PUT is open', async () => {
    const server = installServer();
    renderPage();

    editNif('A');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);
    expect(server.openPutCount).toBe(1);

    editNif('B');
    await elapseDebounce();
    // Well past a second debounce window, with the first PUT still unanswered.
    await elapseDebounce();

    expect(putCalls()).toHaveLength(1);
    expect(server.openPutCount).toBe(1);
  });

  // Deliberately the OPPOSITE of the first test: once the declaration is filed with the AEAT,
  // its stored content must match what was filed, so a queued autosave is DROPPED rather than
  // replayed. The server does not stop it — `FiscalDeclCrudHandler#handleDeclPut` has no
  // submitted guard — so the client-side eligibility re-check is the only gate.
  it('drops a queued save when the declaration is submitted while a PUT is open', async () => {
    const server = installServer();
    renderPage();

    editNif('A');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    editNif('B');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    // Filed while the first PUT is still open.
    submitDeclaration();

    await server.settleNextPut();
    await elapseDebounce();

    // The queued replay must NOT have fired: 'B' is lost on purpose.
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('A');
  });

  // The same eligibility gate, reached the other way: the session ends (`token` goes falsy)
  // while a PUT is open. The queued snapshot still holds the token it was scheduled with, so
  // without the re-check the replay would issue a PUT doomed to 401 — which
  // `persistManualData` does not detect and reports as a plain `{ ok: false }`.
  it('drops a queued save when the token goes falsy while a PUT is open', async () => {
    const server = installServer();
    const { rerender } = renderPage();

    editNif('A');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    editNif('B');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    await act(async () => {
      rerender(
        <FmModel303Page
          decl={BASE_DECL}
          token={undefined}
          apiBaseUrl={API_BASE_URL}
          onBack={vi.fn()}
          onStatusChange={vi.fn()}
        />,
      );
    });

    await server.settleNextPut();
    await elapseDebounce();

    expect(putCalls()).toHaveLength(1);
  });

  it('drops a queued save when apiBaseUrl goes falsy while a PUT is open', async () => {
    const server = installServer();
    const { rerender } = renderPage();

    editNif('A');
    await elapseDebounce();
    editNif('B');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    await act(async () => {
      rerender(
        <FmModel303Page
          decl={BASE_DECL}
          token={TOKEN}
          apiBaseUrl={undefined}
          onBack={vi.fn()}
          onStatusChange={vi.fn()}
        />,
      );
    });

    await server.settleNextPut();
    await elapseDebounce();

    expect(putCalls()).toHaveLength(1);
  });

  // A guard left set would stop the panel autosaving for the rest of the session with nothing
  // on screen to say so — silently worse than the duplicate write it removes. `persistManualData`
  // never throws: an HTTP failure comes back as `{ ok: false, error: 'http_500' }`, so the flag
  // has to be cleared on the success path AND on that one.
  it('keeps autosaving after a save the server refuses', async () => {
    installImmediateServer(500);
    renderPage();

    editNif('A');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    editNif('B');
    await elapseDebounce();

    expect(putCalls()).toHaveLength(2);
    expect(nifOf(putCalls()[1])).toBe('B');
  });

  // The same, for the other non-success shape `persistManualData` collapses to `{ ok: false }`:
  // HTTP 200 with `manualDataApplied: false` (the payload was rejected server-side).
  it('keeps autosaving after a save the server accepts but rejects the payload of', async () => {
    globalThis.fetch = vi.fn((_url, options = {}) => Promise.resolve(
      String(options.method || 'GET').toUpperCase() === 'PUT'
        ? jsonResponse({ manualDataApplied: false })
        : jsonResponse({ response: { data: [] } }),
    ));
    renderPage();

    editNif('A');
    await elapseDebounce();
    editNif('B');
    await elapseDebounce();

    expect(putCalls()).toHaveLength(2);
  });

  it('sends nothing on the first render, which is hydration rather than a user edit', async () => {
    installServer();
    renderPage({ decl: { ...BASE_DECL, manualData: { identification: { nif: 'HYDRATED' }, manualOverrides: {} } } });

    await elapseDebounce();
    await elapseDebounce();

    expect(putCalls()).toHaveLength(0);
  });

  it('does not save when the page unmounts before the debounce fires', async () => {
    installServer();
    const { unmount } = renderPage();

    editNif('A');
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(putCalls()).toHaveLength(0);
  });

  // Unmount must also cancel a save that is already QUEUED, not only one still on the timer:
  // the replay fires from a `finally` that runs after the component is gone.
  it('does not replay a queued save after the page unmounts', async () => {
    const server = installServer();
    const { unmount } = renderPage();

    editNif('A');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    editNif('B');
    await elapseDebounce();
    expect(putCalls()).toHaveLength(1);

    unmount();
    await server.settleNextPut();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(putCalls()).toHaveLength(1);
  });
});
