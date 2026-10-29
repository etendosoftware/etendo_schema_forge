// Client-side save gate for ListModalWindow's create / edit modal. Plain module, no React.
// (A failed write is read with useEntity's `extractErrorMessage`, the shared translated reader.)
import { getNumericFieldError } from '@/lib/numericValidation.js';

/**
 * The first modal field whose value breaks its declared numeric rules (`min`, `integer` — the
 * same `getNumericFieldError` the detail form's save gate uses), translated; `null` when all pass.
 *
 * The modal used to skip this entirely: EntityForm's blur toast reported the violation, and the
 * save went to the backend anyway.
 *
 * @param {Array<object>} fields  the modal's field descriptors
 * @param {object} data           current form values
 * @param {(key: string, params?: object) => string} ui
 * @returns {{ key: string, message: string } | null}
 */
export function firstFieldViolation(fields, data, ui) {
  for (const f of fields ?? []) {
    const err = getNumericFieldError(f, data?.[f.key]);
    if (err) return { key: f.key, message: ui(err.key, err.params) };
  }
  return null;
}
