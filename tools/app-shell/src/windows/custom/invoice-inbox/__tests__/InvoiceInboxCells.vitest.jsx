// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxCells.jsx
// @covers tools/app-shell/src/components/ui/truncated-text.jsx
// New file justification: InvoiceInboxPage.vitest.jsx renders the cells through a mocked DataTable and
// an i18n stub that returns keys; these tests need the real Radix tooltip and the real locale texts.
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fixtures first: vi.mock factories run before imports.
const { clipState } = vi.hoisted(() => ({ clipState: { clipped: true } }));

import {
  DocumentCell, NumberCell, StatusCell, VendorCell, formatReceived,
} from '../InvoiceInboxCells.jsx';

const localeDir = join(process.cwd(), 'src', 'locales');
const labels = (l) => JSON.parse(readFileSync(join(localeDir, `${l}.json`), 'utf8')).genericLabels;
const EN = labels('en_US');
const ES = labels('es_ES');

/** `ui()` over the real locale files, with `{{x}}` / `{x}` interpolation. */
const makeUi = (dict) => (key, params) => String(dict[key] ?? key)
  .replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, p) => params?.[p] ?? '');

function stubMetrics() {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true, get() { return clipState.clipped ? 500 : 50; },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true, get() { return 100; },
  });
}

beforeEach(() => {
  clipState.clipped = true;
  stubMetrics();
});
afterEach(() => {
  delete HTMLElement.prototype.scrollWidth;
  delete HTMLElement.prototype.clientWidth;
});

const uiEs = makeUi(ES);
const uiEn = makeUi(EN);

describe('StatusCell — reason line per error code', () => {
  it.each([
    ['UNREADABLE', 'invoiceInboxErrorUnreadable'],
    ['SERVICE_FAILURE', 'invoiceInboxErrorServiceFailure'],
    ['FOREIGN_RECEIVER', 'invoiceInboxErrorForeignReceiver'],
    ['MISSING_FIELDS', 'invoiceInboxErrorMissingFields'],
    ['REFERENCE_TOO_LONG', 'invoiceInboxErrorReferenceTooLong'],
    ['CONFIRM_FAILED', 'invoiceInboxErrorConfirmFailed'],
    ['SOMETHING_NEW', 'invoiceInboxErrorUnknown'],
    [undefined, 'invoiceInboxErrorUnknown'],
    ['', 'invoiceInboxErrorUnknown'],
  ])('ERROR %s shows %s', (errorCode, key) => {
    const row = { id: 'e1', status: 'ERROR', errorCode };
    render(<StatusCell row={row} ui={uiEn} locale="en_US" />);
    expect(screen.getByTestId('invoice-inbox-status-reason-e1')).toHaveTextContent(EN[key]);
  });

  it('FOREIGN_RECEIVER reads "La factura no está emitida a tu empresa" in es_ES', () => {
    const row = { id: 'e1', status: 'ERROR', errorCode: 'FOREIGN_RECEIVER' };
    render(<StatusCell row={row} ui={uiEs} locale="es_ES" />);
    expect(screen.getByTestId('invoice-inbox-status-reason-e1')).toHaveTextContent('La factura no está emitida a tu empresa');
  });

  it('the reason opens a tooltip with the full text on hover/focus when it is clipped', () => {
    const row = { id: 'e1', status: 'ERROR', errorCode: 'UNREADABLE' };
    render(<StatusCell row={row} ui={uiEn} locale="en_US" />);
    const reason = screen.getByTestId('invoice-inbox-status-reason-e1');
    expect(screen.queryByTestId('invoice-inbox-status-reason-e1-tooltip')).toBeNull();
    act(() => reason.focus());
    expect(screen.getByTestId('invoice-inbox-status-reason-e1-tooltip')).toHaveTextContent(EN.invoiceInboxErrorUnreadable);
    expect(reason).toHaveAttribute('aria-describedby');
  });

  it('opens on pointer move over the clipped reason too', () => {
    const row = { id: 'e1', status: 'ERROR', errorCode: 'UNREADABLE' };
    render(<StatusCell row={row} ui={uiEn} locale="en_US" />);
    const reason = screen.getByTestId('invoice-inbox-status-reason-e1');
    fireEvent.pointerMove(reason);
    fireEvent.focus(reason);
    expect(screen.getByTestId('invoice-inbox-status-reason-e1-tooltip')).toBeInTheDocument();
  });

  it('does not open the tooltip when the reason is not clipped', () => {
    clipState.clipped = false;
    const row = { id: 'e1', status: 'ERROR', errorCode: 'UNREADABLE' };
    render(<StatusCell row={row} ui={uiEn} locale="en_US" />);
    const reason = screen.getByTestId('invoice-inbox-status-reason-e1');
    act(() => reason.focus());
    expect(screen.queryByTestId('invoice-inbox-status-reason-e1-tooltip')).toBeNull();
    expect(reason).not.toHaveAttribute('aria-describedby');
  });

  it('the reason is keyboard-focusable (tabindex 0)', () => {
    render(<StatusCell row={{ id: 'e1', status: 'ERROR', errorCode: 'UNREADABLE' }} ui={uiEn} locale="en_US" />);
    expect(screen.getByTestId('invoice-inbox-status-reason-e1')).toHaveAttribute('tabindex', '0');
  });

  it('CONFIRMED with an invoice shows "{doc} · Completada" in es_ES', () => {
    const row = { id: 'c1', status: 'CONFIRMED', 'invoice$_identifier': 'FAC-77' };
    render(<StatusCell row={row} ui={uiEs} locale="es_ES" />);
    const reason = screen.getByTestId('invoice-inbox-status-reason-c1');
    expect(reason).toHaveTextContent('FAC-77');
    expect(reason).toHaveTextContent('Completada');
    expect(reason).toHaveTextContent(/^FAC-77 · /);
  });

  it('CONFIRMED without an invoice identifier shows no reason line', () => {
    render(<StatusCell row={{ id: 'c1', status: 'CONFIRMED' }} ui={uiEn} locale="en_US" />);
    expect(screen.queryByTestId('invoice-inbox-status-reason-c1')).toBeNull();
  });

  it.each(['PENDING_REVIEW', 'READY', 'PROCESSING'])('%s shows no reason line', (status) => {
    render(<StatusCell row={{ id: 'x1', status, errorCode: 'UNREADABLE', 'invoice$_identifier': 'F-1' }} ui={uiEn} locale="en_US" />);
    expect(screen.queryByTestId('invoice-inbox-status-reason-x1')).toBeNull();
  });

  it('the status wrapper may shrink: it is no longer whitespace-nowrap', () => {
    render(<StatusCell row={{ id: 'e1', status: 'ERROR', errorCode: 'UNREADABLE' }} ui={uiEn} locale="en_US" />);
    const wrapper = screen.getByTestId('invoice-inbox-status-e1');
    expect(wrapper.className).not.toContain('whitespace-nowrap');
    expect(wrapper.className).toContain('min-w-0');
  });

  it('DISCARDED shows "Descartada el {date}" with its own test id', () => {
    const row = { id: 'd1', status: 'DISCARDED', discardedAt: '2026-08-10T09:30:00Z' };
    render(<StatusCell row={row} ui={uiEs} locale="es_ES" />);
    expect(screen.getByTestId('invoice-inbox-discarded-at-d1')).toHaveTextContent(/^Descartada el 10\/08\/2026$/);
    expect(screen.queryByTestId('invoice-inbox-status-reason-d1')).toBeNull();
  });

  it('DISCARDED without a discardedAt shows no date line', () => {
    render(<StatusCell row={{ id: 'd1', status: 'DISCARDED' }} ui={uiEs} locale="es_ES" />);
    expect(screen.queryByTestId('invoice-inbox-discarded-at-d1')).toBeNull();
  });
});

describe('DocumentCell — file name', () => {
  const row = { id: 'f1', status: 'READY', fileName: 'a-very-long-supplier-invoice-name.pdf', source: 'UPLOAD' };

  it('has a testid, no native title, and a tooltip with the full name when clipped', () => {
    render(<DocumentCell row={row} ui={uiEn} locale="en_US" />);
    const name = screen.getByTestId('invoice-inbox-file-name-f1');
    expect(name).toHaveTextContent(row.fileName);
    expect(name).not.toHaveAttribute('title');
    expect(name).toHaveAttribute('tabindex', '0');
    act(() => name.focus());
    expect(screen.getByTestId('invoice-inbox-file-name-f1-tooltip')).toHaveTextContent(row.fileName);
  });

  it('shows no tooltip for a name that fits', () => {
    clipState.clipped = false;
    render(<DocumentCell row={row} ui={uiEn} locale="en_US" />);
    act(() => screen.getByTestId('invoice-inbox-file-name-f1').focus());
    expect(screen.queryByTestId('invoice-inbox-file-name-f1-tooltip')).toBeNull();
  });

  it('focusing or hovering the name never selects the row (no click handler, no checkbox)', () => {
    const onClick = vi.fn();
    render(<div onClick={onClick}><DocumentCell row={row} ui={uiEn} locale="en_US" /></div>);
    const name = screen.getByTestId('invoice-inbox-file-name-f1');
    act(() => name.focus());
    fireEvent.pointerMove(name);
    fireEvent.mouseEnter(name);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('a checkbox rendered beside the cell still selects on click', () => {
    const onChange = vi.fn();
    render(
      <div>
        <input type="checkbox" data-testid="check" onChange={onChange} />
        <DocumentCell row={row} ui={uiEn} locale="en_US" />
      </div>,
    );
    act(() => screen.getByTestId('invoice-inbox-file-name-f1').focus());
    fireEvent.click(screen.getByTestId('check'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('VendorCell — name and tax id', () => {
  it('linked vendor: name + businessPartner$taxID + link icon, both truncated with tooltips', () => {
    const row = {
      id: 'v1', status: 'READY', businessPartner: 'bp1',
      'businessPartner$_identifier': 'ACME SL', 'businessPartner$taxID': 'B1234',
    };
    render(<VendorCell row={row} ui={uiEn} />);
    expect(screen.getByTestId('invoice-inbox-vendor-name-v1')).toHaveTextContent('ACME SL');
    expect(screen.getByTestId('invoice-inbox-vendor-tax-id-v1')).toHaveTextContent('B1234');
    expect(screen.getByTestId('Link2__85f13c')).toBeInTheDocument();
    act(() => screen.getByTestId('invoice-inbox-vendor-name-v1').focus());
    expect(screen.getByTestId('invoice-inbox-vendor-name-v1-tooltip')).toHaveTextContent('ACME SL');
    act(() => screen.getByTestId('invoice-inbox-vendor-tax-id-v1').focus());
    expect(screen.getByTestId('invoice-inbox-vendor-tax-id-v1-tooltip')).toHaveTextContent('B1234');
  });

  it('extracted vendor: extractedName + extractedTaxID and NO link icon', () => {
    const row = { id: 'v2', status: 'PENDING_REVIEW', extractedName: 'Extracted SL', extractedTaxID: 'X999' };
    render(<VendorCell row={row} ui={uiEn} />);
    expect(screen.getByTestId('invoice-inbox-vendor-name-v2')).toHaveTextContent('Extracted SL');
    expect(screen.getByTestId('invoice-inbox-vendor-tax-id-v2')).toHaveTextContent('X999');
    expect(screen.queryByTestId('Link2__85f13c')).toBeNull();
  });

  it('a vendor without tax id renders the name only', () => {
    render(<VendorCell row={{ id: 'v3', status: 'READY', extractedName: 'Only Name' }} ui={uiEn} />);
    expect(screen.getByTestId('invoice-inbox-vendor-name-v3')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-inbox-vendor-tax-id-v3')).toBeNull();
  });

  it('no vendor data shows the muted placeholder, not a truncated text', () => {
    render(<VendorCell row={{ id: 'v4', status: 'READY' }} ui={uiEn} />);
    expect(screen.getByText(EN.invoiceInboxVendorNoData)).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-inbox-vendor-name-v4')).toBeNull();
  });
});

describe('NumberCell — duplicate icon', () => {
  it('keeps its title and aria-label', () => {
    const row = { id: 'n1', status: 'READY', orderReference: 'F-1', duplicateOfInvoice: 'i1', 'duplicateOfInvoice$_identifier': 'INV-9' };
    render(<NumberCell row={row} ui={uiEn} />);
    const icon = screen.getByTestId('invoice-inbox-duplicate-n1');
    expect(icon).toHaveAttribute('title', expect.stringContaining('INV-9'));
    expect(icon).toHaveAttribute('aria-label', expect.stringContaining('INV-9'));
    expect(within(icon).queryByRole('tooltip')).toBeNull();
  });
});

describe('DocumentCell — origin line', () => {
  const created = '2026-08-10T09:30:00Z';
  const upload = { id: 'u1', status: 'READY', fileName: 'a.pdf', source: 'UPLOAD', created };
  const email = { id: 'e1', status: 'READY', fileName: 'b.pdf', source: 'EMAIL', created };

  it('an UPLOAD row shows only the reception date: no origin text, icon or separator', () => {
    const { container } = render(<DocumentCell row={upload} ui={uiEn} locale="en_US" />);
    const received = formatReceived(created, 'en_US');
    expect(received).not.toBe('');
    expect(screen.getByTestId('invoice-inbox-received-u1')).toHaveTextContent(received);
    expect(screen.queryByTestId('invoice-inbox-source-u1')).toBeNull();
    expect(screen.queryByTestId('invoice-inbox-source-icon-u1')).toBeNull();
    expect(container).not.toHaveTextContent('Manual upload');
    expect(container).not.toHaveTextContent('·');
  });

  it('an EMAIL row shows the mail icon, the translated origin and the date, with a separator', () => {
    const { container } = render(<DocumentCell row={email} ui={makeUi(ES)} locale="es_ES" />);
    const source = screen.getByTestId('invoice-inbox-source-e1');
    expect(source).toHaveTextContent('Correo');
    expect(within(source).getByTestId('invoice-inbox-source-icon-e1')).toHaveAttribute('aria-hidden', 'true');
    expect(source).toHaveTextContent('·');
    expect(screen.getByTestId('invoice-inbox-received-e1')).toHaveTextContent(formatReceived(created, 'es_ES'));
    expect(container).not.toHaveTextContent('Carga manual');
  });

  it('an EMAIL row without a date shows the origin but no dangling separator', () => {
    render(<DocumentCell row={{ ...email, created: null }} ui={uiEn} locale="en_US" />);
    expect(screen.getByTestId('invoice-inbox-source-e1')).not.toHaveTextContent('·');
    expect(screen.queryByTestId('invoice-inbox-received-e1')).toBeNull();
  });

  it('both variants keep the same fixed-height second line, so the row height does not change', () => {
    const a = render(<DocumentCell row={upload} ui={uiEn} locale="en_US" />);
    const lineOf = (c, id) => c.container.querySelector(`[data-testid="invoice-inbox-received-${id}"]`).parentElement;
    const uploadLine = lineOf(a, 'u1');
    a.unmount();
    const b = render(<DocumentCell row={email} ui={uiEn} locale="en_US" />);
    const emailLine = lineOf(b, 'e1');
    expect(uploadLine.className).toContain('h-4');
    expect(emailLine.className).toBe(uploadLine.className);
  });
});
