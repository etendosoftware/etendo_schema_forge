// Real-locale breadcrumb regression coverage (ETP-4945).
//
// FmModel349Page.jsx used to render
// `Tesorería / Declaraciones / Modelo 349 - {periodLabel}` — 3 segments,
// inconsistent with the 303 page's 2-segment version and rooted under a raw
// hardcoded "Tesorería" literal. The fix aligns both 303 and 349 on
// `${ui('finance')} / ${ui('fm.breadcrumb.section')} / Modelo <n> - {periodLabel}`.
// Breadcrumb is inline JSX text (not a useSetPageMeta call), so this asserts
// the rendered title-bar text directly. Mirrors the sibling
// FmModel349Page.vitest.jsx's mocking shape but with `useUI` backed by the
// real locale dictionary instead of its identity mock.
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { loadLocaleDictionary, makeRealUI } from '../../../../shared/__tests__/testUtils/realLocaleUI.js';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;
let activeLocale = 'es_ES';

vi.mock('@/i18n', () => ({
  useUI: () => activeUi,
  useLocaleSwitch: () => ({ locale: activeLocale }),
}));

vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => String(n),
  compute349Operators: vi.fn(),
  generate349File: vi.fn(),
}));

vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({
    pdfUrl: null,
    loading: false,
    generatePdf: vi.fn(),
    clearPdf: vi.fn(),
  }),
}));

vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: () => null,
  Tabs: () => null,
  Banner: () => null,
}));

vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal: () => null,
}));

vi.mock('../../../../../../components/contract-ui/DocumentPreview.jsx', () => ({
  DocumentPreview: () => null,
}));

vi.mock('../../../fiscal-models.css', () => ({}));

vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
}));

vi.mock('lucide-react', () => ({
  ArrowLeft: () => null, Save: () => null, Download: () => null, FileDown: () => null, Play: () => null,
  OctagonAlert: () => null, CircleCheck: () => null, Search: () => null, RefreshCw: () => null,
  Globe: () => null, Eye: () => null, Lock: () => null, MoreVertical: () => null,
  ChevronDown: () => null, ChevronRight: () => null, Users: () => null, FileEdit: () => null,
  Clock: () => null, TriangleAlert: () => null, Folder: () => null, ReceiptText: () => null,
  Calculator: () => null, PenLine: () => null, ShieldAlert: () => null, Info: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, TrendingUp: () => null,
  TrendingDown: () => null, FileText: () => null, Settings: () => null, ArrowLeftRight: () => null,
  Pencil: () => null, X: () => null, Check: () => null, Checkbox: () => null, FileCheck: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';

// period 'T1' (not a 2-digit month code) keeps periodLabel deterministic:
// `${decl.year} ${decl.period}` — see FmModel349Page.jsx's monthNum/monthName
// derivation, which only kicks in for a 2-digit numeric period.
const makeDecl = (overrides = {}) => ({
  id: 'decl-001',
  model: '349',
  year: 2026,
  period: 'T1',
  type: 'ord',
  status: 'pending',
  nif: 'B12345678',
  operators: [],
  invoices: [],
  rectifications: 0,
  incidents: { blocking: 0 },
  _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'test-token',
  apiBaseUrl: '/api/fiscal-models',
};

describe('FmModel349Page — breadcrumb against the real locale dictionary (ETP-4945)', () => {
  it('resolves the es_ES breadcrumb to "Finanzas / Modelos Fiscales / Modelo 349 - 2026 T1", not the stale "Tesorería / Declaraciones"', () => {
    activeUi = realUiEs;
    activeLocale = 'es_ES';
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);

    expect(container.textContent).toContain('Finanzas / Modelos Fiscales / Modelo 349 - 2026 T1');
    expect(container.textContent).not.toContain('Tesorería');
  });

  // ETP-5338 — the "Modelo 349" segment itself used to be a hardcoded Spanish
  // literal even under en_US, surviving the ETP-4945 fix which only localized
  // the root/section segments. Now resolved via the shared 'fm.config.m349.title'
  // key (already used by the catalog config section header), which translates
  // "Modelo" to "Form" — the term AEAT-form-aware English UI copy uses.
  it('resolves the en_US breadcrumb to "Finance / Fiscal Models / Form 349 - 2026 T1", not the stale "Modelo"', () => {
    activeUi = realUiEn;
    activeLocale = 'en_US';
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);

    expect(container.textContent).toContain('Finance / Fiscal Models / Form 349 - 2026 T1');
    expect(container.textContent).not.toContain('Modelo 349');
  });

  // ETP-5338 — a MONTHLY declaration's periodLabel used to derive its month name
  // via `new Intl.DateTimeFormat(undefined, { month: 'long' })`: `undefined` locale
  // resolves to the runtime's/OS's default locale, NOT the app's selected UI
  // locale, so under a Spanish-language runtime the breadcrumb showed "octubre"
  // even with the UI set to en_US. `period: '10'` (2-digit numeric) is required to
  // hit this derivation — 'T1' above deliberately does not exercise it (see the
  // comment on makeDecl above).
  it('formats a monthly period\'s month name in Spanish under es_ES ("octubre")', () => {
    activeUi = realUiEs;
    activeLocale = 'es_ES';
    const { container } = render(<FmModel349Page decl={makeDecl({ period: '10' })} {...defaultProps} />);

    expect(container.textContent).toContain('Modelo 349 - 2026 / octubre');
  });

  it('formats a monthly period\'s month name in English under en_US ("October"), not the stale "octubre"', () => {
    activeUi = realUiEn;
    activeLocale = 'en_US';
    const { container } = render(<FmModel349Page decl={makeDecl({ period: '10' })} {...defaultProps} />);

    expect(container.textContent).toContain('Form 349 - 2026 / October');
    expect(container.textContent).not.toContain('octubre');
  });
});
