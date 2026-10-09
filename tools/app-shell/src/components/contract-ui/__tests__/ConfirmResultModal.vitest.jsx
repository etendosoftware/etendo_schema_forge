// @covers tools/app-shell/src/components/contract-ui/ConfirmResultModal.jsx
//
// The shared "documents generated" popup. Callers only hand it `docs` ({ type, num,
// documentStatus?, route? }); title, banner, card label, status badge and footer buttons are
// all derived here, so this is the one place that renders them — caller tests only assert
// which docs they pass.

// Echo the key, plus the interpolated values, so both the chosen key and what was
// interpolated into it are observable.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmResultModal } from '../ConfirmResultModal.jsx';
import { inlineFontFamiliesUpToBody } from './fontInheritance.js';

const RECEIPT = { type: 'entrada', num: 'GR-001', documentStatus: 'DR', route: '/goods-receipt/1' };
const INVOICE = { type: 'facturaCompra', num: 'PI-002', documentStatus: 'CO', route: '/purchase-invoice/2' };

function renderModal(overrides = {}) {
  const props = { docs: [RECEIPT, INVOICE], navigate: vi.fn(), onClose: vi.fn(), ...overrides };
  const view = render(<ConfirmResultModal {...props} />);
  return { ...view, props };
}

const title = () => screen.getByTestId('confirm-result-title');
const card = (i) => screen.getByTestId(`confirm-result-card-${i}`);

describe('ConfirmResultModal', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('copy derived from the documents', () => {
    // One row per document type: the title, the card label, the "Ver …" button and the
    // grammatical gender of the "completed" badge all follow the type. An unknown type
    // falls back to the purchase-invoice copy instead of crashing.
    it.each([
      ['salida', 'title.albaran', 'soViewShipment', 'completedMasculine'],
      ['entrada', 'title.albaran', 'poViewReceipt', 'completedMasculine'],
      ['facturaVenta', 'title.factura', 'soViewInvoice', 'completedFeminine'],
      ['facturaCompra', 'title.factura', 'poViewInvoice', 'completedFeminine'],
      ['facturaRectificativa', 'title.facturaRectificativa', 'soViewInvoice', 'completedFeminine'],
      ['facturaRectificativaCompra', 'title.facturaRectificativaCompra', 'poViewInvoice', 'completedFeminine'],
      ['pedidoVenta', 'title.pedido', 'sqViewOrder', 'completedMasculine'],
      ['devolucionCompra', 'title.devolucionCompra', 'confirmResultModal.view.devolucion', 'completedFeminine'],
      ['unknownType', 'title.factura', 'poViewInvoice', 'completedFeminine', 'facturaCompra'],
    ])('a completed %s gets its own title, label, view button and gendered badge', (type, titleKey, viewKey, statusKey, labelType = type) => {
      renderModal({ docs: [{ type, num: 'X-1', documentStatus: 'CO', route: '/x/1' }] });

      expect(title()).toHaveTextContent(`confirmResultModal.${titleKey}`);
      expect(card(0)).toHaveTextContent(`confirmResultModal.docType.${labelType}`);
      expect(card(0)).toHaveTextContent(`confirmResultModal.status.${statusKey}`);
      expect(screen.getByTestId('action-confirm-result-view')).toHaveTextContent(viewKey);
    });

    it('one document: singular banner and hint, the number, Cerrar plus a primary Ver button', () => {
      renderModal({ docs: [RECEIPT] });

      expect(screen.getByTestId('confirm-result-banner')).toHaveTextContent('confirmResultModal.bannerOne');
      expect(screen.getByTestId('confirm-result-banner')).toHaveTextContent('confirmResultModal.bannerOneHint');
      expect(card(0)).toHaveTextContent('confirmResultModal.docNumber:GR-001');
      expect(screen.getByTestId('action-confirm-result-close')).toHaveTextContent('soClose');
      expect(screen.getByTestId('action-confirm-result-view')).toBeInTheDocument();
    });

    it('several documents: plural title, banner with the count, one card each and only Cerrar', () => {
      renderModal();

      expect(title()).toHaveTextContent('confirmResultModal.title.many');
      expect(screen.getByTestId('confirm-result-banner')).toHaveTextContent('confirmResultModal.bannerMany:2');
      expect(screen.getByTestId('confirm-result-banner')).toHaveTextContent('confirmResultModal.bannerManyHint');
      expect(card(0)).toHaveAttribute('data-doc-type', 'entrada');
      expect(card(1)).toHaveAttribute('data-doc-type', 'facturaCompra');
      // The walkthrough's `confirmed-ack` step targets this id — it must exist in both variants.
      expect(screen.getByTestId('action-confirm-result-close')).toHaveTextContent('soClose');
      expect(screen.queryByTestId('action-confirm-result-view')).toBeNull();
    });

    it('no documents: fallback title, no banner, no card, only Cerrar', () => {
      renderModal({ docs: [] });

      expect(title()).toHaveTextContent('followUpDocumentCreated');
      expect(screen.queryByTestId('confirm-result-banner')).toBeNull();
      expect(screen.queryByTestId('confirm-result-card-0')).toBeNull();
      expect(screen.getByTestId('action-confirm-result-close')).toBeInTheDocument();
      expect(screen.queryByTestId('action-confirm-result-view')).toBeNull();
    });

    it('badges a document Borrador unless its real status is CO, and never shows an amount', () => {
      renderModal({
        docs: [
          { ...RECEIPT, documentStatus: undefined, amount: 1234.5 },
          { ...INVOICE, amount: 999.99 },
        ],
      });

      expect(card(0)).toHaveAttribute('data-doc-status', 'DR');
      expect(card(0)).toHaveTextContent('confirmResultModal.status.draft');
      expect(card(1)).toHaveAttribute('data-doc-status', 'CO');
      expect(card(1)).toHaveTextContent('confirmResultModal.status.completedFeminine');
      const text = screen.getByTestId('confirm-result-dialog').textContent;
      expect(text).not.toMatch(/1[.,]?234|999/);
    });
  });

  describe('navigation', () => {
    it.each([
      ['click', (user) => user.click(card(1))],
      ['Enter', async (user) => { card(1).focus(); await user.keyboard('{Enter}'); }],
      ['Space', async (user) => { card(1).focus(); await user.keyboard(' '); }],
    ])('a card opens its document on %s: closes first, then navigates to its route', async (_, activate) => {
      const user = userEvent.setup();
      const { props } = renderModal();
      await activate(user);

      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.navigate).toHaveBeenCalledWith('/purchase-invoice/2');
      expect(props.onClose.mock.invocationCallOrder[0]).toBeLessThan(props.navigate.mock.invocationCallOrder[0]);
    });

    it('the Ver button calls onNavigate instead of onClose when given, then navigates', async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      const { props } = renderModal({ docs: [INVOICE], onNavigate });
      await user.click(screen.getByTestId('action-confirm-result-view'));

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(props.onClose).not.toHaveBeenCalled();
      expect(props.navigate).toHaveBeenCalledWith('/purchase-invoice/2');
    });

    it('a document without a route is shown but cannot be opened, and gets no Ver button', async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ docs: [{ type: 'pedidoVenta', num: '?' }] });

      expect(card(0).tagName).not.toBe('BUTTON');
      await user.click(card(0));
      expect(props.navigate).not.toHaveBeenCalled();
      expect(screen.queryByTestId('action-confirm-result-view')).toBeNull();
      expect(screen.getByTestId('action-confirm-result-close')).toBeInTheDocument();
    });

    it.each([
      ['Cerrar', 'action-confirm-result-close'],
      ['the X icon', 'action-confirm-result-dismiss'],
    ])('%s closes without navigating', async (_, testId) => {
      const user = userEvent.setup();
      const { props } = renderModal({ docs: [INVOICE] });
      await user.click(screen.getByTestId(testId));

      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.navigate).not.toHaveBeenCalled();
    });
  });

  describe('keyboard and focus', () => {
    it('is a labelled modal dialog that focuses the primary action, so Enter opens the single document', async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ docs: [INVOICE] });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAccessibleName('confirmResultModal.title.factura');
      expect(screen.getByTestId('action-confirm-result-view')).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(props.navigate).toHaveBeenCalledWith('/purchase-invoice/2');
    });

    it('with several documents the primary action is Cerrar', () => {
      renderModal();
      expect(screen.getByTestId('action-confirm-result-close')).toHaveFocus();
    });

    it('Esc closes the dialog', async () => {
      const user = userEvent.setup();
      const { props } = renderModal({ docs: [INVOICE] });
      await user.keyboard('{Escape}');
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.navigate).not.toHaveBeenCalled();
    });

    it('an Esc already handled by a layer on top does not close it', () => {
      const { props } = renderModal({ docs: [INVOICE] });
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      event.preventDefault();
      fireEvent(screen.getByTestId('action-confirm-result-view'), event);
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it('Tab cycles inside the dialog, wrapping from the last control to the first and back', async () => {
      const user = userEvent.setup();
      renderModal({ docs: [INVOICE] });
      // Tab order: X icon, card, Cerrar, Ver. Focus starts on Ver (the last).
      await user.tab();
      expect(screen.getByTestId('action-confirm-result-dismiss')).toHaveFocus();
      await user.tab({ shift: true });
      expect(screen.getByTestId('action-confirm-result-view')).toHaveFocus();
    });

    it('gives the focus back to the element that opened it when it closes', () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();
      try {
        const { unmount } = renderModal({ docs: [INVOICE] });
        expect(opener).not.toHaveFocus();
        unmount();
        expect(opener).toHaveFocus();
      } finally {
        opener.remove();
      }
    });
  });

  // ETP-5108: the design system declares its typeface once, on <body>; nothing in the popup
  // may override it.
  it('inherits the design-system typeface everywhere (no inline font-family up to body)', () => {
    renderModal({ docs: [INVOICE] });
    const overlay = screen.getByTestId('confirm-result-modal');
    expect(inlineFontFamiliesUpToBody(overlay)).toEqual([]);
    const overriding = [...overlay.querySelectorAll('*')].filter((el) => el.style?.fontFamily);
    expect(overriding).toEqual([]);
  });

  // Ported from the ETP-5576 popup variant: the backdrop dismisses the popup, a click inside
  // the dialog (here, its title) does not.
  it('a backdrop click closes it, a click inside the dialog does not', () => {
    const { props } = renderModal();
    fireEvent.click(title());
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirm-result-modal'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
