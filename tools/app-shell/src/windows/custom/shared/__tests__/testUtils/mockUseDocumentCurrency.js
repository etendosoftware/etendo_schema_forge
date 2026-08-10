// Shared vi.mock factory for '../useDocumentCurrency.js', reused by every preview
// test suite that needs a partial mock (keep the real module's other exports,
// stub only useDocumentCurrency). Vitest hoists vi.mock() calls above imports and
// the factory cannot close over local variables, but it CAN reference an imported
// function — imports themselves are hoist-safe. Usage in a test file:
//
//   import { mockUseDocumentCurrency } from './testUtils/mockUseDocumentCurrency.js';
//   vi.mock('../useDocumentCurrency.js', mockUseDocumentCurrency);
import { vi } from 'vitest';

export function mockUseDocumentCurrency(importOriginal) {
  return importOriginal().then((actual) => ({
    ...actual,
    useDocumentCurrency: vi.fn(() => ({
      orgCurrencyCode: null,
      exchangeRate: null,
      isSameCurrency: true,
      loading: false,
      convertAmount: (amount) => amount,
    })),
  }));
}
