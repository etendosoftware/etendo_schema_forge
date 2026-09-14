import { AlertTriangle } from 'lucide-react';
import { InfoBanner } from '@/components/InfoBanner';
import { useUI } from '@/i18n';
import { isProductMissingRequiredCost } from '@/lib/productCostRequirement.js';
import { useSaveBlockSignal } from '@/hooks/useSaveBlockSignal.js';

/**
 * Blocking warning shown on a stockable product that has no cost defined (ETP-5245).
 *
 * Mounted through `window.customComponents.subHeader`, so it renders as a full-width strip
 * between the toolbar and the form — the same place, and the same `InfoBanner` primitive, as the
 * "credit limit exceeded" notice on Sales Invoice. The one deliberate difference is the tone:
 * amber (`warning`) rather than that banner's blue (`info`), because this one also blocks saving.
 *
 * The banner is the visible half of the rule; the enforcing half is the save gate in
 * `useEntity.performSave`. Both read the same predicate, so they can never disagree about whether
 * a product is blocked. It disappears on its own as soon as a cost line exists, because the
 * backend re-emits `etgoHasCost` on the next read of the record.
 *
 * ETP-5245 — the user can close it (every `InfoBanner` is dismissible now), but closing an
 * explanation of a BLOCK must not leave the user stuck without one: `reopenSignal` is a counter
 * that the save gate bumps through the save-block bus every time it actually refuses a save for
 * this reason, and a fresh value re-opens the banner. The id is the save gate's own stable toast
 * id, so the banner and the toast can never disagree about which refusal just happened. Note that
 * the product window autosaves on blur, so a dismissed banner comes back on the next field the
 * user leaves — which is the point: the block is still there.
 */
export default function ProductCostBanner({ data }) {
  const ui = useUI();
  const reopenSignal = useSaveBlockSignal('product-cost-required');
  if (!isProductMissingRequiredCost('product', data)) return null;
  return (
    <InfoBanner
      tone="warning"
      icon={AlertTriangle}
      className="mb-4"
      reopenSignal={reopenSignal}
      data-testid="product-cost-banner"
    >
      {ui('productCostRequired')}
    </InfoBanner>
  );
}
