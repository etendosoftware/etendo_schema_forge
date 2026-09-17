// ETP-5255 / ETP-5338 — the Modelo 303 explicit-save write path must save SINGLE-FLIGHT.
//
// ETP-5338 removed the debounced autosave of `identChecks`/`manualOverrides` entirely
// (identChecks/manualOverrides are now pure local React state until an explicit "Guardar" or
// "Calcular" click flushes them, via the shared `persistEditableFields` helper — see
// FmModel303Page.jsx). That redesign did NOT remove the underlying single-flight write queue
// (`useRecordWriteQueue`) — it is still needed because two of these EXPLICIT clicks can race each
// other: the Guardar button disables itself while its own save is in flight
// (`disabled={isSavingManualData}`), but the Calcular button is only gated by `computing`, so a
// Guardar save still in flight when the user clicks Calcular is the realistic race in the new
// model (see `handleComputeClick`'s own comment in FmModel303Page.jsx).
//
// What the underlying bug always was (ETP-5255): a write that outlived the earlier
// debounce/click guarded its own re-entry TIMER/CLICK but never guarded the REQUEST. When a PUT
// outlived the trigger that issued it and a second trigger fired, a second PUT could go out while
// the first was still open.
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
// the test controls, never the presence of a ref, a flag, or a component internal. `persistManualData`
// is kept REAL (only its siblings in `fiscalModelsUtils` are stubbed) and `globalThis.fetch` is
// doubled underneath it, so what is counted is what would hit the wire.
//
// Four properties are exercised separately, because a fix that satisfies any three of them
// while breaking the fourth is a plausible mistake. All four are now triggered by EXPLICIT
// Guardar/Calcular clicks, never by an elapsed debounce timer — there is no timer left to elapse:
//
//   1. No edit is LOST — a save requested mid-flight (via the OTHER button) is replayed with the
//      NEWEST value, not the snapshot that was current when it was queued.
//   2. No two PUTs OVERLAP — a request made while one is in flight issues no PUT of its own until
//      the first settles.
//   3. A queued save that has become INELIGIBLE for a reason `handlePresent` itself cannot flush
//      away (the session ending — token/apiBaseUrl going falsy — while a PUT is open) is DROPPED,
//      never replayed onto a record whose content no longer matches what would be filed. This
//      used to also cover "the declaration got filed while a save was queued behind an in-flight
//      Guardar" — but that was the ETP-5338 pt.4 bug ("processing a rectificativa un-checks the
//      checkbox"): `handlePresent` now `await`s `persistEditableFields()` BEFORE transitioning
//      status, so a save queued at filing time is flushed first, not dropped. (1) and (3) must
//      both be asserted or a later change will "fix" one by breaking the other.
//   4. The in-flight guard can never get STUCK — a failed save must not silence the write path
//      for the rest of the session, which is a worse outcome than the duplicate write the guard
//      removes. Exercised across BOTH callers (a failed Guardar must not block a later Calcular
//      save), since they now share one `persistEditableFields` implementation.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

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
// one the real FmBoxes303 calls), so driving it exercises the genuine local-state update
// `persistEditableFields` later reads. 'nif' is used rather than 'motivo_rectificacion', which
// has extra box-108 side effects irrelevant here.
//
// A second, boolean-valued input drives `identChecks.rectificativa` through the exact same
// `onIdentChange` callback the real "Autoliquidación Rectificativa" checkbox uses (see
// FmBoxes303.jsx) — needed for the ETP-5338 pt.4 ticket-scenario test below, which drives the
// actual field the bug report named rather than the generic 'nif' stand-in the rest of this file
// uses.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ onIdentChange }) => React.createElement(React.Fragment, null,
    React.createElement('input', {
      'data-testid': 'ident-nif',
      onChange: (e) => onIdentChange('nif', e.target.value),
    }),
    React.createElement('input', {
      type: 'checkbox',
      'data-testid': 'ident-rectificativa',
      onChange: (e) => onIdentChange('rectificativa', e.target.checked),
    }),
  ),
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
  Settings: () => null, Download: () => null, ArrowLeft: () => null, Save: () => null, OctagonAlert: () => null,
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
  // `tipo_declaracion` is NOT decoration here — do not "clean up" this manualData.
  //
  // ETP-5187 added a required-field pre-flight gate: `getMissingRequiredFields` (fm303Layouts.js)
  // reports every visible layout field marked `required: true` whose value is empty, and both
  // `handlePresent` and the "Marcar como Presentado" button pre-check return early with a toast
  // while that list is non-empty. `identChecks` is seeded from `decl.manualData?.identification`,
  // so with no seed it starts as `{}`, `tipo_declaracion` (always visible, always required) is
  // reported missing, and PresentModal NEVER MOUNTS — which breaks `submitDeclaration()` below,
  // and with it the eligibility property (3) documented at the top of this file.
  //
  // 'N' (resultado cero) is chosen deliberately: it is a valid option AND it is not one of
  // U/D/X, so the `datos_bancarios` section stays hidden and its own `required: true`
  // `bank_iban` does not become required too. `rectificativa` is left unset for the same reason.
  manualData: { identification: { tipo_declaracion: 'N' } },
};

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/fiscal-models';

/**
 * A `fetch` double that holds every PUT open until the test releases it, and answers everything
 * else immediately.
 *
 * Holding only the PUTs is what makes this deterministic: the page also issues unrelated GETs
 * on mount (`fetchOrgIdent`), so a naive "resolve the oldest pending request" double would
 * release one of those instead of the write under test.
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

/** The recorded PUTs — the manualData save is the only PUT this page ever issues. */
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

/** Types a new identification value — the local-state edit the write path later reads. */
function editNif(value) {
  fireEvent.change(screen.getByTestId('ident-nif'), { target: { value } });
}

/** Clicks "Guardar" — always disabled while its own save is in flight. */
async function clickGuardar() {
  await act(async () => { fireEvent.click(screen.getByTestId('FmModel303Page__save')); });
}

/** Clicks "Calcular" — gated only by `computing`, never by `isSavingManualData`, so it is the
 *  button that can genuinely race an in-flight Guardar save. */
async function clickCalcular() {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.compute'));
  if (!btn) throw new Error('clickCalcular(): the Calcular button is not on screen');
  await act(async () => { fireEvent.click(btn); });
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
  // Self-diagnosing on purpose. When the first click is silently refused by a pre-flight gate
  // (ETP-5187's required-field check, `requiresRectificativa`, …) the modal never mounts and a
  // bare `getByTestId` dies in a raw DOM dump that says nothing about the cause — that exact
  // failure cost real time to trace once already. Still a genuine hard failure: nothing here
  // skips or tolerates the condition.
  const confirmBtn = screen.queryByTestId('present-confirm-submitted');
  if (!confirmBtn) {
    throw new Error(
      'submitDeclaration(): PresentModal did not mount after clicking the submit action. '
      + 'The click was most likely refused by a pre-flight gate before `setShowPresent(true)` — '
      + 'check that BASE_DECL still satisfies every `required: true` field the resolved layout '
      + 'considers visible (see the note on BASE_DECL.manualData), and that no new gate has been '
      + 'added to the button handler in FmModel303Page.jsx.',
    );
  }
  fireEvent.click(confirmBtn);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FmModel303Page — single-flight explicit-save write path (ETP-5255 / ETP-5338)', () => {
  // THE regression, and the property a wrong fix breaks: NO edit is silently dropped.
  //
  // Under the ETP-5338 explicit-click model, `persistEditableFields` always calls
  // `waitUntilManualDataIdle` FIRST and only builds/flushes its own snapshot once genuinely
  // idle — unlike the old debounce effect, which called `persistManualDataQueued` directly and
  // let its internal `queuedRef` coalesce a same-field burst into a single replay. So two
  // SEPARATE explicit clicks made while an earlier one is in flight do not coalesce into one
  // skipped-middle-value replay; each click's own snapshot (captured at ITS OWN click, via that
  // click's closure over `identChecks`) eventually flushes as its own PUT, strictly serialized —
  // never overlapping, never lost. This test asserts the practical consequence: every value a
  // user explicitly saved is eventually sent, in click order, and the LAST one transmitted is
  // the newest edit — so the record never ends up stuck on a stale value.
  it('never drops an edit made via Calcular while an earlier Guardar is still in flight', async () => {
    const server = installServer();
    renderPage();

    editNif('A');
    await clickGuardar();
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('A');

    // The first PUT is still open. A second explicit action (Calcular, edit 'B') is queued
    // behind it — Guardar itself is disabled while its own save is in flight, so Calcular is the
    // only way a second explicit save can be requested here.
    editNif('B');
    await clickCalcular();
    expect(putCalls()).toHaveLength(1);

    // Settling A releases B's own flush.
    await server.settleNextPut();
    expect(putCalls()).toHaveLength(2);
    expect(nifOf(putCalls()[1])).toBe('B');
    // Never overlapping: exactly one PUT open at a time throughout.
    expect(server.openPutCount).toBe(1);

    // A third explicit action (Calcular again, edit 'C') arrives while B is still open.
    editNif('C');
    await clickCalcular();
    expect(putCalls()).toHaveLength(2);

    await server.settleNextPut();
    expect(putCalls()).toHaveLength(3);
    // The last value transmitted is the newest edit — nothing is stuck on a stale value.
    expect(nifOf(putCalls()[2])).toBe('C');
    expect(server.openPutCount).toBe(1);

    // Settle C's own PUT to drain the chain completely.
    await server.settleNextPut();
    expect(putCalls()).toHaveLength(3);
    expect(server.openPutCount).toBe(0);
  });

  // The plain no-overlap half, asserted on its own: a save requested (via Calcular) while a PUT
  // is open must issue no request of its own until the first settles.
  it('issues no request while a PUT is open', async () => {
    const server = installServer();
    renderPage();

    editNif('A');
    await clickGuardar();
    expect(putCalls()).toHaveLength(1);
    expect(server.openPutCount).toBe(1);

    editNif('B');
    await clickCalcular();
    // A second Calcular click, well after the first, with the first PUT still unanswered.
    await clickCalcular();

    expect(putCalls()).toHaveLength(1);
    expect(server.openPutCount).toBe(1);
  });

  // ETP-5338 pt.4 — this test used to assert the OPPOSITE: that a save queued behind an
  // in-flight Guardar was DROPPED once the declaration got filed before it could flush. That was
  // exactly the "processing a rectificativa un-checks the checkbox" bug (see FmModel303Page.md /
  // FmModel303Page.jsx's own comment on `handlePresent`): a user who edits a field (e.g. checks
  // "Autoliquidación Rectificativa") and clicks "Registrar/Presentar" before an earlier Guardar's
  // PUT has settled had that edit silently discarded — `writeManualData`'s `isManualDataEligible`
  // gate closed the instant `handleStatusChange` flipped local `status` to a submitted value,
  // and once submitted `persistEditableFields` is a permanent no-op, so the edit could never be
  // retried either.
  //
  // Fixed by having `handlePresent` itself `await persistEditableFields()` BEFORE transitioning
  // the status (see FmModel303Page.jsx). That means the pending edit here is not dropped at all:
  // it flushes as its own PUT, and the status transition — and the `onStatusChange` callback
  // that reports it — waits for that flush to actually settle. `FiscalDeclCrudHandler#handleDeclPut`
  // still has no submitted guard server-side, so the ordering guarantee is entirely client-side,
  // which is exactly why it has to hold here.
  it('flushes a queued save before filing the declaration, instead of dropping it', async () => {
    const server = installServer();
    const onStatusChange = vi.fn();
    renderPage({ onStatusChange });

    editNif('A');
    await clickGuardar();
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('A');

    editNif('B');
    await clickCalcular();
    expect(putCalls()).toHaveLength(1);

    // Filed while the first PUT is still open.
    submitDeclaration();

    // Settling A releases B's own flush — the status transition must not have happened yet,
    // since `handlePresent` awaits the flush before calling `handleStatusChange`.
    await server.settleNextPut();
    expect(putCalls()).toHaveLength(2);
    expect(nifOf(putCalls()[1])).toBe('B');
    expect(onStatusChange).not.toHaveBeenCalled();

    // Drain any further PUTs (e.g. a Calcular flush and handlePresent's own flush both racing
    // to persist the same 'B' snapshot can produce one coalesced follow-up write via the shared
    // write queue's own queued-replay mechanism — see useRecordWriteQueue.js) until the record is
    // genuinely idle, then let handlePresent proceed to the actual status transition.
    for (let i = 0; i < 5 && server.openPutCount > 0; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await server.settleNextPut();
    }
    await waitFor(() => {
      expect(onStatusChange).toHaveBeenCalledWith('303-2026-T2', 'submitted', 'manual_no_receipt');
    });
  });

  // ETP-5338 pt.4 — the exact ticket scenario, driving the named field itself: check
  // "Autoliquidación Rectificativa" and click "Registrar/Presentar" directly, with NO
  // intervening "Guardar". Before the fix the checkbox's own `identChecks.rectificativa: true`
  // never reached the server at all — `handlePresent` transitioned `status` straight away and
  // `persistEditableFields` becomes a permanent no-op once `isSubmitted`, so the edit was lost
  // for good, not merely delayed. `onManualDataSaved` is the observable proxy for "reopening the
  // declaration / the list's 'Tipo' column would show Rectificativa, not Ordinaria" — it is the
  // exact payload `FiscalModelsPage` patches into `FmListPage`'s cache on a successful save (see
  // `FiscalModelsPage.manualDataSaved.vitest.jsx` and `FmListPage.declManualDataPatch.vitest.jsx`
  // for that plumbing's own coverage), so asserting it fires with `rectificativa: true` here
  // proves the full chain end-to-end without re-testing already-covered wiring in a second place.
  it('persists a checked "Autoliquidación Rectificativa" when Presentar is clicked directly', async () => {
    installImmediateServer(200);
    const onStatusChange = vi.fn();
    const onManualDataSaved = vi.fn();
    // Checking 'rectificativa' makes the 'datos_bancarios' section visible (fm303Layouts.js),
    // whose 'bank_iban' is itself `required: true` — seeded here so the ETP-5187 pre-flight
    // gate this test is not exercising doesn't block `submitDeclaration()` below.
    renderPage({
      onStatusChange,
      onManualDataSaved,
      decl: {
        ...BASE_DECL,
        manualData: { identification: { tipo_declaracion: 'N', bank_iban: 'ES0000000000000000000000' } },
      },
    });

    fireEvent.click(screen.getByTestId('ident-rectificativa'));
    submitDeclaration();

    // The saved payload must carry the checked box — this is what a reopened declaration (or
    // the list's "Tipo" column) would read back.
    await waitFor(() => {
      expect(onManualDataSaved).toHaveBeenCalledWith(
        '303-2026-T2',
        expect.objectContaining({
          identification: expect.objectContaining({ rectificativa: true }),
        }),
      );
    });
    expect(putCalls()).toHaveLength(1);
    expect(JSON.parse(putCalls()[0][1].body).manualData.identification.rectificativa).toBe(true);

    // The flush must have settled BEFORE the status transition — not raced against it, not
    // skipped by it.
    const savedOrder = onManualDataSaved.mock.invocationCallOrder[0];
    const statusOrder = onStatusChange.mock.invocationCallOrder[0];
    expect(onStatusChange).toHaveBeenCalledWith('303-2026-T2', 'submitted', 'manual_no_receipt');
    expect(savedOrder).toBeLessThan(statusOrder);
  });

  // ETP-5338 pt.4 — the other half of the fix: `handlePresent`'s own flush can FAIL (a genuine
  // network/server error, not an eligibility drop). `persistEditableFields` never throws — a
  // failed PUT comes back as `{ ok: false }` — so `handlePresent` must check that return value
  // and abort the transition itself rather than proceeding on the assumption the flush always
  // succeeds. Unlike the eligibility-drop tests above (which cover a save becoming ineligible
  // WHILE queued behind an earlier PUT), this drives the flush directly off the Presentar click
  // with no earlier PUT in flight, so it is `handlePresent`'s own `if (!savedOk)` branch under
  // test, not `writeManualData`'s eligibility re-check.
  it('aborts the status transition when its own flush fails, and the edit stays retryable', async () => {
    installImmediateServer(500);
    const onStatusChange = vi.fn();
    renderPage({ onStatusChange });

    editNif('B');
    submitDeclaration();

    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(nifOf(putCalls()[0])).toBe('B');
    // The failed flush must abort the transition — no status change, and a toast instead.
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);

    // The edit must still read as pending (not silently dropped): a retry via Guardar issues a
    // fresh PUT rather than silently no-op'ing, and this time it succeeds.
    installImmediateServer(200);
    await clickGuardar();
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('B');
  });

  // The same eligibility gate, reached the other way: the session ends (`token` goes falsy)
  // while a PUT is open. The queued snapshot still holds the token it was scheduled with, so
  // without the re-check the replay would issue a PUT doomed to 401 — which
  // `persistManualData` does not detect and reports as a plain `{ ok: false }`.
  it('drops a queued save when the token goes falsy while a PUT is open', async () => {
    const server = installServer();
    const { rerender } = renderPage();

    editNif('A');
    await clickGuardar();
    expect(putCalls()).toHaveLength(1);

    editNif('B');
    await clickCalcular();
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

    expect(putCalls()).toHaveLength(1);
  });

  it('drops a queued save when apiBaseUrl goes falsy while a PUT is open', async () => {
    const server = installServer();
    const { rerender } = renderPage();

    editNif('A');
    await clickGuardar();
    editNif('B');
    await clickCalcular();
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

    expect(putCalls()).toHaveLength(1);
  });

  // A guard left set would stop the write path saving for the rest of the session with nothing
  // on screen to say so — silently worse than the duplicate write the guard removes.
  // `persistManualData` never throws: an HTTP failure comes back as `{ ok: false, error:
  // 'http_500' }`, so the flag has to be cleared on the success path AND on that one. Exercised
  // across BOTH callers: a failed Guardar must not block a LATER Calcular save, since they now
  // share one `persistEditableFields` implementation.
  it('keeps accepting saves after a save the server refuses, even from the other button', async () => {
    installImmediateServer(500);
    renderPage();

    editNif('A');
    await clickGuardar();
    expect(putCalls()).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledTimes(1);

    // A failed Guardar leaves `hasPendingManualDataEditRef` set — the edit still reads as
    // pending, so it must not be silently dropped. `installImmediateServer` swaps in a brand
    // new `fetch` mock (resetting the recorded call history), so from here on `putCalls()`
    // only reflects calls made against this NEW double — exactly one PUT is expected for the
    // Calcular click below.
    installImmediateServer(200);
    editNif('B');
    await clickCalcular();

    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('B');
    // Calcular never toasts on a successful save — only Guardar does, and only on its own click.
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  // The same, for the other non-success shape `persistManualData` collapses to `{ ok: false }`:
  // HTTP 200 with `manualDataApplied: false` (the payload was rejected server-side).
  it('keeps accepting saves after a save the server accepts but rejects the payload of', async () => {
    globalThis.fetch = vi.fn((_url, options = {}) => Promise.resolve(
      String(options.method || 'GET').toUpperCase() === 'PUT'
        ? jsonResponse({ manualDataApplied: false })
        : jsonResponse({ response: { data: [] } }),
    ));
    renderPage();

    editNif('A');
    await clickGuardar();
    expect(putCalls()).toHaveLength(1);

    editNif('B');
    await clickGuardar();

    expect(putCalls()).toHaveLength(2);
    expect(nifOf(putCalls()[1])).toBe('B');
  });

  it('sends nothing on mount, before any explicit Guardar/Calcular click', async () => {
    installServer();
    renderPage({ decl: { ...BASE_DECL, manualData: { identification: { nif: 'HYDRATED' }, manualOverrides: {} } } });

    await act(async () => { await Promise.resolve(); });

    expect(putCalls()).toHaveLength(0);
  });

  // ETP-5338 follow-up fix: an explicit Calcular/Guardar click queued BEHIND an earlier
  // in-flight click's PUT used to be a fully independent async chain with NO unmount guard —
  // `useRecordWriteQueue`'s `mountedRef` only gated its OWN internal replay (armed inside
  // `persist`'s `finally` block), not a second top-level call to `persist` arriving later from
  // `persistEditableFields` itself once its `waitUntilManualDataIdle` wait resumes. See
  // `FmModel303Page.cancelDiscard.vitest.jsx` for the full "Cancelar during a queued Calcular
  // save" regression test — `useRecordWriteQueue.js` now refuses to start ANY new write
  // (fresh call or replay) once its owning component has unmounted.
  it('does not error and issues no further PUT when the page unmounts with a single write in flight', async () => {
    const server = installServer();
    const { unmount } = renderPage();

    editNif('A');
    await clickGuardar();
    expect(putCalls()).toHaveLength(1);

    expect(() => unmount()).not.toThrow();
    await server.settleNextPut();

    expect(putCalls()).toHaveLength(1);
  });
});
