// ETP-5315 QA fix (medium) — regression guard for a bug QA (and the coordinator,
// via live manual testing) confirmed independently of Alex's earlier review.
//
// `PurchaseOrderBulkActions` (tools/app-shell/src/windows/custom/purchase-order/index.jsx)
// renders TWO SEPARATE `BulkDocumentAction` instances side by side:
//   1. the pre-existing, unrelated CO-only one (`buildActions={buildInOutActions}`,
//      `labelKey="confirmBulk"`) — out of scope, works fine today, untouched here.
//   2. `PurchaseOrderReactivateBulkAction` (this ticket), which used to ALSO pass
//      `labelKey="confirmBulk"`.
//
// For a selection mixing at least one DRAFT row with at least one COMPLETED-unlinked
// row, BOTH buttons render simultaneously — one books (CO), the other reactivates
// (RE) — but before the fix they were LITERALLY IDENTICAL: both read "confirmBulk"
// ("Confirmar"/"Confirm"), indistinguishable to the user. The fix gives the
// reactivate button its own `reactivateBulk` label instead of reusing `confirmBulk`.
//
// `PurchaseOrderBulkActions` itself is not exported from index.jsx, so this test
// mounts the same two components it renders, in the same shape, side by side —
// mirroring the mounting/mocking pattern from BulkDocumentAction.vitest.jsx
// (tools/app-shell/src/components/contract-ui/__tests__/BulkDocumentAction.vitest.jsx)
// and this window's own index.vitest.jsx.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({
    execute: vi.fn().mockResolvedValue({}),
  }),
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
  Select: ({ children }) => <div data-testid="select">{children}</div>,
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span>val</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

vi.mock('@/components/ui/label.jsx', () => ({
  Label: ({ children }) => <label>{children}</label>,
}));

import BulkDocumentAction, { buildInOutActions } from '@/components/contract-ui/BulkDocumentAction';
import PurchaseOrderReactivateBulkAction from '@generated/purchase-order/custom/PurchaseOrderReactivateBulkAction';

// Same shape as the real (unexported) PurchaseOrderBulkActions in index.jsx —
// only the two BulkDocumentAction-family buttons matter for this regression,
// so BulkPurchaseOrderMoreMenu/CopyLinkButton are omitted.
function TestPurchaseOrderBulkActions(props) {
  return (
    <>
      <BulkDocumentAction {...props} buildActions={buildInOutActions} labelKey="confirmBulk" />
      <PurchaseOrderReactivateBulkAction {...props} />
    </>
  );
}

describe('PurchaseOrderBulkActions — no label collision between the CO-only and Reactivate buttons (ETP-5315)', () => {
  it('renders two buttons with DIFFERENT accessible names for a mixed DR + CO-unlinked selection', () => {
    const rows = [
      { id: 'po-draft', documentStatus: 'DR', hasLinkedDocuments: false },
      { id: 'po-completed-unlinked', documentStatus: 'CO', hasLinkedDocuments: false },
    ];

    render(
      <TestPurchaseOrderBulkActions
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        windowName="purchase-order"
      />,
    );

    const buttons = screen.getAllByRole('button');
    const names = buttons.map((b) => b.textContent);

    // Both buttons must be present...
    expect(names).toContain('confirmBulk');
    expect(names).toContain('reactivateBulk');
    // ...and, critically, must NOT collide: before the fix both read 'confirmBulk'.
    expect(names.filter((n) => n === 'confirmBulk')).toHaveLength(1);
    expect(new Set(names).size).toBe(names.length);
  });

  it('the CO-only button keeps its untouched confirmBulk label', () => {
    const rows = [
      { id: 'po-draft', documentStatus: 'DR', hasLinkedDocuments: false },
      { id: 'po-completed-unlinked', documentStatus: 'CO', hasLinkedDocuments: false },
    ];

    render(
      <TestPurchaseOrderBulkActions
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        windowName="purchase-order"
      />,
    );

    expect(screen.getByText('confirmBulk')).toBeInTheDocument();
  });

  it('the Reactivate button now uses the distinct reactivateBulk label, never confirmBulk', () => {
    const rows = [
      { id: 'po-draft', documentStatus: 'DR', hasLinkedDocuments: false },
      { id: 'po-completed-unlinked', documentStatus: 'CO', hasLinkedDocuments: false },
    ];

    render(
      <TestPurchaseOrderBulkActions
        selectedRows={rows}
        clearSelection={vi.fn()}
        token="tok"
        apiBaseUrl="/api"
        windowName="purchase-order"
      />,
    );

    expect(screen.getByText('reactivateBulk')).toBeInTheDocument();
  });
});
