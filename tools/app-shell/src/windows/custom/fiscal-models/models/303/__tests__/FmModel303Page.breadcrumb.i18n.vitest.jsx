// Real-locale breadcrumb regression coverage (ETP-4945).
//
// FmModel303Page.jsx used to render `Tesorería / Modelo 303 - {periodLabel}` —
// a raw hardcoded Spanish literal. The fix is
// `${ui('finance')} / ${ui('fm.breadcrumb.section')} / Modelo 303 - {periodLabel}`,
// 3 segments, matching the fm-list breadcrumb's root+section. Breadcrumb is
// inline JSX text (not a useSetPageMeta call), so this asserts the rendered
// title-bar text directly, following the sibling FmModel303Page.vitest.jsx's
// mocking shape but with `useUI` backed by the real locale dictionary instead
// of its identity mock.
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { loadLocaleDictionary, makeRealUI } from '../../../../shared/__tests__/testUtils/realLocaleUI.js';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => activeUi }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
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
  EmptyState: () => React.createElement('div', { className: 'fm-empty-state' }, 'empty'),
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
  PresentModal: () => null,
  FileGenModal303: () => null,
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

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
};

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
};

describe('FmModel303Page — breadcrumb against the real locale dictionary (ETP-4945)', () => {
  it('resolves the es_ES breadcrumb to "Finanzas / Modelos Fiscales / Modelo 303 - 2026/T2", not the stale "Tesorería"', () => {
    activeUi = realUiEs;
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    expect(container.textContent).toContain('Finanzas / Modelos Fiscales / Modelo 303 - 2026/T2');
    expect(container.textContent).not.toContain('Tesorería');
  });

  // ETP-5338 — the "Modelo 303" segment itself used to be a hardcoded Spanish
  // literal even under en_US, surviving the ETP-4945 fix which only localized
  // the root/section segments. Now resolved via the shared 'fm.config.m303.title'
  // key (already used by the catalog config section header), which translates
  // "Modelo" to "Form" — the term AEAT-form-aware English UI copy uses.
  it('resolves the en_US breadcrumb to "Finance / Fiscal Models / Form 303 - 2026/T2", not the stale "Modelo"', () => {
    activeUi = realUiEn;
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    expect(container.textContent).toContain('Finance / Fiscal Models / Form 303 - 2026/T2');
    expect(container.textContent).not.toContain('Modelo 303');
  });
});
