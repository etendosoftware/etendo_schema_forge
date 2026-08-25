/**
 * Tests for FiscalDefaultsSection — the grouped SII/TicketBAI fiscal-defaults
 * block (ETP-4784). Faithful to Classic: no "SII/TBAI active" gating — the
 * SII block (`aeatsiiDefaultsiikey` + `aeatsiiSiikeylist`) shows only when
 * `data.customer` is true (same gate as `BillingPreferencesForm.jsx`'s
 * Cliente block), and the TicketBAI block (`tbaiIssimplifiedinv`) always
 * renders.
 */
import { render, screen } from '@testing-library/react';
import FiscalDefaultsSection from '../FiscalDefaultsSection';
import { EntityForm } from '@/components/contract-ui';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
  useLabel: () => (column) => `label:${column}`,
}));
vi.mock('@/components/contract-ui', () => ({
  EntityForm: vi.fn(({ fields }) => (
    <div data-testid="entity-form">{fields?.map(f => <span key={f.key}>{f.key}</span>)}</div>
  )),
}));

function findFieldsCall(fieldKey) {
  return EntityForm.mock.calls.find(([props]) =>
    props?.fields?.some((f) => f.key === fieldKey),
  );
}

describe('FiscalDefaultsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always renders the section title and description', () => {
    render(<FiscalDefaultsSection data={{}} onChange={vi.fn()} />);
    expect(screen.getByText('fiscalDefaults')).toBeInTheDocument();
    expect(screen.getByText('fiscalDefaultsDescription')).toBeInTheDocument();
  });

  describe('SII block — shown only when data.customer is true', () => {
    it('renders the SII block title and fields when customer is true', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsSiiBlock')).toBeInTheDocument();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeTruthy();
      expect(screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).toBeInTheDocument();
    });

    it('does not render the SII block when customer is false', () => {
      render(<FiscalDefaultsSection data={{ customer: false }} onChange={vi.fn()} />);

      expect(screen.queryByText('fiscalDefaultsSiiBlock')).not.toBeInTheDocument();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeUndefined();
      expect(screen.queryByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).not.toBeInTheDocument();
    });

    it('does not render the SII block when customer is undefined', () => {
      render(<FiscalDefaultsSection data={{}} onChange={vi.fn()} />);

      expect(screen.queryByText('fiscalDefaultsSiiBlock')).not.toBeInTheDocument();
    });

    it('wires the aeatsiiDefaultsiikey toggle to onChange with the AD column name', () => {
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ customer: true, aeatsiiDefaultsiikey: false }} onChange={onChange} />);

      screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' }).click();
      expect(onChange).toHaveBeenCalledWith('aeatsiiDefaultsiikey', true, 'EM_Aeatsii_Defaultsiikey');
    });

    it('exposes the aeatsiiSiikeylist select with exactly the four AEAT invoice-type codes', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      const call = findFieldsCall('aeatsiiSiikeylist');
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      expect(field.column).toBe('EM_Aeatsii_Siikeylist');
      expect(field.type).toBe('select');
      const codes = field.options.map((o) => o.value).sort();
      expect(codes).toEqual(['F1', 'F2', 'F4', 'R'].sort());
    });

    it('the aeatsiiSiikeylist displayLogic mirrors @EM_Aeatsii_Defaultsiikey@=\'Y\' (visible only when the toggle is on)', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      const call = findFieldsCall('aeatsiiSiikeylist');
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      expect(field.displayLogic({ aeatsiiDefaultsiikey: false })).toBe(false);
      expect(field.displayLogic({ aeatsiiDefaultsiikey: true })).toBe(true);
    });
  });

  describe('TicketBAI block — always shown', () => {
    it('renders the TicketBAI block title and toggle regardless of customer', () => {
      render(<FiscalDefaultsSection data={{ customer: false }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsTbaiBlock')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' })).toBeInTheDocument();
    });

    it('wires the tbaiIssimplifiedinv toggle to onChange with the AD column name', () => {
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ tbaiIssimplifiedinv: false }} onChange={onChange} />);

      screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' }).click();
      expect(onChange).toHaveBeenCalledWith('tbaiIssimplifiedinv', true, 'EM_Tbai_Issimplifiedinv');
    });
  });

  describe('both blocks visible', () => {
    it('renders both blocks simultaneously when customer is true', () => {
      render(<FiscalDefaultsSection data={{ customer: true }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsSiiBlock')).toBeInTheDocument();
      expect(screen.getByText('fiscalDefaultsTbaiBlock')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' })).toBeInTheDocument();
    });
  });
});
