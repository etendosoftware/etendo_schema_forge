// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxRowActions.jsx
// New file justification: no existing test covers the row actions (the Page test mocks DataTable and never renders them).
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const labels = JSON.parse(readFileSync(join(process.cwd(), 'src', 'locales', 'es_ES.json'), 'utf8')).genericLabels;
vi.mock('@/i18n', () => ({ useUI: () => (key, p) => String(globalThis.__labels[key] ?? key).replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, k) => p?.[k] ?? '') }));
globalThis.__labels = labels;

import InvoiceInboxRowActions, { INVOICE_INBOX_ROW_ACTION_COUNT } from '../InvoiceInboxRowActions.jsx';

const renderFor = (status, onDiscard = vi.fn()) => {
  render(<InvoiceInboxRowActions row={{ id: 'x', status }} onDiscard={onDiscard} />);
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

  it('pencil and kebab are aria-disabled and do nothing', () => {
    const onDiscard = renderFor('READY');
    for (const id of ['invoice-inbox-row-edit-x', 'invoice-inbox-row-more-x']) {
      const btn = screen.getByTestId(id);
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).not.toBeDisabled();
      fireEvent.click(btn);
    }
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('the trash is not aria-disabled', () => {
    renderFor('READY');
    expect(screen.getByTestId('invoice-inbox-row-discard-x')).not.toHaveAttribute('aria-disabled');
  });

  it('pencil and kebab show a "Próximamente" tooltip on focus', async () => {
    renderFor('READY');
    fireEvent.focus(screen.getByTestId('invoice-inbox-row-edit-x'));
    expect((await screen.findAllByText(/Próximamente/)).length).toBeGreaterThan(0);
  });

  it('clicking an action does not bubble to the row', () => {
    const rowClick = vi.fn();
    render(<div onClick={rowClick}><InvoiceInboxRowActions row={{ id: 'x', status: 'READY' }} onDiscard={vi.fn()} /></div>);
    fireEvent.click(screen.getByTestId('invoice-inbox-row-discard-x'));
    fireEvent.click(screen.getByTestId('invoice-inbox-row-edit-x'));
    expect(rowClick).not.toHaveBeenCalled();
  });
});
