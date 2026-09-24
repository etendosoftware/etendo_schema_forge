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

// The purchase-side twin. The ETP-5378 QA defect (CP-10 / CP-15) reproduced on BOTH
// return windows, so every URL assertion below runs against both configs — the factory
// is what has to be generic, not one window's wiring.
const CONFIG_RTVS = {
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
};

/**
 * The template ConfirmWithCreditButtonBase.jsx (the FORM path) builds for its own
 * picker, transcribed here on purpose rather than imported: the whole defect was the
 * grid path and the form path disagreeing, and a shared constant would make the two
 * agree by construction and prove nothing. If this literal ever has to change, the
 * form's own line must change with it.
 */
function formRectifiableInvoicesUrl(base, specName, entityName, id) {
  return `${base}/${specName}/${entityName}/${id}/action/rectifiableInvoices`;
}

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

  /**
   * ETP-5378 QA follow-up — CP-10 / CP-15.
   *
   * Confirming an albarán de devolución from the GRID row-hover kebab with "Crear
   * Factura Rectificativa" on answered HTTP 400 and left the document Completed with no
   * invoice. The cause was entirely here: this factory mounted ConfirmInOutModal WITHOUT
   * `rectifiableInvoicesUrl`, and ConfirmInOutModal gates the whole picker on
   *
   *     rectifyActive = !!rectifiableInvoicesUrl && !!invoiceAction && invoiceRequested
   *
   * so the "Factura a rectificar" field never rendered, `buildInvoiceBody()` never added
   * `originInvoices`, and ReturnShipmentUtils#resolveRectifiedInvoiceIds fell back to
   * chain auto-detection → ERR_RECTIFIED_INVOICE_REQUIRED. The damage was not the 400:
   * `runConfirm()` posts documentAction {docAction:'CO'} and createReturnInvoice as TWO
   * separate requests, so the CO had already committed when the second one failed.
   *
   * The form path (ConfirmWithCreditButtonBase) always passed the URL. That asymmetry
   * was the bug, so these assertions are about parity, not about the string as such.
   */
  describe('rectifiableInvoicesUrl — grid/form parity (ETP-5378 QA, CP-10 / CP-15)', () => {
    function renderWith(config, props = {}) {
      const Modal = buildReturnRowConfirmModal(config);
      render(
        <Modal
          base="/sws/neo"
          headers={{ Authorization: 'Bearer tkn' }}
          token="tkn"
          recordId="row-1"
          data={{ id: 'row-1', invoiceStatus: 0 }}
          onConfirmed={vi.fn()}
          onClose={vi.fn()}
          {...props} />,
      );
      return confirmInOutProps;
    }

    it('builds the URL from base + specName + entityName + record id (sales return)', () => {
      const props = renderWith(CONFIG);
      expect(props.rectifiableInvoicesUrl)
        .toBe('/sws/neo/return-material-receipt/returnMaterialReceipt/row-1/action/rectifiableInvoices');
    });

    it('builds the URL from base + specName + entityName + record id (purchase return)', () => {
      const props = renderWith(CONFIG_RTVS);
      expect(props.rectifiableInvoicesUrl)
        .toBe('/sws/neo/return-to-vendor-shipment/returnToVendorShipment/row-1/action/rectifiableInvoices');
    });

    it('produces the exact string the form path produces, for both windows', () => {
      for (const config of [CONFIG, CONFIG_RTVS]) {
        confirmInOutProps = null;
        const props = renderWith(config);
        expect(props.rectifiableInvoicesUrl)
          .toBe(formRectifiableInvoicesUrl('/sws/neo', config.specName, config.entityName, 'row-1'));
      }
    });

    it('prefers the refetched record id over the recordId prop', () => {
      // useRowConfirmAction refetches the record before opening the popup and passes it
      // as `data`; `recordId` is the grid row's id. They agree today, but `data.id` is
      // the one the modal's own requests are keyed on, so the URL must follow it.
      const props = renderWith(CONFIG, { recordId: 'grid-row-id', data: { id: 'detail-id', invoiceStatus: 0 } });
      expect(props.rectifiableInvoicesUrl)
        .toBe('/sws/neo/return-material-receipt/returnMaterialReceipt/detail-id/action/rectifiableInvoices');
    });

    it('falls back to the recordId prop when the record carries no id', () => {
      const props = renderWith(CONFIG, { recordId: 'grid-row-id', data: { invoiceStatus: 0 } });
      expect(props.rectifiableInvoicesUrl)
        .toBe('/sws/neo/return-material-receipt/returnMaterialReceipt/grid-row-id/action/rectifiableInvoices');
    });

    it('falls back to the recordId prop when no record was handed down at all', () => {
      const props = renderWith(CONFIG, { recordId: 'grid-row-id', data: undefined });
      expect(props.rectifiableInvoicesUrl)
        .toBe('/sws/neo/return-material-receipt/returnMaterialReceipt/grid-row-id/action/rectifiableInvoices');
    });

    it('forwards the bearer token, which the picker needs for its own POST', () => {
      // ConfirmInOutModal hands `token` to useRectifiableInvoices; without it the
      // rectifiableInvoices POST goes out unauthenticated and the picker stays empty,
      // which the UI shows as "nothing to rectify" rather than as an error.
      const props = renderWith(CONFIG, { token: 'bearer-abc' });
      expect(props.token).toBe('bearer-abc');
    });

    it('REGRESSION: whenever invoiceAction is active the URL prop is a non-empty string', () => {
      // This is the exact prop whose absence produced the 400. `rectifyActive` is
      // `!!rectifiableInvoicesUrl && !!invoiceAction && invoiceRequested`, so an
      // undefined/empty URL silently disarms the picker AND the `rectify.isSatisfied`
      // half of `canConfirm` — the confirm button goes back to being clickable with no
      // originInvoices, and the two-request confirm commits the CO before failing.
      for (const config of [CONFIG, CONFIG_RTVS]) {
        confirmInOutProps = null;
        const props = renderWith(config);
        expect(props.invoiceAction).toBe('createReturnInvoice');
        expect(typeof props.rectifiableInvoicesUrl).toBe('string');
        expect(props.rectifiableInvoicesUrl.length).toBeGreaterThan(0);
        expect(props.rectifiableInvoicesUrl).toMatch(/\/action\/rectifiableInvoices$/);
      }
    });

    it('keeps handing the URL down on a fully invoiced document, where the picker is inert BY DESIGN', () => {
      // Not an oversight to "fix" later: at invoiceStatus >= 100 there is nothing left to
      // invoice, so `invoiceAction` is deliberately undefined (mirroring the form's
      // degraded mode) and `rectifyActive` is false through the invoiceAction term — not
      // through a missing URL. Asserting both halves pins the reason: whoever sees the
      // picker missing here should look at invoiceAction, not re-add the URL.
      const props = renderWith(CONFIG, { data: { id: 'row-1', invoiceStatus: 100 } });
      expect(props.invoiceAction).toBeUndefined();
      expect(props.defaultCreateInvoice).toBe(false);
      expect(props.rectifiableInvoicesUrl)
        .toBe('/sws/neo/return-material-receipt/returnMaterialReceipt/row-1/action/rectifiableInvoices');
    });
  });
});
