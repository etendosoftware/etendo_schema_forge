// Real-locale breadcrumb + page-title regression coverage (ETP-4945, ETP-5584).
// @covers tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
//
// ETP-5584: the title, breadcrumb, record count and kebab are published to the app
// TopBar through useSetPageMeta (same mechanism as a generated ListView) — the title is
// the window's menu name ("Modelos Fiscales"), matching the breadcrumb's last segment;
// the content has no "Declaraciones" heading (removed at the user's request). Assertions read the
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
import { PageMetaProvider, useSetPageMeta } from '@/components/layout/PageMetaContext';
import { lastMeta, MetaProbe, renderWithMeta, describeTopBarKebab } from './testUtils/topBarMetaTestUtils.jsx';
import React from 'react';
import { loadLocaleDictionary, makeRealUI } from '../../shared/__tests__/testUtils/realLocaleUI.js';

const esES = loadLocaleDictionary('es_ES');
const enUS = loadLocaleDictionary('en_US');
const realUiEs = makeRealUI(esES);
const realUiEn = makeRealUI(enUS);

let activeUi = realUiEs;
vi.mock('@/i18n', () => ({ useUI: () => activeUi, useLocaleSwitch: () => ({ locale: 'es_ES' }) }));

// ETP-5584 — the TopBar kebab's two contexts (favourites, support chat), shared stand-in.
vi.mock('@/components/layout/FavoritesContext', () => import('./testUtils/topBarMetaTestUtils.jsx'));
vi.mock('@/components/support/SupportChatContext.jsx', () => import('./testUtils/topBarMetaTestUtils.jsx'));

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

  it('renders neither the window title nor a "Declaraciones" heading in the page content', () => {
    activeUi = realUiEs;
    renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);

    expect(document.body.textContent).not.toContain('Modelos Fiscales');
    expect(document.querySelector('.fm-toolbar').textContent).not.toContain('Declaraciones');
  });

  it('en_US: TopBar title is "Fiscal Models"', () => {
    activeUi = realUiEn;
    renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);

    expect(lastMeta.title).toBe('Fiscal Models');
    expect(document.querySelector('.fm-toolbar').textContent).not.toContain('Declarations');
  });

  it('content order: actions row (right-aligned), KPI cards, then right-aligned filters + sort', () => {
    activeUi = realUiEs;
    renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />);

    const actionsRow = screen.getByTestId('fm-list-actions-row');
    const kpiRow = screen.getByTestId('fm-list-kpi-row');
    const toolbar = document.querySelector('.fm-toolbar');
    const follows = (x, y) => Boolean(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);

    // Row 1 — page actions, right-aligned; no active models here, so only the catalog button
    // (the primary one needs catalogLoaded && activeCount > 0).
    expect(actionsRow.style.justifyContent).toBe('flex-end');
    expect(actionsRow.contains(screen.getByTestId('fm-list-catalog-button'))).toBe(true);
    expect(screen.queryByTestId('fm-list-new-declaration-button')).toBeNull();
    // Row 2 — KPI cards share the full row instead of a fixed 360px each.
    expect(follows(actionsRow, kpiRow)).toBe(true);
    [...kpiRow.children].forEach((card) => {
      expect(card.style.width).toBe('');
      expect(card.style.flex).toBe('1 1 0%');
    });
    // Row 3 — the spacer first (no heading), then filters and sort, right-aligned.
    expect(follows(kpiRow, toolbar)).toBe(true);
    expect(toolbar.firstElementChild.className).toBe('fm-toolbar__space');
    expect(toolbar.lastElementChild.querySelector('[aria-label]')).not.toBeNull();
    expect(toolbar.contains(screen.getByTestId('fm-list-catalog-button'))).toBe(false);
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

// ETP-5584 — the list stays mounted (hidden) while a 303/349 detail page is open, for
// auto-compute polling. It must leave the TopBar to the detail page: publishing an empty meta
// while hidden would let a poll (declarations count change) wipe the detail's title.
describe('FmListPage — hands the TopBar to the detail page while inactive (ETP-5584)', () => {
  function DetailPublisher() {
    useSetPageMeta({ title: 'Modelo 303 - 2026/T1' }, []);
    return null;
  }
  const tree = (listProps, withDetail) => (
    <PageMetaProvider>
      <FmListPage {...defaultProps} {...listProps} />
      {withDetail && <DetailPublisher />}
      <MetaProbe />
    </PageMetaProvider>
  );

  it('leaves the detail title in place while inactive, and takes the TopBar back when active again', () => {
    activeUi = realUiEs;
    const decls = [{ id: 'd1', model: '303', year: 2026, period: '1T', status: 'draft' }];
    const { rerender } = render(tree({ declarations: decls, active: true }, false));
    expect(lastMeta.title).toBe('Modelos Fiscales');

    // Detail opened: the list goes inactive and the detail publishes its own meta.
    rerender(tree({ declarations: decls, active: false }, true));
    expect(lastMeta.title).toBe('Modelo 303 - 2026/T1');

    // Any further list re-render while hidden must not touch the TopBar.
    rerender(tree({ declarations: decls, active: false }, true));
    expect(lastMeta.title).toBe('Modelo 303 - 2026/T1');

    // Cancelar: the detail unmounts and the list re-publishes.
    rerender(tree({ declarations: decls, active: true }, false));
    expect(lastMeta.title).toBe('Modelos Fiscales');
    expect(lastMeta.recordCount).toBe(1);
  });
});

// ETP-5584 (review W1) — the TopBar kebab is wired to the real favourites and help mechanisms.
describeTopBarKebab('FmListPage', {
  beforeEachRender: () => { activeUi = realUiEs; },
  renderPage: () => renderWithMeta(<FmListPage declarations={[]} {...defaultProps} />),
});
