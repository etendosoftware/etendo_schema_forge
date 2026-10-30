// @covers tools/app-shell/src/components/contract-ui/InlineCreateModal.jsx
// ---------------------------------------------------------------------------
// The create dialog opened by an inline-creatable selector.
//
// Default (name-only, e.g. match-rule → transaction type): "Name" label, Create disabled while the
// input is blank, `onSubmit` gets the trimmed value.
// With a variant (payment term): relabelled input, unit suffix, `inputMode`, and a `validate` step
// that runs before `onSubmit` — its message is shown under the input and nothing is submitted;
// an empty input is submittable so `validate` can explain why; typing clears the message.
//
// Restricted input (payment-term days): `inputPattern` + `maxLength` refuse a typed or pasted
// change — the previous value stays and the validator's message for the refused value (else
// `rejectedMessage`, else `genericError`) is shown; a pre-fill that does not fit opens empty.
//
// i18n returns the key, so the default label/buttons are asserted by key.
// ---------------------------------------------------------------------------
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InlineCreateModal } from '../InlineCreateModal.jsx';

function renderModal(props = {}) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onCancel = props.onCancel ?? vi.fn();
  render(
    <InlineCreateModal
      open
      title="Create"
      namePlaceholder="placeholder"
      initialName=""
      {...props}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  return { onSubmit, onCancel, input: screen.getByTestId('inline-create-name'), submit: screen.getByTestId('inline-create-submit') };
}

describe('InlineCreateModal — default name-only create', () => {
  it('labels the input with the generic name and shows no suffix', () => {
    const { input } = renderModal();
    expect(screen.getByLabelText('name')).toBe(input);
    expect(screen.queryByTestId('inline-create-suffix')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('inputmode');
  });

  it('keeps Create disabled while the input is blank', () => {
    const { input, submit, onSubmit } = renderModal();
    expect(submit).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed name', async () => {
    const { input, submit, onSubmit } = renderModal();
    fireEvent.change(input, { target: { value: '  Bank fee  ' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Bank fee'));
  });

  it('shows the error thrown by onSubmit and keeps the dialog open', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Duplicate key'));
    const { input, submit } = renderModal({ onSubmit, initialName: 'Bank fee' });
    expect(input).toHaveValue('Bank fee');
    fireEvent.click(submit);
    expect(await screen.findByTestId('inline-create-error')).toHaveTextContent('Duplicate key');
    expect(screen.getByTestId('inline-create-modal')).toBeInTheDocument();
    expect(submit).toBeEnabled();
  });
});

describe('InlineCreateModal — variant input (label, suffix, validate)', () => {
  const validate = (value) => {
    if (!value) return 'required-message';
    return /^\d+$/.test(value) ? null : 'not-integer-message';
  };

  it('renders the variant label, the unit suffix and the input mode', () => {
    const { input } = renderModal({ inputLabel: 'Días', inputSuffix: 'días', inputMode: 'numeric', validate });
    expect(screen.getByLabelText('Días')).toBe(input);
    expect(screen.getByTestId('inline-create-suffix')).toHaveTextContent('días');
    expect(input).toHaveAttribute('inputmode', 'numeric');
  });

  it('lets an empty input be submitted so validate explains it is required — onSubmit is not called', () => {
    const { submit, onSubmit, input } = renderModal({ validate });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(screen.getByTestId('inline-create-error')).toHaveTextContent('required-message');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'inline-create-error');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks an invalid value on Enter as well, showing the validation message', () => {
    const { input, onSubmit } = renderModal({ validate });
    fireEvent.change(input, { target: { value: '7,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('inline-create-error')).toHaveTextContent('not-integer-message');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clears the validation message as soon as the user types', () => {
    const { input, submit } = renderModal({ validate });
    fireEvent.click(submit);
    expect(screen.getByTestId('inline-create-error')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '3' } });
    expect(screen.queryByTestId('inline-create-error')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('submits the trimmed value once validate accepts it', async () => {
    const { input, submit, onSubmit } = renderModal({ validate });
    fireEvent.change(input, { target: { value: ' 12 ' } });
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('12'));
    expect(screen.queryByTestId('inline-create-error')).not.toBeInTheDocument();
  });
});

describe('InlineCreateModal — restricted input (inputPattern + maxLength)', () => {
  // Mirrors the payment-term validator: trims, then required / whole number / 1–365.
  const validate = (raw) => {
    const value = raw.trim();
    if (!value) return 'required-message';
    if (!/^\d+$/.test(value)) return 'not-integer-message';
    const n = Number(value);
    return n < 1 || n > 365 ? 'range-message' : null;
  };
  const restricted = { inputPattern: /^\d*$/, maxLength: 3, inputMode: 'numeric', validate, rejectedMessage: 'rejected-message' };

  function typeInto(input, value) {
    fireEvent.change(input, { target: { value } });
  }

  it.each(['5.541', '5,45454', '123asdasda', '-5', '50%'])(
    'refuses %j: keeps the previous value and shows the validator message',
    (value) => {
      const { input } = renderModal(restricted);
      typeInto(input, '5');
      typeInto(input, value);
      expect(input).toHaveValue('5');
      expect(screen.getByTestId('inline-create-error')).toHaveTextContent('not-integer-message');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    },
  );

  it('refuses a 4th digit: keeps the 3 digits and shows the range message', () => {
    const { input } = renderModal(restricted);
    typeInto(input, '365');
    typeInto(input, '3655');
    expect(input).toHaveValue('365');
    expect(screen.getByTestId('inline-create-error')).toHaveTextContent('range-message');
  });

  it('a refused value the validator accepts once trimmed ("12 ") shows rejectedMessage', () => {
    const { input } = renderModal(restricted);
    typeInto(input, '12');
    typeInto(input, '12 ');
    expect(input).toHaveValue('12');
    expect(screen.getByTestId('inline-create-error')).toHaveTextContent('rejected-message');
  });

  it('without rejectedMessage, the same refusal shows genericError', () => {
    const { input } = renderModal({ ...restricted, rejectedMessage: undefined });
    typeInto(input, '12 ');
    expect(input).toHaveValue('');
    expect(screen.getByTestId('inline-create-error')).toHaveTextContent('genericError');
  });

  it('without a validator, a refusal shows rejectedMessage', () => {
    const { input } = renderModal({ ...restricted, validate: undefined });
    typeInto(input, 'abc');
    expect(input).toHaveValue('');
    expect(screen.getByTestId('inline-create-error')).toHaveTextContent('rejected-message');
  });

  it('a valid digit after a refusal is applied and clears the message', () => {
    const { input } = renderModal(restricted);
    typeInto(input, '1');
    typeInto(input, '1a');
    expect(screen.getByTestId('inline-create-error')).toBeInTheDocument();
    typeInto(input, '12');
    expect(input).toHaveValue('12');
    expect(screen.queryByTestId('inline-create-error')).not.toBeInTheDocument();
  });

  it('clearing the input is allowed (an empty value matches the pattern)', () => {
    const { input } = renderModal(restricted);
    typeInto(input, '12');
    typeInto(input, '');
    expect(input).toHaveValue('');
    expect(screen.queryByTestId('inline-create-error')).not.toBeInTheDocument();
  });

  it.each([
    ['text typed in the selector', 'Inme'],
    ['a number longer than maxLength', '1234'],
  ])('a pre-fill that does not fit (%s) opens empty', (_label, initialName) => {
    const { input } = renderModal({ ...restricted, initialName });
    expect(input).toHaveValue('');
    expect(screen.queryByTestId('inline-create-error')).not.toBeInTheDocument();
  });

  it('a pre-fill that fits ("12") is kept and submitted as-is', async () => {
    const { input, submit, onSubmit } = renderModal({ ...restricted, initialName: '12' });
    expect(input).toHaveValue('12');
    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('12'));
  });

  it('keeps a text input with a numeric keypad (no type="number")', () => {
    const { input } = renderModal(restricted);
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    // The length is enforced with a message, not the silently-truncating HTML attribute.
    expect(input).not.toHaveAttribute('maxlength');
  });

  it('without inputPattern / maxLength any text is accepted, pre-fill included (name-only create unchanged)', () => {
    const { input } = renderModal({ initialName: 'Inme' });
    expect(input).toHaveValue('Inme');
    typeInto(input, '5,45454 abc -5 50% 1234567');
    expect(input).toHaveValue('5,45454 abc -5 50% 1234567');
    expect(screen.queryByTestId('inline-create-error')).not.toBeInTheDocument();
  });
});
