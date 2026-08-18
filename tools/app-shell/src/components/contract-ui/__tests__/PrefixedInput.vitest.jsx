/**
 * PrefixedInput — shared chip+input wrapper (ETP-4749).
 *
 * Used by both EntityForm.jsx's renderInputField (generic windows declaring
 * `inputPrefix` in decisions.json) and OrganizationPage.jsx's hand-built "Sitio web"
 * field — a single source for the chip markup instead of two hand-copied
 * implementations.
 */
import { render, screen } from '@testing-library/react';
import PrefixedInput from '../PrefixedInput.jsx';

describe('PrefixedInput', () => {
  it('renders the prefix chip and the children when prefix is set', () => {
    render(
      <PrefixedInput prefix="https://" testId="wrapper">
        <input data-testid="inner-input" defaultValue="example.com" />
      </PrefixedInput>,
    );

    expect(screen.getByTestId('wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('wrapper')).toHaveTextContent('https://');
    expect(screen.getByTestId('inner-input')).toHaveValue('example.com');
  });

  it('renders children unwrapped (no wrapper div) when prefix is falsy', () => {
    render(
      <PrefixedInput prefix="" testId="wrapper">
        <input data-testid="inner-input" defaultValue="Acme" />
      </PrefixedInput>,
    );

    expect(screen.queryByTestId('wrapper')).not.toBeInTheDocument();
    expect(screen.getByTestId('inner-input')).toHaveValue('Acme');
  });

  it('renders children unwrapped when prefix is null', () => {
    render(
      <PrefixedInput prefix={null} testId="wrapper">
        <input data-testid="inner-input" defaultValue="a" />
      </PrefixedInput>,
    );
    expect(screen.queryByTestId('wrapper')).not.toBeInTheDocument();
    expect(screen.getByTestId('inner-input')).toHaveValue('a');
  });

  it('renders children unwrapped when prefix is omitted (undefined)', () => {
    render(
      <PrefixedInput testId="wrapper">
        <input data-testid="inner-input" defaultValue="b" />
      </PrefixedInput>,
    );
    expect(screen.queryByTestId('wrapper')).not.toBeInTheDocument();
    expect(screen.getByTestId('inner-input')).toHaveValue('b');
  });

  it('does not require a testId — wrapper renders fine without one', () => {
    render(
      <PrefixedInput prefix="+34 ">
        <input data-testid="inner-input" defaultValue="600123456" />
      </PrefixedInput>,
    );
    expect(screen.getByText('+34')).toBeInTheDocument();
    expect(screen.getByTestId('inner-input')).toHaveValue('600123456');
  });
});
