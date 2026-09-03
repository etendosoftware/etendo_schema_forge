/**
 * Merges callout result updates into the current inline-row state.
 *
 * Rules (in priority order):
 * 1. Fields in `forceFields` always win — touched state and empty-value guards are bypassed.
 *    Their `$_identifier` companions are forced too, so a forced value never keeps a stale label.
 * 2. The trigger field (`triggerKey`) always wins — it was just changed by the user.
 * 3. Touched fields with a non-empty user value are preserved (callout cannot overwrite them).
 *    A field's `$_identifier` companion inherits the touched state of its base key, so the
 *    display label the user picked is protected together with the value (ETP-5039). Same rule
 *    as `mergeDefaultsPreservingUserEdits` in `hooks/useEntity.js` for the header form.
 * 4. Callout results that are empty/null do not overwrite an existing non-empty user value.
 *
 * @param {Record<string, unknown>} prev         Current row state
 * @param {Record<string, unknown>} updates      Callout result fields
 * @param {Set<string>}             forceFields  Fields that always get the callout value
 * @param {string}                  triggerKey   Field that triggered the callout
 * @param {Set<string>}             touched      Fields the user has manually set this session
 * @returns {Record<string, unknown>} New row state (shallow copy of prev with updates applied)
 */
const IDENTIFIER_SUFFIX = '$_identifier';

// A `$_identifier` key holds the display label of its base field, so it inherits
// the base key's membership in a rule set: touched (the label the user picked is
// protected together with its value) and forced (a forced value must not be left
// with the previous label). ETP-5039.
function hasWithBaseKey(set, field) {
  if (set.has(field)) return true;
  return field.endsWith(IDENTIFIER_SUFFIX)
    && set.has(field.slice(0, -IDENTIFIER_SUFFIX.length));
}

export function applyCalloutUpdates(prev, updates, forceFields, triggerKey, touched) {
  const next = { ...prev };
  for (const [field, value] of Object.entries(updates)) {
    const isForced    = hasWithBaseKey(forceFields, field);
    const isTrigger   = field === triggerKey;
    const isTouched   = hasWithBaseKey(touched, field);
    const hasUserValue = prev[field] !== '' && prev[field] != null;

    if (!isForced && !isTrigger && isTouched && hasUserValue) continue;
    if (!isForced && (value === '' || value == null) && hasUserValue) continue;
    next[field] = value;
  }
  return next;
}
