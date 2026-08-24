// Adversarial QA pass on the "Justificante" receipt tab port (ETP-4755) —
// deliberately does NOT mock '@/components/attachments' (unlike the sibling
// FmModel349Page.receiptTab.vitest.jsx), so the REAL AttachmentsTab/useAttachments
// implementation runs against a mocked global.fetch. This is what lets these
// tests see through the mock in the sibling file and catch behavior the mocked
// suite structurally cannot: whether the "isActive: false keeps it from eagerly
// listing/fetching attachments on mount" comment in FmModel349Page.jsx actually
// holds against the real hook.
//
// Findings written up as bugs in the QA report (not fixed here, per QA charter):
//   - BUG: useAttachments' eager-list effect depends on [tableName, recordId]
//     only — it never reads `isActive` — so the top-level
//     `useAttachments({ ..., isActive: false })` call in FmModel349Page.jsx
//     (used only to grab `upload`) still fires a real list() fetch on mount,
//     regardless of which tab is active. This is a pre-existing gap in the
//     shared hook (also present in FmModel303Page's identical pattern), not
//     something introduced by this file, but it's the second network fetch of
//     the receipt tab -- see below -- and it directly contradicts the comment
//     that describes the intended behavior.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: () => null,
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
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null,
}));
vi.mock('../../../fiscal-models.css', () => ({}));
// lucide-react is intentionally left UNMOCKED (unlike the sibling suite) —
// the real AttachmentsTab tree (ConfirmDeleteDialog -> Dialog, AttachmentsTable)
// needs real icon exports (X, FileX, Trash2, ...) that a narrow mock would miss.
// Real icons are cheap, side-effect-free SVG components — safe to render as-is.

// Real PresentModal from FmOverlays.jsx is used unmocked in one describe block
// below (MIME-gap trace) so the real file-picker `accept` attribute can be
// inspected; every other test mocks it the same way the sibling suite does.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// NOTE: '@/components/attachments' is intentionally left UNMOCKED here — this
// is the whole point of this file.

import FmModel349Page from '../FmModel349Page.jsx';
import { toast } from 'sonner';
import { compute349Operators } from '../../../fiscalModelsUtils.js';

/** Build a Response-like object backed by vi.fn returns (mirrors useAttachments.vitest.jsx). */
function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    clone() { return jsonResponse(body, { ok, status }); },
    blob: vi.fn().mockResolvedValue(new Blob(['x'])),
  };
}

const makeDecl = (overrides = {}) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'pending', nif: 'B12345678',
  operators: [], invoices: [], rectifications: [],
  incidents: { blocking: 0 }, _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FmModel349Page — real useAttachments: eager-fetch-on-mount gap (BUG)', () => {
  it('fires a GET to the attachments endpoint on mount even though the default tab is "operators", not "receipt"', async () => {
    render(<FmModel349Page decl={makeDecl({ id: 'decl-eager-1' })} {...defaultProps} />);

    // Sanity: the receipt tab is NOT selected by default.
    const tabs = screen.getAllByRole('tab');
    const receiptTab = tabs.find(t => t.textContent.includes('fm.tab.receipt'));
    expect(receiptTab.getAttribute('aria-selected')).toBe('false');

    // The top-level `useAttachments({ isActive: false })` call (only meant to
    // expose `upload`) still runs its eager list() effect, which depends only
    // on [tableName, recordId] and never reads `isActive` — so it fetches
    // regardless of tab. This contradicts the comment in FmModel349Page.jsx
    // ("isActive: false keeps it from eagerly listing/fetching attachments on
    // mount").
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const calledUrls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(calledUrls.some(u => u.includes('/sws/neo/attachments/ETGO_Fiscal_Decl/decl-eager-1'))).toBe(true);
  });

  it('fetches TWICE (once from the top-level hook, once from the tab\'s own AttachmentsTab) when the receipt tab is opened, for the same table/record', async () => {
    render(<FmModel349Page decl={makeDecl({ id: 'decl-eager-2' })} {...defaultProps} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));

    // AttachmentsTab's own internal useAttachments({ isActive: true }) mounts
    // and fires its own list() — a second, redundant GET against the exact
    // same endpoint the top-level hook already hit on mount.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    const urls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(urls[0]).toBe(urls[1]);
  });
});

describe('FmModel349Page — real AttachmentsTab: fetch failure degrades gracefully', () => {
  it('does not crash the page and shows the empty state (not a distinct error state) when list() fails with a 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ message: 'Unauthorized' }, { ok: false, status: 401 }));
    render(<FmModel349Page decl={makeDecl({ id: 'decl-401' })} {...defaultProps} />);

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));

    // Page keeps rendering — no thrown error, no error boundary triggered.
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByTestId('attachments-empty-state')).toBeInTheDocument();
  });

  it('renders the empty state (no crash) before the declaration has ever been submitted', async () => {
    render(<FmModel349Page decl={makeDecl({ id: 'decl-never-submitted', status: 'draft' })} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));

    await waitFor(() => expect(screen.getByTestId('attachments-empty-state')).toBeInTheDocument());
  });
});

describe('FmModel349Page — rapid tab switching against the real hook', () => {
  it('aborts the in-flight receipt-tab fetch cleanly on rapid switch-away with no console errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolveFetch;
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));

    render(<FmModel349Page decl={makeDecl({ id: 'decl-rapid' })} {...defaultProps} />);

    // Let the mount-time auto-compute (ETP-4755 — fires `handleCompute()`
    // when there's no precomputed data yet) settle before the rapid
    // tab-switching sequence below. Its `setComputing(false)` resolves on a
    // microtask outside of any act() wrapper unless we flush it here first —
    // otherwise it produces an unrelated "not wrapped in act" warning that
    // this test would misattribute to the tab-switching behavior under test.
    await waitFor(() => expect(compute349Operators).toHaveResolved());

    const tabs = screen.getAllByRole('tab');

    // Switch to receipt (mounts AttachmentsTab, starts its own list() fetch)
    // then immediately away (unmounts it) before that fetch resolves.
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.m349.tab.operators')));
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.receipt')));
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.m349.tab.operators')));

    // Now let the stale fetch resolve — its AbortController should have fired
    // on unmount, so the resolved promise must not cause a setState-after-unmount
    // warning or an unhandled error.
    resolveFetch(jsonResponse({ items: [] }));
    await Promise.resolve();
    await Promise.resolve();

    const reactActWarnings = consoleErrorSpy.mock.calls.filter(
      (args) => typeof args[0] === 'string' && /not wrapped in act|unmounted component/i.test(args[0])
    );
    expect(reactActWarnings).toHaveLength(0);
    consoleErrorSpy.mockRestore();
  });
});

describe('FmModel349Page — real PresentModal: acuse-de-recibo MIME-type gap (pre-existing, inherited from 303)', () => {
  // Uses the REAL PresentModal from FmOverlays.jsx (not mocked in this file),
  // so the modal's own `accept=".pdf,.xml"` file-input attribute is exercised,
  // and the real handlePresent -> uploadReceipt -> useAttachments.upload() path
  // runs against a mocked fetch. Neither layer validates the file's actual
  // MIME type — this mirrors FmModel303Page's identical handlePresent wiring
  // (same lack of validation there too), so this is NOT a new-to-349 regression,
  // just confirmation that 349 replicates the same gap verbatim.
  it("uploads a non-PDF file selected through the modal's own file input with no MIME check", async () => {
    render(<FmModel349Page decl={makeDecl({ id: 'decl-mime' })} {...defaultProps} />);

    const presentBtn = screen.getByText((t) => t.includes('fm.action.present') || t.includes("Marcar como 'Presentado'"));
    fireEvent.click(presentBtn);

    // Select the "Presentación con Acuse de recibo" path (first PATHS entry).
    fireEvent.click(screen.getByText('fm.present.path.acuse'));

    // The modal's own <input type="file" accept=".pdf,.xml"> — note it already
    // allows .xml, not just PDF, despite AttachmentsTab's own dropzone being
    // configured with allowedMimeTypes: ['application/pdf'] for this same table.
    const fileInput = document.querySelector('input[type="file"][accept=".pdf,.xml"]');
    expect(fileInput).not.toBeNull();

    const xmlFile = new File(['<root/>'], 'acuse.xml', { type: 'application/xml' });
    fireEvent.change(fileInput, { target: { files: [xmlFile] } });

    const confirmBtn = screen.getByText((t) => t.includes('fm.action.confirm_presentation') || t.includes('Confirmar'));
    fireEvent.click(confirmBtn);

    // useAttachments.upload() does no MIME validation whatsoever (unlike
    // UploadDropzone's isMimeAllowed check) — the POST goes out regardless.
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const postCall = globalThis.fetch.mock.calls.find((c) => c[1]?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(postCall[0]).toContain('/sws/neo/attachments/ETGO_Fiscal_Decl/decl-mime');
  });
});
