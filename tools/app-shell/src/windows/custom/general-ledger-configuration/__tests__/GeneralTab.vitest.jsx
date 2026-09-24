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

describe('GeneralTab — allow negative checkbox removed (ETP-4947)', () => {
  it('renders no "Políticas contables" section and no allow-negative toggle', () => {
    renderTab();
    expect(screen.queryByTestId('glc-section-policies')).not.toBeInTheDocument();
    expect(screen.queryByTestId('glc-toggle-allow-negative')).not.toBeInTheDocument();
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

describe('GeneralTab — accrual is hidden and internally fixed to Devengo (ETP-5372)', () => {
  it('does not render a "Criterio contable" field regardless of the accrual value', () => {
    renderTab({ general: { accrual: true } });
    expect(screen.queryByTestId('glc-field-accrual')).not.toBeInTheDocument();

    renderTab({ general: { accrual: false } });
    expect(screen.queryByTestId('glc-field-accrual')).not.toBeInTheDocument();
  });

  it('never calls setGeneralField with "accrual"', async () => {
    const user = userEvent.setup();
    const { setGeneralField } = renderTab();
    const nameInput = within(screen.getByTestId('glc-field-name')).getByRole('textbox');
    await user.type(nameInput, 'X');
    expect(setGeneralField).not.toHaveBeenCalledWith('accrual', expect.anything());
  });
});
