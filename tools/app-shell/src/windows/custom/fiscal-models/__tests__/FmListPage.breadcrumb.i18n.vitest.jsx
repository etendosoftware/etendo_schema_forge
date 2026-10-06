// Real-locale breadcrumb + page-title regression coverage (ETP-4945, ETP-5584).
// @covers tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
//
// ETP-5584: the title, breadcrumb, record count and kebab are published to the app
// TopBar through useSetPageMeta (same mechanism as a generated ListView) — the title is
// the window's menu name ("Modelos Fiscales"), matching the breadcrumb's last segment;
// "Declaraciones" is the heading of the declarations toolbar. Assertions read the
// published meta through a PageMetaProvider probe.
//
// FmListPage.jsx used to render `Tesorería / {t('fm.list.title') ?? 'Declaraciones'}` —
// a raw hardcoded Spanish literal, never localized, never matched against the
// menu section. The fix is `{ui('finance')} / {ui('fm.breadcrumb.section')}`.
//
// NOTE: the sibling FmListPage.vitest.jsx mocks '@etendosoftware/app-shell-core'
// for useUI, but FmListPage.jsx actually imports useUI from '@/i18n' — that mock
// never intercepts the real import (verified empirically), so those tests only
// ever exercise the REAL useUI() falling back to the raw key with no
// LocaleProvider in scope (an existing, harmless test-infra gap, not something
// this file needs to fix). This file mocks the path FmListPage.jsx actually
// imports ('@/i18n') so the real locale dictionary is genuinely exercised.
import { render, screen, act } from '@testing-library/react';
import { PageMetaProvider, usePageMeta } from '@/components/layout/PageMetaContext';
import React from 'react';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;
vi.mock('@/i18n', () => ({ useUI: () => activeUi, useLocaleSwitch: () => ({ locale: 'es_ES' }) }));

vi.mock('../fiscal-models.css', () => ({}));
vi.mock('../useFiscalAutoCompute.js', () => ({
  default: vi.fn(() => ({ computedMap: {} })),
}));
vi.mock('../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  countUpcomingDeadlines: () => 0,
  isUpcomingDeadline: () => false,
  checkModified303: vi.fn(),
  checkModified349: vi.fn(),
  compute349Operators: vi.fn(),
  fetchDeclarationIncidents: vi.fn(),
}));
vi.mock('../FmOverlays.jsx', () => ({
  NewDeclModal: () => null,
}));
vi.mock('../FmCatalogPage.jsx', () => ({
  default: () => null,
}));
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  CheckboxField: () => null,
}));
vi.mock('lucide-react', () => ({
  LayoutGrid: () => null, Settings: () => null, ListFilter: () => null,
  ArrowUpDown: () => null, ChevronDown: () => null, MoreHorizontal: () => null,
  MoreVertical: () => null, Calendar: () => null, Clock: () => null,
  TriangleAlert: () => null, OctagonAlert: () => null, ArrowUpRight: () => null,
  Search: () => null, Play: () => null, Check: () => null,
}));
vi.mock('../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  EmptyState: () => React.createElement('div', { className: 'fm-empty-state' }, 'empty'),
  KpiWidget: () => null,
}));

import FmListPage from '../FmListPage.jsx';

const defaultProps = {
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
  onComputeUpdate: vi.fn(),
};

let lastMeta = null;
function MetaProbe() {
  lastMeta = usePageMeta();
  return null;
}
function renderWithMeta(ui) {
  lastMeta = null;
  return render(<PageMetaProvider>{ui}<MetaProbe /></PageMetaProvider>);
}

describe('FmListPage — breadcrumb against the real locale dictionary (ETP-4945)', () => {
  it('resolves the es_ES breadcrumb to "Finanzas / Modelos Fiscales", not the stale "Tesorería"', () => {
    activeUi = realUiEs;
    renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);

    expect(lastMeta.breadcrumb).toBe('Finanzas / Modelos Fiscales');
    expect(document.body.textContent).not.toContain('Tesorería');
  });

  it('resolves the en_US breadcrumb to "Finance / Fiscal Models"', () => {
    activeUi = realUiEn;
    renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);

    expect(lastMeta.breadcrumb).toBe('Finance / Fiscal Models');
  });
});

describe('FmListPage — TopBar page meta and declarations heading (ETP-5584)', () => {
  it('es_ES: TopBar title is the menu name, count is the declarations count, kebab is wired', () => {
    activeUi = realUiEs;
    const decls = [{ id: 'd1', model: '303', year: 2026, period: '1T', status: 'draft' }];
    renderWithMeta(<FmListPage declarations={decls} {...defaultProps} />);

    expect(lastMeta.title).toBe('Modelos Fiscales');
    expect(lastMeta.recordCount).toBe(1);
    expect(typeof lastMeta.onAddToFavorites).toBe('function');
    expect(typeof lastMeta.onPageHelp).toBe('function');
    expect(lastMeta.isFavorite).toBe(false);
  });

  it('does not duplicate the title in the page content; "Declaraciones" heads the toolbar', () => {
    activeUi = realUiEs;
    renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);

    expect(document.body.textContent).not.toContain('Modelos Fiscales');
    const section = screen.getByTestId('fm-list-section-title');
    expect(section.textContent).toBe('Declaraciones');
    expect(section.closest('.fm-toolbar')).not.toBeNull();
  });

  it('en_US: TopBar title is "Fiscal Models", heading is "Declarations"', () => {
    activeUi = realUiEn;
    renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);

    expect(lastMeta.title).toBe('Fiscal Models');
    expect(screen.getByTestId('fm-list-section-title').textContent).toBe('Declarations');
  });

  it('places the catalog and new-declaration actions right-most in the toolbar, primary last', () => {
    activeUi = realUiEs;
    renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);

    const toolbar = screen.getByTestId('fm-list-section-title').closest('.fm-toolbar');
    const catalog = screen.getByTestId('fm-list-catalog-button');
    expect(toolbar.contains(catalog)).toBe(true);
    // No active models in this fixture → the primary button is hidden (catalogLoaded && activeCount > 0).
    expect(screen.queryByTestId('fm-list-new-declaration-button')).toBeNull();
    expect(toolbar.lastElementChild).toBe(catalog);
  });

  it('publishes an empty meta while inactive (hidden behind a 303/349 detail page) and restores it', () => {
    activeUi = realUiEs;
    const { rerender } = renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);
    expect(lastMeta.title).toBe('Modelos Fiscales');

    act(() => {
      rerender(<PageMetaProvider><FmListPage declarations={[]} {...defaultProps} active={false} /><MetaProbe /></PageMetaProvider>);
    });
    expect(lastMeta.title).toBeUndefined();
    expect(lastMeta.recordCount).toBeUndefined();
    expect(lastMeta.onAddToFavorites).toBeUndefined();

    act(() => {
      rerender(<PageMetaProvider><FmListPage declarations={[]} {...defaultProps} active /><MetaProbe /></PageMetaProvider>);
    });
    expect(lastMeta.title).toBe('Modelos Fiscales');
  });
});
