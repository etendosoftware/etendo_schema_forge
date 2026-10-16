// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/FmModel390Page.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/FmBoxes390.jsx
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
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    persistManualData: vi.fn().mockResolvedValue({ ok: true }),
    fetchDeclarationIncidents: vi.fn().mockResolvedValue({ blocking: 0, warning: 0, items: [] }),
  };
});
vi.mock('../fm390Api.js', () => ({
  fetchBoxes390: vi.fn(),
  generate390File: vi.fn().mockResolvedValue({ ok: true }),
  checkModified390: vi.fn(),
  generatedFileName: () => '390_0A_2026.txt',
}));
const orgIdentityMock = vi.hoisted(() => ({ nameWarnings: [] }));
vi.mock('../useOrg390Identity.js', () => ({
  default: () => ({
    loaded: true, nif: 'B12345678', name: 'Acme SL',
    activities: [{ id: 'a1', activity: 'Comercio', type: 'A', code: '651.1', isDefault: true }],
    isPerson: false, personRepresentative: null,
    representatives: [{ id: 'r1', nif: '12345678Z', name: 'Ana Pérez', powerDate: '2024-03-05', notary: 'Notaría 1' }],
    nameWarnings: orgIdentityMock.nameWarnings,
  }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  KpiWidget: ({ value, label, badge }) => React.createElement(
    'div', { className: 'test-kpi390', 'data-label': label },
    React.createElement('span', { className: 'test-kpi390-value' }, value),
    React.createElement('span', null, badge),
  ),
  Tabs: ({ tabs, active, onSelect }) => React.createElement('div', { role: 'tablist' },
    tabs.map(t => React.createElement('button', {
      key: t.id, role: 'tab', 'aria-selected': String(t.id === active), onClick: () => onSelect(t.id),
    }, t.label))),
}));
vi.mock('../../../FmTabContent.jsx', () => ({ IncidentsTab: () => null }));
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
import { fetchBoxes390, generate390File } from '../fm390Api.js';
import { persistManualData, fetchDeclarationIncidents } from '../../../fiscalModelsUtils.js';
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
  orgIdentityMock.nameWarnings = [];
  persistManualData.mockResolvedValue({ ok: true });
  generate390File.mockResolvedValue({ ok: true });
  fetchBoxes390.mockResolvedValue(PAYLOAD);
  fetchDeclarationIncidents.mockResolvedValue({ blocking: 0, warning: 0, items: [] });
});

const goToBlock = (id) => fireEvent.click(screen.getByTestId(`FmBoxes390__index_${id}`));
const kpiValue = (label) => document.querySelector(`.test-kpi390[data-label="${label}"] .test-kpi390-value`)?.textContent;

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
    expect(kpiValue('fm.tab.incidents')).toBe('0');
  });

  it('renders the index of the 11 blocks, the legend and the design-year note', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    const index = screen.getByTestId('FmBoxes390__index');
    expect(index.querySelectorAll('button')).toHaveLength(11);
    expect(screen.getByTestId('FmBoxes390__legend').textContent).toContain('fm.m390.origin.modified');
    expect(screen.getByTestId('FmBoxes390__designNote').textContent).toContain('fm.m390.design_fallback');
    expect(screen.getByTestId('FmBoxes390__warnings').textContent).toContain('fm.m390.warning.unsupported_rate');
  });

  it('reads the identification and representative blocks from the organization', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    expect(screen.getByTestId('FmBoxes390__nif').textContent).toContain('B12345678');
    goToBlock('datos_estadisticos');
    expect(screen.getByTestId('FmBoxes390__activities').textContent).toContain('651.1');
    goToBlock('representante');
    expect(screen.getByTestId('FmBoxes390__representatives').textContent).toContain('Ana Pérez');
    expect(screen.getByTestId('FmBoxes390__editOrganization')).toBeTruthy();
  });

  it('shows no name-truncation notice when every name fits', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    expect(screen.queryByTestId('FmBoxes390__nameTruncated')).toBeNull();
  });

  it('lists each name the file will cut in its own block, without blocking Generar', () => {
    orgIdentityMock.nameWarnings = [
      { field: 'socialName', limit: 37 },
      { field: 'legalRepresentative', limit: 36, label: '12345678Z' },
    ];
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    const ident = screen.getByTestId('FmBoxes390__nameTruncated');
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

  it('Presentar persists the inputs in their own PUT before the status change', async () => {
    const p = props();
    render(<FmModel390Page decl={makeDecl()} {...p} />);
    goToBlock('resultado_liquidacion');
    typeInput('LIQANUAL_VAT_IMPORT', '12');
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    fireEvent.click(screen.getByTestId('PresentModal-confirm'));
    await waitFor(() => expect(p.onStatusChange).toHaveBeenCalledWith('decl-390', 'submitted', 'manual_no_receipt'));
    expect(persistManualData.mock.invocationCallOrder[0]).toBeLessThan(p.onStatusChange.mock.invocationCallOrder[0]);
  });

  it('blocking incidents disable Generar and Presentar', async () => {
    fetchDeclarationIncidents.mockResolvedValue({ blocking: 1, warning: 0, items: [{ severity: 'block' }] });
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(screen.getByTestId('FmModel390Page__generate').disabled).toBe(true));
    expect(screen.getByTestId('FmModel390Page__present').disabled).toBe(true);
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
