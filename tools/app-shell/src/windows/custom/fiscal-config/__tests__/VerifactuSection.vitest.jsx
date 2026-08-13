import { render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

vi.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, disabled, ...rest }) => (
    <input value={value ?? ''} onChange={onChange} disabled={disabled} {...rest} />
  ),
}));

vi.mock('@/components/ui/label', () => ({ Label: ({ children }) => <label>{children}</label> }));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant }) => <span data-variant={variant}>{children}</span>,
}));

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
  normalizeEtendoBoolean: vi.fn((v) => v === 'Y'),
  normalizeVerifactuTaxType: vi.fn((v) => v ?? 'IVA'),
  getVerifactuTaxTypeLabel: vi.fn((v) => v ?? ''),
  buildVerifactuUpdatePayload: vi.fn((form) => form),
  VERIFACTU_TAX_TYPE_OPTIONS: [
    { value: 'IVA', label: 'IVA' },
    { value: 'IGIC', label: 'IGIC' },
  ],
}));

import VerifactuSection from '../VerifactuSection.jsx';

// --- Tests ----------------------------------------------------------------

const BASE_RECORD = { tAXType: 'IVA', defaultQR: 'N', isReady: 'N' };
const PROPS = { record: BASE_RECORD, apiBaseUrl: '/api', orgId: 'org-1', onSave: vi.fn() };

describe('VerifactuSection — rendering', () => {
  it('renders the VERI*FACTU label', () => {
    render(<VerifactuSection {...PROPS} />);
    expect(screen.getByText('VERI*FACTU')).toBeInTheDocument();
  });

  it('renders the CertSection', () => {
    render(<VerifactuSection {...PROPS} />);
    expect(screen.getByTestId('cert-section')).toBeInTheDocument();
  });

  it('renders the save button when hideSave=false', () => {
    render(<VerifactuSection {...PROPS} hideSave={false} />);
    expect(screen.getByText('fiscal.save')).toBeInTheDocument();
  });

  it('hides the save button when hideSave=true', () => {
    render(<VerifactuSection {...PROPS} hideSave={true} />);
    expect(screen.queryByText('fiscal.save')).not.toBeInTheDocument();
  });
});

describe('VerifactuSection — locked state', () => {
  it('renders a disabled read-only tax type input when isReady=Y', () => {
    render(<VerifactuSection {...PROPS} record={{ ...BASE_RECORD, isReady: 'Y' }} />);
    expect(screen.getByTestId('Input__e30816')).toBeDisabled();
  });

  it('disables the QR switch when isReady=Y', () => {
    render(<VerifactuSection {...PROPS} record={{ ...BASE_RECORD, isReady: 'Y' }} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('hides the save button when locked', () => {
    render(<VerifactuSection {...PROPS} record={{ ...BASE_RECORD, isReady: 'Y' }} hideSave={false} />);
    expect(screen.queryByText('fiscal.save')).not.toBeInTheDocument();
  });

  it('never renders a locked badge, regardless of lock state (badge was removed)', () => {
    const { rerender } = render(<VerifactuSection {...PROPS} record={{ ...BASE_RECORD, isReady: 'Y' }} />);
    expect(screen.queryByText('fiscal.verifactu.locked.badge')).not.toBeInTheDocument();
    rerender(<VerifactuSection {...PROPS} record={{ ...BASE_RECORD, isReady: 'N' }} />);
    expect(screen.queryByText('fiscal.verifactu.locked.badge')).not.toBeInTheDocument();
  });
});

describe('VerifactuSection — validation', () => {
  it('shows error when tAXType is empty', async () => {
    const { normalizeVerifactuTaxType } = await import('../fiscalConfig.utils.js');
    normalizeVerifactuTaxType.mockReturnValueOnce('');
    const ref = createRef();
    render(<VerifactuSection {...PROPS} record={{ ...BASE_RECORD, tAXType: '' }} ref={ref} />);
    await expect(ref.current.save()).rejects.toThrow();
    await waitFor(() => {
      expect(screen.getByText('fiscal.verifactu.err.noTaxType')).toBeInTheDocument();
    });
  });
});

describe('VerifactuSection — save', () => {
  it('calls onSave after a successful PUT', async () => {
    const onSave = vi.fn();
    const ref = createRef();
    render(<VerifactuSection {...PROPS} onSave={onSave} ref={ref} />);
    await ref.current.save();
    expect(onSave).toHaveBeenCalled();
  });
});
