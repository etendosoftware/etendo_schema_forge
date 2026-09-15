import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import FmModel303Page from '../FmModel303Page.jsx';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount:     (n) => String(n),
    formatPeriod:     (p) => p,
    computeBoxes303:  vi.fn(),
    generate303File:  vi.fn(),
    checkModified303: vi.fn(),
  };
});
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));

const DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: {
    boxes:   { 7: 100, 9: 21, 27: 21, 28: 500, 29: 105, 45: 105, 46: -84 },
    summary: { accrued: 21, deductible: 105, result: -84 },
    error:   null,
    computedAt: Date.now(),
  },
};

describe('FmModel303Page — precomputed data initialization', () => {
  it('renders compute button without spinner when precomputed data is present', () => {
    render(
      <FmModel303Page
        decl={DECL}
        onBack={vi.fn()}
        onStatusChange={vi.fn()}
      />
    );
    const calcBtns = screen.queryAllByRole('button', { name: /fm\.action\.compute/i });
    expect(calcBtns.length).toBeGreaterThan(0);
  });
});

// ── ETP-5272 pt.6 — precomputed boxes merge with manualOverrides on mount ────
// Before this fix, the mount effect skipped straight past `decl._precomputed`
// whenever it was present, leaving `liveBoxes`/`liveSummary` pinned to the raw
// seed from the initial `useState` — the user's already-saved `manualOverrides`
// stayed invisible until they manually re-ran "Calcular". The fix routes
// `decl._precomputed` through the same `applyComputeResult` helper "Calcular"
// itself uses, so the merge happens immediately, with no extra network call.
describe('FmModel303Page — precomputed boxes merge with manualOverrides on mount', () => {
  it('merges decl.manualData.manualOverrides into the precomputed boxes immediately, without waiting for "Calcular"', () => {
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      // Deliberately stale/wrong summary — the whole point is proving the
      // component re-derives from `boxes` + `manualOverrides` instead of
      // trusting this raw backend sub-total as-is. box 29 is a real (non-override)
      // deductible input so accrued/deductible/result land on 3 distinct values.
      _precomputed: {
        boxes: { 27: 1000, 29: 100, 65: 100 },
        summary: { accrued: 1000, deductible: 9999, result: 9999 },
        error: null,
        computedAt: Date.now(),
      },
      manualData: { manualOverrides: { 42: 300 } },
    };
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    // box45 = 100 (box29) + 300 (override on 42) = 400; box46 = 1000-400 = 600,
    // and every box downstream of it (64/66/69/71) carries the same 600 through
    // (box65 defaults to 100 — see fiscalModelsUtils.js's recomputeDerivedBoxes).
    expect(screen.getByText('1000')).toBeInTheDocument(); // accrued (box27, untouched)
    expect(screen.getByText('400')).toBeInTheDocument();  // deductible (box45, merged)
    expect(screen.getByText('600')).toBeInTheDocument();  // result (box71, merged)
    // The raw backend summary values must never surface.
    expect(screen.queryByText('9999')).not.toBeInTheDocument();
  });

  it('renders the plain box-71-derived values (no override applied) when manualData is absent', () => {
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: {
        boxes: { 27: 1000, 29: 100, 65: 100 },
        summary: { accrued: 1000, deductible: 9999, result: 9999 },
        error: null,
        computedAt: Date.now(),
      },
    };
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    // No overrides: box45 = 100 (box29 alone), box46 = 1000-100 = 900, flowing
    // through to box71.
    expect(screen.getByText('1000')).toBeInTheDocument(); // accrued
    expect(screen.getByText('100')).toBeInTheDocument();  // deductible
    expect(screen.getByText('900')).toBeInTheDocument();  // result
    expect(screen.queryByText('9999')).not.toBeInTheDocument();
  });
});
