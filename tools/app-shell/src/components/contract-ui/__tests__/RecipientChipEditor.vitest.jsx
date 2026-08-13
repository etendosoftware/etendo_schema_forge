import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock i18n hooks — return the key as-is (interpolation args ignored).
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import RecipientChipEditor from '../RecipientChipEditor.jsx';

/**
 * Controlled wrapper that keeps the recipient list in state, mirroring how
 * SendDocumentModal drives RecipientChipEditor in production.
 */
function Harness({ initial = [], onChangeSpy, onValiditySpy, ...rest }) {
  const [recipients, setRecipients] = React.useState(initial);
  const handleChange = (next) => {
    onChangeSpy?.(next);
    setRecipients(next);
  };
  return (
    <RecipientChipEditor
      recipients={recipients}
      onChange={handleChange}
      onValidityChange={onValiditySpy}
      label="To"
      {...rest}
    />
  );
}

describe('RecipientChipEditor (ETP-4226)', () => {
  it('renders one chip per existing recipient', () => {
    render(<Harness initial={['a@x.com', 'b@x.com']} />);
    expect(screen.getByTestId('recipient-chip-a@x.com')).toBeInTheDocument();
    expect(screen.getByTestId('recipient-chip-b@x.com')).toBeInTheDocument();
    expect(screen.getByTestId('recipient-chip-a@x.com')).toHaveTextContent('a@x.com');
  });

  it('respects a custom testIdPrefix', () => {
    render(<Harness initial={['a@x.com']} testIdPrefix="cc" />);
    expect(screen.getByTestId('cc-chip-a@x.com')).toBeInTheDocument();
    expect(screen.getByTestId('cc-input')).toBeInTheDocument();
  });

  it('adds a valid email on Enter and reports validity true', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    const onValiditySpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} onValiditySpy={onValiditySpy} />);

    const input = screen.getByTestId('recipient-input');
    await user.type(input, 'new@x.com');
    await user.keyboard('{Enter}');

    expect(onChangeSpy).toHaveBeenCalledWith(['new@x.com']);
    expect(onValiditySpy).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId('recipient-chip-new@x.com')).toBeInTheDocument();
  });

  it('adds a valid email on blur', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);

    const input = screen.getByTestId('recipient-input');
    await user.type(input, 'blur@x.com');
    await user.tab(); // blur

    expect(onChangeSpy).toHaveBeenCalledWith(['blur@x.com']);
  });

  it('rejects an invalid email: keeps it in the input, shows error, reports validity false', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    const onValiditySpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} onValiditySpy={onValiditySpy} />);

    const input = screen.getByTestId('recipient-input');
    await user.type(input, 'not-an-email');
    await user.keyboard('{Enter}');

    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(onValiditySpy).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(input).toHaveValue('not-an-email');
  });

  it('removes a chip and calls onChange with the remaining list', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness initial={['a@x.com', 'b@x.com']} onChangeSpy={onChangeSpy} />);

    await user.click(screen.getByTestId('recipient-remove-a@x.com'));

    expect(onChangeSpy).toHaveBeenCalledWith(['b@x.com']);
    expect(screen.queryByTestId('recipient-chip-a@x.com')).not.toBeInTheDocument();
    expect(screen.getByTestId('recipient-chip-b@x.com')).toBeInTheDocument();
  });

  it('commits a comma-separated paste, keeping valid addresses and reporting the invalid remainder', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    const onValiditySpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} onValiditySpy={onValiditySpy} />);

    // A paste delivers the whole "a, b" string in one change event, exercising
    // the comma-split commit path (handleInputChange → commitDraft).
    const input = screen.getByTestId('recipient-input');
    input.focus();
    await user.paste('good@x.com, bad-one');

    // valid part is added; invalid remainder stays in the input with validity=false
    expect(onChangeSpy).toHaveBeenCalledWith(['good@x.com']);
    expect(onValiditySpy).toHaveBeenLastCalledWith(false);
    expect(input).toHaveValue('bad-one');
  });

  it('commits multiple valid comma-separated addresses from a paste', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    const onValiditySpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} onValiditySpy={onValiditySpy} />);

    const input = screen.getByTestId('recipient-input');
    input.focus();
    await user.paste('a@x.com, b@x.com');

    expect(onChangeSpy).toHaveBeenCalledWith(['a@x.com', 'b@x.com']);
    expect(onValiditySpy).toHaveBeenLastCalledWith(true);
    expect(input).toHaveValue('');
  });

  it('disables chip removal and input when disabled', () => {
    render(<Harness initial={['a@x.com']} disabled />);
    expect(screen.getByTestId('recipient-input')).toBeDisabled();
    expect(screen.getByTestId('recipient-remove-a@x.com')).toBeDisabled();
  });
});
