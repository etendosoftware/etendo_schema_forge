// ETP-5051 — relative imports only: `backendErrors.js` imports this module and is loaded by plain
// `node --test`, which does not resolve the `@/` alias.
import { formatGroupedNumber } from './formatCurrency.js';

/**
 * ETP-5051 — the plan quota item (`QuotaItem`) the backend sends in three places, and what the SPA
 * derives from it. One shape everywhere:
 *
 * - `GET /sws/go/billing/subscription` → `planQuotas[]`, every active quota of the plan (/account);
 * - `POST /sws/go/session/environment` → `quotas[]`, only the WARN/DENY items (the login banner);
 * - a NEO write refused with 403 `error.code === 'QUOTA_EXCEEDED'` → `error.quota`.
 *
 * Keys read: `resourceName` (catalog display name), `unitLabel` (may be null), `includedQty`,
 * `consumed` (null = not measured yet), `verdict` (`ALLOW` | `WARN` | `DENY` | null),
 * `period` (`month` | `year` | null — the plan's billing interval, which is the quota's consumption
 * window, so a quota on a yearly plan is a yearly quota, `open-and-notable-topics.md` §5.8),
 * `periodStart` / `periodEnd` (the subscription's current period).
 *
 * Every user-visible sentence is a `genericLabels` key interpolated with the catalog name and unit:
 * never a per-resource key, because the resources are catalog rows an operator can add.
 */

export const QUOTA_VERDICT_WARN = 'WARN';
export const QUOTA_VERDICT_DENY = 'DENY';

/** The 403 `error.code` of a NEO write refused because a plan quota is exhausted. */
export const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED';

const PERIOD_KEYS = { month: 'quotaPeriodMonth', year: 'quotaPeriodYear' };

// Quotas are counts in practice, but INCLUDED_QTY is a DECIMAL column: keep up to two decimals
// rather than rounding a fractional quantity away.
const QUANTITY_FORMAT = { maximumFractionDigits: 2 };

function hasNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
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
    && nonBlank(item.resourceName));
  return [
    ...alerts.filter((item) => item.verdict === QUOTA_VERDICT_DENY),
    ...alerts.filter((item) => item.verdict === QUOTA_VERDICT_WARN),
  ];
}

/**
 * The quota of a 403 QUOTA_EXCEEDED write refusal, or `null` for any other body. Reads the NEO
 * envelope `{ error: { code, quota } }` and tolerates the body arriving already unwrapped
 * (`{ code, quota }`).
 */
export function extractQuotaExceeded(payload) {
  const error = payload?.error && typeof payload.error === 'object' ? payload.error : payload;
  if (error?.code !== QUOTA_EXCEEDED_CODE) return null;
  return error.quota && typeof error.quota === 'object' ? error.quota : {};
}

// ── The login-time quota stash ───────────────────────────────────────────────────────────────
//
// `POST /sws/go/session/environment` answers `quotas`, and every caller follows it with a full
// page load (the session rotated, so every per-tenant cache must go). The answer therefore has to
// cross that navigation: it is kept in sessionStorage, per client, and read by `QuotaStatusBanner`.
// sessionStorage, not localStorage: the verdicts are evaluated at entry and go stale with the
// session; a tab that never entered shows nothing, which is the report-only contract's safe side.

const QUOTA_STASH_PREFIX = 'etendo:environment-quotas:';

export function environmentQuotasStorageKey(clientId) {
  return `${QUOTA_STASH_PREFIX}${clientId || ''}`;
}

/**
 * Records the `quotas` of an environment-entry answer. An answer without the field (a backend that
 * predates ETP-5051) clears the entry, so an earlier entry's verdicts are never shown as current.
 * Never throws: storage can be missing or blocked, and the banner is a convenience.
 */
export function rememberEnvironmentQuotas(clientId, quotas) {
  if (!clientId) return;
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    const alerts = quotaAlertItems(quotas);
    if (alerts.length === 0) {
      storage.removeItem(environmentQuotasStorageKey(clientId));
    } else {
      storage.setItem(environmentQuotasStorageKey(clientId), JSON.stringify(alerts));
    }
  } catch {
    // Nothing to do: the banner simply does not show.
  }
}

/** The stashed WARN/DENY items for this client, `[]` when there are none or storage fails. */
export function readEnvironmentQuotas(clientId) {
  if (!clientId) return [];
  try {
    const raw = globalThis.sessionStorage?.getItem(environmentQuotasStorageKey(clientId));
    return raw ? quotaAlertItems(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/**
 * Session-scoped dismissal key for the quota banner. It names the reported verdicts, so a new
 * alert (another resource, or a WARN turning into a DENY) is shown again after a dismissal.
 */
export function quotaBannerDismissKey(clientId, items) {
  const signature = (Array.isArray(items) ? items : [])
    .map((item) => `${item.resourceKey || item.resourceName}=${item.verdict}`)
    .join(',');
  return `etendo:quota-warning-dismissed:${clientId || ''}:${signature}`;
}
