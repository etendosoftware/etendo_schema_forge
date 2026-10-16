// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/FmModel390Page.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/submission390.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/SubmissionCard390.jsx
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/RegisterSubmitted390Modal.jsx
//
// ETP-5716 — Modelo 390 presentation: "Presentar" offers the AEAT telematic filing and
// "Registrar como presentada"; both save pending changes first. A telematic success mirrors the
// backend's submitted_ack + filing data; an AEAT error keeps the draft. A manual registration
// saves manualData.submission in its own PUT, then changes the status to submitted_ext. A
// submitted 390 shows the "Presentación en la AEAT" card and "Crear declaración sustitutiva".
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuthOptional: () => ({ username: 'ayelen', selectedOrg: { id: 'org1' } }) }));
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
  fetchSources390: vi.fn(),
}));
vi.mock('../FmSources390.jsx', () => ({ default: () => null }));
vi.mock('../useOrg390Identity.js', () => ({
  default: () => ({
    loaded: true, nif: 'B12345678', name: 'Acme SL', activities: [], isPerson: false,
    personRepresentative: null, representatives: [], nameWarnings: [],
  }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  KpiWidget: () => null,
  Tabs: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({ IncidentsTab: () => null }));
const presentProps = vi.hoisted(() => ({ current: null }));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: (p) => {
    presentProps.current = p;
    return React.createElement('div', null,
      React.createElement('button', { type: 'button', 'data-testid': 'PresentModal-aeat', onClick: () => p.onConfirm({ status: 'aeat_telematic' }) }, 'aeat'),
      React.createElement('button', { type: 'button', 'data-testid': 'PresentModal-register', onClick: () => p.onConfirm({ status: 'submitted_ext' }) }, 'register'));
  },
}));
const flowProps = vi.hoisted(() => ({ current: null }));
vi.mock('../../303/AeatSubmitFlow.jsx', () => ({
  default: (p) => {
    flowProps.current = p;
    return React.createElement('div', { 'data-testid': 'AeatSubmitFlow-stub' });
  },
}));
vi.mock('../RegisterSubmitted390Modal.jsx', () => ({
  default: ({ onConfirm }) => React.createElement('button', {
    type: 'button', 'data-testid': 'Register-confirm',
    onClick: () => onConfirm({ justificante: '3901234567890', date: '2027-01-10', file: { name: 'j.pdf' } }),
  }, 'register-confirm'),
}));
vi.mock('../FileGenModal390.jsx', () => ({ default: () => null }));
const uploadMock = vi.hoisted(() => vi.fn());
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null,
  useAttachments: () => ({ count: 0, upload: uploadMock, list: vi.fn() }),
}));
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  CheckboxField: ({ checked, onToggle, 'data-testid': testId }) => React.createElement('input', {
    type: 'checkbox', checked: !!checked, 'data-testid': testId, onChange: e => onToggle?.(e.target.checked),
  }),
}));
vi.mock('../submission390.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createSubstitute390: vi.fn() };
});

import FmModel390Page from '../FmModel390Page.jsx';
import { fetchBoxes390 } from '../fm390Api.js';
import { persistManualData, fetchDeclarationIncidents } from '../../../fiscalModelsUtils.js';
import {
  AEAT_SUBMIT_390, createSubstitute390, formerStatementFrom, substituteManualData, submissionOf,
} from '../submission390.js';
import { presentationDateLabel } from '../SubmissionCard390.jsx';
import { toast } from 'sonner';

const PAYLOAD = {
  boxes: { 47: '460.00', 64: '100.00', 65: '360.00', 86: '360.00' },
  summary: { accrued: '460.00', deductible: '100.00', result: '360.00', annualResult: '360.00' },
  mode: 'liquidation',
  taxReport: { searchKey: 'AEAT390_2025_Y', layoutYear: 2025, fallback: true },
  inputs: {},
  warnings: [],
};

const makeDecl = (overrides = {}) => ({
  id: 'decl-390', model: '390', year: 2026, period: '0A', type: 'ord', status: 'draft',
  manualData: { aeatInputs: { LIQANUAL_VAT_IMPORT: '5' } }, _precomputed: PAYLOAD, ...overrides,
});

const props = () => ({
  onBack: vi.fn(),
  onStatusChange: vi.fn().mockResolvedValue({ ok: true }),
  onSubmittedRemotely: vi.fn(),
  onDeclarationCreated: vi.fn(),
  onManualDataSaved: vi.fn(),
  token: 'tok',
  apiBaseUrl: 'http://host/sws/neo/fiscal-models',
});

beforeEach(() => {
  vi.clearAllMocks();
  presentProps.current = null;
  flowProps.current = null;
  persistManualData.mockResolvedValue({ ok: true });
  fetchBoxes390.mockResolvedValue(PAYLOAD);
  fetchDeclarationIncidents.mockResolvedValue({ blocking: 0, warning: 0, items: [] });
});

function editIdentifier() {
  // A pending change: switch to Sustitutiva and type the identifier.
  fireEvent.click(screen.getByTestId('FmModel390Page__type_sustitutiva'));
  fireEvent.change(screen.getByTestId('FmModel390Page__formerStatement'), { target: { value: '3900000000001' } });
}

describe('FmModel390Page — Presentar', () => {
  it('offers the AEAT path and a single "Registrar como presentada" path', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    expect(presentProps.current.showAeatPath).toBe(true);
    expect(presentProps.current.registerPaths.map(p => p.id)).toEqual(['submitted_ext']);
    expect(presentProps.current.registerPaths[0].continues).toBe(true);
  });

  it('telematic: pending changes are saved BEFORE the AEAT flow opens, with the 390 adapter', async () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    editIdentifier();
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    fireEvent.click(screen.getByTestId('PresentModal-aeat'));
    await waitFor(() => expect(screen.getByTestId('AeatSubmitFlow-stub')).toBeTruthy());
    expect(persistManualData).toHaveBeenCalledTimes(1);
    expect(persistManualData.mock.calls[0][1].identification.formerStatement).toBe('3900000000001');
    expect(flowProps.current.adapter).toBe(AEAT_SUBMIT_390);
    expect(flowProps.current.orgIdent).toEqual({ nif: 'B12345678', nombre: 'Acme SL' });
  });

  it('telematic: a failed save does not open the AEAT flow', async () => {
    persistManualData.mockResolvedValue({ ok: false, error: 'http_500' });
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    editIdentifier();
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    fireEvent.click(screen.getByTestId('PresentModal-aeat'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.save_error'));
    expect(screen.queryByTestId('AeatSubmitFlow-stub')).toBeNull();
  });

  it('telematic success: read-only, "Presentación en la AEAT" card, parent re-reads the declaration', async () => {
    const p = props();
    render(<FmModel390Page decl={makeDecl()} {...p} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    fireEvent.click(screen.getByTestId('PresentModal-aeat'));
    await waitFor(() => expect(flowProps.current).not.toBeNull());
    await waitFor(() => flowProps.current.onResult({
      status: 'SUCCESS', csv: 'CSV123', justificanteNumber: '3901234567890', presentationDate: '15/01/2027 10:20:30',
    }));
    expect(await screen.findByTestId('SubmissionCard390')).toBeTruthy();
    expect(screen.getByTestId('SubmissionCard390__csv').textContent).toBe('CSV123');
    expect(screen.getByTestId('SubmissionCard390__justificante').textContent).toBe('3901234567890');
    expect(screen.getByTestId('SubmissionCard390__user').textContent).toBe('ayelen');
    expect(screen.queryByTestId('FmModel390Page__present')).toBeNull();
    expect(screen.queryByTestId('FmModel390Page__compute')).toBeNull();
    expect(p.onSubmittedRemotely).toHaveBeenCalledWith('decl-390', 'submitted_ack');
    expect(p.onManualDataSaved.mock.calls.at(-1)[1].submission.justificante).toBe('3901234567890');
    expect(p.onStatusChange).not.toHaveBeenCalled();
  });

  it('telematic AEAT error: the declaration stays a draft', async () => {
    const p = props();
    render(<FmModel390Page decl={makeDecl()} {...p} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    fireEvent.click(screen.getByTestId('PresentModal-aeat'));
    await waitFor(() => expect(flowProps.current).not.toBeNull());
    flowProps.current.onResult({ status: 'ERROR', errors: ['E390001 NIF no identificado'] });
    expect(screen.queryByTestId('SubmissionCard390')).toBeNull();
    expect(screen.getByTestId('FmModel390Page__present')).toBeTruthy();
    expect(p.onSubmittedRemotely).not.toHaveBeenCalled();
  });

  it('manual: saves manualData.submission in its own PUT, uploads the PDF, then sets submitted_ext', async () => {
    const p = props();
    render(<FmModel390Page decl={makeDecl()} {...p} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    fireEvent.click(screen.getByTestId('PresentModal-register'));
    fireEvent.click(await screen.findByTestId('Register-confirm'));
    await waitFor(() => expect(p.onStatusChange).toHaveBeenCalledWith('decl-390', 'submitted_ext', 'manual_ext'));
    const saved = persistManualData.mock.calls.at(-1)[1];
    expect(saved.submission).toMatchObject({ method: 'manual_ext', justificante: '3901234567890', presentationDate: '2027-01-10', user: 'ayelen' });
    expect(saved.aeatInputs.LIQANUAL_VAT_IMPORT).toBe('5');
    expect(persistManualData.mock.invocationCallOrder.at(-1)).toBeLessThan(p.onStatusChange.mock.invocationCallOrder[0]);
    expect(uploadMock).toHaveBeenCalledWith({ name: 'j.pdf' });
    expect(await screen.findByTestId('SubmissionCard390')).toBeTruthy();
    expect(screen.getByTestId('SubmissionCard390__method').textContent).toBe('fm.m390.submission.method_manual');
  });

  it('manual: a failed save changes no status', async () => {
    const p = props();
    persistManualData.mockResolvedValue({ ok: false });
    render(<FmModel390Page decl={makeDecl()} {...p} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__present'));
    fireEvent.click(screen.getByTestId('PresentModal-register'));
    fireEvent.click(await screen.findByTestId('Register-confirm'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.save_error'));
    expect(p.onStatusChange).not.toHaveBeenCalled();
  });

  it('blocking incidents: Presentar is disabled and never opens the picker', async () => {
    fetchDeclarationIncidents.mockResolvedValue({ blocking: 1, warning: 0, items: [{ severity: 'block' }] });
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    await waitFor(() => expect(screen.getByTestId('FmModel390Page__present').disabled).toBe(true));
    expect(presentProps.current).toBeNull();
  });
});

describe('FmModel390Page — submitted declaration', () => {
  const submitted = () => makeDecl({
    status: 'submitted_ack', submissionMethod: 'aeat_telematic', submittedSnapshot: PAYLOAD, _precomputed: null,
    manualData: {
      aeatInputs: { LIQANUAL_VAT_IMPORT: '5' },
      submission: { method: 'aeat_telematic', justificante: '3901234567890', csv: 'CSV9', user: 'u1', presentationDate: '15/01/2027 10:20' },
    },
  });

  it('shows the card from manualData.submission', () => {
    render(<FmModel390Page decl={submitted()} {...props()} />);
    expect(screen.getByTestId('SubmissionCard390__csv').textContent).toBe('CSV9');
    expect(screen.getByTestId('SubmissionCard390__date').textContent).toBe('15/01/2027 10:20');
  });

  it('"Crear declaración sustitutiva" creates the substitute and hands it to the parent', async () => {
    const created = { id: 'decl-390-b', model: '390', year: 2026, period: '0A', type: 'com', status: 'draft' };
    createSubstitute390.mockResolvedValue({ ok: true, decl: created });
    const p = props();
    render(<FmModel390Page decl={submitted()} {...p} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__createSubstitute'));
    await waitFor(() => expect(p.onDeclarationCreated).toHaveBeenCalledWith(created));
    expect(createSubstitute390.mock.calls[0][0].manualData.submission.justificante).toBe('3901234567890');
  });

  it('a draft already existing for the exercise is reported', async () => {
    createSubstitute390.mockResolvedValue({ ok: false, error: 'draft_exists' });
    const p = props();
    render(<FmModel390Page decl={submitted()} {...p} />);
    fireEvent.click(screen.getByTestId('FmModel390Page__createSubstitute'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.m390.substitute.draft_exists'));
    expect(p.onDeclarationCreated).not.toHaveBeenCalled();
  });

  it('a draft has no "Crear declaración sustitutiva"', () => {
    render(<FmModel390Page decl={makeDecl()} {...props()} />);
    expect(screen.queryByTestId('FmModel390Page__createSubstitute')).toBeNull();
  });
});

describe('submission390 / card / register helpers', () => {
  it('substituteManualData: Sustitutiva with the 13-digit justificante, inputs kept, no filing data', () => {
    const md = substituteManualData({
      manualData: {
        aeatInputs: { LIQANUAL_VAT_IMPORT: '5' }, aeatPreloaded: { X: '1' },
        submission: { justificante: '3901234567890' },
      },
    });
    expect(md.identification).toMatchObject({ sustitutiva: true, formerStatement: '3901234567890' });
    expect(md.aeatInputs).toMatchObject({ LIQANUAL_VAT_IMPORT: '5', ISSUPPLEMENTARY: 'Y', SUPPLEMENTARYNO: '3901234567890' });
    expect(md.aeatPreloaded).toEqual({ X: '1' });
    expect(submissionOf(md)).toBeNull();
  });

  it('formerStatementFrom leaves the identifier empty when the justificante is not 13 digits', () => {
    expect(formerStatementFrom({ justificante: '123' })).toBe('');
    expect(formerStatementFrom(null)).toBe('');
  });

  it('presentationDateLabel formats a date-only value and keeps the AEAT text verbatim', () => {
    expect(presentationDateLabel({ presentationDate: '2027-01-10' }, 'es-ES')).toBe('10/01/2027');
    expect(presentationDateLabel({ presentationDate: '15/01/2027 10:20' })).toBe('15/01/2027 10:20');
    expect(presentationDateLabel({})).toBe('—');
  });

  it('registerFormError: 13 digits, a past date and the conformity check are all required', async () => {
    const { registerFormError } = await vi.importActual('../RegisterSubmitted390Modal.jsx');
    const ok = { justificante: '3901234567890', date: '2027-01-10', conform: true, today: '2027-01-20' };
    expect(registerFormError(ok)).toBeNull();
    expect(registerFormError({ ...ok, justificante: '39012' })).toBe('fm.m390.register.justificante_invalid');
    expect(registerFormError({ ...ok, date: '' })).toBe('fm.m390.register.date_required');
    expect(registerFormError({ ...ok, date: '2027-02-01' })).toBe('fm.m390.register.date_future');
    expect(registerFormError({ ...ok, conform: false })).toBe('fm.m390.register.conformity_required');
  });

  it('RegisterSubmitted390Modal: Confirmar stays disabled until the justificante and conformity are set', async () => {
    const { default: Modal } = await vi.importActual('../RegisterSubmitted390Modal.jsx');
    const onConfirm = vi.fn();
    render(<Modal onConfirm={onConfirm} onClose={vi.fn()} />);
    const confirm = screen.getByTestId('RegisterSubmitted390Modal__confirm');
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('RegisterSubmitted390Modal__justificante'), { target: { value: '390-1234567890' } });
    expect(screen.getByTestId('RegisterSubmitted390Modal__justificante').value).toBe('3901234567890');
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('RegisterSubmitted390Modal__conformity'));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ justificante: '3901234567890', file: null }));
  });
});
