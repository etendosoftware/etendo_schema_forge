// @covers artifacts/sales-quotation/custom/QuotationTopbarActions.jsx
// The form's Confirmar dispatches `sales-quotation:open-confirm-modal`, and this component picks the
// modal by the quotation's status. Imported through the @generated alias because
// artifacts/sales-quotation/custom/ is outside vitest's src/** include (same reason as
// QuotationConfirmModal.goToDoc.vitest.jsx); the only other test of this file reads its source.

vi.mock('@/i18n', () => ({ useMenuLabel: () => (key) => key }));
vi.mock('@/windows/custom/shared/useQuotationPdf.js', () => ({
  useQuotationPdf: () => ({ pdfUrl: null, loading: false, error: null }),
}));
vi.mock('@/components/contract-ui/SendDocumentModal', () => ({ default: () => <div data-testid="send-modal" /> }));
vi.mock('@generated/sales-quotation/custom/QuotationConfirmModal', () => ({
  default: () => <div data-testid="quotation-confirm-modal" />,
}));
vi.mock('@generated/sales-quotation/custom/SendToEvaluationModal', () => ({
  default: () => <div data-testid="send-to-eval-modal" />,
}));
vi.mock('@generated/sales-quotation/custom/RejectQuotationModal', () => ({
  default: () => <div data-testid="reject-modal" />,
}));

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QuotationTopbarActions from '@generated/sales-quotation/custom/QuotationTopbarActions';

function confirmFrom(documentStatus, { windowReadOnly = false } = {}) {
  render(
    <QuotationTopbarActions
      data={{ id: 'q-1', documentStatus }}
      recordId="q-1"
      token="tkn"
      apiBaseUrl="/sws/neo/sales-quotation"
      windowReadOnly={windowReadOnly}
    />,
  );
  act(() => { window.dispatchEvent(new CustomEvent('sales-quotation:open-confirm-modal')); });
}

describe('QuotationTopbarActions — which modal Confirmar opens', () => {
  for (const [documentStatus, expected] of [
    ['DR', 'send-to-eval-modal'],
    ['UE', 'quotation-confirm-modal'],
    ['CO', 'quotation-confirm-modal'],
    // Accepted by the customer from the portal: still converted into an order or an invoice here.
    ['ETGO_AC', 'quotation-confirm-modal'],
    ['CA', null],
  ]) {
    it(`opens ${expected ?? 'nothing'} on ${documentStatus}`, () => {
      confirmFrom(documentStatus);

      for (const testId of ['send-to-eval-modal', 'quotation-confirm-modal']) {
        if (testId === expected) expect(screen.getByTestId(testId)).toBeInTheDocument();
        else expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
      }
    });
  }

  it('opens nothing under the read-only tier, even on an accepted quotation', () => {
    confirmFrom('ETGO_AC', { windowReadOnly: true });

    expect(screen.queryByTestId('quotation-confirm-modal')).not.toBeInTheDocument();
  });
});
