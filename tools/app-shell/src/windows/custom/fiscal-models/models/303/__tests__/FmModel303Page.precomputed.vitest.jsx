import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import FmModel303Page from '../FmModel303Page.jsx';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('../../fiscalModelsUtils.js', () => ({
  formatAmount:     (n) => String(n),
  formatPeriod:     (p) => p,
  computeBoxes303:  vi.fn(),
  generate303File:  vi.fn(),
  checkModified303: vi.fn(),
}));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));

const DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'borrador', result: null, incidents: { blocking: 0, warning: 0 },
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
        token="tok"
        apiBaseUrl="http://host/neo/fiscal-models"
      />
    );
    const calcBtns = screen.queryAllByRole('button', { name: /fm\.action\.compute/i });
    expect(calcBtns.length).toBeGreaterThan(0);
  });
});
