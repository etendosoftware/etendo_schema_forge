import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { InfoBanner } from '@/components/InfoBanner.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { useCurrency } from '@/hooks/useCurrency';

/**
 * ETP-5024 — persistent inline warning for the two Business-Partner blocking
 * conditions (credit limit exceeded / BP on hold) that used to surface only as an
 * auto-dismissing toast. Renders nothing until one of the two sources below reports
 * a condition, then stays visible — unlike a toast — until it is explicitly cleared.
 *
 * Rendered from `resolveHeaderContent` (detailViewHelpers.jsx), which DetailView.jsx
 * calls unchanged — no new argument needed there (DetailView.jsx is a governed God
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
 * `recordId` resets the banner when the user navigates to a different document
 * — a blocking condition on one document must never bleed into the next one
 * opened, whether that "next one" is another existing record or a brand-new
 * draft. `DetailView.jsx` never remounts this component across any of those
 * transitions (`:windowName/:recordId` route keeps the same static React
 * Router `key`, only the param re-renders in place — verified by reading
 * `runtime-routes.jsx`), so a plain "clear on any recordId change" effect has
 * to tell "the user switched documents" apart from "the SAME in-progress
 * document just got assigned its first real id".
 *
 * That second case is trickier than it looks: `recordId` here is
 * `data?.id || recordId`, and the OUTER `recordId` is React Router's
 * `:recordId` param — which is the literal STRING `'new'` while creating a
 * document, never falsy/undefined (see `DetailView.jsx`'s own
 * `const isNew = recordId === 'new'`). A first fix here (ETP-5024) assumed
 * the pre-save value was falsy and only guarded a falsy → truthy transition;
 * live testing showed the banner still vanished on a plain Save because
 * `'new'` IS truthy, so `'new'` → `<real id>` still read as "two different
 * truthy ids → genuine switch" and wiped the banner every time. `isRealId()`
 * below excludes `'new'` explicitly, and `isFirstSaveOfNewRecord` is the one
 * transition — `'new'` becoming the id Save just assigned to that SAME
 * document — that must NOT clear. Every other change between two different
 * values (including a real id going back to `'new'` via "Nuevo", or one real
 * id switching to a different real id) still clears, exactly as before.
 *
 * `currencyCode` — the document's currency (`data['currency$_identifier']`, from
 * `resolveHeaderContent` in detailViewHelpers.jsx) — is threaded down so the
 * `creditLimit` condition's `amount` (see `lib/blockingBpConditions.js`) can be
 * rendered through the canonical `formatCurrency` util instead of the raw,
 * unformatted backend number. That prop is `null` on a brand-new, unsaved
 * document — `data` is `hook.editing` at that point (DetailView.jsx), which has
 * no `currency$_identifier` yet — so this component falls back to `useCurrency()`
 * (the same session-level currency DetailView.jsx already uses for line rows,
 * via its own `sessionCurrencyCode`) rather than threading one more prop through
 * DetailView.jsx, a governed God Component
 * (`.claude/hooks/check-detailview-growth.mjs` blocks it from growing). If
 * NEITHER source has a currency code, the amount is still shown, unformatted,
 * rather than dropped — mirrors the `matchCashCloseNoConcept` precedent in
 * `lib/backendErrors.js` in spirit (never silently discard a real figure), but
 * that precedent re-interpolates its value when it has one, it doesn't drop it;
 * dropping the number entirely would leave a banner that reads like a truncated
 * sentence with no amount at all.
 */
export function BlockingBpBanner({ calloutResult, blockingCondition, completionSignal, recordId, currencyCode }) {
  const [banner, setBanner] = useState(null);
  const completionSignalRef = useRef(completionSignal);
  const prevRecordIdRef = useRef(recordId);
  const sessionCurrencyCode = useCurrency();
  const effectiveCurrencyCode = currencyCode ?? sessionCurrencyCode ?? null;

  useEffect(() => {
    const prevRecordId = prevRecordIdRef.current;
    prevRecordIdRef.current = recordId;
    const isRealId = id => id != null && id !== 'new';
    const prevStr = prevRecordId != null ? String(prevRecordId) : prevRecordId;
    const nextStr = recordId != null ? String(recordId) : recordId;
    // The one transition that must NOT clear: the sentinel 'new' becoming the
    // real id Save just assigned to that SAME in-progress document.
    const isFirstSaveOfNewRecord = prevStr === 'new' && isRealId(nextStr);
    if (prevStr && nextStr && prevStr !== nextStr && !isFirstSaveOfNewRecord) {
      setBanner(null);
    }
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
      {resolveBannerText(banner, effectiveCurrencyCode)}
    </InfoBanner>
  );
}

/**
 * Builds the visible banner sentence. `onHold` messages carry no interpolated
 * number, so `banner.text` is shown as-is. `creditLimit` messages had their
 * trailing raw amount stripped out by `detectBlockingBpCondition` (see
 * `lib/blockingBpConditions.js`) — it is rebuilt here, through `formatCurrency`,
 * with an explicit space (the backend's own spacing is unreliable — that's the
 * root cause of this bug). When `currencyCode` isn't available (both the header
 * data and the session-level `useCurrency()` fallback came back empty), the raw
 * unformatted number is still shown — never dropped — so the sentence never
 * reads as truncated.
 */
function resolveBannerText(banner, currencyCode) {
  if (banner.kind !== 'creditLimit' || banner.amount == null) return banner.text;
  if (!currencyCode) return `${banner.text} ${banner.amount}`;
  return `${banner.text} ${formatCurrency(currencyCode, banner.amount)}`;
}

export default BlockingBpBanner;
