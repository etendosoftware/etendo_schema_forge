import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import FmListPage from '../FmListPage.jsx';

vi.mock('../useFiscalAutoCompute.js', () => ({
  default: vi.fn(() => ({ computedMap: {} })),
}));
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

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
  // "other" (non-draft, one-time) hooks now feed the list, 4 total.
  it('calls useFiscalAutoCompute exactly 4 times (draft 303, draft 349, other 303, other 349)', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    expect(useFiscalAutoCompute.mock.calls).toHaveLength(4);
  });

  it('the 2 "other" (non-draft) hook calls have no checkModifiedFn — no polling', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;
    // The 2 draft hooks (calls 0 and 1) carry a checkModifiedFn; the 2 "other"
    // hooks (calls 2 and 3) intentionally omit it — see FmListPage.jsx's own
    // comment on otherDecls303/otherDecls349 for why.
    const withCheckModified = calls.filter(call => typeof call[1].checkModifiedFn === 'function');
    const withoutCheckModified = calls.filter(call => call[1].checkModifiedFn === undefined);
    expect(withCheckModified).toHaveLength(2);
    expect(withoutCheckModified).toHaveLength(2);
  });

  it('all 4 hook calls still gate enabled on token+apiBaseUrl, including the "other" ones', () => {
    render(<FmListPage token="tok" apiBaseUrl="http://host/neo/fiscal-models" />);
    const calls = useFiscalAutoCompute.mock.calls;
    calls.forEach(call => {
      expect(call[1].enabled).toBe(true);
    });
  });

  it('passes enabled=false for all 4 hook calls when token/apiBaseUrl are absent', () => {
    render(<FmListPage />);
    const calls = useFiscalAutoCompute.mock.calls;
    expect(calls).toHaveLength(4);
    calls.forEach(call => {
      expect(call[1].enabled).toBe(false);
    });
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
    useFiscalAutoCompute.mockImplementation((decls) => {
      const map = {};
      decls.forEach(d => {
        if (d.model === '303') {
          map[d.id] = { summary: { result: d.status === 'draft' ? 500 : -300 }, error: null };
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
