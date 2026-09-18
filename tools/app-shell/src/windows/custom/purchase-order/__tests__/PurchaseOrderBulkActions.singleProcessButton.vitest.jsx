// ETP-5302 — ONE "Procesar" button for the whole Purchase Order selection bar.
//
// HISTORY (why this file was rewritten). It used to be
// PurchaseOrderBulkActions.labelCollision.vitest.jsx: ETP-5315 reintroduced bulk
// Reactivate for Purchase Order as a SECOND BulkDocumentAction mounted beside the
// pre-existing CO-only one, so a mixed draft + completed selection rendered two
// buttons that both read "Confirmar" (`confirmBulk`). That ticket fixed the symptom
// by inventing a separate `reactivateBulk` label — its own comment said as much
// ("sales-order never hits this because it has no second BulkDocumentAction to
// collide with").
//
// ETP-5302 removes the premise instead: this window now mounts a SINGLE
// document-action button ("Procesar", `labelKey="process"`) and the user picks
// Confirmar and/or Reactivar inside its dialog — the shape sales-order, the
// invoices and the shipments already use. Two buttons can no longer carry the same
// name because there is only one, so the collision assertions were deleted rather
// than adapted, along with the `reactivateBulk` key they were built around (now
// gone from en_US / es_ES / es_AR).
//
// What this file guards INSTEAD is exactly what the user reported on screen:
//   - a COMPLETED-ONLY selection shows "Procesar", never "Reactivar", and offers
//     Reactivar inside the dropdown;
//   - a MIXED draft + completed selection shows exactly ONE button, still
//     "Procesar", whose dropdown offers BOTH Confirmar and Reactivar.
//
// Scope split: "only one component is mounted in the bar" is a source-level fact
// about index.jsx, asserted in ./PurchaseOrderBulkActionLabel.test.js and in
// artifacts/purchase-order/custom/__tests__/PurchaseOrderNoReactivate.test.js.
// This file renders what that slot mounts and asserts what the user actually sees.

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn().mockResolvedValue({}) }),
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

// Richer than the usual Select stub in the sibling specs: the real shadcn Select is
// a portal-based listbox, so a test cannot pick an option through it. This stub
// keeps the same shape (a <div data-testid="select"> whose SelectItems render as
// <option>) and additionally routes a click on an option back into the component's
// own `onValueChange`, which is how a user switches Confirmar → Reactivar in a mixed
// selection. `data-value` mirrors the component's `selectedAction` state, so the
// effect of that pick is observable without having to execute the action.
const { selectStub } = vi.hoisted(() => ({ selectStub: { onValueChange: null } }));
vi.mock('@/components/ui/select.jsx', () => ({
  Select: ({ children, value, onValueChange }) => {
    selectStub.onValueChange = onValueChange;
    return <div data-testid="select" data-value={value ?? ''}>{children}</div>;
  },
  SelectTrigger: ({ children }) => <div>{children}</div>,
  SelectValue: () => <span>val</span>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => (
    <option value={value} onClick={() => selectStub.onValueChange?.(value)}>{children}</option>
  ),
}));

vi.mock('@/components/ui/label.jsx', () => ({
  Label: ({ children }) => <label>{children}</label>,
}));

import PurchaseOrderReactivateBulkAction from '@generated/purchase-order/custom/PurchaseOrderReactivateBulkAction';

// The bar's one and only document-action button — what index.jsx's
// PurchaseOrderBulkActions renders between BulkPurchaseOrderMoreMenu and
// CopyLinkButton, neither of which is a BulkDocumentAction and neither of which
// takes part in this contract.
const BASE_PROPS = {
  clearSelection: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
  windowName: 'purchase-order',
};

const DRAFT_ROW = { id: 'po-draft', documentNo: 'PO-DR-001', documentStatus: 'DR', hasLinkedDocuments: false };
const COMPLETED_ROW = { id: 'po-completed', documentNo: 'PO-CO-001', documentStatus: 'CO', hasLinkedDocuments: false };

const renderBar = (rows) => render(<PurchaseOrderReactivateBulkAction {...BASE_PROPS} selectedRows={rows} />);

// The mocked useUI is the identity function, so the rendered text IS the i18n key:
// 'process' is "Procesar", 'confirm' is "Confirmar", 'reactivate' is "Reactivar".
const openDialog = () => fireEvent.click(screen.getByText('process'));
const dropdownOptions = () => [...screen.getByTestId('select').querySelectorAll('option')];

describe('PurchaseOrderBulkActions — one "Procesar" button, actions chosen in its dropdown (ETP-5302)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectStub.onValueChange = null;
  });

  describe('mixed draft + completed selection (the two-button symptom)', () => {
    it('renders exactly ONE action button, and it is labelled process', () => {
      renderBar([DRAFT_ROW, COMPLETED_ROW]);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveTextContent('process');
    });

    it('never renders the retired confirmBulk / reactivateBulk labels', () => {
      renderBar([DRAFT_ROW, COMPLETED_ROW]);

      expect(screen.queryByText('confirmBulk')).not.toBeInTheDocument();
      expect(screen.queryByText('reactivateBulk')).not.toBeInTheDocument();

      openDialog();
      expect(screen.queryByText('confirmBulk')).not.toBeInTheDocument();
      expect(screen.queryByText('reactivateBulk')).not.toBeInTheDocument();
    });

    it('offers BOTH confirm (CO) and reactivate (RE) inside the single dialog', () => {
      renderBar([DRAFT_ROW, COMPLETED_ROW]);
      openDialog();

      const options = dropdownOptions();
      expect(options.map((o) => o.getAttribute('value'))).toEqual(['CO', 'RE']);
      expect(options.map((o) => o.textContent)).toEqual(['confirm', 'reactivate']);
    });

    it('preselects the first action and lets the user switch to Reactivar', () => {
      renderBar([DRAFT_ROW, COMPLETED_ROW]);
      openDialog();

      expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'CO');

      fireEvent.click(screen.getByText('reactivate'));
      expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'RE');
    });
  });

  describe('completed-only selection (the "Reactivar" button symptom)', () => {
    it('labels the button process, not reactivate', () => {
      renderBar([COMPLETED_ROW]);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveTextContent('process');
      expect(screen.queryByText('reactivate')).not.toBeInTheDocument();
      expect(screen.queryByText('reactivateBulk')).not.toBeInTheDocument();
    });

    it('offers reactivate (RE) as the only dropdown action, already selected', () => {
      renderBar([COMPLETED_ROW]);
      openDialog();

      const options = dropdownOptions();
      expect(options.map((o) => o.getAttribute('value'))).toEqual(['RE']);
      expect(options.map((o) => o.textContent)).toEqual(['reactivate']);
      expect(screen.getByTestId('select')).toHaveAttribute('data-value', 'RE');
    });
  });

  describe('draft-only selection (unchanged by the merge)', () => {
    it('keeps a single process button offering confirm (CO) only', () => {
      renderBar([DRAFT_ROW]);

      expect(screen.getAllByRole('button')).toHaveLength(1);
      openDialog();

      const options = dropdownOptions();
      expect(options.map((o) => o.getAttribute('value'))).toEqual(['CO']);
      expect(options.map((o) => o.textContent)).toEqual(['confirm']);
    });
  });

  describe('edge cases', () => {
    it('renders nothing when no row is selected', () => {
      const { container } = renderBar([]);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when no selected row has an applicable action (voided rows)', () => {
      const { container } = renderBar([{ id: 'po-void', documentStatus: 'VO', hasLinkedDocuments: false }]);
      expect(container.innerHTML).toBe('');
    });
  });
});
