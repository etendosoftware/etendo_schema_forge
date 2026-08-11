import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createRef } from 'react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, disabled, ...rest }) => (
    <input value={value ?? ''} onChange={onChange} disabled={disabled} {...rest} />
  ),
}));

vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange }) => (
    <input type="text" data-testid="date-field" value={value ?? ''} onChange={e => onChange?.(e.target.value)} />
  ),
}));

vi.mock('@/components/ui/label', () => ({ Label: ({ children }) => <label>{children}</label> }));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled }) => (
    <input type="checkbox" checked={!!checked} onChange={e => onCheckedChange?.(e.target.checked)} disabled={disabled} />
  ),
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (url) => url ?? '',
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))),
}));

vi.mock('../CertSection.jsx', () => ({ default: () => <div data-testid="cert-section" /> }));

vi.mock('../fiscalConfig.utils.js', () => ({
  getFiscalRecordId: vi.fn(() => 'rec-1'),
  isEtendoTrue: (v) => v === 'Y',
  normalizeDateInputValue: (v) => v ?? '',
  mapSiiRecordToForm: vi.fn((r) => ({
    acogidaAlSII: r?.acogidaAlSII ?? 'N',
    entornoDeProduccin: r?.entornoDeProduccin ?? 'N',
    adjuntarArchivosXML: r?.adjuntarArchivosXML ?? 'N',
    postedInvoices: r?.postedInvoices ?? 'N',
    recc: r?.recc ?? 'N',
    redeme: r?.redeme ?? 'N',
    plazoLmiteDeEnvoASII: r?.plazoLmiteDeEnvoASII ?? 4,
    cadenciaEnvoFacturasVentaASII: r?.cadenciaEnvoFacturasVentaASII ?? '',
    cadenciaEnvoFacturasCompraASII: r?.cadenciaEnvoFacturasCompraASII ?? '',
    authorizationno: r?.authorizationno ?? '',
    fechaAcogidaSII: r?.fechaAcogidaSII ?? '',
    monitordate: r?.monitordate ?? '',
  })),
  serializeBooleanFields: vi.fn((form) => form),
}));

import SiiSection from '../SiiSection.jsx';

// --- Tests ----------------------------------------------------------------

const BASE_RECORD = { plazoLmiteDeEnvoASII: 4 };
const PROPS = { record: BASE_RECORD, apiBaseUrl: '/api', orgId: 'org-1', onSave: vi.fn() };

describe('SiiSection — rendering', () => {
  it('renders section labels (ETP-4783: status+env sections removed)', () => {
    render(<SiiSection {...PROPS} />);
    expect(screen.queryByText('fiscal.sii.legend.status')).not.toBeInTheDocument();
    expect(screen.queryByText('fiscal.sii.legend.env')).not.toBeInTheDocument();
    expect(screen.getByText('fiscal.sii.legend.sends')).toBeInTheDocument();
  });

  it('renders the CertSection when hideCert is false', () => {
    render(<SiiSection {...PROPS} hideCert={false} />);
    expect(screen.getByTestId('cert-section')).toBeInTheDocument();
  });

  it('hides the CertSection when hideCert is true', () => {
    render(<SiiSection {...PROPS} hideCert={true} />);
    expect(screen.queryByTestId('cert-section')).not.toBeInTheDocument();
  });

  it('renders the save button when hideSave is false', () => {
    render(<SiiSection {...PROPS} hideSave={false} />);
    expect(screen.getByText('fiscal.save')).toBeInTheDocument();
  });

  it('hides the save button when hideSave is true', () => {
    render(<SiiSection {...PROPS} hideSave={true} />);
    expect(screen.queryByText('fiscal.save')).not.toBeInTheDocument();
  });
});

describe('SiiSection — validation', () => {
  it('shows deadline error when plazo is empty and save is attempted', async () => {
    const ref = createRef();
    render(<SiiSection {...PROPS} record={{ plazoLmiteDeEnvoASII: '' }} ref={ref} />);
    await expect(ref.current.save()).rejects.toThrow();
    await waitFor(() => {
      expect(screen.getByText('fiscal.sii.err.deadline')).toBeInTheDocument();
    });
  });
});

describe('SiiSection — save', () => {
  it('calls onSave after a successful PUT', async () => {
    const onSave = vi.fn();
    const ref = createRef();
    render(<SiiSection {...PROPS} onSave={onSave} ref={ref} />);
    await ref.current.save();
    expect(onSave).toHaveBeenCalled();
  });

  it('shows error when API returns non-ok', async () => {
    const { useApiFetch } = await import('@/auth/useApiFetch.js');
    useApiFetch.mockReturnValueOnce(
      vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('Server error'), statusText: 'Error' }))
    );
    const ref = createRef();
    render(<SiiSection {...PROPS} ref={ref} />);
    await expect(ref.current.save()).rejects.toThrow();
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  // ETP-4783 regression guard: fields hidden from UI must always be sent with
  // forced values, regardless of what the record contains.
  it('always sends acogidaAlSII=Y in the PUT body, regardless of record value', async () => {
    const { useApiFetch } = await import('@/auth/useApiFetch.js');
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    useApiFetch.mockReturnValueOnce(fetchMock);
    const ref = createRef();
    render(<SiiSection {...PROPS} record={{ ...BASE_RECORD, acogidaAlSII: 'N' }} ref={ref} />);
    await ref.current.save();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.acogidaAlSII).toBe('Y');
  });

  it('always sends entornoDeProduccin=Y in the PUT body, regardless of record value', async () => {
    const { useApiFetch } = await import('@/auth/useApiFetch.js');
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    useApiFetch.mockReturnValueOnce(fetchMock);
    const ref = createRef();
    render(<SiiSection {...PROPS} record={{ ...BASE_RECORD, entornoDeProduccin: 'N' }} ref={ref} />);
    await ref.current.save();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.entornoDeProduccin).toBe('Y');
  });

  it('always sends adjuntarArchivosXML=Y in the PUT body, regardless of record value', async () => {
    const { useApiFetch } = await import('@/auth/useApiFetch.js');
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    useApiFetch.mockReturnValueOnce(fetchMock);
    const ref = createRef();
    render(<SiiSection {...PROPS} record={{ ...BASE_RECORD, adjuntarArchivosXML: 'N' }} ref={ref} />);
    await ref.current.save();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.adjuntarArchivosXML).toBe('Y');
  });

  it('always sends a truthy fechaAcogidaSII in the PUT body (falls back to today when record has null)', async () => {
    const { useApiFetch } = await import('@/auth/useApiFetch.js');
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    useApiFetch.mockReturnValueOnce(fetchMock);
    const ref = createRef();
    render(<SiiSection {...PROPS} record={{ ...BASE_RECORD, fechaAcogidaSII: null }} ref={ref} />);
    await ref.current.save();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.fechaAcogidaSII).toBeTruthy();
  });

  it('always sends a truthy monitordate in the PUT body (falls back to today when record has null)', async () => {
    const { useApiFetch } = await import('@/auth/useApiFetch.js');
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    useApiFetch.mockReturnValueOnce(fetchMock);
    const ref = createRef();
    render(<SiiSection {...PROPS} record={{ ...BASE_RECORD, monitordate: null }} ref={ref} />);
    await ref.current.save();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.monitordate).toBeTruthy();
  });
});
