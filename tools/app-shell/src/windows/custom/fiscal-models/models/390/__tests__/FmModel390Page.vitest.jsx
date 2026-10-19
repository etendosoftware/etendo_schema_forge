// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/FmModel390Page.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/FmBoxes390.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/usePreload390.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/Reconciliation390.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/Settlements303Table390.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/Incidents390Tab.jsx
//
// Also: the Facturas tab wiring — "Ver facturas" on an invoice box opens the tab filtered by it.
//
// ETP-5716 — Modelo 390 detail page, skeleton + boxes phase: blocks rendered from a mocked
// `GET /fiscal390/boxes` payload, the box search, manual inputs (live derivation + the saved
// manualData), the substitute identifier validation, and the save ordering (inputs are saved in
// their own PUT before generating the file or changing the status).
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    persistManualData: vi.fn().mockResolvedValue({ ok: true }),
    fetchDeclarationIncidents: vi.fn().mockResolvedValue({ blocking: 0, warning: 0, items: [] }),
    fetchDeclaration: vi.fn(),
  };
});
vi.mock('../fm390Api.js', () => ({
  fetchBoxes390: vi.fn(),
  generate390File: vi.fn().mockResolvedValue({ ok: true }),
  checkModified390: vi.fn(),
  generatedFileName: () => '390_0A_2026.txt',
  fetchSources390: vi.fn(),
  fetchPreload390: vi.fn(),
  validate390: vi.fn().mockResolvedValue(null),
}));
vi.mock('../FmSources390.jsx', () => ({
  default: ({ filter, isSubmitted }) => React.createElement('div', {
    'data-testid': 'FmSources390-stub', 'data-filter': JSON.stringify(filter), 'data-submitted': String(!!isSubmitted),
  }),
}));
const orgIdentityMock = vi.hoisted(() => ({}));
vi.mock('../useOrg390Identity.js', () => ({
  default: () => ({
    loaded: true, nif: 'B12345678', name: 'Acme SL',
    activities: [
      { id: 'a1', description: 'OTROS CAFES Y BARES', code: 'A03', codeDescription: 'Resto de actividades', epigraph: '673.2', typeLabel: '1 - Empresariales', isDefault: true, rank: 0 },
      { id: 'a2', description: 'COMERCIO MENOR', code: 'A04', codeDescription: '', epigraph: '651.1', typeLabel: '', isDefault: false, rank: 1 },
      { id: 'a3', description: 'SEXTA', code: 'A01', codeDescription: '', epigraph: '012', typeLabel: '', isDefault: false, rank: 6 },
    ],
    isPerson: false, personRepresentative: null,
    representatives: [{ id: 'r1', nif: '12345678Z', name: 'Ana Pérez', powerDate: '2024-03-05', notary: 'Notaría 1' }],
  }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  KpiWidget: ({ value, label, badge }) => React.createElement(
    'div', { className: 'test-kpi390', 'data-label': label },
    React.createElement('span', { className: 'test-kpi390-value' }, value),
    React.createElement('span', { className: 'test-kpi390-badge' }, badge),
  ),
  EmptyState: ({ title, 'data-testid': testId }) => React.createElement('div', { 'data-testid': testId }, title),
  Tabs: ({ tabs, active, onSelect }) => React.createElement('div', { role: 'tablist' },
    tabs.map(t => React.createElement('button', {
      key: t.id, role: 'tab', 'aria-selected': String(t.id === active), onClick: () => onSelect(t.id),
    }, t.label))),
}));
// The real shared Incidencias table (Incidents390Tab renders through it).
vi.mock('../../../FmTabContent.jsx', async (importOriginal) => importOriginal());
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm }) => React.createElement('button', {
    type: 'button', 'data-testid': 'PresentModal-confirm', onClick: () => onConfirm({ status: 'submitted' }),
  }, 'present-confirm'),
}));
vi.mock('../FileGenModal390.jsx', () => ({
  default: ({ onConfirm }) => React.createElement('button', {
    type: 'button', 'data-testid': 'FileGenModal390-confirm', onClick: () => onConfirm({ fileName: undefined }),
  }, 'filegen-confirm'),
}));
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null,
  useAttachments: () => ({ count: 0, upload: vi.fn() }),
}));
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  CheckboxField: ({ checked, disabled, onToggle, 'data-testid': testId }) => React.createElement('input', {
    type: 'checkbox', checked: !!checked, disabled, 'data-testid': testId,
    onChange: e => onToggle?.(e.target.checked),
  }),
}));

import FmModel390Page, { substituteIdentifierError, summaryOf } from '../FmModel390Page.jsx';
import { fetchBoxes390, generate390File, fetchPreload390, validate390 } from '../fm390Api.js';
import { persistManualData, fetchDeclarationIncidents, fetchDeclaration } from '../../../fiscalModelsUtils.js';
import { toast } from 'sonner';

const PAYLOAD = {
  boxes: {
    1: '1000.00', 2: '40.00', 5: '2000.00', 6: '420.00', 33: '3000.00', 34: '460.00', 47: '460.00',
    190: '500.00', 191: '20.00', 48: '500.00', 49: '100.00', 64: '100.00', 65: '360.00',
    84: '360.00', 86: '360.00', 99: '3000.00', 108: '3000.00',
  },
  summary: { accrued: '460.00', deductible: '100.00', result: '360.00', annualResult: '360.00' },
  mode: 'liquidation',
  taxReport: { searchKey: 'AEAT390_2025_Y', layoutYear: 2025, fallback: true },
  inputs: {},
  warnings: [{ code: 'UNSUPPORTED_RATE', parameter: 'VAT_PURCHASE_NORMAL', rate: '3.00' }],
  invoiceBoxes: [1, 2, 5, 6, 33, 34, 48, 49, 99, 190, 191],
};

const EMPTY_PRELOAD = { year: 2026, declarations: [], missingPeriods: ['T1', 'T2', 'T3', 'T4'], inputs: {}, expectedResult: null, warnings: [] };
const PRELOAD = {
  year: 2026,
  periodicity: 'quarterly',
  declarations: [
    { id: 'd303-1', period: 'T1', month: '03', status: 'submitted', submitted: true, source: 'snapshot', result: '300.00', periodResult: '300.00', kind: 'pay', superseded: 0 },
    { id: 'd303-4', period: 'T4', month: '12', status: 'draft', submitted: false, source: 'live', result: '60.00', periodResult: '60.00', kind: 'pay', superseded: 1 },
  ],
  missingPeriods: ['T2', 'T3'],
  lastPeriod: 'T4',
  inputs: { INGRESAR_03: '300.00', INGRESAR_06: '0.00', INGRESAR_09: '0.00', INGRESAR_12: '60.00', TOTAL_LASTPERIOD: '0.00', TOTAL_LASTPERIOD_DEVOLVER: '0.00', LIQANUAL_COMPENSATION: '0.00', LIQANUAL_ENDCOMPENSATION: '0.00' },
  expectedResult: '360.00',
  tolerance: '1.00',
  warnings: [{ code: 'DRAFT_303', periods: 'T4' }],
};

const makeDecl = (overrides = {}) => ({
  id: 'decl-390', model: '390', year: 2026, period: '0A', type: 'ord', status: 'draft',
  manualData: {}, _precomputed: PAYLOAD, ...overrides,
});

const props = () => ({
  onBack: vi.fn(),
  onStatusChange: vi.fn().mockResolvedValue({ ok: true }),
  onManualDataSaved: vi.fn(),
  token: 'tok',
  apiBaseUrl: 'http://host/sws/neo/fiscal-models',
});

beforeEach(() => {
  vi.clearAllMocks();
  persistManualData.mockResolvedValue({ ok: true });
  generate390File.mockResolvedValue({ ok: true });
  fetchBoxes390.mockResolvedValue(PAYLOAD);
  fetchPreload390.mockResolvedValue(EMPTY_PRELOAD);
  fetchDeclarationIncidents.mockResolvedValue({ blocking: 0, warning: 0, items: [] });
  validate390.mockResolvedValue(null);
});

const goToBlock = (id) => fireEvent.click(screen.getByTestId(`FmBoxes390__index_${id}`));
const kpiValue = (label) => document.querySelector(`.test-kpi390[data-label="${label}"] .test-kpi390-value`)?.textContent;
/** Generar is blocked by a rule incident: its Download icon is red (the button stays clickable). */
const waitForBlocked = () => waitFor(() => expect(screen.getByTestId('Download__generate390').style.color).toBe('hsl(var(--destructive))'));
const kpiBadge = (label) => document.querySelector(`.test-kpi390[data-label="${label}"] .test-kpi390-badge`)?.textContent;

function typeInput(key, value) {
  const field = screen.getByTestId(`FmBoxes390__inputField_${key}`);
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

describe('FmModel390Page — skeleton', () => {
  it('renders the 4 cards from the boxes: [47], [64], [86]', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    expect(kpiValue('fm.m390.kpi.accrued')).toBe('460');
    expect(kpiValue('fm.m390.kpi.deductible')).toBe('100');
    expect(kpiValue('fm.m390.kpi.result')).toBe('360');
    expect(screen.getByTestId('FmModel390Page__incidentsCount').textContent).toBe('0');
  });

  it('renders the index of the 11 blocks, without origin legend or design-year note', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    const index = screen.getByTestId('FmBoxes390__index');
    expect(index.querySelectorAll('button')).toHaveLength(11);
    // The payload is a fallback design (taxReport.fallback), yet the toolbar shows no note.
    expect(screen.queryByTestId('FmBoxes390__legend')).toBeNull();
    expect(screen.queryByTestId('FmBoxes390__designNote')).toBeNull();
    expect(screen.getByTestId('FmBoxes390__warnings').textContent).toContain('fm.m390.warning.unsupported_rate');
  });

  it('reads the identification and representative blocks from the organization', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    expect(screen.getByTestId('FmBoxes390__nif').textContent).toContain('B12345678');
    goToBlock('datos_estadisticos');
    const table = screen.getByTestId('FmBoxes390__activities');
    expect([...table.querySelectorAll('th')].map(th => th.textContent)).toEqual([
      'fm.m390.statistics.activity', 'fm.m390.statistics.code', 'fm.m390.statistics.epigraph', 'fm.m390.statistics.main',
    ]);
    const cells = screen.getAllByTestId('FmBoxes390__activityRow').map(tr => [...tr.querySelectorAll('td')]);
    expect(cells[0][0].textContent).toBe('OTROS CAFES Y BARES');
    expect(cells[0][1].textContent).toContain('A03');
    expect(cells[0][1].getAttribute('title')).toBe('Resto de actividades');
    expect(cells[0][2].textContent).toBe('673.2');
    expect(cells[0][3].textContent).toBe('fm.m390.statistics.main_yes');
    expect(cells[1][3].textContent).toBe('fm.m390.statistics.other');
    expect(cells[2][3].textContent).toBe('fm.m390.statistics.not_declared');
    goToBlock('representante');
    expect(screen.getByTestId('FmBoxes390__representatives').textContent).toContain('Ana Pérez');
    expect(screen.getByTestId('FmBoxes390__editOrganization')).toBeTruthy();
  });

  it('shows no name-truncation notice when every name fits', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    expect(screen.queryByTestId('FmBoxes390__nameTruncated')).toBeNull();
  });

  it('lists each name the file will cut (NAME_TRUNCATED incidents) in its own block, without blocking Generar', async () => {
    fetchDeclarationIncidents.mockResolvedValue({ blocking: 0, warning: 2, items: [
      { origin: 'NAME_TRUNCATED', severity: 'warn', message: 'cut', params: { field: 'socialName', limit: 37 } },
      { origin: 'NAME_TRUNCATED', severity: 'warn', message: 'cut', params: { field: 'legalRepresentative', limit: 36, label: '12345678Z' } },
    ] });
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    const ident = await screen.findByTestId('FmBoxes390__nameTruncated');
    expect(ident.querySelectorAll('li')).toHaveLength(1);
    expect(ident.textContent).toContain('fm.m390.ident.truncated');
    goToBlock('representante');
    expect(screen.getByTestId('FmBoxes390__repNameTruncated').querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByTestId('FmModel390Page__generate').disabled).toBe(false);
  });

  it('renders the calculated boxes of IVA devengado and folds the rates without operations', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('iva_devengado');
    expect(screen.getByTestId('FmBoxes390__box_1').textContent).toContain('1000');
    expect(screen.getByTestId('FmBoxes390__box_47').getAttribute('data-origin')).toBe('calc');
    expect(screen.queryByTestId('FmBoxes390__box_700')).toBeNull();
    fireEvent.click(screen.getByTestId('FmBoxes390__fold_reg_ordinario'));
    expect(screen.getByTestId('FmBoxes390__box_700')).toBeTruthy();
  });

  it('"Buscar casilla" + Enter jumps to the block of the box and highlights it', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    const search = screen.getByTestId('FmBoxes390__search');
    fireEvent.change(search, { target: { value: '[86]' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('FmBoxes390__block_resultado_liquidacion')).toBeTruthy();
    expect(screen.getByTestId('FmBoxes390__box_86').className).toContain('fm-390-cell--highlight');
    fireEvent.change(search, { target: { value: '99999' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('FmBoxes390__searchMiss')).toBeTruthy();
  });

  it('"Buscar casilla" unfolds a "Sin operaciones" group to reveal and highlight the box', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('iva_devengado');
    expect(screen.queryByTestId('FmBoxes390__box_21')).toBeNull();
    const search = screen.getByTestId('FmBoxes390__search');
    fireEvent.change(search, { target: { value: '21' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('FmBoxes390__box_21').className).toContain('fm-390-cell--highlight');
    // The group stays unfolded (not only while highlighted).
    expect(screen.getByTestId('FmBoxes390__fold_adq_intra_bienes').textContent).toBe('fm.m390.fold.hide');
  });

  it('"Buscar casilla" from another block opens the block and its folded group', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    const search = screen.getByTestId('FmBoxes390__search');
    fireEvent.change(search, { target: { value: '[23]' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('FmBoxes390__block_iva_devengado')).toBeTruthy();
    expect(screen.getByTestId('FmBoxes390__box_23').className).toContain('fm-390-cell--highlight');
  });

  it('"Buscar casilla" opens the territory toggle to reveal a box behind it', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('territorio');
    expect(screen.queryByTestId('FmBoxes390__box_92')).toBeNull();
    const search = screen.getByTestId('FmBoxes390__search');
    fireEvent.change(search, { target: { value: '92' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByTestId('FmBoxes390__box_92').className).toContain('fm-390-cell--highlight');
  });

  it('computes on mount when the list handed no payload', async () => {
    render(<FmModel390Page decl={makeDecl({ _precomputed: null })} {...props()} />);
    await waitFor(() => expect(fetchBoxes390).toHaveBeenCalledTimes(1));
    expect(fetchBoxes390.mock.calls[0][0]).toMatchObject({ id: 'decl-390', period: '0A' });
    await screen.findByTestId('FmBoxes390');
  });
});

describe('FmModel390Page — manual inputs', () => {
  it('an edited input re-derives the totals at once and "Guardar" saves it in manualData.aeatInputs', async () => {
    const p = props();
    render(<FmModel390Page decl={makeDecl()} {...p} />);
    goToBlock('resultado_liquidacion');
    typeInput('LIQANUAL_VAT_LAW_REGULARIZATION', '40,5');
    expect(screen.getByTestId('FmBoxes390__box_84').textContent).toContain('400.5');
    expect(screen.getByTestId('FmBoxes390__box_86').textContent).toContain('400.5');
    expect(kpiValue('fm.m390.kpi.result')).toBe('400.5');

    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalledTimes(1));
    const [id, manualData] = persistManualData.mock.calls[0];
    expect(id).toBe('decl-390');
    expect(manualData).toEqual({
      identification: {},
      aeatInputs: { LIQANUAL_VAT_LAW_REGULARIZATION: '40.50', ISSUPPLEMENTARY: 'N', ISRECTIFICATION: 'N' },
    });
    await waitFor(() => expect(p.onManualDataSaved).toHaveBeenCalledWith('decl-390', manualData));
  });

  it('rejects a non-numeric amount and a negative compensation [85]', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('resultado_liquidacion');
    typeInput('LIQANUAL_VAT_IMPORT', 'abc');
    expect(toast.error).toHaveBeenCalledWith('fm.m390.input.invalid_number');
    typeInput('LIQANUAL_COMPENSATION', '-5');
    expect(toast.error).toHaveBeenCalledWith('fm.m390.input.negative');
    expect(screen.getByTestId('FmBoxes390__box_86').textContent).toContain('360');
  });

  it('the identification flags are stored as classic Y/N parameters', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    fireEvent.click(screen.getByTestId('FmBoxes390__flag_ISMONTHLYRETURN'));
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    expect(persistManualData.mock.calls[0][1].aeatInputs.ISMONTHLYRETURN).toBe('Y');
  });

  it('"Calcular" sends the on-screen inputs to the backend, then saves them', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('resultado_liquidacion');
    typeInput('LIQANUAL_VAT_IMPORT', '12');
    fireEvent.click(screen.getByTestId('FmModel390Page__compute'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    expect(fetchBoxes390.mock.calls[0][1].inputs).toMatchObject({ LIQANUAL_VAT_IMPORT: '12.00' });
    expect(fetchBoxes390.mock.invocationCallOrder[0]).toBeLessThan(persistManualData.mock.invocationCallOrder[0]);
  });
});

describe('FmModel390Page — Normal | Sustitutiva', () => {
  it('substituteIdentifierError: only a substitute needs exactly 13 digits', () => {
    expect(substituteIdentifierError({})).toBeNull();
    expect(substituteIdentifierError({ sustitutiva: true, formerStatement: '123' })).toBe('fm.m390.substitutive.id_invalid');
    expect(substituteIdentifierError({ sustitutiva: true, formerStatement: '3901234567890' })).toBeNull();
  });

  it('shows the banner with the identifier and an inline error until it has 13 digits', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    expect(screen.queryByTestId('FmModel390Page__substitutiveBanner')).toBeNull();
    fireEvent.click(screen.getByTestId('FmModel390Page__type_sustitutiva'));
    const input = screen.getByTestId('FmModel390Page__formerStatement');
    fireEvent.change(input, { target: { value: '12a3' } });
    expect(input.value).toBe('123');
    expect(screen.getByTestId('FmModel390Page__formerStatementError')).toBeTruthy();
    fireEvent.change(input, { target: { value: '3901234567890' } });
    expect(screen.queryByTestId('FmModel390Page__formerStatementError')).toBeNull();
  });

  it('blocks Presentar / Generar with an invalid identifier', () => {
    render(<FmModel390Page decl={makeDecl({ manualData: { identification: { sustitutiva: true } } })} {...props()} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    expect(toast.error).toHaveBeenCalledWith('fm.m390.substitutive.id_invalid');
    expect(screen.queryByTestId('PresentModal-confirm')).toBeNull();
    fireEvent.click(screen.getByTestId('FmModel390Page__generate'));
    expect(screen.queryByTestId('FileGenModal390-confirm')).toBeNull();
    expect(screen.getByTestId('FmModel390Page__formerStatementError')).toBeTruthy();
  });

  it('saves the substitute flags for the classic generator (by quota rectification → ISRECTIFICATION)', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    fireEvent.click(screen.getByTestId('FmBoxes390__flag_ConcursoAcr'));
    fireEvent.click(screen.getByTestId('FmModel390Page__type_sustitutiva'));
    fireEvent.change(screen.getByTestId('FmModel390Page__formerStatement'), { target: { value: '3901234567890' } });
    fireEvent.click(screen.getByTestId('FmModel390Page__byQuotas'));
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    const md = persistManualData.mock.calls[0][1];
    expect(md.identification).toEqual({ sustitutiva: true, formerStatement: '3901234567890', rectificacionCuotas: true });
    expect(md.aeatInputs).toMatchObject({ ISSUPPLEMENTARY: 'N', ISRECTIFICATION: 'Y', SUPPLEMENTARYNO: '3901234567890' });
  });
});

describe('FmModel390Page — classic consistency checks (ETP-5716 verification against Classic)', () => {
  it('"Sustitutiva por rectificación de cuotas" is offered only with concurso de acreedores', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__type_sustitutiva'));
    expect(screen.queryByTestId('FmModel390Page__byQuotas')).toBeNull();
    fireEvent.click(screen.getByTestId('FmBoxes390__flag_ConcursoAcr'));
    expect(screen.getByTestId('FmModel390Page__byQuotas')).toBeTruthy();
  });

  it('unchecking concurso clears ConcursoUltPer and the rectification flag', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    fireEvent.click(screen.getByTestId('FmBoxes390__flag_ConcursoAcr'));
    fireEvent.click(screen.getByTestId('FmBoxes390__flag_ConcursoUltPer'));
    fireEvent.click(screen.getByTestId('FmModel390Page__type_sustitutiva'));
    fireEvent.change(screen.getByTestId('FmModel390Page__formerStatement'), { target: { value: '3901234567890' } });
    fireEvent.click(screen.getByTestId('FmModel390Page__byQuotas'));
    fireEvent.click(screen.getByTestId('FmBoxes390__flag_ConcursoAcr'));
    expect(screen.queryByTestId('FmModel390Page__byQuotas')).toBeNull();
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    const md = persistManualData.mock.calls[0][1];
    expect(md.identification.rectificacionCuotas).toBe(false);
    expect(md.aeatInputs).toMatchObject({ ConcursoAcr: 'N', ConcursoUltPer: 'N', ISSUPPLEMENTARY: 'Y', ISRECTIFICATION: 'N' });
  });

  it('territory percentages accept at most 99 %', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('territorio');
    fireEvent.click(screen.getByTestId('FmBoxes390__territoryToggle'));
    typeInput('COMMON_TERRITORY', '100');
    expect(toast.error).toHaveBeenCalledWith('fm.m390.input.percent_range');
    expect(screen.getByTestId('FmBoxes390__inputField_COMMON_TERRITORY').value).toBe('');
    typeInput('COMMON_TERRITORY', '99');
    expect(screen.getByTestId('FmBoxes390__inputField_COMMON_TERRITORY').value).not.toBe('');
  });

  it('turning territory mode on clears [85] from the saved inputs, not just the cell', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('resultado_liquidacion');
    typeInput('LIQANUAL_COMPENSATION', '50');
    goToBlock('territorio');
    fireEvent.click(screen.getByTestId('FmBoxes390__territoryToggle'));
    typeInput('COMMON_TERRITORY', '60');
    typeInput('ALAVA', '40');
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    const inputs = persistManualData.mock.calls[0][1].aeatInputs;
    expect(inputs).not.toHaveProperty('LIQANUAL_COMPENSATION');
    expect(inputs).toMatchObject({ COMMON_TERRITORY: '60.00', ALAVA: '40.00' });
  });

  it('[85] and [93] cannot coexist: the second one is refused', () => {
    render(<FmModel390Page decl={makeDecl({ manualData: { aeatInputs: { COMMON_TERRITORY_COMPENSATION: '10.00' } } })} {...props()} />);
    goToBlock('resultado_liquidacion');
    typeInput('LIQANUAL_COMPENSATION', '50');
    expect(toast.error).toHaveBeenCalledWith('fm.m390.input.compensation_conflict');
    expect(screen.getByTestId('FmBoxes390__inputField_LIQANUAL_COMPENSATION').value).toBe('');
  });

  it('DEVOLVER cells are disabled unless ISMONTHLYRETURN, and cleared when it is turned off', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('resultado_liquidaciones');
    expect(screen.getByTestId('FmBoxes390__inputField_DEVOLVER_01').disabled).toBe(true);
    expect(screen.getByTestId('FmBoxes390__inputField_INGRESAR_01').disabled).toBe(false);
    goToBlock('identificacion');
    fireEvent.click(screen.getByTestId('FmBoxes390__flag_ISMONTHLYRETURN'));
    goToBlock('resultado_liquidaciones');
    expect(screen.getByTestId('FmBoxes390__inputField_DEVOLVER_01').disabled).toBe(false);
    typeInput('DEVOLVER_03', '25');
    goToBlock('identificacion');
    fireEvent.click(screen.getByTestId('FmBoxes390__flag_ISMONTHLYRETURN'));
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    const inputs = persistManualData.mock.calls[0][1].aeatInputs;
    expect(inputs.ISMONTHLYRETURN).toBe('N');
    expect(inputs).not.toHaveProperty('DEVOLVER_03');
  });

  it('DEVOLVER_12 with [97] is an inline error; [98] with [96]/[97] a warning', () => {
    render(<FmModel390Page decl={makeDecl({ manualData: { aeatInputs: { ISMONTHLYRETURN: 'Y' } } })} {...props()} />);
    goToBlock('resultado_liquidaciones');
    typeInput('DEVOLVER_12', '30');
    expect(screen.queryByTestId('FmBoxes390__check_devolver12_with_97')).toBeNull();
    typeInput('TOTAL_LASTPERIOD', '10');
    expect(screen.getByTestId('FmBoxes390__check_devolver12_with_97').getAttribute('role')).toBe('alert');
    typeInput('TOTAL_LASTPERIOD_DEVOLVER', '5');
    expect(screen.getByTestId('FmBoxes390__check_box98_with_96_97').getAttribute('role')).toBe('status');
  });

  it('the result badge is informative: "Resultado positivo / negativo", never "A ingresar"', () => {
    const { unmount } = render(<FmModel390Page decl={makeDecl()} {...props()} />);
    const kpi = () => document.querySelector('.test-kpi390[data-label="fm.m390.kpi.result"]').textContent;
    expect(kpi()).toContain('fm.m390.result.positive');
    expect(kpi()).not.toContain('fm.result.I');
    expect(screen.getByTestId('FmModel390Page__resultHint').textContent).toContain('fm.m390.result.informative_hint');
    unmount();
    const negative = { ...PAYLOAD, boxes: { ...PAYLOAD.boxes, 86: '-20.00', 84: '-20.00', 65: '-20.00' } };
    render(<FmModel390Page decl={makeDecl({ _precomputed: negative })} {...props()} />);
    expect(kpi()).toContain('fm.m390.result.negative');
  });
});

describe('FmModel390Page — Generar fichero / Presentar save first', () => {
  it('"Generar fichero 390" saves pending changes BEFORE generating', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('resultado_liquidacion');
    typeInput('LIQANUAL_VAT_IMPORT', '12');
    fireEvent.click(screen.getByTestId('FmModel390Page__generate'));
    fireEvent.click(screen.getByTestId('FileGenModal390-confirm'));
    await waitFor(() => expect(generate390File).toHaveBeenCalledTimes(1));
    expect(persistManualData).toHaveBeenCalledTimes(1);
    expect(persistManualData.mock.invocationCallOrder[0]).toBeLessThan(generate390File.mock.invocationCallOrder[0]);
  });

  it('a failed save stops the generation', async () => {
    persistManualData.mockResolvedValue({ ok: false, error: 'http_500' });
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('resultado_liquidacion');
    typeInput('LIQANUAL_VAT_IMPORT', '12');
    fireEvent.click(screen.getByTestId('FmModel390Page__generate'));
    fireEvent.click(screen.getByTestId('FileGenModal390-confirm'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.save_error'));
    expect(generate390File).not.toHaveBeenCalled();
  });

  it('without pending changes it generates directly (no extra PUT)', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__generate'));
    fireEvent.click(screen.getByTestId('FileGenModal390-confirm'));
    await waitFor(() => expect(generate390File).toHaveBeenCalled());
    expect(persistManualData).not.toHaveBeenCalled();
  });

  it('blocking incidents: Generar and Presentar say why in a toast and open nothing (303 pattern)', async () => {
    fetchDeclarationIncidents.mockResolvedValue({ blocking: 1, warning: 0, items: [{ severity: 'block' }] });
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitForBlocked();
    fireEvent.click(screen.getByTestId('FmModel390Page__generate'));
    expect(toast.error).toHaveBeenCalledWith('fm.m390.blocked_by_incidents');
    expect(screen.queryByTestId('FileGenModal390-confirm')).toBeNull();
    toast.error.mockClear();
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    expect(toast.error).toHaveBeenCalledWith('fm.m390.blocked_by_incidents');
    expect(screen.queryByTestId('PresentModal-confirm')).toBeNull();
  });
});

describe('FmModel390Page — presented declaration', () => {
  it('is read-only: no actions, inputs disabled, frozen snapshot shown', async () => {
    const snapshot = { ...PAYLOAD, boxes: { ...PAYLOAD.boxes, 86: '999.00' }, inputs: { LIQANUAL_VAT_IMPORT: '5' } };
    render(<FmModel390Page decl={makeDecl({ status: 'submitted', submittedSnapshot: snapshot, _precomputed: null })} {...props()} />);
    expect(screen.queryByTestId('FmModel390Page__compute')).toBeNull();
    expect(screen.queryByTestId('FmModel390Page__save')).toBeNull();
    expect(screen.getByTestId('FmModel390Page__type_normal').disabled).toBe(true);
    expect(kpiValue('fm.m390.kpi.result')).toBe('999');
    goToBlock('resultado_liquidacion');
    expect(screen.getByTestId('FmBoxes390__inputField_LIQANUAL_VAT_IMPORT').disabled).toBe(true);
    await act(async () => {});
    expect(fetchBoxes390).not.toHaveBeenCalled();
  });

  it('summaryOf reads [47] / [64] and the annual result of the mode', () => {
    expect(summaryOf({ 47: '1', 64: '2', 86: '3', 94: '4' }, 'liquidation')).toEqual({ accrued: 1, deductible: 2, result: 3 });
    expect(summaryOf({ 86: '3', 94: '4' }, 'territory').result).toBe(4);
  });
});

describe('FmModel390Page — Facturas tab', () => {
  it('"Ver facturas" on an invoice box opens the Facturas tab filtered by that box', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    goToBlock('iva_devengado');
    expect(screen.queryByTestId('FmBoxes390__viewInvoices_47')).toBeNull(); // derived total: no lines
    fireEvent.click(screen.getByTestId('FmBoxes390__viewInvoices_5'));
    const stub = screen.getByTestId('FmSources390-stub');
    expect(JSON.parse(stub.getAttribute('data-filter'))).toEqual({ box: 5, type: '', tax: '', q: '' });
    expect(screen.getByRole('tab', { name: 'fm.tab.sources' }).getAttribute('aria-selected')).toBe('true');
  });

  it('the Facturas tab opens unfiltered from the tab bar', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'fm.tab.sources' }));
    expect(JSON.parse(screen.getByTestId('FmSources390-stub').getAttribute('data-filter')).box).toBeNull();
  });

  it('a presented declaration has no "Ver facturas" link and passes isSubmitted to the tab', () => {
    render(<FmModel390Page decl={makeDecl({ status: 'submitted', submittedSnapshot: PAYLOAD, _precomputed: null })} {...props()} />);
    goToBlock('iva_devengado');
    expect(screen.queryByTestId('FmBoxes390__viewInvoices_5')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'fm.tab.sources' }));
    expect(screen.getByTestId('FmSources390-stub').getAttribute('data-submitted')).toBe('true');
  });

  it('a payload without invoiceBoxes (older snapshot) shows no link', () => {
    const { invoiceBoxes, ...legacy } = PAYLOAD;
    render(<FmModel390Page decl={makeDecl({ _precomputed: legacy })} {...props()} />);
    goToBlock('iva_devengado');
    expect(screen.queryByTestId('FmBoxes390__viewInvoices_5')).toBeNull();
  });
});

describe('FmModel390Page — preload from the 303s and cuadre (ETP-5716)', () => {
  const savedManualData = () => persistManualData.mock.calls.at(-1)[1];

  it('a draft never preloaded takes the 303 values into its empty inputs and saves them with aeatPreloaded', async () => {
    fetchPreload390.mockResolvedValue(PRELOAD);
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(fetchPreload390).toHaveBeenCalled());
    expect(fetchPreload390.mock.calls[0][1].monthlyReturn).toBe(false);
    goToBlock('resultado_liquidaciones');
    await waitFor(() => expect(screen.getByTestId('FmBoxes390__input_INGRESAR_03').getAttribute('data-origin')).toBe('preloaded'));
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    const md = savedManualData();
    expect(md.aeatInputs.INGRESAR_03).toBe('300.00');
    expect(md.aeatInputs.INGRESAR_12).toBe('60.00');
    expect(md.aeatInputs.INGRESAR_06).toBeUndefined();
    expect(md.aeatPreloaded).toEqual(PRELOAD.inputs);
  });

  it('opening an already preloaded draft does not re-apply; Calcular applies only the unmodified inputs', async () => {
    const manualData = {
      aeatInputs: { INGRESAR_03: '350.00', INGRESAR_12: '60.00' },
      aeatPreloaded: { INGRESAR_03: '300.00', INGRESAR_12: '60.00' },
    };
    fetchPreload390.mockResolvedValue({ ...PRELOAD, inputs: { INGRESAR_03: '310.00', INGRESAR_12: '70.00' } });
    render(<FmModel390Page decl={makeDecl({ manualData })} {...props()} />);
    await waitFor(() => expect(fetchPreload390).toHaveBeenCalledTimes(1));
    goToBlock('resultado_liquidaciones');
    expect(screen.getByTestId('FmBoxes390__inputField_INGRESAR_12').value).toBe('60');

    await act(async () => { fireEvent.click(screen.getByTestId('FmModel390Page__compute')); });
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    expect(fetchPreload390).toHaveBeenCalledTimes(2);
    const md = savedManualData();
    expect(md.aeatInputs.INGRESAR_03).toBe('350.00'); // the user's value survives
    expect(md.aeatInputs.INGRESAR_12).toBe('70.00');
    expect(md.aeatPreloaded).toEqual({ INGRESAR_03: '310.00', INGRESAR_12: '70.00' });
    // the boxes were computed with the preloaded inputs
    expect(fetchBoxes390.mock.calls.at(-1)[1].inputs.INGRESAR_12).toBe('70.00');
  });

  it('a modified preloaded box shows "Modificado" and Restaurar returns to the preloaded value', async () => {
    const manualData = { aeatInputs: { LIQANUAL_COMPENSATION: '80.00' }, aeatPreloaded: { LIQANUAL_COMPENSATION: '50.00' } };
    render(<FmModel390Page decl={makeDecl({ manualData })} {...props()} />);
    goToBlock('resultado_liquidacion');
    expect(screen.getByTestId('FmBoxes390__input_LIQANUAL_COMPENSATION').getAttribute('data-origin')).toBe('modified');
    fireEvent.click(screen.getByTestId('FmBoxes390__restore_LIQANUAL_COMPENSATION'));
    expect(screen.getByTestId('FmBoxes390__input_LIQANUAL_COMPENSATION').getAttribute('data-origin')).toBe('preloaded');
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    expect(savedManualData().aeatInputs.LIQANUAL_COMPENSATION).toBe('50.00');
    expect(savedManualData().aeatPreloaded).toEqual({ LIQANUAL_COMPENSATION: '50.00' });
  });

  it('lists the 303s of the year in block 9 and opens one', async () => {
    fetchPreload390.mockResolvedValue(PRELOAD);
    const target = { id: 'd303-1', model: '303', year: 2026, period: 'T1' };
    fetchDeclaration.mockResolvedValue(target);
    const onOpenDeclaration = vi.fn();
    render(<FmModel390Page decl={makeDecl()} {...props()} onOpenDeclaration={onOpenDeclaration} />);
    goToBlock('resultado_liquidaciones');
    await waitFor(() => expect(screen.getByTestId('Settlements303Table390__row_T1')).toBeTruthy());
    expect(screen.getByTestId('Settlements303Table390__result_T1').textContent).toBe('300');
    expect(screen.getByTestId('Settlements303Table390__row_T4').textContent).toContain('fm.m390.preload.source_live');
    expect(screen.getByTestId('Settlements303Table390__missing')).toBeTruthy();
    expect(screen.getByTestId('Settlements303Table390__warning_DRAFT_303')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByTestId('Settlements303Table390__open_T1')); });
    await waitFor(() => expect(onOpenDeclaration).toHaveBeenCalledWith(target));
  });

  it('the cuadre is OK within 1,00 € of the 303s and a warning beyond it', async () => {
    fetchPreload390.mockResolvedValue({ ...PRELOAD, expectedResult: '359.50', missingPeriods: [] });
    const { unmount } = render(<FmModel390Page decl={makeDecl({ manualData: { aeatPreloaded: {} } })} {...props()} />);
    await waitFor(() => expect(screen.getByTestId('Reconciliation390__ok')).toBeTruthy());
    expect(screen.queryByTestId('Reconciliation390__missing')).toBeNull();
    unmount();

    fetchPreload390.mockResolvedValue({ ...PRELOAD, expectedResult: '300.00' });
    render(<FmModel390Page decl={makeDecl({ manualData: { aeatPreloaded: {} } })} {...props()} />);
    await waitFor(() => expect(screen.getByTestId('Reconciliation390__difference')).toBeTruthy());
    expect(screen.getByTestId('Reconciliation390__difference').textContent).toContain('fm.m390.reconcile.difference');
    expect(screen.getByTestId('Reconciliation390__missing')).toBeTruthy();
    // non-blocking: Generar stays enabled
    expect(screen.getByTestId('FmModel390Page__generate').disabled).toBe(false);
  });

  it('without 303s of the year there is nothing to reconcile and nothing is preloaded', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(screen.getByTestId('Reconciliation390__no303')).toBeTruthy());
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    expect(savedManualData().aeatPreloaded).toBeUndefined();
  });
});

describe('FmModel390Page — incidents (ETP-5716)', () => {
  const INCIDENTS = {
    blocking: 2, warning: 2,
    items: [
      { origin: 'TERRITORY_PERCENT_SUM', severity: 'block', message: 'sum', params: { sum: '90' }, action: { type: 'box', box: 87 } },
      { origin: 'NO_MAIN_IAE', severity: 'block', message: 'iae', action: { type: 'organization', section: 'iae' } },
      { origin: 'UNPOSTED_INVOICES', severity: 'warn', message: 'unposted', params: { count: 1 }, action: { type: 'invoices', sales: 1, purchase: 0 } },
      { origin: 'AEAT-W1', severity: 'warn', message: 'Aviso de la AEAT' },
    ],
  };
  const openIncidents = () => fireEvent.click(screen.getByRole('tab', { name: 'fm.tab.incidents' }));

  it('a draft has its rules recomputed by the backend on opening', async () => {
    validate390.mockResolvedValue(INCIDENTS);
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(validate390).toHaveBeenCalledWith(expect.objectContaining({ id: 'decl-390' }), expect.anything()));
    // the 303 card: the total, with the severity badge ("Requiere revisión" while any blocks)
    await waitFor(() => expect(screen.getByTestId('FmModel390Page__incidentsCount').textContent).toBe('4'));
    expect(kpiBadge('fm.tab.incidents')).toBe('fm.kpi.incidents_sub');
    expect(fetchDeclarationIncidents).not.toHaveBeenCalled();
    // the AEAT warning is listed, but only the rule incidents gate Generar / Presentar
    await waitForBlocked();
  });

  it('a presented declaration keeps its frozen incidents: nothing is recomputed', async () => {
    const snapshot = { ...PAYLOAD };
    render(<FmModel390Page decl={makeDecl({ status: 'submitted', submittedSnapshot: snapshot, _precomputed: null })} {...props()} />);
    await waitFor(() => expect(fetchDeclarationIncidents).toHaveBeenCalled());
    expect(validate390).not.toHaveBeenCalled();
  });

  it('falls back to the stored incidents when the recompute fails', async () => {
    fetchDeclarationIncidents.mockResolvedValue(INCIDENTS);
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(fetchDeclarationIncidents).toHaveBeenCalled());
    await waitForBlocked();
  });

  it('every successful save recomputes them', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(validate390).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('FmModel390Page__save'));
    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    await waitFor(() => expect(validate390).toHaveBeenCalledTimes(2));
  });

  it('Calcular recomputes them even with nothing to save', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(validate390).toHaveBeenCalledTimes(1));
    await act(async () => { fireEvent.click(screen.getByTestId('FmModel390Page__compute')); });
    await waitFor(() => expect(validate390).toHaveBeenCalledTimes(2));
  });

  it('the tab is the shared table: blocking first, origin, text and an AEAT answer as it came', async () => {
    validate390.mockResolvedValue(INCIDENTS);
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitForBlocked();
    openIncidents();
    const rows = screen.getByTestId('Incidents390Tab').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(4);
    // this file's `t` echoes keys without params, so the text falls back to the stored message
    // (the translation by code is incidents390.vitest.js)
    expect(rows[0].textContent).toContain('fm.incidents.severity.block');
    expect(rows[0].textContent).toContain('fm.m390.incidents.origin.box');
    expect(rows[0].textContent).toContain('sum');
    expect(rows[0].textContent).toContain('fm.m390.incidents.go_to_box');
    expect(rows[1].textContent).toContain('fm.m390.incidents.origin.organization');
    expect(rows[2].textContent).toContain('fm.incidents.severity.warn');
    expect(screen.getByTestId('IncidentsTab__row_AEAT-W1').textContent).toContain('Aviso de la AEAT');
    // the banner follows the severity, as on the 303
    expect(screen.getByTestId('Incidents390Tab').textContent).toContain('fm.incidents.block_sub');
  });

  it('"Ir a la casilla" opens the Casillas tab at that box', async () => {
    validate390.mockResolvedValue(INCIDENTS);
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitForBlocked();
    openIncidents();
    fireEvent.click(screen.getByTestId('Incidents390Tab__action_box'));
    await waitFor(() => expect(screen.getByTestId('FmBoxes390__block_territorio')).toBeTruthy());
  });

  it('"Editar en Organización" and the invoice list save first, then navigate', async () => {
    validate390.mockResolvedValue(INCIDENTS);
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitForBlocked();
    openIncidents();
    await act(async () => { fireEvent.click(screen.getByTestId('Incidents390Tab__action_organization')); });
    expect(navigateMock).toHaveBeenCalledWith('/organization#org-section-iae');
    await act(async () => { fireEvent.click(screen.getByTestId('Incidents390Tab__action_sales')); });
    expect(navigateMock).toHaveBeenCalledWith('/sales-invoice');
  });

  it('a 409 BLOCKING_INCIDENTS on Generar shows the fresh list', async () => {
    generate390File.mockResolvedValue({ ok: false, error: 'blocking_incidents', incidents: INCIDENTS });
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(validate390).toHaveBeenCalledTimes(1));
    validate390.mockResolvedValue(INCIDENTS);
    fireEvent.click(screen.getByTestId('FmModel390Page__generate'));
    await act(async () => { fireEvent.click(screen.getByTestId('FileGenModal390-confirm')); });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.m390.blocked_by_incidents'));
    await waitFor(() => expect(screen.getByTestId('IncidentsTab__row_TERRITORY_PERCENT_SUM')).toBeTruthy());
    expect(validate390).toHaveBeenCalledTimes(2);
  });
});
