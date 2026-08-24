/**
 * Tests for FiscalDefaultsSection — the grouped SII/TicketBAI fiscal-defaults
 * block (ETP-4784). Split into two independently-gated sub-blocks (SII /
 * TicketBAI) driven by `useSiiTbaiActive`; the whole section hides when
 * neither system is actively configured for the contact's organization.
 */
import { render, screen } from '@testing-library/react';
import FiscalDefaultsSection from '../FiscalDefaultsSection';
import { EntityForm } from '@/components/contract-ui';
import { useSiiTbaiActive } from '../fiscalDefaults.utils.js';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
  useLabel: () => (column) => `label:${column}`,
}));
vi.mock('@/components/contract-ui', () => ({
  EntityForm: vi.fn(({ fields }) => (
    <div data-testid="entity-form">{fields?.map(f => <span key={f.key}>{f.key}</span>)}</div>
  )),
}));
vi.mock('../fiscalDefaults.utils.js', () => ({
  useSiiTbaiActive: vi.fn(),
  resolveOrganizationId: (v) => (v == null ? null : String(typeof v === 'object' ? v.id : v)),
}));

function findFieldsCall(fieldKey) {
  return EntityForm.mock.calls.find(([props]) =>
    props?.fields?.some((f) => f.key === fieldKey),
  );
}

function mockActive({ loading = false, sii = false, tbai = false } = {}) {
  vi.mocked(useSiiTbaiActive).mockReturnValue({ loading, sii, tbai });
}

describe('FiscalDefaultsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('section visibility', () => {
    it('renders nothing while the active-detection is loading', () => {
      mockActive({ loading: true });
      const { container } = render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('hides the whole section (title + description) when neither SII nor TBAI is active', () => {
      mockActive({ loading: false, sii: false, tbai: false });
      const { container } = render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
      expect(screen.queryByText('fiscalDefaults')).not.toBeInTheDocument();
      expect(screen.queryByText('fiscalDefaultsDescription')).not.toBeInTheDocument();
    });

    it('renders the section title and description when SII is active', () => {
      mockActive({ sii: true });
      render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);
      expect(screen.getByText('fiscalDefaults')).toBeInTheDocument();
      expect(screen.getByText('fiscalDefaultsDescription')).toBeInTheDocument();
    });
  });

  describe('SII block — shown only when SII is active', () => {
    it('renders the SII block title and fields when sii is active and tbai is not', () => {
      mockActive({ sii: true, tbai: false });
      render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsSiiBlock')).toBeInTheDocument();
      expect(screen.queryByText('fiscalDefaultsTbaiBlock')).not.toBeInTheDocument();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeTruthy();
      expect(screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).toBeInTheDocument();
    });

    it('does not render the SII block when sii is not active', () => {
      mockActive({ sii: false, tbai: true });
      render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);

      expect(screen.queryByText('fiscalDefaultsSiiBlock')).not.toBeInTheDocument();
      expect(findFieldsCall('aeatsiiSiikeylist')).toBeUndefined();
    });

    it('wires the aeatsiiDefaultsiikey toggle to onChange with the AD column name', () => {
      mockActive({ sii: true });
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ organization: 'org-1', aeatsiiDefaultsiikey: false }} onChange={onChange} />);

      screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' }).click();
      expect(onChange).toHaveBeenCalledWith('aeatsiiDefaultsiikey', true, 'EM_Aeatsii_Defaultsiikey');
    });

    it('exposes the aeatsiiSiikeylist select with exactly the four AEAT invoice-type codes', () => {
      mockActive({ sii: true });
      render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);

      const call = findFieldsCall('aeatsiiSiikeylist');
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      expect(field.column).toBe('EM_Aeatsii_Siikeylist');
      expect(field.type).toBe('select');
      const codes = field.options.map((o) => o.value).sort();
      expect(codes).toEqual(['F1', 'F2', 'F4', 'R'].sort());
    });

    it('the aeatsiiSiikeylist displayLogic mirrors @EM_Aeatsii_Defaultsiikey@=\'Y\' (visible only when the toggle is on)', () => {
      mockActive({ sii: true });
      render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);

      const call = findFieldsCall('aeatsiiSiikeylist');
      const field = call[0].fields.find((f) => f.key === 'aeatsiiSiikeylist');
      expect(field.displayLogic({ aeatsiiDefaultsiikey: false })).toBe(false);
      expect(field.displayLogic({ aeatsiiDefaultsiikey: true })).toBe(true);
    });
  });

  describe('TicketBAI block — shown only when TBAI is active', () => {
    it('renders the TicketBAI block title and toggle when tbai is active and sii is not', () => {
      mockActive({ sii: false, tbai: true });
      render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsTbaiBlock')).toBeInTheDocument();
      expect(screen.queryByText('fiscalDefaultsSiiBlock')).not.toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' })).toBeInTheDocument();
    });

    it('does not render the TicketBAI block when tbai is not active', () => {
      mockActive({ sii: true, tbai: false });
      render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);

      expect(screen.queryByText('fiscalDefaultsTbaiBlock')).not.toBeInTheDocument();
      expect(screen.queryByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' })).not.toBeInTheDocument();
    });

    it('wires the tbaiIssimplifiedinv toggle to onChange with the AD column name', () => {
      mockActive({ tbai: true });
      const onChange = vi.fn();
      render(<FiscalDefaultsSection data={{ organization: 'org-1', tbaiIssimplifiedinv: false }} onChange={onChange} />);

      screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' }).click();
      expect(onChange).toHaveBeenCalledWith('tbaiIssimplifiedinv', true, 'EM_Tbai_Issimplifiedinv');
    });
  });

  describe('both systems active', () => {
    it('renders both blocks simultaneously', () => {
      mockActive({ sii: true, tbai: true });
      render(<FiscalDefaultsSection data={{ organization: 'org-1' }} onChange={vi.fn()} />);

      expect(screen.getByText('fiscalDefaultsSiiBlock')).toBeInTheDocument();
      expect(screen.getByText('fiscalDefaultsTbaiBlock')).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Aeatsii_Defaultsiikey' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'label:EM_Tbai_Issimplifiedinv' })).toBeInTheDocument();
    });
  });
});
