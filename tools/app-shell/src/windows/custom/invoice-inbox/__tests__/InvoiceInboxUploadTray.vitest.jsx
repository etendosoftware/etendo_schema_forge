// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxUploadTray.jsx
// @covers tools/app-shell/src/components/ui/truncated-text.jsx
// New file justification: no test renders the tray on its own; InvoiceInboxPage.vitest.jsx stubs i18n to
// keys, while these cases assert the real Spanish texts per line state and need the real Radix tooltip.
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { clipState } = vi.hoisted(() => ({ clipState: { clipped: true } }));

// The tray reads `useUI()`; serve the real es_ES texts through it.
vi.mock('@/i18n', async () => {
  const { readFileSync: read } = await import('node:fs');
  const { join: joinPath } = await import('node:path');
  const dict = JSON.parse(read(joinPath(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
  const ui = (key, params) => String(dict[key] ?? key).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, p) => params?.[p] ?? '');
  return { useUI: () => ui };
});

import InvoiceInboxUploadTray, { itemMessage } from '../InvoiceInboxUploadTray.jsx';

const ES = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
const ui = (key, params) => String(ES[key] ?? key).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, p) => params?.[p] ?? '');

beforeEach(() => {
  clipState.clipped = true;
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get() { return clipState.clipped ? 500 : 50; } });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 100; } });
});
afterEach(() => {
  delete HTMLElement.prototype.scrollWidth;
  delete HTMLElement.prototype.clientWidth;
});

const item = (over) => ({ key: 'k', name: 'a.pdf', status: 'queued', ...over });

describe('itemMessage per state', () => {
  it.each([
    ['queued', item({ status: 'queued' }), 'En cola'],
    ['sending', item({ status: 'uploading' }), 'Enviando…'],
    ['refused with a key', item({ status: 'rejected', reasonKey: 'invoiceInboxFileUnsupportedType' }), ES.invoiceInboxFileUnsupportedType],
    ['refused with translated text', item({ status: 'rejected', reasonText: 'Sin conexión' }), 'Sin conexión'],
    ['unconfirmed', item({ status: 'unconfirmed', reasonKey: 'invoiceInboxUploadUnconfirmed' }), ES.invoiceInboxUploadUnconfirmed],
    ['delivered', item({ status: 'accepted' }), 'Entregada · se leerá en unos instantes'],
  ])('%s', (_name, it_, message) => {
    expect(itemMessage(it_, ui)).toBe(message);
  });
});

describe('InvoiceInboxUploadTray', () => {
  const props = (items, over = {}) => ({
    items, done: items.filter((i) => ['accepted', 'rejected'].includes(i.status)).length, total: items.length,
    finished: false, onClose: vi.fn(), ...over,
  });

  it('renders nothing without items', () => {
    const { container } = render(<InvoiceInboxUploadTray {...props([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "Cargando X de N" and one line per file with data-status and its message', () => {
    const items = [item({ key: '1', status: 'uploading' }), item({ key: '2', name: 'b.pdf', status: 'accepted' })];
    render(<InvoiceInboxUploadTray {...props(items)} />);
    expect(screen.getByTestId('invoice-inbox-upload-progress')).toHaveTextContent('Cargando 1 de 2');
    expect(screen.getByTestId('invoice-inbox-upload-item-0')).toHaveAttribute('data-status', 'uploading');
    expect(screen.getByTestId('invoice-inbox-upload-item-1')).toHaveAttribute('data-status', 'accepted');
    expect(screen.getByTestId('invoice-inbox-upload-item-message-0')).toHaveTextContent('Enviando…');
    expect(screen.getByTestId('invoice-inbox-upload-item-message-1')).toHaveTextContent('Entregada · se leerá en unos instantes');
  });

  it('offers the close button only when finished, and it calls onClose', () => {
    const { rerender } = render(<InvoiceInboxUploadTray {...props([item({ status: 'uploading' })])} />);
    expect(screen.queryByTestId('invoice-inbox-upload-close')).toBeNull();
    const onClose = vi.fn();
    rerender(<InvoiceInboxUploadTray {...props([item({ status: 'accepted' })], { finished: true, onClose })} />);
    expect(screen.getByTestId('invoice-inbox-upload-progress')).toHaveTextContent('Cargando 1 de 1');
    fireEvent.click(screen.getByTestId('invoice-inbox-upload-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('name and message are focusable and open the full text in a tooltip when clipped', () => {
    render(<InvoiceInboxUploadTray {...props([item({ name: 'a-very-long-supplier-invoice-name.pdf', status: 'queued' })])} />);
    const name = screen.getByTestId('invoice-inbox-upload-item-name-0');
    const message = screen.getByTestId('invoice-inbox-upload-item-message-0');
    expect(name).toHaveAttribute('tabindex', '0');
    expect(message).toHaveAttribute('tabindex', '0');
    expect(screen.queryByTestId('invoice-inbox-upload-item-name-0-tooltip')).toBeNull();
    act(() => name.focus());
    expect(screen.getByTestId('invoice-inbox-upload-item-name-0-tooltip')).toHaveTextContent('a-very-long-supplier-invoice-name.pdf');
    act(() => message.focus());
    expect(screen.getByTestId('invoice-inbox-upload-item-message-0-tooltip')).toHaveTextContent('En cola');
  });

  it('opens on pointer move over a clipped message', () => {
    render(<InvoiceInboxUploadTray {...props([item({ status: 'queued' })])} />);
    const message = screen.getByTestId('invoice-inbox-upload-item-message-0');
    fireEvent.pointerMove(message);
    fireEvent.focus(message);
    expect(screen.getByTestId('invoice-inbox-upload-item-message-0-tooltip')).toBeInTheDocument();
  });

  it('does not open a tooltip when the text is not clipped', () => {
    clipState.clipped = false;
    render(<InvoiceInboxUploadTray {...props([item({ status: 'queued' })])} />);
    const message = screen.getByTestId('invoice-inbox-upload-item-message-0');
    act(() => message.focus());
    expect(screen.queryByTestId('invoice-inbox-upload-item-message-0-tooltip')).toBeNull();
  });
});
