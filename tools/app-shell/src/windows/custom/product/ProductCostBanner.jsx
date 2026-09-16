import { AlertTriangle } from 'lucide-react';
import { InfoBanner } from '@/components/InfoBanner';
import { useUI } from '@/i18n';
import { isProductMissingRequiredCost } from '@/lib/productCostRequirement.js';

/**
 * Warns that a saved product has no cost defined (ETP-5245).
 *
 * Advisory only. It used to accompany a hard save-block in `useEntity`'s save gate, and the
 * banner re-opened itself through the save-block bus every time that block fired. The block was
 * removed by product decision — a missing cost must not stop someone from editing the product's
 * name — so there is nothing left to re-open it and the `reopenSignal` wiring is gone with it.
 * Dismissing the banner now keeps it dismissed until the record is re-read, which is the normal
 * contract for an `InfoBanner`.
 */
export default function ProductCostBanner({ data }) {
  const ui = useUI();
  if (!isProductMissingRequiredCost('product', data)) return null;
  return (
    <InfoBanner
      tone="warning"
      icon={AlertTriangle}
      className="mb-4"
      data-testid="product-cost-banner"
    >
      {ui('productCostRequired')}
    </InfoBanner>
  );
}
