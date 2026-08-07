import { render, screen } from '@testing-library/react';

// Shared by return-material-receipt's and return-to-vendor-shipment's
// ConfirmWithCreditButton.spec.jsx — both wrap the same ConfirmWithCreditButtonBase
// and must keep CopyRecordLinkButton visible outside DR/CO the same way.
export function itRendersOnlyCopyLinkOutsideDrOrCo(ConfirmWithCreditButton, BASE_PROPS) {
  it('renders only the copy-link action when status is not DR or CO', () => {
    render(<ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'CL', linesCount: 2 }} />);
    expect(screen.getByTestId('CopyRecordLinkButton')).toBeInTheDocument();
    expect(screen.queryByTestId('action-confirm-with-credit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });
}
