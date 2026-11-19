import React from 'react';

/**
 * Identifiable stubs for the icons CurrencyRatePicker renders, shared by its test files.
 * Each keeps a caller-supplied `data-testid` and otherwise falls back to a stable default.
 */
const testIdIcon = fallback => props => <span data-testid={props['data-testid'] || fallback} />;

export const currencyRateIconOverrides = {
  CaretDownIcon: testIdIcon('icon-chevron'),
  CircleNotchIcon: testIdIcon('icon-loader'),
  PencilSimpleIcon: testIdIcon('icon-pencil'),
  CheckIcon: testIdIcon('icon-check'),
  XIcon: testIdIcon('icon-x'),
};
