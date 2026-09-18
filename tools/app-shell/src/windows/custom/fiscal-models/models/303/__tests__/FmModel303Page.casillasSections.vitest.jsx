// Vitest render-level test for ETP-5391's CASILLAS_SECTIONS registration
// (FmModel303Page.jsx). Unlike FmModel303Page.vitest.jsx, FmBoxes303.jsx is
// intentionally NOT mocked here — this file renders the real component so a
// regression like the one caught in manual testing (the two new last-period
// sections defined + gated in fm303Layouts.js, but never added to the
// CASILLAS_SECTIONS registry FmModel303Page.jsx owns) fails at the DOM level,
// not just at getLayout303() (see fm303Layouts.vitest.js for the layout-only
// coverage of the gating itself). declaracion_terceros (the Modelo 347
// filing-exemption checkbox) is merged into info_adicional_ultimo_periodo as
// a leading field — no section of its own — see fm303Layouts.js.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
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
  Tabs: ({ tabs, active, onSelect }) => React.createElement(
    'div',
    { role: 'tablist' },
    tabs.map(t => React.createElement(
      'button',
      { key: t.id, role: 'tab', 'aria-selected': String(t.id === active), onClick: () => onSelect(t.id) },
      t.label
    ))
  ),
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => React.createElement('div', { className: 'fm-empty-state' }, 'empty'),
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal303: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, disabled, onChange }) =>
    React.createElement('input', {
      type: 'checkbox', checked: !!checked, disabled,
      onChange: onChange ?? (() => {}),
    }),
}));
// lucide-react — includes Pencil (used by the real FmBoxes303's edit button),
// unlike FmModel303Page.vitest.jsx's own mock which never needed it since that
// file mocks FmBoxes303.jsx away entirely.
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null, Landmark: () => null, Pencil: () => null,
  Save: () => null,
}));

// NOTE: '../FmBoxes303.jsx' is intentionally NOT mocked in this file.

import FmModel303Page from '../FmModel303Page.jsx';

function declFor(period) {
  return {
    id: `303-2026-${period}`, model: '303', year: 2026, period, type: 'ord',
    status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
    _precomputed: null, boxes: null, sources: [], history: [],
    identification: { tipo_declaracion: 'I' },
  };
}

const defaultProps = { onBack: vi.fn(), onStatusChange: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
});

// CasillasTab defaults to the 'boxes' tab and the 'identificacion' nav section on mount —
// navigate to 'Info Adicional' (mocked i18n echoes the titleKey literally).
function openInfoAdicionalNav(container) {
  const navBtn = Array.from(container.querySelectorAll('button'))
    .find(b => b.textContent.trim() === 'fm.page.info_adicional');
  expect(navBtn).toBeTruthy();
  fireEvent.click(navBtn);
}

describe('FmModel303Page — CasillasTab / info_adicional nav section (ETP-5391 CASILLAS_SECTIONS)', () => {
  it('T4 (last period): renders the declaracion_terceros checkbox field', () => {
    const { container } = render(<FmModel303Page decl={declFor('T4')} {...defaultProps} />);
    openInfoAdicionalNav(container);
    expect(document.body.textContent).toContain('fm.ident.declaracion_terceros');
  });

  it('T4 (last period): renders the tributacion_territorial rows (Álava/Gipuzkoa/Bizkaia/Navarra + territorio común)', () => {
    const { container } = render(<FmModel303Page decl={declFor('T4')} {...defaultProps} />);
    openInfoAdicionalNav(container);
    const text = document.body.textContent;
    expect(text).toContain('fm.box.terr.alava');
    expect(text).toContain('fm.box.terr.guipuzcoa');
    expect(text).toContain('fm.box.terr.vizcaya');
    expect(text).toContain('fm.box.terr.navarra');
    expect(text).toContain('fm.box.terr.territorio_comun');
  });

  it('T4 (last period): renders the info_adicional_ultimo_periodo rows (casillas 95/97/98/127/128)', () => {
    const { container } = render(<FmModel303Page decl={declFor('T4')} {...defaultProps} />);
    openInfoAdicionalNav(container);
    const text = document.body.textContent;
    expect(text).toContain('fm.box.row.info_reagyp');
    expect(text).toContain('fm.box.row.info_bienes_usados');
    expect(text).toContain('fm.box.row.info_agencias_viaje');
    expect(text).toContain('fm.box.row.info_oss');
    expect(text).toContain('fm.box.row.info_intragrupo');
  });

  it('T4 (last period): still renders the original info_adicional section content alongside the new ones', () => {
    const { container } = render(<FmModel303Page decl={declFor('T4')} {...defaultProps} />);
    openInfoAdicionalNav(container);
    // info_adicional's own long-standing row content must not have been displaced by
    // adding the three new section ids to the same CASILLAS_SECTIONS entry. (info_adicional
    // is not in FmBoxes303's TITLED_SECTIONS set, so it has no rendered section title —
    // assert on one of its actual rows instead.)
    expect(document.body.textContent).toContain('fm.box.row.entregas_intracom');
  });

  it('T2 (not the last period): does NOT render declaracion_terceros', () => {
    const { container } = render(<FmModel303Page decl={declFor('T2')} {...defaultProps} />);
    openInfoAdicionalNav(container);
    expect(document.body.textContent).not.toContain('fm.ident.declaracion_terceros');
  });

  it('T2 (not the last period): does NOT render the tributacion_territorial rows', () => {
    const { container } = render(<FmModel303Page decl={declFor('T2')} {...defaultProps} />);
    openInfoAdicionalNav(container);
    const text = document.body.textContent;
    expect(text).not.toContain('fm.box.terr.alava');
    expect(text).not.toContain('fm.box.terr.territorio_comun');
  });

  it('T2 (not the last period): does NOT render the info_adicional_ultimo_periodo rows', () => {
    const { container } = render(<FmModel303Page decl={declFor('T2')} {...defaultProps} />);
    openInfoAdicionalNav(container);
    const text = document.body.textContent;
    expect(text).not.toContain('fm.box.row.info_reagyp');
    expect(text).not.toContain('fm.box.row.info_oss');
  });

  it('T2 (not the last period): still renders the original info_adicional section content', () => {
    const { container } = render(<FmModel303Page decl={declFor('T2')} {...defaultProps} />);
    openInfoAdicionalNav(container);
    expect(document.body.textContent).toContain('fm.box.row.entregas_intracom');
  });
});
