// ETP-5338 Bug B fix — "Cancelar" must genuinely discard unsaved edits.
//
// Root cause of the original bug: `identChecks`/`manualOverrides` used to autosave via a
// debounced background PUT (800ms after every keystroke). By the time the user clicked
// "Cancelar", most edits had already been sent to the server — "Cancelar" itself was wired to a
// plain `onBack()` call with no revert logic at all, so there was nothing left to actually
// cancel.
//
// The fix removes the debounce entirely: `identChecks`/`manualOverrides` are now PURE local React
// state, flushed exclusively by an explicit "Guardar" or "Calcular" click
// (`persistEditableFields`). "Cancelar" now goes through `handleCancel`, which clears the
// pending-edit ref and calls `onBack?.()` — NO network call, ever, under any circumstance.
// Since there is no more background write racing ahead of the click, simply not flushing and
// unmounting (this page always unmounts on `onBack`) IS the discard.
//
// These tests assert the discard is total: an edit made and then cancelled produces ZERO PUT
// requests, even if fake timers are advanced well past the OLD 800ms debounce window (there is no
// timer left to fire, but this guards against any regression that reintroduces one).
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { toast } from 'sonner';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

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
// Surfaces BOTH `onIdentChange` (identification field edit) and `onBoxChange` (box override
// edit) so a test can drive either kind of "manualData" edit.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ onIdentChange, onBoxChange }) => React.createElement(
    React.Fragment,
    null,
    React.createElement('input', {
      'data-testid': 'ident-nif',
      onChange: (e) => onIdentChange('nif', e.target.value),
    }),
    React.createElement('input', {
      'data-testid': 'box-46',
      onChange: (e) => onBoxChange(46, e.target.value),
    }),
  ),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
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

function putCalls() {
  return globalThis.fetch.mock.calls.filter(
    ([, options]) => String(options?.method || '').toUpperCase() === 'PUT',
  );
}

function installImmediateServer() {
  globalThis.fetch = vi.fn((_url, options = {}) => Promise.resolve(
    String(options.method || 'GET').toUpperCase() === 'PUT'
      ? jsonResponse({ manualDataApplied: true })
      : jsonResponse({ response: { data: [] } }),
  ));
}

// A `fetch` double that holds every PUT open until the test releases it (mirrors the one in
// `FmModel303Page.explicitSaveSingleFlight.vitest.jsx`) — needed here to hold a Guardar PUT open
// long enough for a Calcular click to genuinely queue behind it before Cancelar unmounts the page.
function installControllableServer() {
  const openPuts = [];
  globalThis.fetch = vi.fn((_url, options = {}) => {
    if (String(options.method || 'GET').toUpperCase() === 'PUT') {
      return new Promise((resolve) => { openPuts.push(resolve); });
    }
    return Promise.resolve(jsonResponse({ response: { data: [] } }));
  });
  return {
    async settleNextPut() {
      const resolve = openPuts.shift();
      if (!resolve) throw new Error('settleNextPut(): no PUT is open');
      await act(async () => {
        resolve(jsonResponse({ manualDataApplied: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    get openPutCount() { return openPuts.length; },
  };
}

function editNif(value) {
  fireEvent.change(screen.getByTestId('ident-nif'), { target: { value } });
}

function editBox46(value) {
  fireEvent.change(screen.getByTestId('box-46'), { target: { value } });
}

function findCancelarBtn() {
  return Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.cancel'));
}

function findGuardarBtn() {
  return screen.getByTestId('FmModel303Page__save');
}

function findCalcularBtn() {
  return Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.compute'));
}

function clickCancelar() {
  fireEvent.click(findCancelarBtn());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FmModel303Page — Cancelar discards unsaved edits (ETP-5338 Bug B fix)', () => {
  it('issues ZERO PUT requests when an identification edit is cancelled', async () => {
    installImmediateServer();
    const onBack = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={onBack} onStatusChange={vi.fn()} />);

    editNif('DISCARDED-EDIT');
    await act(async () => { clickCancelar(); });

    // Even advancing well past the OLD 800ms debounce window must never fire a PUT — there is no
    // timer left to fire, but this is the regression guard against reintroducing one.
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(putCalls()).toHaveLength(0);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('issues ZERO PUT requests when a box-override edit is cancelled', async () => {
    installImmediateServer();
    const onBack = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={onBack} onStatusChange={vi.fn()} />);

    editBox46('1234.56');
    await act(async () => { clickCancelar(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(putCalls()).toHaveLength(0);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('discards BOTH an identification edit and a box edit made in the same session', async () => {
    installImmediateServer();
    const onBack = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={onBack} onStatusChange={vi.fn()} />);

    editNif('DISCARDED-NIF');
    editBox46('999');
    await act(async () => { clickCancelar(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(putCalls()).toHaveLength(0);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onBack exactly once and makes no other side-effecting call', async () => {
    installImmediateServer();
    const onBack = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={onBack} onStatusChange={vi.fn()} />);

    editNif('X');
    // No Guardar/Calcular click at all before Cancelar.
    fireEvent.click(Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('fm.action.cancel')));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(putCalls()).toHaveLength(0);
  });

  // ETP-5338 follow-up — the edge case the earlier tests above don't cover: they only ever click
  // Cancelar BEFORE any Guardar/Calcular save has started, where "no autosave" alone is enough to
  // guarantee zero PUTs. This test instead reproduces the narrow race the redesign's own explicit
  // Guardar/Calcular persist path reopened: Guardar's PUT is held open, a Calcular click queues a
  // second save behind it via `persistEditableFields`'s own `waitUntilManualDataIdle` wait (NOT
  // `useRecordWriteQueue`'s internal `queuedRef` — see the NOTE this replaces in
  // `FmModel303Page.explicitSaveSingleFlight.vitest.jsx`), and Cancelar unmounts the page before
  // Guardar's PUT settles. Once Guardar's PUT finally resolves, the queued Calcular-triggered save
  // must NOT fire a second PUT — Cancelar must mean the record is genuinely done being written to,
  // no matter which explicit action queued the pending write.
  //
  // DEFENSIVE TEST (per this ticket's established pattern): written by the implementing developer
  // alongside the fix for immediate coverage — flagged for Tester's full audit pass, not treated
  // as the final word on this edge case.
  it('never fires a Calcular save queued behind an in-flight Guardar PUT once Cancelar has unmounted the page', async () => {
    const server = installControllableServer();
    const onBack = vi.fn();
    const { unmount } = render(
      <FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={onBack} onStatusChange={vi.fn()} />,
    );

    editNif('GUARDAR-EDIT');
    await act(async () => { fireEvent.click(findGuardarBtn()); });
    expect(putCalls()).toHaveLength(1);
    expect(server.openPutCount).toBe(1);

    // Calcular click while Guardar's PUT is still open. Its own `persistEditableFields` call
    // awaits `waitUntilManualDataIdle` on the SAME record and has not issued its own PUT yet —
    // it is "queued" behind Guardar's write, in the sense this ticket cares about, without ever
    // touching `useRecordWriteQueue`'s own `queuedRef`.
    editNif('CALCULAR-EDIT');
    await act(async () => { fireEvent.click(findCalcularBtn()); });
    expect(putCalls()).toHaveLength(1); // still just Guardar's own PUT

    // Cancelar fires — and in production this unmounts the page (`onBack` swaps it out of the
    // parent's tree) BEFORE the Guardar PUT has resolved.
    await act(async () => {
      clickCancelar();
      unmount();
    });
    expect(onBack).toHaveBeenCalledTimes(1);

    // Only now does the Guardar PUT resolve. If the queued Calcular save were still going to
    // fire, this is where it would issue its own PUT.
    await server.settleNextPut();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(putCalls()).toHaveLength(1);
    expect(server.openPutCount).toBe(0);
  });
});
