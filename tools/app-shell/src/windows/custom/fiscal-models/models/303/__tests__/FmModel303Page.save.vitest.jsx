// ETP-5338 (PIVOT) — Modelo 303 "Guardar" button (handleSave).
//
// "Guardar" (`data-testid="FmModel303Page__save"`) replaced the earlier "Volver"
// (go-back) button in the exact same toolbar slot. Unlike go-back, it does NOT
// unmount/navigate — it force-flushes the pending manualData edit
// (`persistEditableFields`, which calls `flushManualData`/`persistManualData` under
// `useRecordWriteQueue`), then reports the outcome via `toast.success`/`toast.error`,
// and the user stays on the same declaration view.
//
// ETP-5338 architecture change: `identChecks`/`manualOverrides` are now PURE local
// React state — there is no more debounced background autosave. An edit never reaches
// the wire until an explicit "Guardar" or "Calcular" click. `handleSave` is `async` and
// awaits any write already in flight from an EARLIER explicit click (via
// `waitUntilManualDataIdle`) before rebuilding and flushing its own snapshot from
// CURRENT state — this is the one race `useRecordWriteQueue`/`isManualDataEligible`
// still guard against (see the "in-flight write" test below).
//
// `persistManualData` is kept REAL and `globalThis.fetch` is doubled underneath it, so
// what is asserted is what would actually hit the wire — never internal refs/flags.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { toast } from 'sonner';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

// `persistManualData` deliberately NOT stubbed — see file header.
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
// `onIdentChange` drives the same code path the real FmBoxes303 does, so an edit
// exercises the genuine local-state update that `persistEditableFields` later reads.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ onIdentChange }) => React.createElement('input', {
    'data-testid': 'ident-nif',
    onChange: (e) => onIdentChange('nif', e.target.value),
  }),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  // PresentModal is only ever mounted while `showPresent` is true, so rendering it
  // unconditionally as a confirm button is safe — it lets a test drive the REAL internal
  // `handlePresent` -> `handleStatusChange` -> `setStatus` path (not a prop swap), which is
  // what actually flips `isSubmitted` in production.
  PresentModal: ({ onConfirm }) => React.createElement(
    'button',
    { 'data-testid': 'present-modal-confirm', onClick: () => onConfirm({ status: 'submitted' }) },
    'confirm present',
  ),
  FileGenModal303: () => null,
}));
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: () => null,
  isMissingDefaultIaeActivity: () => false,
}));
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, ArrowLeft: () => null, Save: () => null,
  OctagonAlert: () => null, TriangleAlert: () => null, CircleCheck: () => null,
  ArrowLeftRight: () => null, Calculator: () => null, Loader2: () => null,
  MoreVertical: () => null, TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null, Landmark: () => null,
}));

import FmModel303Page from '../FmModel303Page.jsx';
import { jsonResponse } from '@/test/realApiFetch.js';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
  manualData: { identification: { tipo_declaracion: 'N' } },
};

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/fiscal-models';

/** The recorded PUTs — the manualData save is the only PUT this page ever issues. */
function putCalls() {
  return globalThis.fetch.mock.calls.filter(
    ([, options]) => String(options?.method || '').toUpperCase() === 'PUT',
  );
}

function nifOf(call) {
  return JSON.parse(call[1].body).manualData.identification.nif;
}

function installImmediateServer() {
  globalThis.fetch = vi.fn((_url, options = {}) => Promise.resolve(
    String(options.method || 'GET').toUpperCase() === 'PUT'
      ? jsonResponse({ manualDataApplied: true })
      : jsonResponse({ response: { data: [] } }),
  ));
}

/**
 * A server whose PUT responses are held open until the test explicitly resolves them, so a test
 * can put a manualData write genuinely "in flight" and drive a second explicit `Guardar` click
 * while it is still open — the exact window ETP-5338's hardening (`waitUntilManualDataIdle`)
 * targets. GETs (session/incidents fetches on mount) resolve immediately; only PUTs are
 * deferred, one resolver per call, in call order.
 */
function installControllableServer() {
  const resolvers = [];
  globalThis.fetch = vi.fn((_url, options = {}) => {
    if (String(options.method || 'GET').toUpperCase() !== 'PUT') {
      return Promise.resolve(jsonResponse({ response: { data: [] } }));
    }
    return new Promise((resolve) => { resolvers.push(() => resolve(jsonResponse({ manualDataApplied: true }))); });
  });
  return { resolveNextPut: (i = 0) => resolvers[i]() };
}

function editNif(value) {
  fireEvent.change(screen.getByTestId('ident-nif'), { target: { value } });
}

function clickSave() {
  fireEvent.click(screen.getByTestId('FmModel303Page__save'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FmModel303Page — Guardar button (ETP-5338 pivot)', () => {
  it('flushes a pending manualData edit and shows a success toast, without navigating', async () => {
    installImmediateServer();
    const onBack = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={onBack} onStatusChange={vi.fn()} />);

    // No autosave: editing alone never touches the wire.
    editNif('EDITED');
    expect(putCalls()).toHaveLength(0);

    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    // The click flushed the PUT, and it carries the edited value — not stale/empty data.
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('EDITED');
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    // "Guardar" never navigates away — unlike the earlier go-back button.
    expect(onBack).not.toHaveBeenCalled();
  });

  // ETP-5338 architecture change — there is no more debounce timer to "clear": an edit with NO
  // follow-up Guardar/Calcular click must never reach the wire, no matter how long the test
  // waits. This is the regression guard for the old autosave-on-every-commit design, which is
  // exactly the root cause Bug B (an uncancellable "Cancelar") lived in.
  it('never fires a PUT on its own, even long after the old 800ms debounce window', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    editNif('NEVER-SAVED');
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(putCalls()).toHaveLength(0);

    // Only the explicit click flushes it.
    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('NEVER-SAVED');
  });

  /**
   * ETP-4576 — the cookie session, and the reason `persistEditableFields` must NOT gate on
   * `!token`.
   *
   * Under the cookie scheme `useAuth()` holds no token at all, so this render — `token`
   * undefined, everything else normal — is the ordinary case for every user, not an edge case.
   * The gate used to read `if (!hasPending || !token || !apiBaseUrl) return { ok: true }`, and
   * the `{ ok: true }` is what makes the failure so bad: `handleSave` reads that `ok` and shows
   * `toast.success` ("Registro guardado"). The user pressed Guardar, was told it saved, and the
   * identification/box edits were dropped without a single request going out.
   *
   * So the assertion that matters is the PUT — a success toast alone would have "passed" against
   * the broken code. The credential is no longer this component's to check: `apiFetch` resolves
   * it from the active scheme when the request is actually made.
   */
  it('flushes the edit and toasts success with no token held (cookie session)', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={undefined} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    editNif('COOKIE-SESSION-EDIT');
    expect(putCalls()).toHaveLength(0);

    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    // The write genuinely went out — this is the assertion the old `!token` gate failed.
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('COOKIE-SESSION-EDIT');
    // And the success it reports is now an earned one rather than the gate's optimistic default.
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('no-ops the network call (but still confirms success) when there is no pending edit', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    await act(async () => { expect(() => clickSave()).not.toThrow(); await Promise.resolve(); });
    expect(putCalls()).toHaveLength(0);
    // Nothing needed persisting, so the current state IS already saved — still a success.
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('is not rendered at all once the declaration is submitted (nothing left to save)', () => {
    const submittedDecl = { ...BASE_DECL, status: 'submitted' };
    render(<FmModel303Page decl={submittedDecl} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    expect(screen.queryByTestId('FmModel303Page__save')).toBeNull();
  });

  // ETP-5338 Bug 2 hardening (carried over from the debounce era, retargeted at the new
  // explicit-click model) — the Guardar button is itself `disabled={isSavingManualData}`, so two
  // SEPARATE Guardar clicks can never race each other once React has re-rendered between them;
  // the true race the source's own comments call out is a Guardar save still in flight when the
  // user clicks CALCULAR (whose button is only gated by `computing`, not `isSavingManualData`).
  // `persistManualDataQueued` is single-flight per record: calling it mid-flight only QUEUES the
  // new snapshot and returns immediately, it does not wait for the eventual replay. Both
  // `handleSave` and `handleComputeClick` funnel through the same `persistEditableFields`, which
  // waits for any write already in flight (`waitUntilManualDataIdle`) before rebuilding and
  // flushing its own snapshot from CURRENT state — so the newest edit is never dropped behind an
  // in-flight write, regardless of which of the two buttons triggers each side of the race.
  it('does not drop an edit queued behind an in-flight Guardar write when Calcular is clicked', async () => {
    const { resolveNextPut } = installControllableServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    // Edit A, then click Guardar — its PUT is issued and left in flight (server not yet
    // resolved). The Guardar button is now disabled (isSavingManualData), but Calcular's is not.
    editNif('FIRST-EDIT');
    await act(async () => { fireEvent.click(screen.getByTestId('FmModel303Page__save')); });
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('FIRST-EDIT');

    // Edit B, made while A's write is still open.
    editNif('SECOND-EDIT-WHILE-A-IN-FLIGHT');

    // Click Calcular before A resolves — its own `persistEditableFields` call is still suspended
    // waiting for A's in-flight write, so nothing more is flushed synchronously.
    const calcularBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.compute'));
    await act(async () => { fireEvent.click(calcularBtn); });

    // Only now does A's server response land, unblocking Guardar's own await.
    await act(async () => {
      resolveNextPut(0);
      // Let the awaited chain (A's response -> queue's own finally -> Calcular's rebuilt flush
      // issuing B's own PUT) fully drain before that second PUT's response is available.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // B's own PUT — resolving it lets Calcular's flush settle.
    await act(async () => {
      resolveNextPut(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    // B must have been sent as its own PUT — not silently dropped. Guardar toasts success on its
    // own flush; Calcular never toasts on save success (only on failure), so exactly ONE success
    // toast total.
    expect(putCalls()).toHaveLength(2);
    expect(nifOf(putCalls()[1])).toBe('SECOND-EDIT-WHILE-A-IN-FLIGHT');
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  // Sentinel/QA edge-case sweep (ETP-5338 final QA, carried over to the pivot) — `handleSave`
  // is `async` and has no re-entrancy guard of its own. Clicking twice before the first click's
  // await chain settles must not crash and must not corrupt the flushed payload.
  it('handles two rapid Guardar clicks before the first resolves without crashing', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    editNif('DOUBLE-CLICK-EDIT');
    expect(putCalls()).toHaveLength(0);

    // Fire both clicks synchronously, before either's internal await chain has a chance to run.
    await act(async () => {
      clickSave();
      clickSave();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Every PUT that did go out (whether one or a harmless duplicate) must carry the real edit,
    // never a corrupted/partial value.
    expect(putCalls().length).toBeGreaterThanOrEqual(1);
    for (const call of putCalls()) {
      expect(nifOf(call)).toBe('DOUBLE-CLICK-EDIT');
    }
  });

  // Network failure during the flush: `persistManualData` never throws (it catches and returns
  // `{ ok: false, error: 'network' }`). `handleSave` reads `lastManualDataResultRef` after the
  // flush settles and reports the failure via `toast.error`, and leaves
  // `hasPendingManualDataEditRef` set so a retry click actually attempts the write again instead
  // of silently no-op'ing.
  it('shows an error toast (and does not navigate) when the flush PUT fails at the network level', async () => {
    globalThis.fetch = vi.fn((_url, options = {}) => {
      if (String(options.method || 'GET').toUpperCase() === 'PUT') {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(jsonResponse({ response: { data: [] } }));
    });
    const onBack = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={onBack} onStatusChange={vi.fn()} />);

    editNif('EDIT-DURING-NETWORK-OUTAGE');

    await act(async () => {
      clickSave();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    // The user is not stuck on a broken screen, but also never silently navigated away.
    expect(onBack).not.toHaveBeenCalled();

    // A failed save leaves `hasPendingManualDataEditRef` set, so clicking Guardar again
    // must genuinely retry the write (re-issue the PUT with the same edit) rather than
    // no-op'ing like the "nothing pending" case above.
    installImmediateServer();

    await act(async () => {
      clickSave();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('EDIT-DURING-NETWORK-OUTAGE');
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });
});
