import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));

import GeneralTab from '../GeneralTab.jsx';
import { GENERAL_SEED, ORG_INFO_SEED, CURRENCY_OPTIONS } from '../mockCatalogs.js';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});

function renderTab(overrides = {}) {
  const setGeneralField = vi.fn();
  render(
    <GeneralTab
      general={{ ...GENERAL_SEED, ...overrides.general }}
      orgInfo={ORG_INFO_SEED}
      currencyOptions={CURRENCY_OPTIONS}
      setGeneralField={setGeneralField}
      errors={overrides.errors ?? {}}
    />,
  );
  return { setGeneralField };
}

describe('GeneralTab — allow negative toggle', () => {
  it('shows the "allow negative" toggle OFF when allowNegative is false', () => {
    renderTab({ general: { allowNegative: false } });
    expect(screen.getByTestId('glc-toggle-allow-negative-switch')).not.toBeChecked();
  });

  it('shows the toggle ON when allowNegative is true', () => {
    renderTab({ general: { allowNegative: true } });
    expect(screen.getByTestId('glc-toggle-allow-negative-switch')).toBeChecked();
  });

  it('writes the raw value directly when the toggle is turned ON', async () => {
    const user = userEvent.setup();
    const { setGeneralField } = renderTab({ general: { allowNegative: false } });
    await user.click(screen.getByTestId('glc-toggle-allow-negative-switch'));
    // Toggle ON ⇒ AllowNegative = true (direct binding, no inversion).
    expect(setGeneralField).toHaveBeenCalledWith('allowNegative', true);
  });
});

describe('GeneralTab — read-only AD_OrgInfo fields', () => {
  it('renders Organización read-only with the org-info origin caption', () => {
    renderTab();
    const org = screen.getByTestId('glc-field-organization');
    expect(within(org).getByText(ORG_INFO_SEED.organization)).toBeInTheDocument();
    expect(within(org).getByText('glc.readonly.fromOrgInfo')).toBeInTheDocument();
    // Read-only fields have no input control.
    expect(within(org).queryByRole('textbox')).toBeNull();
  });

  it('renders Calendario fiscal read-only from org info', () => {
    renderTab();
    const cal = screen.getByTestId('glc-field-calendar');
    expect(within(cal).getByText(ORG_INFO_SEED.fiscalCalendar)).toBeInTheDocument();
    expect(within(cal).queryByRole('textbox')).toBeNull();
  });
});

describe('GeneralTab — backed editable fields', () => {
  it('edits the schema name through setGeneralField', async () => {
    const user = userEvent.setup();
    const { setGeneralField } = renderTab();
    const nameInput = within(screen.getByTestId('glc-field-name')).getByRole('textbox');
    await user.type(nameInput, 'X');
    expect(setGeneralField).toHaveBeenCalledWith('name', expect.stringContaining('X'));
  });
});
