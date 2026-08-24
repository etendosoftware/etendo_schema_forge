/**
 * ETP-4933 — Required-field predicate, extracted from useEntity.js.
 *
 * These three helpers were exported from `hooks/useEntity.js` (ETP-3894). They moved
 * here so `hooks/useFormValidity.js` can reuse the predicate WITHOUT importing
 * useEntity — which imports useFormValidity in turn, and would therefore be a cycle.
 * `useEntity.js` re-exports all three, so the ten existing call sites across
 * `components/`, `windows/` and `__tests__/` keep working unchanged.
 *
 * Pure and presentation-free: no React, no i18n, no toasts.
 */

/**
 * Builds the "is this field locked?" predicate for a given record.
 * A throwing `readOnlyLogic` is treated as NOT read-only — a broken contract
 * closure must never silently lock a field the user is supposed to fill.
 */
export function getReadOnly(editing) {
    return (f) => {
        if (f.readOnly === true) return true;
        try {
            return typeof f.readOnlyLogic === 'function'
                ? Boolean(f.readOnlyLogic(editing))
                : false;
        } catch {
            return false;
        }
    };
}

/**
 * Builds the "is this field on screen?" predicate for a given record.
 * A throwing `displayLogic` is treated as visible, for the same reason: failing
 * open keeps the field (and its required-ness) observable instead of vanishing it.
 */
export function getVisible(editing) {
    return (f) => {
        if (typeof f.displayLogic !== 'function') return true;
        try {
            return !!f.displayLogic(editing ?? {});
        } catch {
            return true;
        }
    };
}

/**
 * Keys of the fields that are required, reachable and still empty.
 *
 * The exclusions are deliberate and load-bearing — see ETP-4933 §3.5:
 *  - `readOnly` / `readOnlyLogic`: the user cannot fill it, so it must never block.
 *    (e.g. `documentNo` in a generated HeaderForm is `required + readOnly`.)
 *  - `displayLogic` false: not on screen, so not the user's problem.
 *  - `type === 'checkbox'`: a checkbox always holds a value (true or false), so
 *    "required" would only mean "must be true" — a business rule, not completeness.
 *  - `section === 'summary'`: computed totals, `required` in the AD but never typed.
 *
 * Empty means `null`, `undefined`, `''`, or whitespace-only.
 */
export function getMissingRequiredDescriptors(fields, editing) {
    const isReadOnly = getReadOnly(editing);
    const isVisible = getVisible(editing);
    return fields
        .filter(f => f.required && !isReadOnly(f) && isVisible(f) && f.type !== 'checkbox' && f.section !== 'summary')
        .filter(f => {
            const v = editing?.[f.key];
            return v == null || v === '' || (typeof v === 'string' && v.trim() === '');
        });
}

/**
 * Key-only projection of {@link getMissingRequiredDescriptors}. Kept as the primary
 * export because ten call sites (and `handleSave`) consume keys; ETP-4933 needs the
 * full descriptors as well, to resolve translated labels via `useLabel(f.column)`.
 */
export function getMissingRequiredFields(fields, editing) {
    return getMissingRequiredDescriptors(fields, editing).map(f => f.key);
}

/**
 * ETP-4933: the field set the required-field gate validates against — the UNION of the
 * contract's descriptors and whatever actually registered at runtime.
 *
 * Neither source is sufficient alone, and choosing one loses required fields:
 *  - contract only: it carries just the fields the generator emitted (`form: true`).
 *    `assets` marks its 10 required fields `form: false` and renders them from a
 *    hand-written formFooter panel, so the gate saw 3 optional fields, found nothing
 *    missing, and left Save enabled on an empty new record.
 *  - registry only: it is mount-dependent, so a section that never passes
 *    `registerFields` (`section: 'other'`) is invisible to validation entirely.
 *
 * Union is the safe direction — it can only ADD a required field, never drop one, so a
 * surface nobody thought about fails closed-and-visible rather than silently open.
 * Deduped by key with the contract descriptor winning: it is the richer of the two,
 * carrying readOnlyLogic / displayLogic straight from the AD.
 */
export function mergeValidationFields(contractFields, registeredFields) {
    const contract = Array.isArray(contractFields) ? contractFields : [];
    const registered = Array.isArray(registeredFields) ? registeredFields : [];
    if (contract.length === 0) return registered;
    if (registered.length === 0) return contract;
    const seen = new Set(contract.map(f => f.key));
    return [...contract, ...registered.filter(f => !seen.has(f.key))];
}
