// Mocks must be declared before any imports that pull in the mocked modules.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen } from '@testing-library/react';
import SifErrorBanner from '../SifErrorBanner.jsx';

describe('SifErrorBanner', () => {
  // ---------------------------------------------------------------------------
  // Null / no-error cases — renders nothing
  // ---------------------------------------------------------------------------

  it('renders nothing when data is null', () => {
    const { container } = render(<SifErrorBanner data={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when aeatsiiEstado is not an error state (e.g. "CO")', () => {
    const { container } = render(
      <SifErrorBanner data={{ aeatsiiEstado: 'CO', etvfacInvoiceStatus: null }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when etvfacInvoiceStatus is not an error state (e.g. "CO")', () => {
    const { container } = render(
      <SifErrorBanner data={{ aeatsiiEstado: null, etvfacInvoiceStatus: 'CO' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when both states are absent', () => {
    const { container } = render(<SifErrorBanner data={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  // ---------------------------------------------------------------------------
  // SII error block — AE / EE
  // ---------------------------------------------------------------------------

  it('renders SII error block when aeatsiiEstado is "AE"', () => {
    render(
      <SifErrorBanner
        data={{
          aeatsiiEstado: 'AE',
          aeatsiiErrorCode: 'CODE-001',
          aeatsiiErrorMsg: 'Some error detail',
        }}
      />,
    );
    // Title includes the i18n key for AE
    expect(
      screen.getByText((t) => t.includes('sifDataTabs.status.sii.acceptedWithErrors')),
    ).toBeInTheDocument();
    // Error code and message are shown
    expect(screen.getByText('CODE-001')).toBeInTheDocument();
    expect(screen.getByText('Some error detail')).toBeInTheDocument();
  });

  it('renders SII error block when aeatsiiEstado is "EE"', () => {
    render(
      <SifErrorBanner
        data={{
          aeatsiiEstado: 'EE',
          aeatsiiErrorCode: 'CODE-002',
          aeatsiiErrorMsg: 'Send error detail',
        }}
      />,
    );
    expect(
      screen.getByText((t) => t.includes('sifDataTabs.status.sii.sendError')),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Verifactu error block — AE / ER / IN (excluded)
  // ---------------------------------------------------------------------------

  it('renders Verifactu error block when etvfacInvoiceStatus is "AE"', () => {
    render(
      <SifErrorBanner
        data={{
          etvfacInvoiceStatus: 'AE',
          etvfacIssueDescription: 'Verifactu AE error',
        }}
      />,
    );
    expect(
      screen.getByText((t) => t.includes('sifDataTabs.status.verifactu.acceptedWithErrors')),
    ).toBeInTheDocument();
    expect(screen.getByText('Verifactu AE error')).toBeInTheDocument();
  });

  it('renders Verifactu error block when etvfacInvoiceStatus is "ER"', () => {
    render(
      <SifErrorBanner
        data={{
          etvfacInvoiceStatus: 'ER',
          etvfacIssueDescription: 'Rejected description',
        }}
      />,
    );
    expect(
      screen.getByText((t) => t.includes('sifDataTabs.status.verifactu.rejected')),
    ).toBeInTheDocument();
    expect(screen.getByText('Rejected description')).toBeInTheDocument();
  });

  it('does NOT render Verifactu error block when etvfacInvoiceStatus is "IN" (intentionally excluded)', () => {
    const { container } = render(
      <SifErrorBanner
        data={{
          aeatsiiEstado: null,
          etvfacInvoiceStatus: 'IN',
          etvfacIssueDescription: 'Local validation failure',
        }}
      />,
    );
    // 'IN' is excluded from VERIFACTU_ERROR_STATES — renders nothing
    expect(container).toBeEmptyDOMElement();
  });

  // ---------------------------------------------------------------------------
  // Both SII + Verifactu errors at once
  // ---------------------------------------------------------------------------

  it('renders both SII and Verifactu error blocks when both have errors', () => {
    render(
      <SifErrorBanner
        data={{
          aeatsiiEstado: 'AE',
          aeatsiiErrorCode: 'SII-001',
          aeatsiiErrorMsg: 'SII error',
          etvfacInvoiceStatus: 'ER',
          etvfacIssueDescription: 'Verifactu error',
        }}
      />,
    );
    expect(
      screen.getByText((t) => t.includes('sifDataTabs.status.sii.acceptedWithErrors')),
    ).toBeInTheDocument();
    expect(
      screen.getByText((t) => t.includes('sifDataTabs.status.verifactu.rejected')),
    ).toBeInTheDocument();
    expect(screen.getByText('SII error')).toBeInTheDocument();
    expect(screen.getByText('Verifactu error')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // ErrorRow null/empty suppression
  // ---------------------------------------------------------------------------

  it('does not render error code row when aeatsiiErrorCode is null', () => {
    render(
      <SifErrorBanner
        data={{
          aeatsiiEstado: 'AE',
          aeatsiiErrorCode: null,
          aeatsiiErrorMsg: 'Some detail',
        }}
      />,
    );
    // The label for error code should not appear when value is falsy
    expect(screen.queryByText((t) => t.includes('sifErrorBanner.errorCode'))).not.toBeInTheDocument();
    // But the detail row IS shown
    expect(screen.getByText('Some detail')).toBeInTheDocument();
  });

  it('does not render error detail row when aeatsiiErrorMsg is null', () => {
    render(
      <SifErrorBanner
        data={{
          aeatsiiEstado: 'EE',
          aeatsiiErrorCode: 'CODE-003',
          aeatsiiErrorMsg: null,
        }}
      />,
    );
    // The code row IS shown
    expect(screen.getByText('CODE-003')).toBeInTheDocument();
    // But the detail label should not appear
    expect(screen.queryByText((t) => t.includes('sifErrorBanner.errorDetail'))).not.toBeInTheDocument();
  });
});
