import { buildReturnRowConfirmModal } from '../shared/buildReturnRowConfirmModal.jsx';

// ETP-5378 — row-hover Confirmar for return-to-vendor-shipment, via useRowConfirmAction.
// See buildReturnRowConfirmModal's own doc comment for the shape and rationale shared
// with ReturnMaterialReceiptRowConfirmModal (dedupe: Sonar flagged the two hand-written
// copies of this file at 35.7% duplication).
export default buildReturnRowConfirmModal({
  specName: 'return-to-vendor-shipment',
  entityName: 'returnToVendorShipment',
  titleKey: 'returnToVendor.confirmModal.title',
  infoRowPreKey: 'returnToVendor.confirmModal.infoRowPre',
  infoRowBoldKey: 'returnToVendor.confirmModal.infoRowBold',
  infoRowPostKey: 'returnToVendor.confirmModal.infoRowPost',
  cardTitleKey: 'returnToVendor.createCreditNote',
  cardDescKey: 'returnToVendor.createCreditNoteDescription',
  confirmLabelKey: 'confirmReturn',
  confirmWithInvoiceLabelKey: 'returnToVendor.confirmModal.confirmWithInvoice',
  testId: 'ConfirmInOutModal__44be16',
});
