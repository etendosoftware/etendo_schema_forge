// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxConfirmDialog.jsx
// New file justification: InvoiceInboxConfirmDialog.jsx is a new component with no test; the sibling
// InvoiceInboxDiscardDialog.vitest.jsx is about the discard dialog (different copy and behavior).
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const labels = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
vi.mock('@/i18n', () => ({ useUI: () => (key, p) => String(globalThis.__labels[key] ?? key).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, k) => p?.[k] ?? '') }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
globalThis.__labels = labels;

import InvoiceInboxConfirmDialog from '../InvoiceInboxConfirmDialog.jsx';

const ready = (id, extra = {}) => ({ id, status: 'READY', grandTotalAmount: 100, currency: 'EUR', ...extra });

const setup = (props = {}) => {
  const onConfirm = vi.fn(); const onClose = vi.fn();
  const utils = render(<InvoiceInboxConfirmDialog open rows={[ready('a')]} onConfirm={onConfirm} onClose={onClose} {...props} />);
  return { onConfirm, onClose, ...utils };
};
const tid = (id) => screen.getByTestId(id);
const maybe = (id) => screen.queryByTestId(id);

describe('InvoiceInboxConfirmDialog', () => {
  it('one confirmable row: singular title and body, the total of that row', () => {
    setup({ rows: [ready('a', { grandTotalAmount: 1234.5 })] });
    expect(tid('invoice-inbox-confirm-dialog-title')).toHaveTextContent(labels.invoiceInboxConfirmTitleOne);
    expect(tid('invoice-inbox-confirm-dialog-body')).toHaveTextContent(labels.invoiceInboxConfirmBodyOne);
    expect(tid('invoice-inbox-confirm-total-EUR')).toHaveTextContent('1.234,50');
    expect(tid('invoice-inbox-confirm-total-EUR')).toHaveTextContent(labels.invoiceInboxConfirmTotal);
  });

  it('several rows: plural title with the count and the summed total', () => {
    setup({ rows: [ready('a', { grandTotalAmount: 0.1 }), ready('b', { grandTotalAmount: 0.2 }), ready('c', { status: 'PENDING_REVIEW', grandTotalAmount: 10 })] });
    expect(tid('invoice-inbox-confirm-dialog-title')).toHaveTextContent('Confirmar 3 facturas');
    expect(tid('invoice-inbox-confirm-total-EUR')).toHaveTextContent('10,30');
  });

  it('one currency shows one line labelled without the ISO code', () => {
    setup();
    expect(tid('invoice-inbox-confirm-totals').children).toHaveLength(1);
    expect(tid('invoice-inbox-confirm-total-EUR').querySelector('dt').textContent).toBe(labels.invoiceInboxConfirmTotal);
  });

  it('several currencies: one line each, labelled with the ISO code', () => {
    setup({ rows: [ready('a', { currency: 'USD', grandTotalAmount: 10 }), ready('b', { currency: 'EUR', grandTotalAmount: 20 })] });
    expect(tid('invoice-inbox-confirm-totals').children).toHaveLength(2);
    expect(tid('invoice-inbox-confirm-total-USD').querySelector('dt')).toHaveTextContent('USD');
    expect(tid('invoice-inbox-confirm-total-EUR').querySelector('dt')).toHaveTextContent('EUR');
  });

  it('a row with no currency falls back to the organization currency', () => {
    setup({ rows: [ready('a', { currency: undefined, grandTotalAmount: 5 })] });
    expect(tid('invoice-inbox-confirm-total-EUR')).toBeInTheDocument();
  });

  it('skipped line: singular and plural, and not shown at zero', () => {
    const { rerender, onConfirm, onClose } = setup({ rows: [ready('a'), { id: 'x', status: 'CONFIRMED' }] });
    expect(tid('invoice-inbox-confirm-skipped')).toHaveTextContent(labels.invoiceInboxConfirmSkippedOne);
    rerender(<InvoiceInboxConfirmDialog open rows={[ready('a'), { id: 'x', status: 'CONFIRMED' }, { id: 'y', status: 'PROCESSING' }]} onConfirm={onConfirm} onClose={onClose} />);
    expect(tid('invoice-inbox-confirm-skipped')).toHaveTextContent('2');
    rerender(<InvoiceInboxConfirmDialog open rows={[ready('a')]} onConfirm={onConfirm} onClose={onClose} />);
    expect(maybe('invoice-inbox-confirm-skipped')).toBeNull();
  });

  it('new-products line: singular and plural, absent without new products', () => {
    const { rerender, onConfirm, onClose } = setup({ rows: [ready('a', { newProducts: 1 })] });
    expect(tid('invoice-inbox-confirm-new-products')).toHaveTextContent(labels.invoiceInboxConfirmNewProductsOne);
    rerender(<InvoiceInboxConfirmDialog open rows={[ready('a', { newProducts: 2 }), ready('b', { newProducts: 1 })]} onConfirm={onConfirm} onClose={onClose} />);
    expect(tid('invoice-inbox-confirm-new-products')).toHaveTextContent('3');
    rerender(<InvoiceInboxConfirmDialog open rows={[ready('a', { newProducts: 0 })]} onConfirm={onConfirm} onClose={onClose} />);
    expect(maybe('invoice-inbox-confirm-new-products')).toBeNull();
  });

  it('mismatch warning: singular and plural, only counting confirmable rows', () => {
    const { rerender, onConfirm, onClose } = setup({ rows: [ready('a', { totalMismatch: 'Y' })] });
    expect(tid('invoice-inbox-confirm-mismatch')).toHaveTextContent(labels.invoiceInboxConfirmMismatchWarnOne);
    rerender(<InvoiceInboxConfirmDialog open rows={[ready('a', { totalMismatch: true }), ready('b', { totalMismatch: 'Y' })]} onConfirm={onConfirm} onClose={onClose} />);
    expect(tid('invoice-inbox-confirm-mismatch')).toHaveTextContent('2');
    rerender(<InvoiceInboxConfirmDialog open rows={[ready('a'), { id: 'x', status: 'CONFIRMED', totalMismatch: 'Y' }]} onConfirm={onConfirm} onClose={onClose} />);
    expect(maybe('invoice-inbox-confirm-mismatch')).toBeNull();
  });

  it('count 0: Confirmar is disabled, there are no totals', () => {
    setup({ rows: [{ id: 'x', status: 'CONFIRMED' }] });
    expect(tid('invoice-inbox-confirm-confirm')).toBeDisabled();
    expect(maybe('invoice-inbox-confirm-totals')).toBeNull();
  });

  it('opens with the focus on Cancel', async () => {
    setup();
    await vi.waitFor(() => expect(document.activeElement).toBe(tid('invoice-inbox-confirm-cancel')));
  });

  it('Cancel calls onClose and Confirmar calls onConfirm', () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(tid('invoice-inbox-confirm-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(tid('invoice-inbox-confirm-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Escape closes it when idle', () => {
    const { onClose } = setup();
    fireEvent.keyDown(tid('invoice-inbox-confirm-dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('while running', () => {
    const running = { running: true, progress: { done: 3, total: 10 } };

    it('shows the progress, a spinner and aria-busy, and locks both buttons', () => {
      setup(running);
      expect(tid('invoice-inbox-confirm-dialog-body')).toHaveTextContent('Confirmando 3 de 10');
      expect(tid('invoice-inbox-confirm-dialog')).toHaveAttribute('aria-busy', 'true');
      expect(tid('invoice-inbox-confirm-spinner')).toBeInTheDocument();
      expect(tid('invoice-inbox-confirm-confirm')).toBeDisabled();
      expect(tid('invoice-inbox-confirm-confirm')).toHaveTextContent(labels.invoiceInboxConfirming);
      expect(tid('invoice-inbox-confirm-cancel')).toBeDisabled();
    });

    it('Escape does not close it', () => {
      const { onClose } = setup(running);
      fireEvent.keyDown(tid('invoice-inbox-confirm-dialog'), { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(tid('invoice-inbox-confirm-dialog')).toBeInTheDocument();
    });

    it('a click outside does not close it', () => {
      const { onClose } = setup(running);
      const overlay = document.querySelector('[data-state="open"][class*="fixed"]:not([role="dialog"])');
      if (overlay) fireEvent.pointerDown(overlay);
      fireEvent.pointerDown(document.body);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('without progress yet it keeps the plain body', () => {
      setup({ running: true, progress: null });
      expect(tid('invoice-inbox-confirm-dialog-body')).toHaveTextContent(labels.invoiceInboxConfirmBodyOne);
    });
  });

  it('idle: no aria-busy and the confirm label', () => {
    setup();
    expect(tid('invoice-inbox-confirm-dialog')).not.toHaveAttribute('aria-busy');
    expect(tid('invoice-inbox-confirm-confirm')).toHaveTextContent(labels.invoiceInboxBulkConfirm);
  });

  it('closed: renders nothing', () => {
    setup({ open: false });
    expect(maybe('invoice-inbox-confirm-dialog')).toBeNull();
  });
});
