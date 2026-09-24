import { buildReturnRowConfirmModal } from '../shared/buildReturnRowConfirmModal.jsx';

// ETP-5378 — row-hover Confirmar for return-material-receipt, via useRowConfirmAction.
// See buildReturnRowConfirmModal's own doc comment for the shape and rationale shared
// with ReturnToVendorShipmentRowConfirmModal (dedupe: Sonar flagged the two hand-written
// copies of this file at 35.7% duplication).
export default buildReturnRowConfirmModal({
  specName: 'return-material-receipt',
  entityName: 'returnMaterialReceipt',
  titleKey: 'returnReceipt.confirmModal.title',
  infoRowPreKey: 'returnReceipt.confirmModal.infoRowPre',
  infoRowBoldKey: 'returnReceipt.confirmModal.infoRowBold',
  infoRowPostKey: 'returnReceipt.confirmModal.infoRowPost',
  cardTitleKey: 'returnReceipt.createRectificativeInvoice',
  cardDescKey: 'returnReceipt.createRectificativeInvoiceDescription',
  confirmLabelKey: 'processReceipt',
  confirmWithInvoiceLabelKey: 'returnReceipt.confirmModal.confirmWithInvoice',
  testId: 'ConfirmInOutModal__1f8f4b',
});
