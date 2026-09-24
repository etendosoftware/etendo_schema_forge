import { render, screen, act } from '@testing-library/react';

// Shared by return-material-receipt's and return-to-vendor-shipment's
// ConfirmWithCreditButton.spec.jsx — both wrap the same ConfirmWithCreditButtonBase.
// Callers must mock ConfirmInOutModal with data-testid="confirm-inout-modal".
//
// ETP-5260 regression guard: CopyRecordLinkButton used to render here as a
// topbarRight sibling (ETP-4721), placing it to the RIGHT of Save/Confirm
// against the DF. It now lives in the window's *SecondaryActions component
// (topbarSecondary, left of Save/Confirm) — see ReturnMaterialReceiptSecondaryActions.jsx
// / ReturnToVendorShipmentSecondaryActions.jsx. A future regression that re-adds
// CopyRecordLinkButton here (duplicating it alongside the topbarSecondary copy) is
// exactly what this guard catches.
//
// ETP-5408: the Borrador "Confirmar" is no longer rendered here either — it is the
// generic draftMode Confirm, whose onConfirm dispatches the window's CONFIRM_EVENT.
// ConfirmWithCreditButtonBase registers its listener on EVERY status (the effect sits
// before the `status !== 'DR' && status !== 'CO'` early return), so outside DR/CO the
// guard also proves the event is inert: the wrapper renders nothing, and dispatching
// the event opens no confirm modal.
export function itRendersNothingOutsideDrOrCo(ConfirmWithCreditButton, BASE_PROPS, confirmEventName) {
  it('renders nothing and ignores the confirm event when status is not DR or CO', () => {
    const { container } = render(
      <ConfirmWithCreditButton {...BASE_PROPS} data={{ documentStatus: 'CL', linesCount: 2 }} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('CopyRecordLinkButton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('action-create-return-invoice')).not.toBeInTheDocument();

    act(() => { window.dispatchEvent(new CustomEvent(confirmEventName)); });
    expect(screen.queryByTestId('confirm-inout-modal')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
}
