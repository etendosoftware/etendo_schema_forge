// Real-locale breadcrumb + page-title regression coverage (ETP-4945, ETP-5584).
// @covers tools/app-shell/src/windows/custom/fiscal-models/FmListPage.jsx
//
// ETP-5584: the page title must be the window's menu name ("Modelos Fiscales"),
// matching the breadcrumb's last segment; "Declaraciones" moved down to head the
// declarations table toolbar, next to its count badge.
//
// FmListPage.jsx used to render `Tesorería / {t('fm.list.title') ?? 'Declaraciones'}` —
// a raw hardcoded Spanish literal, never localized, never matched against the
// menu section. The fix is `{ui('finance')} / {ui('fm.breadcrumb.section')}`.
// The breadcrumb is inline JSX text (not a useSetPageMeta call), so this
// asserts the rendered title-bar text directly.
//
// NOTE: the sibling FmListPage.vitest.jsx mocks '@etendosoftware/app-shell-core'
// for useUI, but FmListPage.jsx actually imports useUI from '@/i18n' — that mock
// never intercepts the real import (verified empirically), so those tests only
// ever exercise the REAL useUI() falling back to the raw key with no
// LocaleProvider in scope (an existing, harmless test-infra gap, not something
// this file needs to fix). This file mocks the path FmListPage.jsx actually
// imports ('@/i18n') so the real locale dictionary is genuinely exercised.
import { render, screen } from '@testing-library/react';
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

describe('FmListPage — breadcrumb against the real locale dictionary (ETP-4945)', () => {
  it('resolves the es_ES breadcrumb to "Finanzas / Modelos Fiscales", not the stale "Tesorería"', () => {
    activeUi = realUiEs;
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);

    expect(container.textContent).toContain('Finanzas / Modelos Fiscales');
    expect(container.textContent).not.toContain('Tesorería');
  });

  it('resolves the en_US breadcrumb to "Finance / Fiscal Models"', () => {
    activeUi = realUiEn;
    const { container } = render(<FmListPage declarations={[]} {...defaultProps} />);

    expect(container.textContent).toContain('Finance / Fiscal Models');
  });
});

describe('FmListPage — page title and declarations heading (ETP-5584)', () => {
  it('es_ES: page title is the menu name, "Declaraciones" heads the table toolbar', () => {
    activeUi = realUiEs;
    const decls = [{ id: 'd1', model: '303', year: 2026, period: '1T', status: 'draft' }];
    render(<FmListPage declarations={decls} {...defaultProps} />);

    expect(screen.getByTestId('fm-list-page-title').textContent).toBe('Modelos Fiscales');
    expect(screen.getByTestId('fm-list-breadcrumb').textContent).toBe('Finanzas / Modelos Fiscales');
    const section = screen.getByTestId('fm-list-section-title');
    expect(section.textContent).toBe('Declaraciones1');
    expect(screen.getByTestId('fm-list-count').textContent).toBe('1');
    // The heading lives in the filters toolbar, not in the page header.
    expect(section.closest('.fm-toolbar')).not.toBeNull();
    expect(screen.getByTestId('fm-list-page-header').textContent).not.toContain('Declaraciones');
  });

  it('en_US: page title is "Fiscal Models", heading is "Declarations"', () => {
    activeUi = realUiEn;
    render(<FmListPage declarations={[]} {...defaultProps} />);

    expect(screen.getByTestId('fm-list-page-title').textContent).toBe('Fiscal Models');
    expect(screen.getByTestId('fm-list-section-title').textContent).toBe('Declarations0');
  });

  it('renders the page header before the declarations toolbar', () => {
    activeUi = realUiEs;
    render(<FmListPage declarations={[]} {...defaultProps} />);

    const header = screen.getByTestId('fm-list-page-header');
    const section = screen.getByTestId('fm-list-section-title');
    expect(header.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
