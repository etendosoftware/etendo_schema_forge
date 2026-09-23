import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import FmListPage from '../FmListPage.jsx';

vi.mock('../useFiscalAutoCompute.js', () => ({
  default: vi.fn(() => ({ computedMap: {} })),
}));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key, useLocaleSwitch: () => ({ locale: 'es_ES' }) }));

import useFiscalAutoCompute from '../useFiscalAutoCompute.js';

describe('FmListPage — auto-compute wiring', () => {
  beforeEach(() => {
    useFiscalAutoCompute.mockClear();
  });

  it('passes enabled=true when token and apiBaseUrl are present', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    // Both auto-compute calls must gate on token+apiBaseUrl being present
    calls.forEach(call => {
      expect(call[1].enabled).toBe(true);
    });
  });

  // ETP-4755 — "Resultado" column auto-compute split: 2 draft (polling) + 2
  // "other" (ready/skipped, non-draft, one-time) hooks fed the list, 4 total.
  // ETP-5438 narrowed "other" further: submitted-family declarations were carved
  // out into their own 2 "submitted" (frozen) hooks, so it's 6 total now.
  it('calls useFiscalAutoCompute exactly 6 times (draft 303/349, other 303/349, submitted 303/349)', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    expect(useFiscalAutoCompute.mock.calls).toHaveLength(6);
  });

  it('the 2 "other" (ready/skipped) hook calls have no checkModifiedFn — no polling', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;
    // 2 draft hooks carry a real (polling) checkModifiedFn, 2 submitted hooks carry a
    // frozen "always false" one (ETP-5438 — see the next test), and the 2 "other"
    // (ready/skipped) hooks intentionally omit it entirely.
    const withCheckModified = calls.filter(call => typeof call[1].checkModifiedFn === 'function');
    const withoutCheckModified = calls.filter(call => call[1].checkModifiedFn === undefined);
    expect(withCheckModified).toHaveLength(4);
    expect(withoutCheckModified).toHaveLength(2);
  });

  // ETP-5438 — the 2 submitted-family hooks are distinguished from the 2 draft
  // (real polling) hooks by NOT being `checkModified303`/`checkModified349`, and by
  // always resolving `false` — this is what makes useFiscalAutoCompute trust its own
  // sessionStorage cache instead of live-recomputing on every FmListPage re-mount
  // (the actual "sigue tomando facturas aun presentada" root cause).
  it('the 2 "submitted" hook calls carry a distinct, always-false checkModifiedFn (frozen, not polling)', async () => {
    const { checkModified303, checkModified349 } = await import('../fiscalModelsUtils.js');
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;
    const draftCalls = calls.filter(call =>
      call[1].checkModifiedFn === checkModified303 || call[1].checkModifiedFn === checkModified349);
    const frozenCalls = calls.filter(call =>
      typeof call[1].checkModifiedFn === 'function'
      && call[1].checkModifiedFn !== checkModified303
      && call[1].checkModifiedFn !== checkModified349);
    expect(draftCalls).toHaveLength(2);
    expect(frozenCalls).toHaveLength(2);
    await expect(frozenCalls[0][1].checkModifiedFn()).resolves.toBe(false);
    await expect(frozenCalls[1][1].checkModifiedFn()).resolves.toBe(false);
  });

  it('all 6 hook calls still gate enabled on token+apiBaseUrl, including the "other"/"submitted" ones', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;
    calls.forEach(call => {
      expect(call[1].enabled).toBe(true);
    });
  });

  it('passes enabled=false for all 6 hook calls when token/apiBaseUrl are absent', () => {
    render(<FmListPage />);
    const calls = useFiscalAutoCompute.mock.calls;
    expect(calls).toHaveLength(6);
    calls.forEach(call => {
      expect(call[1].enabled).toBe(false);
    });
  });

  // ETP-5438 — a submitted-family declaration must be routed into one of the frozen
  // (always-false checkModifiedFn) buckets, never into the "other" (ready/skipped,
  // no-checkModifiedFn) bucket — that bucket's own mount effect ignores its session
  // cache entirely (no checkFn to consult it with) and live-recomputes on every
  // FmListPage re-mount, which is exactly the bug this split fixes.
  it('routes a submitted declaration into a frozen (checkModifiedFn-bearing) bucket, not the plain "other" one', () => {
    const decls = [
      { id: 'ready-1', model: '303', year: 2026, period: 'T1', status: 'ready' },
      { id: 'sub-1', model: '303', year: 2026, period: 'T2', status: 'submitted' },
      { id: 'sub-2', model: '349', year: 2026, period: 'T1', status: 'submitted_ack' },
    ];
    render(<FmListPage declarations={decls} token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;

    const callContaining = (id) => calls.find(call => call[0].some(d => d.id === id));

    const readyCall = callContaining('ready-1');
    expect(readyCall[1].checkModifiedFn).toBeUndefined();

    const sub1Call = callContaining('sub-1');
    expect(typeof sub1Call[1].checkModifiedFn).toBe('function');

    const sub2Call = callContaining('sub-2');
    expect(typeof sub2Call[1].checkModifiedFn).toBe('function');
  });
});

// ── "Resultado" renders from the correct map (draft vs non-draft, ETP-4755) ───
// Each of the 4 useFiscalAutoCompute calls only ever receives the decls it was
// filtered for (draftDecls303/349 vs otherDecls303/349) — so a mock that just
// echoes back a computedMap keyed off whatever decls it was actually called
// with is enough to prove the list picks the right map for each row's status,
// without ever mixing computedMap/computedMapOther303 up.
describe('FmListPage — "Resultado" column reads from the correct map', () => {
  const TOKEN = 'test-token';
  const API_BASE_URL = 'http://host/neo/fiscal-models';

  const makeRow = (overrides) => ({
    id: `row-${Math.random()}`,
    model: '303',
    year: 2026,
    period: 'T1',
    type: 'ord',
    status: 'draft',
    result: null,
    incidents: { blocking: 0, warning: 0 },
    updatedAt: '2026-01-20',
    ...overrides,
  });

  beforeEach(() => {
    useFiscalAutoCompute.mockClear();
    // Echo back a computedMap keyed by whichever decls this specific call
    // received — draft-only vs non-draft-only, per FmListPage.jsx's own split.
    // ETP-5272 pt.6 — the "Resultado" column now re-derives box 71 from
    // `computed.boxes` (via recomputeDerivedBoxes/applyOverrides/getBoxValue)
    // instead of trusting the raw `computed.summary.result` (box 46), so the
    // mock must carry a `boxes` shape that yields the same 500/-300 through
    // that derivation (box 27 alone, no other inputs, box65 defaults to 100 —
    // see fiscalModelsUtils.js's recomputeDerivedBoxes for the full formula).
    useFiscalAutoCompute.mockImplementation((decls) => {
      const map = {};
      decls.forEach(d => {
        if (d.model === '303') {
          const box27 = d.status === 'draft' ? 500 : -300;
          map[d.id] = { summary: { result: box27 }, error: null, boxes: { 27: box27 } };
        }
      });
      return { computedMap: map };
    });
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('fiscal-models-catalog')) {
        return Promise.resolve({ ok: true, json: async () => ({ '303': true, '349': true }) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  async function waitForCatalogLoad() {
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
  }

  it('a draft declaration renders its Resultado from the draft (computedMap) hook call', async () => {
    const decl = makeRow({ id: 'draft-x', status: 'draft' });
    const { container } = render(
      <FmListPage declarations={[decl]} token={TOKEN} apiBaseUrl={API_BASE_URL} />
    );
    await waitForCatalogLoad();

    const resultCell = container.querySelector('tbody tr').querySelectorAll('td')[5];
    expect(resultCell.textContent).toContain('500');
  });

  it('a non-draft (submitted) declaration renders its Resultado from the "other" (computedMapOther303) hook call', async () => {
    const decl = makeRow({ id: 'sub-x', status: 'submitted' });
    const { container } = render(
      <FmListPage declarations={[decl]} token={TOKEN} apiBaseUrl={API_BASE_URL} />
    );
    await waitForCatalogLoad();

    const resultCell = container.querySelector('tbody tr').querySelectorAll('td')[5];
    expect(resultCell.textContent).toContain('300');
  });

  it('a draft and a non-draft row in the same list each render from their own map, without crossing over', async () => {
    const draftDecl = makeRow({ id: 'draft-y', status: 'draft' });
    const submittedDecl = makeRow({ id: 'sub-y', status: 'submitted', period: 'T2' });
    const { container } = render(
      <FmListPage declarations={[draftDecl, submittedDecl]} token={TOKEN} apiBaseUrl={API_BASE_URL} />
    );
    await waitForCatalogLoad();

    const rows = container.querySelectorAll('tbody tr');
    const texts = Array.from(rows).map(r => r.querySelectorAll('td')[5].textContent);
    expect(texts.some(t => t.includes('500'))).toBe(true);
    expect(texts.some(t => t.includes('300'))).toBe(true);
  });
});

// ── "Resultado" merges manualData.manualOverrides (ETP-5272 pt.6) ────────────
// GET /fiscal303/boxes (the real backend behind `useFiscalAutoCompute`) computes
// purely from invoice data — no declaration id, no manualOverrides input — so
// `computed.summary.result` is always the raw box 46 sub-total. The list column
// must re-derive box 71 from `computed.boxes` merged with this row's own
// `decl.manualData.manualOverrides` (same helpers FmModel303Page.jsx's detail
// view uses), never trust the raw backend summary.
describe('FmListPage — "Resultado" column merges manualData.manualOverrides', () => {
  const TOKEN = 'test-token';
  const API_BASE_URL = 'http://host/neo/fiscal-models';

  const makeRow = (overrides) => ({
    id: `row-${Math.random()}`,
    model: '303',
    year: 2026,
    period: 'T1',
    type: 'ord',
    status: 'draft',
    result: null,
    incidents: { blocking: 0, warning: 0 },
    updatedAt: '2026-01-20',
    ...overrides,
  });

  beforeEach(() => {
    useFiscalAutoCompute.mockClear();
    // `summary.result` is deliberately a stale/wrong value (9999) — the whole
    // point of these tests is proving the column never falls back to trusting it
    // once real `boxes` are present.
    useFiscalAutoCompute.mockImplementation((decls) => {
      const map = {};
      decls.forEach(d => {
        if (d.model === '303') {
          map[d.id] = { summary: { result: 9999 }, error: null, boxes: { 27: 1000 } };
        }
      });
      return { computedMap: map };
    });
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('fiscal-models-catalog')) {
        return Promise.resolve({ ok: true, json: async () => ({ '303': true, '349': true }) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  async function waitForCatalogLoad() {
    await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
  }

  it('re-derives box 71 from the row\'s manualOverrides instead of the raw backend summary.result', async () => {
    const decl = makeRow({
      id: 'override-x',
      manualData: { manualOverrides: { 42: 500 } },
    });
    const { container } = render(
      <FmListPage declarations={[decl]} token={TOKEN} apiBaseUrl={API_BASE_URL} />
    );
    await waitForCatalogLoad();

    const resultCell = container.querySelector('tbody tr').querySelectorAll('td')[5];
    // box45 = 500 (override on 42), box46 = 1000-500 = 500, and every box downstream
    // of it (64/66/69/71) carries the same 500 through — see recomputeDerivedBoxes.
    expect(resultCell.textContent).toContain('500');
    expect(resultCell.textContent).not.toContain('9999');
  });

  it('renders the box-71-derived result (no override applied) when manualData is absent', async () => {
    const decl = makeRow({ id: 'no-override-x' });
    const { container } = render(
      <FmListPage declarations={[decl]} token={TOKEN} apiBaseUrl={API_BASE_URL} />
    );
    await waitForCatalogLoad();

    const resultCell = container.querySelector('tbody tr').querySelectorAll('td')[5];
    expect(resultCell.textContent).toContain('1.000');
    expect(resultCell.textContent).not.toContain('9999');
  });

  it('an empty manualOverrides object behaves exactly like manualData being absent', async () => {
    const decl = makeRow({ id: 'empty-override-x', manualData: { manualOverrides: {} } });
    const { container } = render(
      <FmListPage declarations={[decl]} token={TOKEN} apiBaseUrl={API_BASE_URL} />
    );
    await waitForCatalogLoad();

    const resultCell = container.querySelector('tbody tr').querySelectorAll('td')[5];
    expect(resultCell.textContent).toContain('1.000');
  });
});
