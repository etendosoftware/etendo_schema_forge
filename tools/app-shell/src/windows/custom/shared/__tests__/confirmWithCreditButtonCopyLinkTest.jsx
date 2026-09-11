import { render, screen } from '@testing-library/react';

// Shared by return-material-receipt's and return-to-vendor-shipment's
// ConfirmWithCreditButton.spec.jsx — both wrap the same ConfirmWithCreditButtonBase.
//
// ETP-5260 regression guard: CopyRecordLinkButton used to render here as a
// topbarRight sibling (ETP-4721), placing it to the RIGHT of Save/Confirm
// against the DF. It now lives in the window's *SecondaryActions component
// (topbarSecondary, left of Save/Confirm) — see ReturnMaterialReceiptSecondaryActions.jsx
// / ReturnToVendorShipmentSecondaryActions.jsx. ConfirmWithCreditButtonBase is
// the only PRIMARY action left here (ETP-4933) and only renders for DR/CO
// (see ConfirmWithCreditButtonBase.jsx `if (status !== 'DR' && status !== 'CO') return null`),
// so outside DR/CO this wrapper must render NOTHING — no CopyRecordLinkButton,
// no confirm/create-invoice action. A future regression that re-adds
// CopyRecordLinkButton here (duplicating it alongside the topbarSecondary
// copy) is exactly what this guard catches.
export function itRendersNothingOutsideDrOrCo(ConfirmWithCreditButton, BASE_PROPS) {
  it('renders nothing when status is not DR or CO (Copy link now lives in topbarSecondary, not here)', () => {
    const { container } = render(
      <ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'CL', linesCount: 2 }} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('CopyRecordLinkButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-confirm-with-credit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();
  });
}
