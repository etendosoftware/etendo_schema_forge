// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxRowActions.jsx
// New file justification: no existing test covers the row actions (the Page test mocks DataTable and never renders them).
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const labels = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
vi.mock('@/i18n', () => ({ useUI: () => (key, p) => String(globalThis.__labels[key] ?? key).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, k) => p?.[k] ?? '') }));
globalThis.__labels = labels;

import InvoiceInboxRowActions, { INVOICE_INBOX_ROW_ACTION_COUNT } from '../InvoiceInboxRowActions.jsx';

const renderFor = (status, onDiscard = vi.fn(), onOpen = vi.fn()) => {
  render(<InvoiceInboxRowActions row={{ id: 'x', status }} onDiscard={onDiscard} onOpen={onOpen} />);
  return onDiscard;
};

describe('InvoiceInboxRowActions', () => {
  it('reserves room for 3 buttons', () => {
    expect(INVOICE_INBOX_ROW_ACTION_COUNT).toBe(3);
  });

  it('PROCESSING shows nothing', () => {
    renderFor('PROCESSING');
    expect(screen.queryByTestId('invoice-inbox-row-actions-x')).toBeNull();
  });

  it.each(['CONFIRMED', 'DISCARDED'])('%s shows pencil and kebab only', (status) => {
    renderFor(status);
    expect(screen.getByTestId('invoice-inbox-row-edit-x')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-inbox-row-more-x')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-inbox-row-discard-x')).toBeNull();
  });

  it.each(['PENDING_REVIEW', 'ERROR', 'READY'])('%s also shows the trash, which calls onDiscard(row)', (status) => {
    const onDiscard = renderFor(status);
    fireEvent.click(screen.getByTestId('invoice-inbox-row-discard-x'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledWith({ id: 'x', status });
  });

  it('the pencil is live (not aria-disabled) and calls onOpen(row) once; it does not discard', () => {
    const onOpen = vi.fn();
    const onDiscard = renderFor('READY', vi.fn(), onOpen);
    const pencil = screen.getByTestId('invoice-inbox-row-edit-x');
    expect(pencil).not.toHaveAttribute('aria-disabled');
    fireEvent.click(pencil);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith({ id: 'x', status: 'READY' });
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it.each(['CONFIRMED', 'DISCARDED', 'ERROR', 'PENDING_REVIEW'])('the pencil of a %s row opens the panel too', (status) => {
    const onOpen = vi.fn();
    renderFor(status, vi.fn(), onOpen);
    fireEvent.click(screen.getByTestId('invoice-inbox-row-edit-x'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('without onOpen the pencil click does not throw', () => {
    render(<InvoiceInboxRowActions row={{ id: 'x', status: 'READY' }} onDiscard={vi.fn()} />);
    expect(() => fireEvent.click(screen.getByTestId('invoice-inbox-row-edit-x'))).not.toThrow();
  });

  it('the kebab stays aria-disabled and inert', () => {
    const onOpen = vi.fn();
    const onDiscard = renderFor('READY', vi.fn(), onOpen);
    const btn = screen.getByTestId('invoice-inbox-row-more-x');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('the trash is not aria-disabled', () => {
    renderFor('READY');
    expect(screen.getByTestId('invoice-inbox-row-discard-x')).not.toHaveAttribute('aria-disabled');
  });

  it('the kebab shows a "Próximamente" tooltip on focus; the pencil shows only "Editar"', async () => {
    renderFor('READY');
    fireEvent.focus(screen.getByTestId('invoice-inbox-row-more-x'));
    expect((await screen.findAllByText(/Próximamente/)).length).toBeGreaterThan(0);
  });

  it('the pencil tooltip is the plain Edit label, not "coming soon"', async () => {
    renderFor('READY');
    fireEvent.focus(screen.getByTestId('invoice-inbox-row-edit-x'));
    expect((await screen.findAllByText(labels['quickAction.edit'])).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Próximamente/)).toBeNull();
  });

  it('clicking an action does not bubble to the row', () => {
    const rowClick = vi.fn();
    render(<div onClick={rowClick}><InvoiceInboxRowActions row={{ id: 'x', status: 'READY' }} onDiscard={vi.fn()} onOpen={vi.fn()} /></div>);
    fireEvent.click(screen.getByTestId('invoice-inbox-row-discard-x'));
    fireEvent.click(screen.getByTestId('invoice-inbox-row-edit-x'));
    expect(rowClick).not.toHaveBeenCalled();
  });
});
