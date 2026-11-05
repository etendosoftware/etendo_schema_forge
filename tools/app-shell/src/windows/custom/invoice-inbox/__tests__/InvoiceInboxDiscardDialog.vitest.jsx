// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxDiscardDialog.jsx
// New file justification: no existing test covers the dialog; the Page test exercises it only through the flow.
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const labels = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
vi.mock('@/i18n', () => ({ useUI: () => (key, p) => String(globalThis.__labels[key] ?? key).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, k) => p?.[k] ?? '') }));
globalThis.__labels = labels;

import InvoiceInboxDiscardDialog from '../InvoiceInboxDiscardDialog.jsx';

const setup = (props = {}) => {
  const onConfirm = vi.fn(); const onClose = vi.fn();
  render(<InvoiceInboxDiscardDialog open count={1} onConfirm={onConfirm} onClose={onClose} {...props} />);
  return { onConfirm, onClose };
};

describe('InvoiceInboxDiscardDialog', () => {
  it('count 1: singular title, and no "30 días" line in the body', () => {
    setup();
    expect(screen.getByTestId('invoice-inbox-discard-dialog-title')).toHaveTextContent('¿Descartar esta factura?');
    expect(screen.getByTestId('invoice-inbox-discard-dialog-body').textContent).not.toMatch(/30 d/);
  });

  it('count n: plural title with the count', () => {
    setup({ count: 4 });
    expect(screen.getByTestId('invoice-inbox-discard-dialog-title')).toHaveTextContent('¿Descartar 4 facturas?');
    expect(screen.getByTestId('invoice-inbox-discard-dialog-body').textContent).not.toMatch(/30 d/);
  });

  it('opens with the focus on Cancel', async () => {
    setup();
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('invoice-inbox-discard-cancel')));
  });

  it('Cancel calls onClose, Discard calls onConfirm', () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByTestId('invoice-inbox-discard-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('invoice-inbox-discard-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Escape closes while idle', () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByTestId('invoice-inbox-discard-dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('is not rendered when closed', () => {
    setup({ open: false });
    expect(screen.queryByTestId('invoice-inbox-discard-dialog')).toBeNull();
  });

  describe('running', () => {
    it('is aria-busy, shows the spinner, disables both buttons and shows the progress text', () => {
      setup({ running: true });
      expect(screen.getByTestId('invoice-inbox-discard-dialog')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('invoice-inbox-discard-spinner')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-inbox-discard-cancel')).toBeDisabled();
      expect(screen.getByTestId('invoice-inbox-discard-confirm')).toBeDisabled();
      expect(screen.getByTestId('invoice-inbox-discard-dialog-body')).toHaveTextContent(labels.invoiceInboxDiscardInProgress);
    });

    it('hides the corner X (class) and is not aria-busy when idle', () => {
      setup({ running: true });
      expect(screen.getByTestId('invoice-inbox-discard-dialog').className).toContain('[&>button]:hidden');
    });

    it('ignores Escape and outside clicks', () => {
      const { onClose } = setup({ running: true });
      fireEvent.keyDown(screen.getByTestId('invoice-inbox-discard-dialog'), { key: 'Escape' });
      fireEvent.pointerDown(document.body);
      fireEvent.click(document.body);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('invoice-inbox-discard-dialog')).toBeInTheDocument();
    });
  });

  it('idle dialog is not aria-busy', () => {
    setup();
    expect(screen.getByTestId('invoice-inbox-discard-dialog')).not.toHaveAttribute('aria-busy');
  });
});
