import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }) => <span>{children}</span> }));

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
  normalizeDateInputValue: vi.fn((v) => v ?? ''),
  normalizeEtendoBoolean: vi.fn((v) => v === 'Y'),
  serializeBooleanFields: vi.fn((form) => form),
}));

import TbaiSection from '../TbaiSection.jsx';

// --- Tests ----------------------------------------------------------------

const BASE_RECORD = {
  tbaisystemdate: '2024-01-01',
  productionEnv: 'N',
  invoiceDescription: 'Factura',
  tbaiTerritory: 'ARABA',
};
const PROPS = { record: BASE_RECORD, apiBaseUrl: '/api', orgId: 'org-1', onSave: vi.fn() };

describe('TbaiSection — rendering', () => {
  it('renders section labels', () => {
    render(<TbaiSection {...PROPS} />);
    expect(screen.getByText('fiscal.tbai.legend.billing')).toBeInTheDocument();
    expect(screen.getByText('fiscal.tbai.legend.technical')).toBeInTheDocument();
  });

  it('renders the CertSection when hideCert is false', () => {
    render(<TbaiSection {...PROPS} hideCert={false} />);
    expect(screen.getByTestId('cert-section')).toBeInTheDocument();
  });

  it('hides the CertSection when hideCert is true', () => {
    render(<TbaiSection {...PROPS} hideCert={true} />);
    expect(screen.queryByTestId('cert-section')).not.toBeInTheDocument();
  });

  it('renders save button when hideSave=false', () => {
    render(<TbaiSection {...PROPS} hideSave={false} />);
    expect(screen.getByText('fiscal.save')).toBeInTheDocument();
  });

  it('hides save button when hideSave=true', () => {
    render(<TbaiSection {...PROPS} hideSave={true} />);
    expect(screen.queryByText('fiscal.save')).not.toBeInTheDocument();
  });
});

describe('TbaiSection — validation', () => {
  it('shows date error when tbaisystemdate is empty', async () => {
    const ref = createRef();
    render(<TbaiSection {...PROPS} record={{ ...BASE_RECORD, tbaisystemdate: '' }} ref={ref} />);
    await expect(ref.current.save()).rejects.toThrow();
    await waitFor(() => {
      expect(screen.getByText('fiscal.tbai.err.enrollDate')).toBeInTheDocument();
    });
  });

  it('shows description error when invoiceDescription is empty', async () => {
    const ref = createRef();
    render(<TbaiSection {...PROPS} record={{ ...BASE_RECORD, invoiceDescription: '' }} ref={ref} />);
    await expect(ref.current.save()).rejects.toThrow();
    await waitFor(() => {
      expect(screen.getByText('fiscal.tbai.err.invoiceDesc')).toBeInTheDocument();
    });
  });
});

describe('TbaiSection — save', () => {
  it('calls onSave after a successful PUT', async () => {
    const onSave = vi.fn();
    const ref = createRef();
    render(<TbaiSection {...PROPS} onSave={onSave} ref={ref} />);
    await ref.current.save();
    expect(onSave).toHaveBeenCalled();
  });
});
