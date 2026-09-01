import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';

/**
 * ETP-5024 — persistent inline warning for the two Business-Partner blocking
 * conditions (credit limit exceeded / BP on hold) that used to surface only as an
 * auto-dismissing toast. Renders nothing until one of the two sources below reports
 * a condition, then stays visible — unlike a toast — until it is explicitly cleared.
 *
 * Rendered from `resolveHeaderContent` (detailViewHelpers.jsx) so DetailView.jsx
 * itself only has to widen its existing `resolveHeaderContent(...)` call with one
 * extra argument — see that file for why (DetailView.jsx is a governed God
 * Component: `.claude/hooks/check-detailview-growth.mjs` blocks it from growing).
 *
 * Two independent sources can raise the condition, so this component owns the
 * combined "is a banner currently active" state rather than either source owning
 * its own copy:
 *  - `calloutResult` (from `useCallout`) — set at BP-select time when the callout's
 *    `messages` include a match (see `lib/blockingBpConditions.js`). Cleared when a
 *    NEW `businessPartner` callout comes back WITHOUT the condition (the user picked
 *    a different, unblocked BP).
 *  - `blockingCondition` (from `useEntity`) — set when a Complete/process action is
 *    refused for an on-hold BP. Cleared (see `completionSignal`) when a completion
 *    action later succeeds.
 *
 * `completionSignal` (from `useEntity`, bumped on every successful completion) is
 * the one trigger that must clear a banner from EITHER source, so it is tracked via
 * its own ref-based "did it change" effect rather than folded into a plain value
 * comparison (0 → 0 must not look like a change on mount).
 *
 * `recordId` resets the banner when the user navigates to a different record — a
 * blocking condition on one document must never bleed into the next one opened.
 *
 * `currencyCode` — the document's currency (`data['currency$_identifier']`, with
 * the session-level fallback DetailView.jsx already resolves for line rows —
 * see `sessionCurrencyCode` there) — is threaded down so the `creditLimit`
 * condition's `amount` (see `lib/blockingBpConditions.js`) can be rendered through
 * the canonical `formatCurrency` util instead of the raw, unformatted backend
 * number. If the currency isn't available for some reason, the amount is dropped
 * entirely rather than shown unformatted (mirrors the `matchCashCloseNoConcept`
 * precedent in `lib/backendErrors.js`) — a banner that says "credit limit
 * exceeded" without the exact figure is still correct and useful.
 */
export function BlockingBpBanner({ calloutResult, blockingCondition, completionSignal, recordId, currencyCode }) {
  const [banner, setBanner] = useState(null);
  const completionSignalRef = useRef(completionSignal);

  useEffect(() => {
    setBanner(null);
  }, [recordId]);

  useEffect(() => {
    if (!calloutResult) return;
    const { triggerField, blockingCondition: calloutCondition } = calloutResult;
    if (calloutCondition) {
      setBanner(calloutCondition);
    } else if (triggerField === 'businessPartner') {
      setBanner(null);
    }
  }, [calloutResult]);

  useEffect(() => {
    if (blockingCondition) setBanner(blockingCondition);
  }, [blockingCondition]);

  useEffect(() => {
    if (completionSignalRef.current !== completionSignal) {
      completionSignalRef.current = completionSignal;
      setBanner(null);
    }
  }, [completionSignal]);

  if (!banner) return null;

  return (
    <InfoBanner tone="warning" icon={AlertTriangle} className="mb-4" data-testid="bp-blocking-banner">
      {resolveBannerText(banner, currencyCode)}
    </InfoBanner>
  );
}

/**
 * Builds the visible banner sentence. `onHold` messages carry no interpolated
 * number, so `banner.text` is shown as-is. `creditLimit` messages had their
 * trailing raw amount stripped out by `detectBlockingBpCondition` (see
 * `lib/blockingBpConditions.js`) — it is rebuilt here, through `formatCurrency`,
 * with an explicit space (the backend's own spacing is unreliable — that's the
 * root cause of this bug). When `currencyCode` isn't available, the amount is
 * dropped rather than shown unformatted.
 */
function resolveBannerText(banner, currencyCode) {
  if (banner.kind !== 'creditLimit' || banner.amount == null) return banner.text;
  if (!currencyCode) return banner.text;
  return `${banner.text} ${formatCurrency(currencyCode, banner.amount)}`;
}

export default BlockingBpBanner;
