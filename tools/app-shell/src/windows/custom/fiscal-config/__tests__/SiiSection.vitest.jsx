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
  it('renders section labels', () => {
    render(<SiiSection {...PROPS} />);
    expect(screen.getByText('fiscal.sii.legend.status')).toBeInTheDocument();
    expect(screen.getByText('fiscal.sii.legend.env')).toBeInTheDocument();
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
});
