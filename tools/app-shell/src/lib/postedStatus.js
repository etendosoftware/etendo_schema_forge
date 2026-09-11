/**
 * AD "Posted status" domain (AD_Reference 234) — the `Posted` column that every
 * accountable table carries (`M_MatchInv`, `C_Invoice`, `M_InOut`, …).
 *
 * <p>The column is NOT a boolean: it holds 17 distinct codes, and only `Y`/`N` mean
 * "posted"/"not posted". Every other code is the REASON a posting attempt did not
 * succeed — `i` (invalid account), `E` (error), `p` (period closed), … — and those are
 * the majority of real rows, not an edge case.
 *
 * Windows declare the field as `"type": "boolean"` in `decisions.json` (a display-type
 * override, not a value coercion — see `resolve-curated.js`), so both renderers used to
 * apply their own hardcoded `'Y'`/`'N'` allowlist and disagreed on everything else: the
 * grid printed a bare "—" while the detail pill claimed "Not posted". A record whose
 * posting FAILED therefore read as one that was merely never attempted, hiding the
 * reason — the defect this registry exists to close (ETP-5075).
 *
 * Only the non-`Y`/`N` codes are resolved here. `Y`/`N` deliberately return `null` so
 * each caller keeps its existing path for them (the grid its `badgeLabels`, the detail
 * its `statusPills` `trueKey`/`falseKey`), which is what guarantees the windows already
 * shipped — `goods-receipt`, `purchase-invoice`, `sales-invoice` — do not change at all
 * in their normal operation.
 *
 * Keyed by AD column name, the same way `fkNavigation.js` keys its own registry, and it
 * fails closed: an unlisted column resolves to `null` and nothing changes.
 */

/**
 * Identifiers that carry this domain. Both spellings are registered on purpose: the grid
 * passes the AD column name (`col.column`, from the contract), while a `statusPills`
 * entry only carries the apiKey (`b.key`) — the generator does not emit `column` in the
 * `extraBadges` array, and adding it there would need a core release.
 */
const POSTED_STATUS_COLUMNS = new Set(['Posted', 'posted']);

/**
 * Code → i18n key + tones. Codes are CASE-SENSITIVE and the case is meaningful:
 * `Y` (posted) vs `y` (post prepared), `C` (error, no cost) vs `c` (not convertible),
 * `D` (document disabled) vs `d` (disabled for background). Never upper/lower-case a
 * code before looking it up here.
 *
 * Tones: a code that means "the posting failed and a human must act" is `destructive`;
 * a code that only means "posting is switched off / not attempted yet" is `neutral`.
 */
const POSTED_STATUS = {
  E:  { labelKey: 'postedStatusError',              tone: 'destructive', variant: 'red' },
  C:  { labelKey: 'postedStatusErrorNoCost',        tone: 'destructive', variant: 'red' },
  i:  { labelKey: 'postedStatusInvalidAccount',     tone: 'destructive', variant: 'red' },
  b:  { labelKey: 'postedStatusNotBalanced',        tone: 'destructive', variant: 'red' },
  c:  { labelKey: 'postedStatusNotConvertible',     tone: 'destructive', variant: 'red' },
  NC: { labelKey: 'postedStatusCostNotCalculated',  tone: 'destructive', variant: 'red' },
  AD: { labelKey: 'postedStatusNoAccountingDate',   tone: 'destructive', variant: 'red' },
  DT: { labelKey: 'postedStatusNoDocumentType',     tone: 'destructive', variant: 'red' },
  NO: { labelKey: 'postedStatusNoRelatedPo',        tone: 'destructive', variant: 'red' },
  L:  { labelKey: 'postedStatusDocumentLocked',     tone: 'destructive', variant: 'red' },
  p:  { labelKey: 'postedStatusPeriodClosed',       tone: 'destructive', variant: 'red' },
  T:  { labelKey: 'postedStatusTableDisabled',      tone: 'neutral',     variant: 'neutral' },
  D:  { labelKey: 'postedStatusDocumentDisabled',   tone: 'neutral',     variant: 'neutral' },
  d:  { labelKey: 'postedStatusDisabledBackground', tone: 'neutral',     variant: 'neutral' },
  y:  { labelKey: 'postedStatusPostPrepared',       tone: 'neutral',     variant: 'neutral' },
  l:  { labelKey: 'postedStatusPendingRefresh',     tone: 'neutral',     variant: 'neutral' },
};

/** The values both renderers already handle themselves as plain true/false. */
const BOOLEAN_VALUES = new Set([true, false, 'Y', 'N', 'true', 'false']);

/**
 * Resolves a posting-status code that the plain boolean path cannot express.
 *
 * @param column AD column name of the cell/field being rendered (`col.column`)
 * @param value  raw value straight from the backend
 * @returns `{ labelKey, rawLabel, tone, variant }` for a code that needs this registry,
 *          or `null` when the column is not a posting-status column, the value is empty,
 *          or the value is plain `Y`/`N`/boolean (caller keeps its own rendering).
 *          `labelKey` is `null` for a code absent from the AD domain — `rawLabel` then
 *          carries the code itself, so an unknown state is still shown rather than
 *          silently collapsed into a dash.
 */
export function resolvePostedStatus(column, value) {
  if (!POSTED_STATUS_COLUMNS.has(column)) return null;
  if (value == null || value === '') return null;
  if (BOOLEAN_VALUES.has(value)) return null;
  const code = String(value);
  const entry = POSTED_STATUS[code];
  if (!entry) return { labelKey: null, rawLabel: code, tone: 'neutral', variant: 'neutral' };
  return { ...entry, rawLabel: code };
}

/** Resolves the display text for a `resolvePostedStatus` result. */
export function postedStatusLabel(status, ui) {
  return status.labelKey ? ui(status.labelKey) : status.rawLabel;
}

/**
 * Resolves a `statusPills` entry (a generated `extraBadges` item) into
 * `DocumentStatusPill` props, applying the posting-status domain above first and the
 * entry's own `trueKey`/`falseKey` otherwise.
 *
 * <p>Lives here, next to the domain, so the list and the detail resolve one raw value
 * through one code path. Two hardcoded, independently-drifting `'Y'`/`'N'` allowlists —
 * one per renderer — are exactly what made the same record read as "—" in the grid and
 * "Not posted" in the detail (ETP-5075).
 *
 * @param badge the `extraBadges` entry (`{ key, trueKey, falseKey, … }`)
 * @param value raw value straight from the backend
 * @param ui    the `useUI()` translator
 * @returns `{ status, label, tone }`, or `null` when nothing should be rendered
 */
export function resolveStatusPill(badge, value, ui) {
  const posted = resolvePostedStatus(badge.column ?? badge.key, value);
  if (posted) {
    return { status: posted.rawLabel, label: postedStatusLabel(posted, ui), tone: posted.tone };
  }
  const isTrue = value === true || value === 'Y' || value === 'true';
  const labelKey = isTrue ? badge.trueKey : badge.falseKey;
  // One-sided badges (only a trueKey declared) hide on the false value — the generator
  // emits the missing side as the literal string 'undefined', which must never show.
  if (!labelKey || labelKey === 'undefined') return null;
  return { status: isTrue ? 'Y' : 'N', label: ui(labelKey), tone: isTrue ? 'success' : 'warning' };
}
