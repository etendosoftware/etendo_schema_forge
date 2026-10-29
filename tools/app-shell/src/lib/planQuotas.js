// ETP-5051 — relative imports only: `backendErrors.js` imports this module and is loaded by plain
// `node --test`, which does not resolve the `@/` alias.
import { formatGroupedNumber } from './formatCurrency.js';

/**
 * ETP-5051 — the plan quota item (`QuotaItem`) the backend sends in three places, and what the SPA
 * derives from it. One shape everywhere:
 *
 * - `GET /sws/go/billing/subscription` → `planQuotas[]`, every active quota of the plan (/account);
 * - `GET /sws/go/environments` → each environment's `quotas[]`, only its WARN/DENY items (the
 *   in-environment banner; contract §4b). `POST /sws/go/session/environment` sends the same list,
 *   but core's `loginEnvironment()` discards that answer, so the SPA reads the environment list;
 * - a NEO write refused with 403 `error.code === 'QUOTA_EXCEEDED'` → `error.quota`, or, inside a
 *   `/sws/neo/batch` failure envelope, `error.detail.error.quota` (contract §4d).
 *
 * Keys read: `resourceName` (catalog display name), `unitLabel` (may be null), `includedQty`,
 * `consumed` (null = not measured yet), `verdict` (`ALLOW` | `WARN` | `DENY` | null),
 * `period` (`month` | `year` | null — the plan's billing interval, which is the quota's consumption
 * window, so a quota on a yearly plan is a yearly quota, `open-and-notable-topics.md` §5.8),
 * `periodStart` / `periodEnd` (the counted window, date-only `yyyy-MM-dd` strings, shown through
 * `formatCalendarDate`).
 *
 * Every user-visible sentence is a `genericLabels` key interpolated with the catalog name and unit:
 * never a per-resource key, because the resources are catalog rows an operator can add.
 */

export const QUOTA_VERDICT_WARN = 'WARN';
export const QUOTA_VERDICT_DENY = 'DENY';

/** The 403 `error.code` of a NEO write refused because a plan quota is exhausted. */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

/**
 * The 500 `error.code` of a NEO write that was not saved because the quota check itself failed
 * (e.g. a database error while measuring consumption). Nothing was written; retrying is safe.
 */
export const QUOTA_CHECK_FAILED_CODE = 'QUOTA_CHECK_FAILED';

const PERIOD_KEYS = { month: 'quotaPeriodMonth', year: 'quotaPeriodYear' };

/**
 * Window event announcing that a write was refused with 403 QUOTA_EXCEEDED. The app-level
 * `useEnvironmentListFreshness` (mounted once, in `AppLayoutInner`) answers it with ONE shared
 * re-read of `GET /sws/go/environments`, so the quota banner turns red right after the refusal
 * instead of at the next login. Listeners never receive the quota itself; the list is the source.
 */
export const QUOTA_REFUSED_EVENT = 'etendo:quota-refused';

/** How long one refusal (same resource and counts) is announced only once. */
export const QUOTA_REFUSAL_ANNOUNCE_WINDOW_MS = 30_000;

const announcedRefusals = new Map();

function signatureCount(value) {
  if (value === null || value === undefined) return '';
  return hasNumber(value) ? String(Number(value)) : String(value).trim();
}

/**
 * The identity of one refusal, the same whichever form it was read from. The structured body
 * carries `resourceKey`, `resourceName` and numeric counts; the prose parser
 * (`matchQuotaExceededMessage` in `backendErrors.js`) recovers only the name and the counts, as
 * strings. The backend writes that name as `resourceName`, else `resourceKey`
 * (`QuotaItemJson.refusalMessage`), which is exactly `quotaResourceLabel`; the counts are compared
 * as numbers, so `100`, `"100"` and a decimal column's `"100.00"` agree. Two different resources
 * with the same catalog name share a signature: one re-read covers both, since it re-reads the
 * whole list.
 */
function refusalSignature(quota) {
  return [quotaResourceLabel(quota) ?? '', signatureCount(quota?.consumed), signatureCount(quota?.includedQty)]
    .join('|');
}

/**
 * Announces a QUOTA_EXCEEDED refusal ({@link QUOTA_REFUSED_EVENT}). Called from the one place
 * every path that classifies the refusal goes through — `translateQuotaExceeded` in
 * `backendErrors.js` (useEntity saves, RecordCreateModal, the OCR batch, and every caller that
 * only forwards the message prose). That function also runs when an already-shown error renders
 * again, so the same refusal (same resource and counts) is announced at most once per
 * {@link QUOTA_REFUSAL_ANNOUNCE_WINDOW_MS}: a re-render can never turn into a stream of reads.
 * A refusal with the same counts after the window means nothing changed meanwhile, so a later
 * re-read is harmless. A no-op outside a browser (plain `node --test`).
 */
export function announceQuotaRefusal(quota, now = Date.now()) {
  if (!quota || typeof globalThis.dispatchEvent !== 'function' || typeof Event !== 'function') return;
  const signature = refusalSignature(quota);
  const last = announcedRefusals.get(signature);
  if (last !== undefined && now - last < QUOTA_REFUSAL_ANNOUNCE_WINDOW_MS) return;
  announcedRefusals.set(signature, now);
  globalThis.dispatchEvent(new Event(QUOTA_REFUSED_EVENT));
}

// Quotas are counts in practice, but INCLUDED_QTY is a DECIMAL column: keep up to two decimals
// rather than rounding a fractional quantity away.
const QUANTITY_FORMAT = { maximumFractionDigits: 2 };

function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * The name to show for a quota: the catalog `resourceName`, or its `resourceKey` when the name is
 * blank (a catalog row an operator left unnamed). `null` when neither is usable.
 */
export function quotaResourceLabel(item) {
  return nonBlank(item?.resourceName) ?? nonBlank(item?.resourceKey);
}

/** The quantity as the UI shows it: grouped with the instance-wide separators. */
export function formatQuotaQuantity(value) {
  return formatGroupedNumber(value, QUANTITY_FORMAT);
}

/** True when the measured consumption has reached the included quantity. */
export function isQuotaOverLimit(item) {
  return hasNumber(item?.consumed) && hasNumber(item?.includedQty)
    && Number(item.consumed) >= Number(item.includedQty);
}

/**
 * The state indicator key for one quota, or `null` when there is nothing to flag (ALLOW, not
 * evaluated, unknown verdict). A WARN item that has already reached its limit is a `warn`-mode
 * quota running over — the write is still allowed, so it reads "over the limit", not "reached".
 */
export function quotaStateKey(item) {
  if (item?.verdict === QUOTA_VERDICT_DENY) return 'quotaStateDeny';
  if (item?.verdict === QUOTA_VERDICT_WARN) {
    return isQuotaOverLimit(item) ? 'quotaStateOver' : 'quotaStateWarn';
  }
  return null;
}

/** `quotaPeriodMonth` / `quotaPeriodYear`, or null for a plan with no billing interval. */
export function quotaPeriodKey(item) {
  return PERIOD_KEYS[item?.period] ?? null;
}

/**
 * "87 of 100 Inv" — or "100 Inv included" when `consumed` is null (not measured yet: the caller
 * shows `quotaNotMeasured` next to it). A missing unit drops the unit slot instead of rendering it
 * empty. Returns '' when the item carries no included quantity.
 */
export function quotaUsageText(item, ui) {
  if (!item || !hasNumber(item.includedQty)) return '';
  const unit = nonBlank(item.unitLabel);
  const included = formatQuotaQuantity(item.includedQty);
  if (!hasNumber(item.consumed)) {
    return unit
      ? ui('quotaIncluded', { included, unit })
      : ui('quotaIncludedNoUnit', { included });
  }
  const consumed = formatQuotaQuantity(item.consumed);
  return unit
    ? ui('quotaUsage', { consumed, included, unit })
    : ui('quotaUsageNoUnit', { consumed, included });
}

/** {@link quotaUsageText} followed by the period ("… per year"), so a yearly quota reads yearly. */
export function quotaUsageWithPeriod(item, ui) {
  const usage = quotaUsageText(item, ui);
  const periodKey = quotaPeriodKey(item);
  if (!usage || !periodKey) return usage;
  return ui('quotaUsageInPeriod', { usage, period: ui(periodKey) });
}

/** The items the login banner reports: WARN and DENY only, DENY first. */
export function quotaAlertItems(quotas) {
  if (!Array.isArray(quotas)) return [];
  const alerts = quotas.filter((item) => item
    && (item.verdict === QUOTA_VERDICT_WARN || item.verdict === QUOTA_VERDICT_DENY)
    && quotaResourceLabel(item));
  return [
    ...alerts.filter((item) => item.verdict === QUOTA_VERDICT_DENY),
    ...alerts.filter((item) => item.verdict === QUOTA_VERDICT_WARN),
  ];
}

function quotaOf(error) {
  if (error?.code !== QUOTA_EXCEEDED_CODE) return null;
  return error.quota && typeof error.quota === 'object' ? error.quota : {};
}

/**
 * The quota of a 403 QUOTA_EXCEEDED write refusal, or `null` for any other body. Reads:
 * - the NEO envelope `{ error: { code, quota } }`, and the body already unwrapped (`{ code, quota }`);
 * - the `/sws/neo/batch` failure envelope `{ committed: false, error: { message, detail } }`, where
 *   `detail` is the refused operation's own NEO response, so the refusal sits at
 *   `error.detail.error` (contract §4d).
 */
export function extractQuotaExceeded(payload) {
  const error = payload?.error && typeof payload.error === 'object' ? payload.error : payload;
  return quotaOf(error) ?? quotaOf(error?.detail?.error) ?? null;
}

/**
 * True when the body is a QUOTA_CHECK_FAILED refusal: the check that guards a counted create
 * failed, so nothing was saved. Read from the same two places as {@link extractQuotaExceeded}:
 * the NEO envelope (or the unwrapped body) and, in a `/sws/neo/batch` failure envelope,
 * `error.detail.error`.
 */
export function isQuotaCheckFailed(payload) {
  const error = payload?.error && typeof payload.error === 'object' ? payload.error : payload;
  return error?.code === QUOTA_CHECK_FAILED_CODE
    || error?.detail?.error?.code === QUOTA_CHECK_FAILED_CODE;
}

/**
 * Session-scoped dismissal key for the quota banner. It names the reported verdicts, so a new
 * alert (another resource, or a WARN turning into a DENY) is shown again after a dismissal.
 */
export function quotaBannerDismissKey(clientId, items) {
  const signature = (Array.isArray(items) ? items : [])
    .map((item) => `${item.resourceKey || quotaResourceLabel(item)}=${item.verdict}`)
    .join(',');
  return `etendo:quota-warning-dismissed:${clientId || ''}:${signature}`;
}
