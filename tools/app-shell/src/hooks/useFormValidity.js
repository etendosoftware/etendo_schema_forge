/**
 * ETP-4933 — Save-button gating: is this form complete enough to persist?
 *
 * The PURE layer. It knows nothing about `useEntity`, about NEO, or about any
 * particular window: callers hand it field descriptors and values, it answers
 * whether a primary persist action should be enabled. That is what lets the custom
 * modals (NewPaymentEntryModal, ManualStatementModal, NewAccountWizard, …) consume
 * it with their own local state — none of them feeds useEntity's field registry.
 *
 * The reactive `useEntity` adapter lives in useEntity.js and wraps this.
 */
import { useMemo } from 'react';
import { getMissingRequiredDescriptors } from '@/lib/requiredFields.js';

/**
 * Deterministic lexicographic (UTF-16 code-unit) comparator, reproducing exactly what
 * `Array.prototype.sort()` does by default on strings.
 *
 * It is spelled out rather than left implicit ONLY to satisfy sonarjs S2871, which
 * flags every comparator-less `.sort()`. It is deliberately NOT `localeCompare`:
 * that is locale- and ICU-sensitive, so the same key collection could order
 * differently across runtimes and produce two different signatures for identical
 * input — destroying the very stability these signatures exist to guarantee. The
 * signature is an internal memo key that is never shown to a user, so collation
 * correctness is irrelevant here; byte-stable determinism is the whole requirement.
 * Do not "simplify" this back to `.sort()` or forward to `.sort(localeCompare)`.
 */
const byCodeUnit = (a, b) => (a < b ? -1 : (a > b ? 1 : 0));

/**
 * Stable, order-insensitive signature of a key collection. Used as a memo dependency
 * so a freshly-built array/Set carrying the same keys does not invalidate the memo.
 *
 * NUL is the separator because no field key can contain it, so `['a b']` and
 * `['a', 'b']` can never collide into the same signature. Written as the `\0`
 * ESCAPE, not as a raw NUL byte: a literal one makes git classify this file as
 * binary, which silently turns every diff of it into "Bin 5088 -> 6415 bytes"
 * and takes the file out of review, blame and Sonar's line-level reach.
 */
function keysSignature(keys) {
    return [...keys].sort(byCodeUnit).join('\0');
}

/**
 * Signature of a descriptor list: key plus required-ness. Captures adds, removals and
 * a `required` flag flipping — the three things that change the answer without any
 * value changing. `displayLogic` / `readOnlyLogic` are contract-level statics keyed to
 * the field, so the key alone pins them.
 */
export function fieldsSignature(fields) {
    const list = Array.isArray(fields) ? fields : [];
    return keysSignature(list.map(f => `${f?.key}:${f?.required ? 1 : 0}`));
}

/**
 * Field keys that currently block a save. Empty array means "good to go".
 *
 * `skipUnchangedInvalid` is the legacy-data policy (ETP-4933 §3.2). On an EXISTING
 * record, a required field that is empty but which the user never touched must NOT
 * block: plenty of records predate the constraint, and blocking them would leave the
 * user unable to fix an unrelated field — possibly without even having the missing
 * datum. A required field the user DID touch and left empty still blocks. On a NEW
 * record the caller passes `false`, so every missing required field blocks; that is
 * also the pre-existing `handleSave` behaviour, kept intact.
 *
 * `deferBlocking` is the not-yet-judgeable escape hatch (ETP-5002). A required field
 * that is empty because its backend default has not landed YET is not the user failing
 * to fill it in — it is the form not being ready to be judged at all. Blocking on it
 * turns a slow `GET /<entity>/defaults` into a dead primary button: `purchase-order`
 * marks `warehouse` required with no contract-level default, so every new PO whose
 * defaults request outran ETP-4741's 4s UX budget rendered Guardar AND Confirmar
 * disabled, reading "Completa primero los campos obligatorios: Almacen" for a value
 * the user was never meant to type. While the caller reports the form as pending
 * nothing blocks; the moment it settles the gate applies in full. The backend's own
 * MISSING_REQUIRED_FIELDS validation is the net underneath — the same net that caught
 * this case before ETP-4933 existed.
 *
 * @param {object} args
 * @param {Array<object>} args.fields Descriptors as EntityForm renders them: `key`,
 *   `required`, `type`, `section`, optional `readOnly` / `readOnlyLogic` / `displayLogic`.
 * @param {object|null|undefined} args.values Current values, keyed by field key.
 * @param {Set<string>|null|undefined} args.changedKeys Keys the user actually touched.
 *   Only consulted when `skipUnchangedInvalid` is true.
 * @param {boolean} [args.skipUnchangedInvalid=false]
 * @param {boolean} [args.deferBlocking=false] Form not ready to be judged yet — see above.
 * @returns {Array<object>} Blocking field descriptors, in field order.
 */
export function getBlockingRequiredFields({ fields, values, changedKeys, skipUnchangedInvalid = false, deferBlocking = false }) {
    if (deferBlocking) return [];
    const missing = getMissingRequiredDescriptors(Array.isArray(fields) ? fields : [], values);
    if (!skipUnchangedInvalid) return missing;
    // No changed-keys set to consult means the user has touched nothing yet, so
    // nothing they are responsible for is missing.
    if (!changedKeys || typeof changedKeys.has !== 'function') return [];
    return missing.filter(f => changedKeys.has(f.key));
}

/**
 * Reactive wrapper over {@link getBlockingRequiredFields}.
 *
 * Memoized on the field signature and the changed-key signature rather than on array
 * identity, because both arrive as freshly-built collections on most renders. Note
 * `values` is compared by identity and is a new object on every keystroke by design
 * (`setEditing(prev => ({ ...prev, ... }))`) — so the predicate DOES re-run per
 * keystroke, which is the point: the button has to react in real time. What the memo
 * buys is skipping the work on re-renders that changed neither values nor fields.
 * The predicate invokes every field's displayLogic / readOnlyLogic closure, so that
 * distinction matters on the widest windows.
 *
 * `missingRequired` is the key list (what `data-missing-required` and the pre-existing
 * `handleSave` path consume); `missingRequiredFields` is the matching descriptor list,
 * needed to render a translated tooltip via `useLabel(f.column)`.
 *
 * `deferBlocking` (ETP-5002) short-circuits to "valid" — see getBlockingRequiredFields.
 * It is a plain boolean in the dep list, so the gate snaps back on the render that
 * flips it to false, with no stale-memo window.
 *
 * @returns {{ isValid: boolean, missingRequired: string[], missingRequiredFields: Array<object> }}
 */
export function useFormValidity({ fields, values, changedKeys, skipUnchangedInvalid = false, deferBlocking = false }) {
    const fieldsKey = fieldsSignature(fields);
    const changedKey = skipUnchangedInvalid && changedKeys ? keysSignature(changedKeys) : '';

    return useMemo(() => {
        const blocking = getBlockingRequiredFields({ fields, values, changedKeys, skipUnchangedInvalid, deferBlocking });
        return {
            isValid: blocking.length === 0,
            missingRequired: blocking.map(f => f.key),
            missingRequiredFields: blocking,
        };
        // `fields` and `changedKeys` are intentionally represented by their signatures:
        // a new collection with the same content must not invalidate the memo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fieldsKey, changedKey, values, skipUnchangedInvalid, deferBlocking]);
}

export default useFormValidity;
