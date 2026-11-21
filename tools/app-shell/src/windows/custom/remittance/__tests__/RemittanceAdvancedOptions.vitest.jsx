// @covers artifacts/remittance/custom/RemittanceAdvancedOptions.jsx
//
// The collection options of a remittance header: scheme (Core | B2B) and «Remesa financiada». The values are
// handed to the header form (`onChange`), read-only once processed. Only the i18n hook is mocked.
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RemittanceAdvancedOptions, { advancedOptionValues } from '@generated/remittance/custom/RemittanceAdvancedOptions.jsx';

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

const info = (extra = {}) => ({ directDebitScheme: 'CORE', financed: false, ...extra });
const renderOptions = (props = {}) => {
  const onChange = vi.fn();
  const onTouched = vi.fn();
  const view = render(<RemittanceAdvancedOptions info={info()} processed={false} onChange={onChange} onTouched={onTouched} {...props} />);
  return { onChange, onTouched, ...view };
};

describe('advancedOptionValues', () => {
  it('defaults to Core and not financed, and lets a choice win over the server value', () => {
    expect(advancedOptionValues(null, {})).toEqual({ scheme: 'CORE', financed: false });
    expect(advancedOptionValues({ directDebitScheme: 'B2B', financed: true }, {})).toEqual({ scheme: 'B2B', financed: true });
    expect(advancedOptionValues({ directDebitScheme: 'B2B', financed: true }, { scheme: 'CORE', financed: false })).toEqual({ scheme: 'CORE', financed: false });
  });
});

describe('RemittanceAdvancedOptions', () => {
  it('shows both controls right away as header fields, with the defaults Core and off', () => {
    renderOptions();
    expect(screen.getByTestId('remittance-scheme-trigger')).toHaveTextContent('remittanceSchemeCore');
    expect(screen.getByTestId('remittance-financed-switch')).not.toBeChecked();
    expect(screen.queryByTestId('remittance-advanced-toggle')).toBeNull();
  });

  // `financed` is required in the contract (REM_REMITTANCE.ISFINANCED is NOT NULL, default N). On a new remittance
  // an untouched switch hands nothing to the header form: the column default N applies, and nothing here could hold
  // «Guardar» back.
  it('on a new remittance the untouched switch is off and hands nothing to the header form', () => {
    const { onChange, onTouched } = renderOptions({ info: null });
    expect(screen.getByTestId('remittance-financed-switch')).not.toBeChecked();
    expect(screen.getByTestId('remittance-financed-switch')).toBeEnabled();
    expect(onChange).not.toHaveBeenCalled();
    expect(onTouched).not.toHaveBeenCalled();
  });

  it('shows the server values', () => {
    renderOptions({ info: info({ directDebitScheme: 'B2B', financed: true }) });
    expect(screen.getByTestId('remittance-scheme-trigger')).toHaveTextContent('remittanceSchemeB2b');
    expect(screen.getByTestId('remittance-financed-switch')).toBeChecked();
  });

  it('has a short help (i) on each option, from the shared info button', () => {
    renderOptions({ info: info({ financed: true }) });
    expect(screen.getByTestId('remittance-scheme-info')).toHaveAttribute('aria-label', 'remittanceDirectDebitSchemeInfo');
    expect(screen.getByTestId('remittance-financed-info')).toHaveAttribute('aria-label', 'remittanceFinancedInfo');
  });

  it('hands «Remesa financiada» to the header form and marks the options as touched', () => {
    const { onChange, onTouched } = renderOptions({ info: info({ financed: true }) });
    fireEvent.click(screen.getByTestId('remittance-financed-switch'));
    expect(onChange).toHaveBeenCalledWith('financed', false);
    expect(onTouched).toHaveBeenCalled();
    expect(screen.getByTestId('remittance-financed-switch')).not.toBeChecked();
  });

  it('hands the chosen scheme to the header form', async () => {
    const user = userEvent.setup();
    const { onChange } = renderOptions({ info: info({ financed: true }) });
    await user.click(screen.getByTestId('remittance-scheme-trigger'));
    await user.click(await screen.findByTestId('remittance-scheme-option-b2b'));
    expect(onChange).toHaveBeenCalledWith('directDebitScheme', 'B2B');
    expect(screen.getByTestId('remittance-scheme-trigger')).toHaveTextContent('remittanceSchemeB2b');
  });

  it('is read-only with the values once processed', () => {
    renderOptions({ info: info({ directDebitScheme: 'B2B', financed: true }), processed: true });
    // The same disabled grey input as the other read-only header fields, holding the value.
    expect(screen.getByTestId('remittance-scheme-value')).toHaveValue('remittanceSchemeB2b');
    expect(screen.getByTestId('remittance-scheme-value')).toBeDisabled();
    // «Remesa financiada» stays the same switch, disabled (on here).
    expect(screen.getByTestId('remittance-financed-switch')).toBeChecked();
    expect(screen.getByTestId('remittance-financed-switch')).toBeDisabled();
    expect(screen.queryByTestId('remittance-financed-value')).toBeNull();
    expect(screen.queryByTestId('remittance-scheme-trigger')).toBeNull();
  });
});
