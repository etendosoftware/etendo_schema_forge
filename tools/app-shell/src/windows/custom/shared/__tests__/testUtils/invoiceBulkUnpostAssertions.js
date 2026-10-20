// Shared assertion for the invoice windows' standalone bulk "Descontabilizar"
// button, reused by the sales-invoice and purchase-invoice render suites
// (`<window>/__tests__/index.vitest.jsx`). Both windows mount the same button
// wired to the same invoice unpost pair (Completed + posted) from
// useInvoiceWindow.js, so the wiring assertion lives here once.
//
// Usage (after rendering the window, inside the bulk-actions describe):
//
//   expectInvoiceBulkUnpostWiring(callFor);
//
// where `callFor(labelKey)` returns the props the window passed to the
// BulkDocumentActionButton mock for that label.
import { expect } from 'vitest';
import { screen } from '@testing-library/react';
import { buildInvoiceUnpostActions, invoiceUnpostRowFilter } from '../../useInvoiceWindow.js';

/**
 * Asserts the bulk unpost button is mounted and wired to the invoice unpost
 * pair: a neoAction button whose actions and row filter are the shared invoice
 * ones, with no pre-unpost step (that belongs to Reactivar, not to Unpost).
 *
 * @param {(labelKey: string) => object | undefined} callFor - looks up the props
 *   the window passed to the bulk-action button for a given labelKey.
 */
export function expectInvoiceBulkUnpostWiring(callFor) {
  expect(screen.getByTestId('bulk-document-action-unpost')).toBeInTheDocument();
  const unpost = callFor('unpost');
  expect(unpost.actionMode).toBe('neoAction');
  expect(unpost.buildActions).toBe(buildInvoiceUnpostActions);
  expect(unpost.rowFilter).toBe(invoiceUnpostRowFilter);
  expect(unpost.preUnpostActions).toBeUndefined();
}
