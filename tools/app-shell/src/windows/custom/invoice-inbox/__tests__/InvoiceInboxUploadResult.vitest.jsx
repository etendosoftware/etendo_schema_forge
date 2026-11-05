// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxUploadResult.jsx
// New file justification: InvoiceInboxUploadResult.jsx is a new component. The cases assert the real
// Spanish texts (the page test stubs i18n to keys).
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dict = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
  const ui = (key, params) => String(dict[key] ?? key).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, p) => params?.[p] ?? '');
  return { useUI: () => ui };
});

import InvoiceInboxUploadResult, { resultTitle, resultHint } from '../InvoiceInboxUploadResult.jsx';
import { summarizeUploadResult } from '../invoiceInboxUploadResult.js';

const row = (id, status, extra = {}) => ({ id, status, ...extra });

function resultOf(rows, over = {}) {
  const ids = rows.map((r) => r.id);
  const map = new Map(rows.map((r) => [r.id, r.row === undefined ? r : r.row]));
  return { ids, summary: summarizeUploadResult(ids, map), loadError: false, retry: vi.fn(), dismiss: vi.fn(), ...over };
}

const renderResult = (result, handlers = {}) => render(
  <InvoiceInboxUploadResult result={result} {...handlers} />,
);
const title = () => screen.getByTestId('invoice-inbox-result-title');

describe('InvoiceInboxUploadResult — states', () => {
  it('renders nothing when nothing is recorded', () => {
    const { container } = renderResult({ ids: [], summary: summarizeUploadResult([], new Map()), loadError: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('reading: "Leyendo tus facturas · X de N" with the keep-working hint and no dismiss', () => {
    renderResult(resultOf([row('a', 'PROCESSING'), row('b', 'PROCESSING'), row('c', 'PROCESSING')]));
    expect(title()).toHaveTextContent('Leyendo tus facturas · 0 de 3');
    expect(screen.getByTestId('invoice-inbox-result-hint')).toHaveTextContent('Puedes seguir trabajando');
    expect(screen.queryByTestId('invoice-inbox-result-dismiss')).toBeNull();
  });

  it('mixed: read, with errors and being read counts, still no dismiss', () => {
    renderResult(resultOf([row('a', 'READY'), row('b', 'ERROR', { errorCode: 'UNREADABLE' }), row('c', 'PROCESSING')]));
    expect(title()).toHaveTextContent('1 leídas · 1 con error · 1 leyéndose');
    expect(screen.queryByTestId('invoice-inbox-result-dismiss')).toBeNull();
  });

  it('done: "1 factura leída" / "N facturas leídas" with the review hint and dismiss', () => {
    const { unmount } = renderResult(resultOf([row('a', 'READY')]));
    expect(title()).toHaveTextContent('1 factura leída');
    expect(screen.getByTestId('invoice-inbox-result-hint')).toHaveTextContent('Revísalas y confírmalas desde Pendientes.');
    expect(screen.getByTestId('invoice-inbox-result-dismiss')).toBeInTheDocument();
    unmount();
    renderResult(resultOf([row('a', 'READY'), row('b', 'PENDING_REVIEW')]));
    expect(title()).toHaveTextContent('2 facturas leídas');
  });

  it('done with errors: counts, one reason line per code, view-errors and dismiss', () => {
    renderResult(resultOf([
      row('a', 'READY'),
      row('b', 'ERROR', { errorCode: 'UNREADABLE' }),
      row('c', 'ERROR', { errorCode: 'UNREADABLE' }),
      row('d', 'ERROR', { errorCode: 'FOREIGN_RECEIVER' }),
      row('e', 'ERROR'),
    ]));
    expect(title()).toHaveTextContent('1 leídas · 4 con error');
    expect(screen.getByTestId('invoice-inbox-result-reason-UNREADABLE')).toHaveTextContent('2 · No se pudo leer el documento');
    expect(screen.getByTestId('invoice-inbox-result-reason-FOREIGN_RECEIVER')).toHaveTextContent('1 · La factura no está emitida a tu empresa');
    expect(screen.getByTestId('invoice-inbox-result-reason-UNKNOWN')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-inbox-result-dismiss')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-inbox-result-hint')).toBeNull();
  });

  it('shows the handled and gone lines', () => {
    renderResult(resultOf([row('a', 'READY'), row('h1', 'CONFIRMED'), row('h2', 'DISCARDED'), { id: 'g', row: null }]));
    expect(screen.getByTestId('invoice-inbox-result-handled')).toHaveTextContent('2 ya gestionadas (confirmadas o descartadas)');
    expect(screen.getByTestId('invoice-inbox-result-gone')).toHaveTextContent('1 ya no están disponibles');
  });

  it('all handled and nothing read: the neutral headline', () => {
    renderResult(resultOf([row('h', 'CONFIRMED')]));
    expect(title()).toHaveTextContent('Resultado de tus cargas');
  });

  it('load error: message with retry only, no counts and no actions', () => {
    const retry = vi.fn();
    renderResult(resultOf([row('a', 'READY')], { loadError: true, retry }));
    expect(title()).toHaveTextContent('No se pudo comprobar el resultado de tu carga.');
    fireEvent.click(screen.getByTestId('invoice-inbox-result-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('invoice-inbox-result-dismiss')).toBeNull();
  });

  it('is a polite live region with an accessible name', () => {
    renderResult(resultOf([row('a', 'READY')]));
    const section = screen.getByTestId('invoice-inbox-result');
    expect(section).toHaveAttribute('aria-live', 'polite');
    expect(section).toHaveAttribute('aria-label', 'Resultado de tus cargas');
  });
});

describe('InvoiceInboxUploadResult — dismiss', () => {
  it('the close button calls dismiss and there are no "view" buttons', () => {
    const result = resultOf([row('a', 'READY'), row('b', 'ERROR', { errorCode: 'UNREADABLE' })]);
    renderResult(result);
    fireEvent.click(screen.getByTestId('invoice-inbox-result-dismiss'));
    expect(result.dismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('invoice-inbox-result-view-batch')).toBeNull();
    expect(screen.queryByTestId('invoice-inbox-result-view-errors')).toBeNull();
  });

  it('the close button has an accessible name and is offered only when nothing is being read', () => {
    const { unmount } = renderResult(resultOf([row('a', 'READY')]));
    expect(screen.getByTestId('invoice-inbox-result-dismiss')).toHaveAccessibleName(/\S/);
    unmount();
    renderResult(resultOf([row('a', 'READY'), row('b', 'PROCESSING')]));
    expect(screen.queryByTestId('invoice-inbox-result-dismiss')).toBeNull();
  });
});

describe('resultTitle / resultHint', () => {
  const ui = (key, params) => `${key}:${JSON.stringify(params ?? {})}`;
  it('pick the key of each state', () => {
    const s = (rows) => resultOf(rows).summary;
    expect(resultTitle(s([row('a', 'PROCESSING')]), ui)).toContain('invoiceInboxResultReadingTitle');
    expect(resultTitle(s([row('a', 'READY'), row('b', 'PROCESSING')]), ui)).toContain('invoiceInboxResultMixed');
    expect(resultTitle(s([row('a', 'READY'), row('b', 'ERROR')]), ui)).toContain('invoiceInboxResultDoneWithErrors');
    expect(resultTitle(s([row('a', 'READY')]), ui)).toContain('invoiceInboxResultDoneOne');
    expect(resultHint(s([row('a', 'PROCESSING')]), ui)).toContain('invoiceInboxResultReadingHint');
    expect(resultHint(s([row('a', 'READY')]), ui)).toContain('invoiceInboxResultAllGoodHint');
    expect(resultHint(s([row('a', 'READY'), row('b', 'ERROR')]), ui)).toBeNull();
  });
});
