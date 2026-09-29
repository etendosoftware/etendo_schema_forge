// Vitest tests for FmModel303Page's ETP-4975 missing-default-IAE-activity
// pre-flight guard in handleGenerate ("Generar fichero 303"). Mirrors the
// identical guard already covered on AeatSubmitFlow's own submit button
// (reached via PresentModal's "aeat_telematic" path) — see AeatSubmitFlow.jsx's
// own handleSubmit and its docstring for the full rationale (Classic's Modelo
// 303 code, reused via reflection, throws an untranslated
// IndexOutOfBoundsException on the last period of the fiscal year when the
// organization has no default IAE activity with a code).
//
// ETP-5432 pt.10 follow-up — the guard's user-facing feedback is now
// `showIaeActivityReminder` (a toast), never the old fixed inline banner, on
// EVERY trigger this component fires it from: the page-mount proactive check
// AND this file's "Generar fichero 303" click path. Mocked here (like
// `FmCatalogPage.iaeReminder.vitest.jsx`/`FmOverlays.iaeReminder.vitest.jsx`
// already do) so these tests assert the call, not sonner's actual DOM output —
// the toast's own content/CTA-click-navigates behavior is unit-tested in
// `fiscalModelsUtils.iae.vitest.js`.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' } }),
}));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: vi.fn().mockResolvedValue(null),
    generate303File: vi.fn().mockResolvedValue({ ok: true }),
    fetchDeclarationIncidents: vi.fn().mockResolvedValue({ blocking: 0, warning: 0, items: [] }),
    showIaeActivityReminder: vi.fn(),
  };
});
// ETP-5432 pt.10 SECOND follow-up — deliberately NOT mocking `neoBase` (unlike this
// directory's usual `(u) => u ?? ''` identity boilerplate): the real implementation strips
// the last path segment (`/sws/neo/fiscal-models` -> `/sws/neo`), and an identity mock makes
// `resolveApiUrl`'s "path already starts with base" verbatim escape hatch trivially true for
// a manually-prefixed path built from the SAME `apiBaseUrl` — which is exactly what hid the
// real double-prefix/missing-`{baseUrl:''}` bug from every test in this file the first time
// around. The real `neoBase` is pure and dependency-free, safe to leave unmocked.
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  SummaryCard: () => null,
  Tabs: ({ tabs, active, onSelect }) => React.createElement(
    'div',
    { role: 'tablist' },
    tabs.map(t => React.createElement(
      'button',
      { key: t.id, role: 'tab', 'aria-selected': String(t.id === active), onClick: () => onSelect(t.id) },
      t.label
    ))
  ),
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => null,
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({
  default: () => React.createElement('div', { 'data-testid': 'fm-boxes-303' }, 'boxes'),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  // Exposes one "invoke onConfirm" button per PresentModal path (real bug found via live
  // retest: 'submitted'/'submitted_ack' — the two DIRECT manual paths — never went through
  // ANY missing-IAE check at all, only 'aeat_telematic' did via AeatSubmitFlow's own guard).
  PresentModal: ({ onConfirm }) => React.createElement(
    'div',
    { 'data-testid': 'PresentModal-mock' },
    React.createElement(
      'button',
      { 'data-testid': 'present-confirm-submitted', onClick: () => onConfirm?.({ status: 'submitted', acuseFile: null }) },
      'confirm-submitted',
    ),
    React.createElement(
      'button',
      { 'data-testid': 'present-confirm-submitted-ack', onClick: () => onConfirm?.({ status: 'submitted_ack', acuseFile: null }) },
      'confirm-submitted-ack',
    ),
  ),
  // Exposes an "invoke onConfirm" button so tests can drive handleGenerate directly,
  // same pattern as FmModel303Page.vitest.jsx.
  FileGenModal303: ({ onConfirm }) => React.createElement(
    'div',
    { 'data-testid': 'FileGenModal303-mock' },
    React.createElement(
      'button',
      { 'data-testid': 'filegen303-confirm', onClick: () => onConfirm?.({ filename: undefined }) },
      'confirm-filegen',
    ),
  ),
}));
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null,
  useAttachments: () => ({ upload: vi.fn() }),
}));
vi.mock('lucide-react', () => ({
  Download: () => null, ArrowLeft: () => null, Save: () => null, OctagonAlert: () => null, TriangleAlert: () => null,
  CircleCheck: () => null, Calculator: () => null, Loader2: () => null,
  TrendingUp: () => null, TrendingDown: () => null, ClipboardCheck: () => null,
  ReceiptText: () => null, FileCheck: () => null, Landmark: () => null,
}));

import FmModel303Page from '../FmModel303Page.jsx';
import { generate303File, showIaeActivityReminder } from '../../../fiscalModelsUtils.js';

const LAST_PERIOD_DECL = {
  id: '303-2026-T4', model: '303', year: 2026, period: 'T4', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
  // ETP-5187 required-field gate: tipo_declaracion must be set or "Generar fichero 303"
  // never even opens FileGenModal303 — unrelated to this file's own IAE-activity guard.
  identification: { tipo_declaracion: 'I' },
};

const NOT_LAST_PERIOD_DECL = { ...LAST_PERIOD_DECL, id: '303-2026-T2', period: 'T2' };

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/sws/neo/fiscal-models',
};

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

// iaeRows null => the /organization/actividadesDelIae fetch itself rejects (fail-open case).
//
// ETP-5432 pt.10 SECOND follow-up — the actividadesDelIae branch used to match on a lenient
// `url.includes('/organization/actividadesDelIae')`, which also matched a malformed,
// double-prefixed URL (e.g. "/sws/neo/fiscal-models/sws/neo/organization/actividadesDelIae?...",
// produced by a call site missing `{ baseUrl: '' }`) — masking a real bug that a live retest
// caught but this mock did not. Only the EXACT clean path now resolves; anything else
// containing the same substring 404s, exactly like the real NEO backend would against an
// unknown route — this is what would have caught the double-prefix bug.
function makeFetchMock({ iaeRows = [], iaeRejects = false } = {}) {
  return vi.fn((url) => {
    if (url.startsWith('/sws/neo/organization/actividadesDelIae?')) {
      if (iaeRejects) return Promise.reject(new Error('network down'));
      return jsonResponse({ response: { data: iaeRows } });
    }
    if (url.includes('/organization/actividadesDelIae')) {
      // Any OTHER shape containing this substring (double-prefixed, wrong base, etc.) 404s.
      return jsonResponse({}, false);
    }
    if (url.includes('/session')) {
      return jsonResponse({ organization: { taxId: 'B1', name: 'Acme' } });
    }
    return jsonResponse({});
  });
}

async function openFileGenAndConfirm() {
  const genBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.gen303'));
  fireEvent.click(genBtn);
  fireEvent.click(await screen.findByTestId('filegen303-confirm'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FmModel303Page — missing default IAE activity guard (ETP-4975)', () => {
  it('last period + a default row WITH a code: proceeds to generate normally', async () => {
    global.fetch = makeFetchMock({ iaeRows: [{ id: 'row-1', default: true, epiaeCode: 'C1' }] });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(generate303File).toHaveBeenCalledTimes(1));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('last period + NO default row: blocks BEFORE calling generate303File and fires the toast, not a banner', async () => {
    global.fetch = makeFetchMock({ iaeRows: [] });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    // The mount-time proactive check (pt.10) may already have fired the toast once by
    // the time the click resolves — this only asserts the click path ALSO uses the toast
    // (never a banner), not an exact call count shared with the mount effect.
    await waitFor(() => expect(showIaeActivityReminder).toHaveBeenCalled());
    expect(generate303File).not.toHaveBeenCalled();
    // ETP-5432 pt.10 follow-up — no fixed inline banner/CTA for this case anymore, from
    // any trigger. The toast's own CTA click-to-navigate is covered by
    // fiscalModelsUtils.iae.vitest.js, not re-tested here.
    expect(screen.queryByText('fm.aeat.error.missingDefaultIae')).not.toBeInTheDocument();
    expect(screen.queryByText('fm.aeat.action.go_to_organization')).not.toBeInTheDocument();
  });

  it('last period + a default row WITHOUT a code: still counts as missing and blocks', async () => {
    global.fetch = makeFetchMock({ iaeRows: [{ id: 'row-1', default: true, epiaeCode: null }] });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(showIaeActivityReminder).toHaveBeenCalled());
    expect(generate303File).not.toHaveBeenCalled();
  });

  it('non-last period: never checks actividadesDelIae and generates normally', async () => {
    const fetchMock = makeFetchMock({ iaeRows: [] }); // would block if (wrongly) checked
    global.fetch = fetchMock;
    render(<FmModel303Page decl={NOT_LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(generate303File).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/organization/actividadesDelIae'))).toBe(false);
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('fails OPEN when the actividadesDelIae fetch itself errors (network failure): generation still proceeds', async () => {
    global.fetch = makeFetchMock({ iaeRejects: true });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(generate303File).toHaveBeenCalledTimes(1));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('clicking "Generar fichero 303" with a missing IAE activity calls showIaeActivityReminder with the live navigate', async () => {
    global.fetch = makeFetchMock({ iaeRows: [] });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(showIaeActivityReminder).toHaveBeenCalled());
    // Every call must be wired to this page's real `navigate` (react-router's
    // `useNavigate`, mocked at module level as `navigateMock`) — the toast's own
    // CTA-click-to-navigate mechanics are unit-tested in fiscalModelsUtils.iae.vitest.js.
    for (const call of showIaeActivityReminder.mock.calls) {
      expect(call[1]).toBe(navigateMock);
      // ETP-5432 pt.10 third follow-up (user correction) — every call from this page's
      // own guards (mount effect, "Generar fichero 303", "Registrar/Presentar") must use
      // error severity, not the default warning.
      expect(call[2]).toEqual({ severity: 'error' });
    }
  });
});

// Real bug found via live retest (hard reload, not a stale build): choosing either of the
// two DIRECT manual "Registrar/Presentar" paths ("Presentación con/sin Acuse de recibo",
// PresentModal's LEFT column) skipped the missing-IAE guard entirely — only the
// 'aeat_telematic' path ever reached a check (AeatSubmitFlow's own `checkMissingIaeGuard`,
// deep inside a separate modal). `handlePresent` now runs the SAME guard (reused from
// AeatSubmitFlow.jsx, not a 4th hand-rolled copy) up front, before `persistEditableFields`/
// `handleStatusChange`, for every path uniformly.
describe('FmModel303Page — missing default IAE activity guard covers the manual "Registrar/Presentar" paths too', () => {
  async function openPresentAndConfirm(testId) {
    const presentBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.submit'));
    fireEvent.click(presentBtn);
    fireEvent.click(await screen.findByTestId(testId));
  }

  it('blocks the "sin acuse" path (status "submitted") before any status change', async () => {
    global.fetch = makeFetchMock({ iaeRows: [] });
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} onStatusChange={onStatusChange} />);

    await openPresentAndConfirm('present-confirm-submitted');

    await waitFor(() => expect(showIaeActivityReminder).toHaveBeenCalled());
    expect(onStatusChange).not.toHaveBeenCalled();
    // ETP-5432 pt.10 third follow-up (user correction) — error severity, not warning.
    expect(showIaeActivityReminder).toHaveBeenCalledWith(expect.any(Function), navigateMock, { severity: 'error' });
  });

  it('blocks the "con acuse" path (status "submitted_ack") the same way', async () => {
    global.fetch = makeFetchMock({ iaeRows: [] });
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} onStatusChange={onStatusChange} />);

    await openPresentAndConfirm('present-confirm-submitted-ack');

    await waitFor(() => expect(showIaeActivityReminder).toHaveBeenCalled());
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(showIaeActivityReminder).toHaveBeenCalledWith(expect.any(Function), navigateMock, { severity: 'error' });
  });

  it('lets a manual path through normally once a valid default IAE activity exists', async () => {
    global.fetch = makeFetchMock({ iaeRows: [{ id: 'row-1', default: true, epiaeCode: 'C1' }] });
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} onStatusChange={onStatusChange} />);

    await openPresentAndConfirm('present-confirm-submitted');

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(LAST_PERIOD_DECL.id, 'submitted', 'manual_no_receipt'));
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  it('non-last period: never checks actividadesDelIae and proceeds normally', async () => {
    const fetchMock = makeFetchMock({ iaeRows: [] }); // would block if (wrongly) checked
    global.fetch = fetchMock;
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={NOT_LAST_PERIOD_DECL} {...defaultProps} onStatusChange={onStatusChange} />);

    await openPresentAndConfirm('present-confirm-submitted');

    await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
    expect(showIaeActivityReminder).not.toHaveBeenCalled();
  });

  // ── Async-timing verification (this is the part a synchronous render/mock can't catch) ──
  it('awaits the guard under a SLOW/delayed network response — no race, no fail-open on "not yet resolved"', async () => {
    // Models a genuine hard-reload: the actividadesDelIae fetch (fired both by this page's
    // own pt.10 mount effect AND by handlePresent's own guard call) stays PENDING until the
    // test explicitly resolves it — mimicking real network latency the previous synchronous
    // tests/mocks never modeled. If `handlePresent` read a not-yet-settled value instead of
    // `await`ing the guard, or defaulted to "not blocked" while pending, `onStatusChange`
    // would already have fired by the time we assert, BEFORE the network call ever resolves.
    const pendingResolvers = [];
    global.fetch = vi.fn((url) => {
      // Exact-path match only (see `makeFetchMock`'s own comment above) — a malformed,
      // double-prefixed URL 404s immediately rather than joining the slow-resolving pool,
      // so this test would also fail loudly (guard never blocks) if that bug resurfaced.
      if (url.startsWith('/sws/neo/organization/actividadesDelIae?')) {
        return new Promise((resolve) => {
          pendingResolvers.push(() => resolve({ ok: true, json: async () => ({ response: { data: [] } }) }));
        });
      }
      if (url.includes('/organization/actividadesDelIae')) {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    function resolveAllPendingIaeFetches() {
      pendingResolvers.splice(0).forEach(resolve => resolve());
    }

    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} onStatusChange={onStatusChange} />);

    const presentBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.submit'));
    fireEvent.click(presentBtn);
    fireEvent.click(await screen.findByTestId('present-confirm-submitted'));

    // The guard's own fetch is still in flight at this point — handlePresent must be
    // suspended on it, not have already decided "not blocked" and moved on.
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(showIaeActivityReminder).not.toHaveBeenCalled();

    // Now let the slow network response(s) resolve.
    resolveAllPendingIaeFetches();

    await waitFor(() => expect(showIaeActivityReminder).toHaveBeenCalled());
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});
