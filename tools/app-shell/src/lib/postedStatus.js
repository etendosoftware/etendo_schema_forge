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
 * This module is also the ONLY place that colours a posting status (ETP-5647). Every code,
 * `Y`/`N` included, maps to one status tone here, and every surface that shows the state —
 * the list column, the detail pill, the Not Posted Documents page, the financial-account
 * reconciliations and movements — reads that tone through {@link postedStatusTone}. Before
 * that, five surfaces carried five colour tables in two palettes, and each window
 * copy-pasted its own `badgeVariants: { false: 'orange' }`, so "Sin contabilizar" read as an
 * error in the list and as a pending warning in the detail.
 *
 * Labels are a different matter: `resolvePostedStatus` still returns `null` for `Y`/`N` so
 * each caller keeps its own wording for them (the grid its `badgeLabels`, the detail its
 * `statusPills` `trueKey`/`falseKey`, the financial account its own keys).
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
 * Tones (the status palette, `TONE_STYLES` in `status-tag-tokens.js`): `Y` is `success`;
 * `N` — posting not attempted yet — is `warning` (yellow: pending, not an error); a code
 * that means "the posting failed and a human must act" is `destructive`, `p` (period
 * closed) included; a code that only means "posting is switched off / not prepared yet" is
 * `neutral`.
 */
const POSTED_STATUS = {
  Y:  { labelKey: 'postedStatus',                   tone: 'success' },
  N:  { labelKey: 'notPostedStatus',                tone: 'warning' },
  E:  { labelKey: 'postedStatusError',              tone: 'destructive' },
  C:  { labelKey: 'postedStatusErrorNoCost',        tone: 'destructive' },
  i:  { labelKey: 'postedStatusInvalidAccount',     tone: 'destructive' },
  b:  { labelKey: 'postedStatusNotBalanced',        tone: 'destructive' },
  c:  { labelKey: 'postedStatusNotConvertible',     tone: 'destructive' },
  NC: { labelKey: 'postedStatusCostNotCalculated',  tone: 'destructive' },
  AD: { labelKey: 'postedStatusNoAccountingDate',   tone: 'destructive' },
  DT: { labelKey: 'postedStatusNoDocumentType',     tone: 'destructive' },
  NO: { labelKey: 'postedStatusNoRelatedPo',        tone: 'destructive' },
  L:  { labelKey: 'postedStatusDocumentLocked',     tone: 'destructive' },
  p:  { labelKey: 'postedStatusPeriodClosed',       tone: 'destructive' },
  T:  { labelKey: 'postedStatusTableDisabled',      tone: 'neutral' },
  D:  { labelKey: 'postedStatusDocumentDisabled',   tone: 'neutral' },
  d:  { labelKey: 'postedStatusDisabledBackground', tone: 'neutral' },
  y:  { labelKey: 'postedStatusPostPrepared',       tone: 'neutral' },
  l:  { labelKey: 'postedStatusPendingRefresh',     tone: 'neutral' },
};

/** Boolean spellings of the `Y`/`N` pair, as the backend or a boolean-typed field sends them. */
const BOOLEAN_CODE = new Map([[true, 'Y'], ['true', 'Y'], ['Y', 'Y'], [false, 'N'], ['false', 'N'], ['N', 'N']]);

/**
 * The posting code a raw value stands for: booleans fold to `Y`/`N`, anything else is the
 * code itself (case kept). `null` for an empty value.
 */
function toPostedCode(value) {
  if (value == null || value === '') return null;
  return BOOLEAN_CODE.get(value) ?? String(value);
}

/**
 * The status tone (`success` | `warning` | `destructive` | `neutral`) of a raw posting value —
 * the single colour source for every surface that shows a posting status. An unknown code
 * is `neutral`; an empty value is `null` (nothing to show).
 */
export function postedStatusTone(value) {
  const code = toPostedCode(value);
  if (code == null) return null;
  return POSTED_STATUS[code]?.tone ?? 'neutral';
}

/**
 * True when a raw value is one of the plain `Y`/`N` pair (or a boolean spelling of it),
 * whose label each caller words itself.
 */
export function isPostedBooleanValue(value) {
  return BOOLEAN_CODE.has(value);
}

/**
 * Resolves a posting-status code that the plain boolean path cannot express.
 *
 * @param column AD column name of the cell/field being rendered (`col.column`)
 * @param value  raw value straight from the backend
 * @returns `{ labelKey, rawLabel, tone }` for a code that needs this registry,
 *          or `null` when the column is not a posting-status column, the value is empty,
 *          or the value is plain `Y`/`N`/boolean (caller keeps its own rendering).
 *          `labelKey` is `null` for a code absent from the AD domain — `rawLabel` then
 *          carries the code itself, so an unknown state is still shown rather than
 *          silently collapsed into a dash.
 */
export function resolvePostedStatus(column, value) {
  if (!POSTED_STATUS_COLUMNS.has(column)) return null;
  if (value == null || value === '') return null;
  if (isPostedBooleanValue(value)) return null;
  const code = String(value);
  const entry = POSTED_STATUS[code];
  if (!entry) return { labelKey: null, rawLabel: code, tone: 'neutral' };
  return { ...entry, rawLabel: code };
}

/** Resolves the display text for a `resolvePostedStatus` result. */
export function postedStatusLabel(status, ui) {
  return status.labelKey ? ui(status.labelKey) : status.rawLabel;
}

/** True when `column` belongs to the Posted-status domain (17 codes) above — used to
 * scope a shared chip width to this column only, not every boolean badge. */
export function isPostedStatusColumn(column) {
  return POSTED_STATUS_COLUMNS.has(column);
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
 * @param badge the `extraBadges` entry (`{ key, trueKey, falseKey, hintKeys, … }`). An
 *   optional `hintKeys` map (code → i18n key) lets ONE window attach a table-specific
 *   explanation to a code whose core meaning is generic across every table that carries
 *   this domain (e.g. `D` means "no M_Transaction has a calculated cost yet" only on
 *   goods-movements' M_Movement — see ETP-5436 — but means something structurally
 *   different on DocFINPayment/DocInventory/DocGLJournal). Deliberately per-window, not a
 *   new case added to the shared `POSTED_STATUS` table above: that table has no notion of
 *   which AD table produced the code, so a hint added there would misinform every other
 *   window that happens to hit the same code.
 * @param value raw value straight from the backend
 * @param ui    the `useUI()` translator
 * @returns `{ status, label, tone, hint }`, or `null` when nothing should be rendered.
 *   `hint` is `undefined` unless the window declared a matching `hintKeys` entry.
 */
export function resolveStatusPill(badge, value, ui) {
  const posted = resolvePostedStatus(badge.column ?? badge.key, value);
  if (posted) {
    const hintKey = badge.hintKeys?.[posted.rawLabel];
    return {
      status: posted.rawLabel,
      label: postedStatusLabel(posted, ui),
      tone: posted.tone,
      hint: hintKey ? ui(hintKey) : undefined,
    };
  }
  const isTrue = value === true || value === 'Y' || value === 'true';
  const labelKey = isTrue ? badge.trueKey : badge.falseKey;
  // One-sided badges (only a trueKey declared) hide on the false value — the generator
  // emits the missing side as the literal string 'undefined', which must never show.
  if (!labelKey || labelKey === 'undefined') return null;
  const status = isTrue ? 'Y' : 'N';
  // A posting-status pill takes its Y/N colour from the registry, like every other code;
  // any other true/false pill keeps the generic success/warning pair.
  const tone = isPostedStatusColumn(badge.column ?? badge.key)
    ? postedStatusTone(status)
    : (isTrue ? 'success' : 'warning');
  return { status, label: ui(labelKey), tone };
}
