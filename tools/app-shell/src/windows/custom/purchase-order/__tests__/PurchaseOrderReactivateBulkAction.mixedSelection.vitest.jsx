// ETP-5315 / ETP-5302 — real render+interaction test for
// PurchaseOrderReactivateBulkAction's `rowFilter` contract, complementing the
// source-reading assertions in
// artifacts/purchase-order/custom/__tests__/PurchaseOrderReactivateBulkAction.test.js
// (which cannot render JSX). Vitest's include glob is scoped to `src/**` relative
// to tools/app-shell, so a `.vitest.jsx` render test for a component living under
// `artifacts/` must be placed here instead — mirroring the note already left in
// that source-reading test file, and the sibling
// PurchaseOrderBulkActions.singleProcessButton.vitest.jsx in this same directory.
//
// Proves end-to-end, through a REAL render (mocking only BulkDocumentAction's
// external deps, per the pattern in
// tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx),
// that for a selection mixing a COMPLETED-linked row and a COMPLETED-unlinked row:
//   - the bar still offers Reactivar (the unlinked row makes it eligible)
//   - executing it only calls the action for the unlinked row's id
//   - the linked row is pre-blocked (never sent to the API) and reported as
//     `omitted` with the `cannotReactivateLinkedDocs` message — not as `failed`.
//
// ETP-5302 changed only HOW that flow is reached, not the contract it asserts: the
// button is now the window's single "Procesar" (`labelKey="process"`) and Reactivar
// is an entry in its dropdown, instead of a second, dedicated "Reactivar" button
// with its own `reactivateBulk` label. For this completed-only selection the
// component's default action builder offers RE alone, so it is already the selected
// action when the dialog opens — the dropdown assertion below pins that down, which
// is also the user-reported case "select one Completada → the dropdown must offer
// Reactivar".

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: mockExecute }),
}));

vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: vi.fn(), loading: false }),
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...props }) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/select.jsx', () => ({
  Select: ({ children, value }) => <div data-testid="select" data-value={value ?? ''}>{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span>val</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

vi.mock('@/components/ui/label.jsx', () => ({
  Label: ({ children }) => <label>{children}</label>,
}));

import PurchaseOrderReactivateBulkAction from '@generated/purchase-order/custom/PurchaseOrderReactivateBulkAction';

const STORAGE_KEY = 'bulkActionResult';

describe('PurchaseOrderReactivateBulkAction — mixed completed-linked + completed-unlinked selection (ETP-5315)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockResolvedValue({});
    sessionStorage.clear();
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
      configurable: true,
    });
  });

  const rows = [
    { id: 'po-linked', documentNo: 'PO-LINKED', documentStatus: 'CO', hasLinkedDocuments: true },
    { id: 'po-unlinked', documentNo: 'PO-UNLINKED', documentStatus: 'CO', hasLinkedDocuments: false },
  ];

  const renderBar = () => render(
    <PurchaseOrderReactivateBulkAction
      selectedRows={rows}
      clearSelection={vi.fn()}
      token="tok"
      apiBaseUrl="/api"
      windowName="purchase-order"
    />,
  );

  it('renders the single "Procesar" button (the unlinked completed row makes the selection eligible)', () => {
    renderBar();

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent('process');
  });

  it('offers Reactivate (RE) in the dropdown, already selected for a completed-only selection', () => {
    renderBar();
    fireEvent.click(screen.getByText('process'));

    const options = [...screen.getByTestId('select').querySelectorAll('option')];
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['RE']);
    expect(options.map((o) => o.textContent)).toEqual(['reactivate']);
    expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'RE');
  });

  it('executing Reactivate calls the action only for the unlinked row, omitting the linked one', async () => {
    renderBar();

    // Open the "Procesar" dialog. RE is the only action this selection yields, so it
    // is the one already selected; the dropdown itself is asserted in the test above.
    fireEvent.click(screen.getByText('process'));
    // ETP-5302 renamed the dialog's confirm button from `done` ("Completado", the
    // name of a document state) to `accept` ("Aceptar").
    fireEvent.click(screen.getByText('accept'));

    await waitFor(() => expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull());

    // Only the unlinked row's id was ever sent to the API.
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith('po-unlinked', 'RE');
    expect(mockExecute).not.toHaveBeenCalledWith('po-linked', expect.anything());

    const { ok, omitted, failed } = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    expect(ok).toBe(1);
    expect(failed).toEqual([]);
    // Pre-blocked by rowFilter, never attempted — reported as omitted, not failed.
    expect(omitted).toEqual([{ documentNo: 'PO-LINKED', message: 'cannotReactivateLinkedDocs' }]);

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled(), { timeout: 3000 });
  });
});
