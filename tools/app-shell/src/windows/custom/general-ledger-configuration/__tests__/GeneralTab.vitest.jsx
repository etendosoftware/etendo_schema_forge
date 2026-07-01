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

describe('GeneralTab — inverted period toggle', () => {
  it('shows the "closed periods" toggle OFF when automaticPeriodControl is true', () => {
    renderTab({ general: { automaticPeriodControl: true } });
    // Toggle reads the inverse of the raw AD value.
    expect(screen.getByTestId('glc-toggle-closed-periods-switch')).not.toBeChecked();
  });

  it('shows the toggle ON when automaticPeriodControl is false', () => {
    renderTab({ general: { automaticPeriodControl: false } });
    expect(screen.getByTestId('glc-toggle-closed-periods-switch')).toBeChecked();
  });

  it('writes the inverted raw value when the toggle is turned ON', async () => {
    const user = userEvent.setup();
    const { setGeneralField } = renderTab({ general: { automaticPeriodControl: true } });
    await user.click(screen.getByTestId('glc-toggle-closed-periods-switch'));
    // Toggle ON ⇒ allow closed periods ⇒ AutoPeriodControl = false.
    expect(setGeneralField).toHaveBeenCalledWith('automaticPeriodControl', false);
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

describe('GeneralTab — unbacked placeholders', () => {
  it('marks the conversion type and cost precision selects as unbacked', () => {
    renderTab();
    const conv = screen.getByTestId('glc-field-conversion-type');
    const cost = screen.getByTestId('glc-field-cost-precision');
    expect(within(conv).getByTestId('glc-unbacked-hint')).toBeInTheDocument();
    expect(within(cost).getByTestId('glc-unbacked-hint')).toBeInTheDocument();
  });

  it('marks the auto-reconciliation and journal-numbering toggles as unbacked and disabled', () => {
    renderTab();
    const recon = screen.getByTestId('glc-toggle-auto-reconciliation');
    const journal = screen.getByTestId('glc-toggle-journal-numbering');
    expect(within(recon).getByTestId('glc-unbacked-hint')).toBeInTheDocument();
    expect(within(journal).getByTestId('glc-unbacked-hint')).toBeInTheDocument();
    expect(screen.getByTestId('glc-toggle-auto-reconciliation-switch')).toBeDisabled();
    expect(screen.getByTestId('glc-toggle-journal-numbering-switch')).toBeDisabled();
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
