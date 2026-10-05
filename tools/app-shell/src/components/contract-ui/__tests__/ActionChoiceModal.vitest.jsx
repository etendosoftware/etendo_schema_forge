// ETP-5398 — generic "summary + pick one option" confirmation modal.
//
// The component is meant to be mounted from several windows without touching its code, so
// the contract pinned here is: everything that varies (title, summary headers and values,
// question, options, default option, both actions) comes from props, while layout and styles
// cannot be overridden by the consumer.

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ActionChoiceModal from '../ActionChoiceModal.jsx';

const TITLE = 'Confirm sales quotation';
const QUESTION = 'How do you want to process the sale?';
const ORDER_ID = 'order';
const INVOICE_ID = 'invoice';
const ORDER_TEST_ID = 'option-order';
const INVOICE_TEST_ID = 'option-invoice';
const CONTINUE_TEST_ID = 'action-confirm-modal';

const COLUMNS = [
  { key: 'documentNo', label: 'Quotation' },
  { key: 'total', label: 'Total', testId: 'summary-total' },
];
const DATA = { documentNo: '1000155', total: '12,10 EUR' };
const OPTIONS = [
  { id: ORDER_ID, label: 'Create sales order', description: 'Ideal for stock', badge: 'Recommended', testId: ORDER_TEST_ID },
  { id: INVOICE_ID, label: 'Invoice directly', description: 'Ideal for services', testId: INVOICE_TEST_ID },
];

function renderModal(overrides = {}) {
  const props = {
    title: TITLE,
    summaryColumns: COLUMNS,
    summaryData: DATA,
    question: QUESTION,
    options: OPTIONS,
    defaultOptionId: ORDER_ID,
    onCancel: vi.fn(),
    onContinue: vi.fn(),
    ...overrides,
  };
  const view = render(<ActionChoiceModal {...props} />);
  return { ...view, props };
}

const isChecked = (testId) => screen.getByTestId(testId).getAttribute('aria-checked');

describe('ActionChoiceModal — configurable content', () => {
  it('renders the title, the question and every summary header with its value', () => {
    renderModal();
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    expect(screen.getByText(QUESTION)).toBeInTheDocument();
    for (const column of COLUMNS) {
      expect(screen.getByText(column.label)).toBeInTheDocument();
    }
    expect(screen.getByText(DATA.documentNo)).toBeInTheDocument();
    expect(screen.getByTestId('summary-total')).toHaveTextContent(DATA.total);
  });

  it('renders one radio card per option with its label, description and optional badge', () => {
    renderModal();
    expect(screen.getAllByRole('radio')).toHaveLength(OPTIONS.length);
    const order = within(screen.getByTestId(ORDER_TEST_ID));
    expect(order.getByText('Create sales order')).toBeInTheDocument();
    expect(order.getByText('Ideal for stock')).toBeInTheDocument();
    expect(order.getByText('Recommended')).toBeInTheDocument();
    const invoice = within(screen.getByTestId(INVOICE_TEST_ID));
    expect(invoice.getByText('Ideal for services')).toBeInTheDocument();
    expect(invoice.queryByText('Recommended')).not.toBeInTheDocument();
  });

  it('supports any number of options', () => {
    const three = [...OPTIONS, { id: 'third', label: 'Third', description: 'Third option', testId: 'option-third' }];
    renderModal({ options: three });
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });
});

describe('ActionChoiceModal — selection', () => {
  it('starts with the default option selected', () => {
    renderModal({ defaultOptionId: INVOICE_ID });
    expect(isChecked(INVOICE_TEST_ID)).toBe('true');
    expect(isChecked(ORDER_TEST_ID)).toBe('false');
  });

  it('falls back to the first option when no default is given', () => {
    renderModal({ defaultOptionId: undefined });
    expect(isChecked(ORDER_TEST_ID)).toBe('true');
  });

  it('moves the selection when another card is clicked', () => {
    renderModal();
    fireEvent.click(screen.getByTestId(INVOICE_TEST_ID));
    expect(isChecked(INVOICE_TEST_ID)).toBe('true');
    expect(isChecked(ORDER_TEST_ID)).toBe('false');
  });

  it('renders the cards as native buttons so they are reachable and operable with the keyboard', () => {
    renderModal();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.tagName).toBe('BUTTON');
    }
    expect(screen.getByRole('radiogroup', { name: QUESTION })).toBeInTheDocument();
  });
});

describe('ActionChoiceModal — actions', () => {
  it('passes the selected option id to onContinue', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByTestId(INVOICE_TEST_ID));
    fireEvent.click(screen.getByTestId(CONTINUE_TEST_ID));
    expect(props.onContinue).toHaveBeenCalledWith(INVOICE_ID);
  });

  it('labels the primary button with the generic continue key', () => {
    renderModal();
    expect(screen.getByTestId(CONTINUE_TEST_ID)).toHaveTextContent('continue');
  });

  it.each([
    ['the cancel button', () => screen.getByText('cancel')],
    ['the close icon', () => screen.getByRole('button', { name: 'close' })],
    ['the backdrop', () => screen.getByRole('dialog').parentElement],
  ])('calls onCancel from %s', (_, getTarget) => {
    const { props } = renderModal();
    fireEvent.click(getTarget());
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not cancel when clicking inside the dialog', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByRole('dialog'));
    expect(props.onCancel).not.toHaveBeenCalled();
  });
});

describe('ActionChoiceModal — loading and error', () => {
  it('shows the processing label and disables the buttons and cards while loading', () => {
    renderModal({ loading: true });
    const primary = screen.getByTestId(CONTINUE_TEST_ID);
    expect(primary).toHaveTextContent('soProcessing');
    expect(primary).toBeDisabled();
    expect(screen.getByText('cancel')).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toBeDisabled();
    }
  });

  it('shows the error message when given one', () => {
    renderModal({ error: 'Something failed' });
    expect(screen.getByRole('alert')).toHaveTextContent('Something failed');
  });

  it('renders no error block without an error', () => {
    renderModal();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ActionChoiceModal — fixed structure and style', () => {
  it('ignores style and className props so a consumer cannot deform the modal', () => {
    renderModal({ style: { width: 10 }, className: 'deformed' });
    const dialog = screen.getByRole('dialog');
    expect(dialog.style.width).toBe('720px');
    expect(dialog.className).toBe('');
  });

  it('paints the primary button with theme tokens, never the blue status palette', () => {
    renderModal();
    const primary = screen.getByTestId(CONTINUE_TEST_ID).getAttribute('style');
    expect(primary).toContain('hsl(var(--foreground))');
    expect(primary).not.toContain('--status-info');
  });

  it('marks only the selected card with the strong foreground border', () => {
    renderModal();
    expect(screen.getByTestId(ORDER_TEST_ID).style.border).toContain('2px');
    expect(screen.getByTestId(INVOICE_TEST_ID).style.border).toContain('1px');
  });
});
