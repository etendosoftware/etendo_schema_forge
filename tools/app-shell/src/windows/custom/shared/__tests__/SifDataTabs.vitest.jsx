import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const patcher = vi.fn();

vi.mock('../useSifFieldPatcher.js', () => ({
  useSifFieldPatcher: (...args) => patcher(...args),
}));

import SifDataTabs from '../SifDataTabs.jsx';

function basePatcher(overrides = {}) {
  return {
    ui: (key) => key,
    siiTypeField: 'aeatsiiClaveRegEspecialOTrascendencia',
    siiDescriptionMasterIdentifier: 'Master description',
    siiTypeOptions: [
      { value: 'F1', labelKey: 'invoiceF1' },
      { value: 'F2', labelKey: 'invoiceF2' },
    ],
    showSii: true,
    showTbai: true,
    showVerifactu: true,
    dateReadOnly: false,
    siiFieldReadOnly: false,
    savingField: null,
    getVal: vi.fn((key) => ({
      aeatsiiClaveRegEspecialOTrascendencia: 'F1',
      aeatsiiDescripcionSii: 'Current description',
      aeatsiiIsauthorization: true,
    }[key] ?? '')),
    getDateVal: vi.fn(() => '2026-07-01'),
    setVal: vi.fn(),
    handleBlur: vi.fn(),
    handleCheckboxChange: vi.fn(),
    ...overrides,
  };
}

function renderTabs({ patcherValue = basePatcher(), data = {}, props = {} } = {}) {
  patcher.mockReturnValue(patcherValue);
  render(
    <SifDataTabs
      data={{
        aeatsiiEstado: 'CO',
        aeatsiiCauseExemption$_identifier: 'Exempt cause',
        aeatsiiEjercicio: '2026',
        aeatsiiPeriodo: '07',
        tbaiIssent: 'Y',
        tbaiSequence: 'SEQ-1',
        tbaiInvoicenum: 'SER-1',
        tbaiInvoiceseq: '42',
        etvfacInvoiceStatus: 'AE',
        etvfacDateIssue: '2026-07-02',
        cdigoCSV: 'CSV-1',
        etvfacHash: 'HASH-1',
        etvfacQRURL: 'https://qr.test',
        etvfacIssueDescription: 'Accepted with issues',
        ...data,
      }}
      recordId="record-1"
      apiBaseUrl="/api/sales-invoice"
      {...props}
    />,
  );
  return patcherValue;
}

describe('SifDataTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no fiscal target is visible', () => {
    patcher.mockReturnValue(basePatcher({ showSii: false, showTbai: false, showVerifactu: false }));
    const { container } = render(
      <SifDataTabs
        data={{}}
        recordId="record-1"
        apiBaseUrl="/api"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders SII fields and patches editable values', async () => {
    const user = userEvent.setup();
    const model = renderTabs();

    expect(patcher).toHaveBeenCalledWith({
      data: expect.any(Object),
      recordId: 'record-1',
      apiBaseUrl: '/api/sales-invoice',
    });
    expect(screen.getByText('sifDataTabs.status.sii.correct')).toBeInTheDocument();
    expect(screen.getByText('Master description')).toBeInTheDocument();
    expect(screen.getByText('Exempt cause')).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('Current description'), { target: { value: 'Updated' } });
    expect(model.setVal).toHaveBeenCalledWith('aeatsiiDescripcionSii', 'Updated');

    await user.selectOptions(screen.getByDisplayValue('F1 - invoiceF1'), 'F2');
    expect(model.setVal).toHaveBeenCalledWith('aeatsiiClaveRegEspecialOTrascendencia', 'F2');

    await user.click(screen.getByRole('checkbox'));
    expect(model.handleCheckboxChange).toHaveBeenCalledWith('aeatsiiIsauthorization', false);
  });

  it('switches to TBAI and Verifactu tabs and falls back when SII is hidden', async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByText('sifDataTabs.tab.tbai'));
    expect(screen.getByText('sifDataTabs.status.tbai.sent')).toBeInTheDocument();
    expect(screen.getByText('SEQ-1')).toBeInTheDocument();

    await user.click(screen.getByText('sifDataTabs.tab.verifactu'));
    expect(screen.getByText('sifDataTabs.status.verifactu.acceptedWithErrors')).toBeInTheDocument();
    expect(screen.getByText('HASH-1')).toBeInTheDocument();

    patcher.mockReturnValue(basePatcher({ showSii: false, showTbai: true, showVerifactu: false }));
    render(<SifDataTabs data={{ tbaiIssent: false }} recordId="record-2" apiBaseUrl="/api" />);
    expect(screen.getAllByText('sifDataTabs.status.tbai.notSent').length).toBeGreaterThan(0);
  });

  it('disables date and SII controls while fields are read-only or saving', () => {
    renderTabs({
      patcherValue: basePatcher({
        dateReadOnly: true,
        siiFieldReadOnly: true,
        savingField: 'aeatsiiDescripcionSii',
      }),
    });

    expect(screen.getByDisplayValue('2026-07-01')).toBeDisabled();
    expect(screen.getByDisplayValue('F1 - invoiceF1')).toBeDisabled();
    expect(screen.getByDisplayValue('Current description')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });
});
