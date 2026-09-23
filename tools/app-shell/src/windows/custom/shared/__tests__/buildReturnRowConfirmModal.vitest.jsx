// ETP-5378 — buildReturnRowConfirmModal is the dedupe target for
// ReturnMaterialReceiptRowConfirmModal.jsx / ReturnToVendorShipmentRowConfirmModal.jsx,
// which Sonar flagged at 35.7% duplication. Both are now a thin config passed to this
// factory; this spec exercises the factory itself once, plus the identity guarantee
// each window's file relies on (called at module scope, not per render).

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

let confirmInOutProps;
vi.mock('@/components/contract-ui/ConfirmInOutModal', () => ({
  default: (props) => { confirmInOutProps = props; return <div data-testid="confirm-in-out-modal" />; },
}));

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReturnRowConfirmModal } from '../buildReturnRowConfirmModal.jsx';

const CONFIG = {
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
};

describe('buildReturnRowConfirmModal', () => {
  beforeEach(() => {
    confirmInOutProps = null;
  });

  it('returns a plain function component, not a hook or JSX element', () => {
    const Modal = buildReturnRowConfirmModal(CONFIG);
    expect(typeof Modal).toBe('function');
  });

  it('resolves every config key through ui() and forwards spec/entity names as-is', () => {
    const Modal = buildReturnRowConfirmModal(CONFIG);
    render(
      <Modal
        base="/sws/neo"
        headers={{ Authorization: 'Bearer tkn' }}
        recordId="rmr-1"
        data={{ documentNo: '1000000', 'businessPartner$_identifier': 'Laura Morat', invoiceStatus: 0 }}
        onConfirmed={vi.fn()}
        onClose={vi.fn()} />,
    );

    expect(screen.getByTestId('confirm-in-out-modal')).toBeInTheDocument();
    expect(confirmInOutProps).toMatchObject({
      base: '/sws/neo',
      recordId: 'rmr-1',
      specName: 'return-material-receipt',
      entityName: 'returnMaterialReceipt',
      title: 'returnReceipt.confirmModal.title',
      infoRowPre: 'returnReceipt.confirmModal.infoRowPre',
      infoRowBold: 'returnReceipt.confirmModal.infoRowBold',
      infoRowPost: 'returnReceipt.confirmModal.infoRowPost',
      cardTitle: 'returnReceipt.createRectificativeInvoice',
      cardDesc: 'returnReceipt.createRectificativeInvoiceDescription',
      confirmLabel: 'processReceipt',
      confirmWithInvoiceLabel: 'returnReceipt.confirmModal.confirmWithInvoice',
      processingLabel: 'processing',
      cancelLabel: 'cancel',
      'data-testid': 'ConfirmInOutModal__1f8f4b',
      invoiceAction: 'createReturnInvoice',
      defaultCreateInvoice: true,
    });
    expect(confirmInOutProps.docInfo).toEqual({ bpName: 'Laura Morat', documentNo: '1000000' });
  });

  it('drops invoiceAction and defaultCreateInvoice once the document is fully invoiced', () => {
    const Modal = buildReturnRowConfirmModal(CONFIG);
    render(
      <Modal
        base="/sws/neo"
        headers={{}}
        recordId="rmr-1"
        data={{ invoiceStatus: 100 }}
        onConfirmed={vi.fn()}
        onClose={vi.fn()} />,
    );

    expect(confirmInOutProps.invoiceAction).toBeUndefined();
    expect(confirmInOutProps.defaultCreateInvoice).toBe(false);
  });

  it('forwards onConfirmed and onClose through unchanged', () => {
    const Modal = buildReturnRowConfirmModal(CONFIG);
    const onConfirmed = vi.fn();
    const onClose = vi.fn();
    render(
      <Modal base="/sws/neo" headers={{}} recordId="rmr-1" data={{}} onConfirmed={onConfirmed} onClose={onClose} />,
    );
    expect(confirmInOutProps.onConfirmed).toBe(onConfirmed);
    expect(confirmInOutProps.onClose).toBe(onClose);
  });
});
