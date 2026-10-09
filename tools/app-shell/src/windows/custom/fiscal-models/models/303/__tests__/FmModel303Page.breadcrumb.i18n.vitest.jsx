// @covers tools/app-shell/src/windows/custom/fiscal-models/models/303/FmModel303Page.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/FmDetailChrome.jsx
// Real-locale breadcrumb regression coverage (ETP-4945).
//
// FmModel303Page.jsx used to render `Tesorería / Modelo 303 - {periodLabel}` —
// a raw hardcoded Spanish literal. The fix is
// `${ui('finance')} / ${ui('fm.breadcrumb.section')} / Modelo 303 - {periodLabel}`,
// 3 segments, matching the fm-list breadcrumb's root+section. Since ETP-5584 the
// title and breadcrumb are published to the app TopBar through useSetPageMeta
// (no in-page title row), so this asserts the published meta, following the
// sibling FmModel303Page.vitest.jsx's mocking shape but with `useUI` backed by
// the real locale dictionary instead of its identity mock.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { PageMetaProvider } from '@/components/layout/PageMetaContext';
import { lastMeta, MetaProbe, renderWithMeta, describeTopBarKebab } from '../../../__tests__/testUtils/topBarMetaTestUtils.jsx';
import { loadLocaleDictionary, makeRealUI } from '../../../../shared/__tests__/testUtils/realLocaleUI.js';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;
let activeLocale = 'es_ES';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => activeUi, useLocaleSwitch: () => ({ locale: activeLocale }) }));

// ETP-5584 — the TopBar kebab's two contexts (favourites, support chat), shared stand-in.
vi.mock('@/components/layout/FavoritesContext', () => import('../../../__tests__/testUtils/topBarMetaTestUtils.jsx'));
vi.mock('@/components/support/SupportChatContext.jsx', () => import('../../../__tests__/testUtils/topBarMetaTestUtils.jsx'));
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
  // ETP-5584 — the detail status chip renders lucide's Check for success tones.
  Check: () => null,
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
    renderWithMeta(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    expect(lastMeta.breadcrumb).toBe('Finanzas / Modelos Fiscales / Modelo 303 - 2026/T2');
    expect(lastMeta.title).toBe('Modelo 303 - 2026/T2');
  });

  // ETP-5338 — the "Modelo 303" segment itself used to be a hardcoded Spanish
  // literal even under en_US, surviving the ETP-4945 fix which only localized
  // the root/section segments. Now resolved via the shared 'fm.config.m303.title'
  // key (already used by the catalog config section header), which translates
  // "Modelo" to "Form" — the term AEAT-form-aware English UI copy uses.
  it('resolves the en_US breadcrumb to "Finance / Fiscal Models / Form 303 - 2026/T2", not the stale "Modelo"', () => {
    activeUi = realUiEn;
    activeLocale = 'en_US';
    renderWithMeta(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    activeLocale = 'es_ES';

    expect(lastMeta.breadcrumb).toBe('Finance / Fiscal Models / Form 303 - 2026/T2');
    expect(lastMeta.title).toBe('Form 303 - 2026/T2');
  });
});

// ETP-5584 — the declaration header moved from an in-page title row to the app TopBar.
describe('FmModel303Page — app TopBar meta (ETP-5584)', () => {
  it('publishes the model badge and the same kebab items as the list (favourite + page help)', () => {
    activeUi = realUiEs;
    renderWithMeta(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(lastMeta.titleExtra.props.className).toBe('fm-model-badge fm-model-badge--303');
    expect(lastMeta.titleExtra.props.children).toBe('303');
    expect(typeof lastMeta.onAddToFavorites).toBe('function');
    expect(typeof lastMeta.onPageHelp).toBe('function');
    expect(lastMeta.isFavorite).toBe(false);
  });

  it('renders no in-page title, breadcrumb or kebab (nothing duplicated with the TopBar)', () => {
    activeUi = realUiEs;
    const { container } = renderWithMeta(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(container.textContent).not.toContain('Modelo 303 - 2026/T2');
    expect(container.textContent).not.toContain('Finanzas / Modelos Fiscales');
    expect(container.querySelector('[data-testid="fm-more-options-trigger"]')).toBeNull();
  });

  it('updates the title when another declaration is opened in the same page instance', () => {
    activeUi = realUiEs;
    const { rerender } = renderWithMeta(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(lastMeta.title).toBe('Modelo 303 - 2026/T2');
    rerender(
      <PageMetaProvider>
        <FmModel303Page decl={{ ...BASE_DECL, id: '303-2026-T3', period: 'T3' }} {...defaultProps} />
        <MetaProbe />
      </PageMetaProvider>,
    );
    expect(lastMeta.title).toBe('Modelo 303 - 2026/T3');
  });

  it('withdraws its meta on unmount (Cancelar back to the list)', () => {
    activeUi = realUiEs;
    const { rerender } = renderWithMeta(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(lastMeta.title).toBe('Modelo 303 - 2026/T2');
    rerender(<PageMetaProvider><MetaProbe /></PageMetaProvider>);
    expect(lastMeta.title).toBeUndefined();
  });
});

// P9 (ETP-5584) — one title format for every model (FmDetailChrome's buildDeclTitle): a monthly
// period shows its month name in the UI locale, exactly like Modelo 349.
describe('FmModel303Page — monthly period title (P9)', () => {
  it('es_ES: "Modelo 303 - 2026/octubre"', () => {
    activeUi = realUiEs;
    activeLocale = 'es_ES';
    renderWithMeta(<FmModel303Page decl={{ ...BASE_DECL, period: '10' }} {...defaultProps} />);
    expect(lastMeta.title).toBe('Modelo 303 - 2026/octubre');
  });

  it('en_US: "Form 303 - 2026/October"', () => {
    activeUi = realUiEn;
    activeLocale = 'en_US';
    renderWithMeta(<FmModel303Page decl={{ ...BASE_DECL, period: '10' }} {...defaultProps} />);
    activeLocale = 'es_ES';
    expect(lastMeta.title).toBe('Form 303 - 2026/October');
  });
});

// ETP-5584 (review W1) — the TopBar kebab is wired to the real favourites and help mechanisms.
describeTopBarKebab('FmModel303Page', {
  beforeEachRender: () => { activeUi = realUiEs; },
  renderPage: () => renderWithMeta(<FmModel303Page decl={BASE_DECL} {...defaultProps} />),
});
