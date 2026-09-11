// Shared stand-in for '@/components/contract-ui/SendDocumentModal.jsx', reused by
// every preview test suite (Invoice, Order, Quotation) that exercises the send flow.
//
// ETP-5069 — simulates the modal reporting a SUCCESSFUL send (its new `onSent`
// callback, which a cancel never reaches), so the panel's refresh wiring can be
// exercised without the real modal.
//
// Vitest hoists vi.mock() calls above imports, but a plain top-level `import` is
// hoist-safe too (hoisting only reorders vi.mock() calls, not module imports
// processed by the transform), so this component can be imported and referenced
// directly inside a vi.mock() factory. Usage in a test file:
//
//   import { SendDocumentModalMock } from './testUtils/sendDocumentModalMock.jsx';
//   vi.mock('@/components/contract-ui/SendDocumentModal.jsx', () => ({
//     default: SendDocumentModalMock,
//   }));
export function SendDocumentModalMock({ onClose, onSent, documentNo }) {
  return (
    <div data-testid="send-modal" data-docno={documentNo}>
      <button data-testid="send-modal-close" onClick={onClose}>
        Close Send
      </button>
      {onSent && (
        <button data-testid="send-modal-sent" onClick={() => onSent({ status: 'SENT' })}>
          Simulate Sent
        </button>
      )}
    </div>
  );
}
