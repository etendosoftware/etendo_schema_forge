// Test double for '@/components/contract-ui/ConfirmInOutModal', shared by
// return-material-receipt's and return-to-vendor-shipment's ConfirmWithCreditButton.spec.jsx:
//   vi.mock('@/components/contract-ui/ConfirmInOutModal', () => import('<path>/confirmInOutModalProbe.jsx'));
// It exposes the props each wrapper is responsible for forwarding (spec/entity names,
// the confirm label) as data attributes, so the event-driven flow can assert the wiring.
export default function ConfirmInOutModalProbe({ specName, entityName, confirmLabel }) {
  return (
    <div
      data-testid="confirm-inout-modal"
      data-spec-name={specName}
      data-entity-name={entityName}
      data-confirm-label={confirmLabel}
    />
  );
}
