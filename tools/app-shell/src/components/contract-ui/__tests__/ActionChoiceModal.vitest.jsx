// @covers tools/app-shell/src/components/contract-ui/ActionChoiceModal.jsx
//
// Generic "summary + pick one option" confirmation modal.
//
// The component is meant to be mounted from several windows without touching its code, so
// the contract pinned here is: everything that varies (title, summary headers and values,
// question, options, default option, both actions) comes from props, while layout and styles
// cannot be overridden by the consumer.

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { createPortal } from 'react-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ActionChoiceModal, { nextOptionId } from '../ActionChoiceModal.jsx';

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

// ── Single-option mode: one option is a direct confirmation, not a choice ─────────────

const SINGLE = {
  id: 'shipment',
  label: 'Create sales shipment',
  description: 'Draft with the 2 pending lines',
  badge: 'Draft',
  badgeTone: 'info',
  actionLabel: 'Create shipment',
  testId: 'option-shipment',
};

function renderSingle(overrides = {}) {
  return renderModal({ options: [SINGLE], defaultOptionId: undefined, ...overrides });
}

const dialog = () => screen.getByRole('dialog');
const primary = () => screen.getByTestId(CONTINUE_TEST_ID);
const escape = (target = document.activeElement) => fireEvent.keyDown(target, { key: 'Escape' });

describe('ActionChoiceModal — single option', () => {
  it('renders no radiogroup and no radio, and the option as a static, non-focusable card', () => {
    renderSingle();
    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    const card = screen.getByTestId(SINGLE.testId);
    expect(card.tagName).toBe('DIV');
    expect(card).not.toHaveAttribute('tabindex');
    expect(card).not.toHaveAttribute('role');
    expect(card.querySelector('button')).toBeNull();
  });

  it('renders the question above the card, and omits it when empty', () => {
    const { unmount } = renderSingle();
    const question = screen.getByText(QUESTION);
    expect(question.compareDocumentPosition(screen.getByTestId(SINGLE.testId)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    unmount();
    renderSingle({ question: '' });
    expect(dialog().querySelector('p')).toBeNull();
  });

  it('shows label, badge and description on the card, and describes the dialog with the description', () => {
    renderSingle();
    const card = within(screen.getByTestId(SINGLE.testId));
    expect(card.getByText(SINGLE.label)).toBeInTheDocument();
    expect(card.getByText(SINGLE.badge)).toBeInTheDocument();
    expect(card.getByText(SINGLE.description)).toBeInTheDocument();
    expect(dialog()).toHaveAccessibleDescription(SINGLE.description);
  });

  it.each([
    ['info', 'info'],
    [undefined, 'success'],
    ['bogus', 'success'],
  ])('badgeTone %s renders data-badge-tone="%s"', (badgeTone, expected) => {
    renderSingle({ options: [{ ...SINGLE, badgeTone }] });
    expect(screen.getByText(SINGLE.badge)).toHaveAttribute('data-badge-tone', expected);
  });

  it('focuses the primary button, labelled with actionLabel and without the arrow icon', () => {
    renderSingle();
    expect(primary()).toHaveFocus();
    expect(primary()).toHaveTextContent(SINGLE.actionLabel);
    expect(screen.queryByTestId('ArrowRight__6f7a22')).toBeNull();
  });

  it.each([
    ['actionLabel wins over primaryLabel', { actionLabel: 'Create shipment' }, 'Explicit', 'Create shipment'],
    ['primaryLabel without actionLabel', { actionLabel: undefined }, 'Explicit', 'Explicit'],
    ['the continue key without either', { actionLabel: undefined }, undefined, 'continue'],
  ])('primary label: %s', (_, optionPatch, primaryLabel, expected) => {
    renderSingle({ options: [{ ...SINGLE, ...optionPatch }], primaryLabel });
    expect(primary()).toHaveTextContent(expected);
  });

  it('shows the spinner and the loading label while loading', () => {
    renderSingle({ loading: true, loadingLabel: 'Creating' });
    expect(screen.getByTestId('Loader2__6f7a22')).toBeInTheDocument();
    expect(primary()).toHaveTextContent('Creating');
    expect(primary()).toBeDisabled();
  });

  it('continues with the only option on Enter, the focus being on the primary button', async () => {
    const user = userEvent.setup();
    const { props } = renderSingle();
    await user.keyboard('{Enter}');
    expect(props.onContinue).toHaveBeenCalledTimes(1);
    expect(props.onContinue).toHaveBeenCalledWith(SINGLE.id);
  });

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByText('cancel'))],
    ['the close icon', () => fireEvent.click(screen.getByRole('button', { name: 'close' }))],
    ['Esc', () => escape()],
    ['the backdrop', () => fireEvent.click(dialog().parentElement)],
  ])('cancels from %s without continuing', (_, act) => {
    const { props } = renderSingle();
    act();
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it('traps Tab in the close icon, Cancel and the primary button only', async () => {
    const user = userEvent.setup();
    render(<button type="button">outside</button>);
    renderSingle();
    const close = screen.getByRole('button', { name: 'close' });
    const cancel = screen.getByText('cancel');
    const visited = [];
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      visited.push(document.activeElement);
    }
    expect(visited).toEqual([close, cancel, primary(), close]);
    await user.tab({ shift: true });
    expect(primary()).toHaveFocus();
  });
});

// ── Multi-option mode: keyboard model of the radio group ───────────────────────────────

const THREE = [
  ...OPTIONS,
  { id: 'third', label: 'Third', description: 'Third option', badge: 'New', badgeTone: 'info', testId: 'option-third' },
];

describe('nextOptionId', () => {
  it.each([
    ['ArrowRight', ORDER_ID, INVOICE_ID],
    ['ArrowDown', INVOICE_ID, 'third'],
    ['ArrowRight', 'third', ORDER_ID],
    ['ArrowLeft', ORDER_ID, 'third'],
    ['ArrowUp', INVOICE_ID, ORDER_ID],
    ['Home', 'third', ORDER_ID],
    ['End', ORDER_ID, 'third'],
    ['ArrowRight', 'unknown', INVOICE_ID],
    ['Enter', ORDER_ID, null],
    [' ', ORDER_ID, null],
  ])('%s from %s → %s', (key, current, expected) => {
    expect(nextOptionId(THREE, current, key)).toBe(expected);
  });

  it('returns null without options', () => {
    expect(nextOptionId([], undefined, 'ArrowRight')).toBeNull();
  });
});

describe('ActionChoiceModal — multiple options keyboard model', () => {
  const tabStops = () => screen.getAllByRole('radio').filter(r => r.tabIndex === 0);

  it('focuses the selected card and keeps it the only Tab stop of the group', () => {
    renderModal({ options: THREE });
    expect(screen.getByTestId(ORDER_TEST_ID)).toHaveFocus();
    expect(tabStops()).toEqual([screen.getByTestId(ORDER_TEST_ID)]);
  });

  it.each([
    ['ArrowLeft', 'option-third'],
    ['End', 'option-third'],
    ['ArrowRight', INVOICE_TEST_ID],
  ])('%s moves selection, focus and the Tab stop together', (key, expectedTestId) => {
    renderModal({ options: THREE });
    fireEvent.keyDown(document.activeElement, { key });
    const target = screen.getByTestId(expectedTestId);
    expect(target).toHaveAttribute('aria-checked', 'true');
    expect(target).toHaveFocus();
    expect(tabStops()).toEqual([target]);
  });

  it('Enter on a card selects it and continues with it', () => {
    const { props } = renderModal({ options: THREE });
    fireEvent.keyDown(screen.getByTestId('option-third'), { key: 'Enter' });
    expect(screen.getByTestId('option-third')).toHaveAttribute('aria-checked', 'true');
    expect(props.onContinue).toHaveBeenCalledTimes(1);
    expect(props.onContinue).toHaveBeenCalledWith('third');
  });

  it('Space on a card only selects it', async () => {
    const user = userEvent.setup();
    const { props } = renderModal({ options: THREE });
    screen.getByTestId(INVOICE_TEST_ID).focus();
    await user.keyboard(' ');
    expect(screen.getByTestId(INVOICE_TEST_ID)).toHaveAttribute('aria-checked', 'true');
    expect(props.onContinue).not.toHaveBeenCalled();
  });

  it('shows the arrow icon on the primary button and honours each card badge tone', () => {
    renderModal({ options: THREE, primaryLabel: 'Go' });
    expect(screen.getByTestId('ArrowRight__6f7a22')).toBeInTheDocument();
    expect(primary()).toHaveTextContent('Go');
    expect(screen.getByText('Recommended')).toHaveAttribute('data-badge-tone', 'success');
    expect(screen.getByText('New')).toHaveAttribute('data-badge-tone', 'info');
  });

  it('renders a custom option icon instead of the default one', () => {
    const CustomIcon = () => <svg data-testid="custom-icon" />;
    renderModal({ options: [{ ...OPTIONS[0], icon: CustomIcon }, OPTIONS[1]] });
    expect(within(screen.getByTestId(ORDER_TEST_ID)).getByTestId('custom-icon')).toBeInTheDocument();
    expect(within(screen.getByTestId(INVOICE_TEST_ID)).queryByTestId('custom-icon')).toBeNull();
  });
});

// ── Both modes: Esc ownership, loading lock, focus around loading ─────────────────────

const MODES = [
  ['single option', { options: [SINGLE], defaultOptionId: undefined }, () => primary()],
  ['multiple options', {}, () => screen.getByTestId(ORDER_TEST_ID)],
];

describe.each(MODES)('ActionChoiceModal — %s: closing and loading', (_, modeProps, submitControl) => {
  it('ignores an Esc a layer on top already handled (defaultPrevented)', () => {
    const { props } = renderModal(modeProps);
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    document.activeElement.dispatchEvent(event);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('ignores an Esc whose target is outside the dialog (a portalled inner layer keeps it)', () => {
    const layer = <span>{createPortal(<button type="button" data-testid="inner-layer">layer</button>, document.body)}</span>;
    const options = (modeProps.options ?? OPTIONS).map((o, i) => (i === 0 ? { ...o, label: layer } : o));
    const { props } = renderModal({ ...modeProps, options });
    escape(screen.getByTestId('inner-layer'));
    expect(props.onCancel).not.toHaveBeenCalled();
    escape(submitControl());
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Esc', () => escape()],
    ['the backdrop', () => fireEvent.click(dialog().parentElement)],
    ['the close icon', () => fireEvent.click(screen.getByRole('button', { name: 'close' }))],
  ])('ignores %s while loading', (__, act) => {
    const { props } = renderModal({ ...modeProps, loading: true });
    act();
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('parks focus on the dialog while loading and gives it back to the submit control after', () => {
    const { props, rerender } = renderModal(modeProps);
    expect(submitControl()).toHaveFocus();
    rerender(<ActionChoiceModal {...props} loading />);
    expect(dialog()).toHaveFocus();
    rerender(<ActionChoiceModal {...props} loading={false} error="failed" />);
    expect(submitControl()).toHaveFocus();
  });
});
