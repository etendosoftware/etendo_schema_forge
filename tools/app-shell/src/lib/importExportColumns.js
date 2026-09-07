import { resolveTemplateHeaders } from '@etendosoftware/app-shell-core/lib/import/buildTemplateCsv.js';

/**
 * Derive a CSV **export** column spec from a window's `window.import.fields` (ETP-4997).
 *
 * The export deliberately has no configuration of its own: a `window.export` block in every
 * `decisions.json` would duplicate the import template and let the two drift apart, so the
 * columns are derived from the import fields at runtime instead. That is what closes the
 * export -> edit -> import loop: what comes out is, by construction, the same column set the
 * import template hands out.
 *
 * ## Headers come from the template writer itself
 *
 * They are NOT re-derived here. `resolveTemplateHeaders` (app-shell-core) is the same function
 * `ImportDialog` calls to write the downloadable template, so the two files carry byte-identical
 * headers, including three behaviours that would be easy to get subtly wrong by reimplementing:
 *
 *  - **Session language.** The header is resolved through `headerFor` (ListView passes the very
 *    resolver it already hands `ImportDialog` as `fieldLabelFn`), so a Spanish session exports
 *    "nombre comercial" and an English one "Commercial Name". The round-trip holds either way:
 *    `ImportDialog` adds the localized header to the field's aliases before matching.
 *  - **Collision handling.** A composite import splits one row across entities whose AD labels
 *    collide (Contacts carries the company's AND the contact's email); `parseDelimited` REJECTS
 *    a file with duplicate headers, so a hand-rolled header pass could produce an export that
 *    cannot be re-imported at all.
 *  - **The ` *` required marker.** Kept, so the header matches the template exactly and the
 *    user can still see which columns are mandatory. `mapColumns.stripRequiredMarker` removes it
 *    before matching, so it never reaches the field identity.
 *
 * `importExportColumns.vitest.js` asserts the headers against `buildTemplateCsv` directly, so a
 * change to the template writer in core cannot silently desync the export.
 *
 * ## Why a per-spec source-key map exists
 *
 * An import field names the property the import WRITES; the list row carries the property the
 * grid READS, and the two are not always spelled the same (`category` is written, but the
 * businessPartner list row calls it `businessPartnerCategory`). Nothing generic can bridge that
 * at runtime — ListView only ever sees the currently visible table columns, not the full
 * contract — so the handful of real mismatches are declared by the window's own import
 * descriptor via `registerExportHints`. This keeps the exception where the rest of the window's
 * import knowledge already lives, and out of `decisions.json` and the generator (which live in
 * schema_forge_core and would force a publish + pin bump for a two-line map).
 *
 * ## AD-coded columns are exported as words, not codes
 *
 * A raw list row carries codes: `etgoIsperson` is `true`/`false`, `oBTIKTaxIDKey` is `'1'`,
 * `productType` is `'I'`. Those re-import fine (`resolveCodedValue` always accepts the code
 * itself) but they are unreadable in a spreadsheet, which defeats the edit half of
 * export -> edit -> import. A window therefore declares `valueLabels` in its export hints, built
 * with `codeLabels()` from the very synonym table its import validates against — so a label this
 * writes is guaranteed to be one the import accepts, rather than merely likely to be.
 *
 * The CSV is serialized server-side (the browser never sees the rows), so the map travels to the
 * backend as the `valueMaps` query param and is applied per column there. Using the AD
 * `$_identifier` companion instead would read just as nicely for `oBTIKTaxIDKey`, cost nothing,
 * and silently stop matching the day that translation changes — and it is not even available for
 * `etgoIsperson`, which is a plain boolean with no companion at all.
 */

/**
 * Per-spec export refinements, registered as a side effect by a window's import descriptor
 * (mirroring how `registerImportDescriptor` already works), so the hints are in place by the
 * time ListView mounts inside that window's lazily-imported module.
 *
 * @type {Map<string, {sourceKeys?: Record<string, string|null>}>}
 */
const hintsBySpec = new Map();

/**
 * Declare how a spec's import fields map onto its list-row properties.
 *
 * @param {string} spec - the window's kebab-case spec name (`window.import.spec`).
 * @param {{sourceKeys?: Record<string, string|null>, valueLabels?: Record<string, Record<string, string>>}} hints
 *   `sourceKeys` maps an import `target` to the list-row key holding its value; map a target to
 *   `null` to declare that the list row has no value for it, which emits the column with an empty
 *   cell. `valueLabels` maps an import `target` to a `{ rawValue: label }` table for an AD-coded
 *   column — build it with `codeLabels()` so every label is one the import accepts.
 */
export function registerExportHints(spec, hints) {
  if (!spec) return;
  hintsBySpec.set(spec, hints || {});
}

/** The hints registered for a spec, or `null` when the window declared none. */
export function getExportHints(spec) {
  return hintsBySpec.get(spec) ?? null;
}

/** Test-only: drops every registration so specs cannot leak between test files. */
export function clearExportHints() {
  hintsBySpec.clear();
}

/**
 * The list-row key holding this field's value, or `''` when the row has none (which the backend
 * serializes as an empty cell — `NeoCsvExportService.resolveValue` returns null for an unknown
 * key).
 *
 * Resolution order:
 *  1. an explicit `sourceKeys` entry — the only way to fix a spelling mismatch;
 *  2. `headerScope` — the field belongs to a child entity (contacts' contact/address block),
 *     which the header list GET does not return;
 *  3. a foreign key — NEO returns the id in `target` and the human label in
 *     `target$_identifier`; the label is the half the import can resolve back;
 *  4. the target itself.
 */
export function exportSourceKeyForField(field, sourceKeys = {}) {
  if (Object.prototype.hasOwnProperty.call(sourceKeys, field.target)) {
    return sourceKeys[field.target] ?? '';
  }
  if (field.headerScope) return '';
  if (field.type === 'foreignKey' || field.matchEntity) return `${field.target}$_identifier`;
  return field.target;
}

/**
 * Build the ordered column list for a window's export, one entry per import field.
 *
 * @param {{spec?: string, fields?: Array}} importConfig - the resolved `window.import` block.
 * @param {{headerFor?: (field: object) => string}} [options] - session-language header resolver,
 *   the same one passed to `ImportDialog` as `fieldLabelFn`. Omitting it falls back to the
 *   field's first (Spanish) alias, exactly as the template writer does.
 * @returns {Array<{key: string, label: string, type: string}>}
 */
export function buildExportColumns(importConfig, options = {}) {
  const fields = Array.isArray(importConfig?.fields) ? importConfig.fields : [];
  if (fields.length === 0) return [];
  const { sourceKeys = {} } = getExportHints(importConfig?.spec) ?? {};
  const headers = resolveTemplateHeaders(fields, options);
  return fields.map((field, i) => ({
    key: exportSourceKeyForField(field, sourceKeys),
    label: headers[i],
    type: field.type === 'date' ? 'date' : '',
  }));
}

/**
 * The `{ columnKey: { rawValue: label } }` table the backend applies while serializing, so a
 * coded column reads as a word instead of a code.
 *
 * Keyed by the column's SOURCE key (what the backend sees on the row), not by the import target.
 * A column with no source — Contacts' contact-scoped ones — is skipped: it has no value to
 * translate. Returns `null` when the window declares no coded columns, so the caller can leave
 * the query param off entirely rather than send an empty object.
 *
 * @param {{spec?: string, fields?: Array}} importConfig
 * @param {Array<{key: string}>} columns - the output of {@link buildExportColumns}, positionally
 *   aligned with `importConfig.fields`.
 */
export function buildExportValueMaps(importConfig, columns) {
  const { valueLabels } = getExportHints(importConfig?.spec) ?? {};
  if (!valueLabels) return null;
  const fields = Array.isArray(importConfig?.fields) ? importConfig.fields : [];
  const maps = {};
  fields.forEach((field, i) => {
    const labels = valueLabels[field.target];
    const key = columns[i]?.key;
    if (labels && key) maps[key] = labels;
  });
  return Object.keys(maps).length > 0 ? maps : null;
}

/**
 * `NeoCsvExportService.parseColumns` splits the spec on `|` and then on `:`, so neither
 * character can survive inside a key or a label — a header carrying one would silently shift
 * every following column. Replacing them with a space keeps the header readable and, because
 * `mapColumns` compares on whitespace-collapsed text, still matchable on re-import.
 */
function sanitizeSpecPart(value) {
  return String(value ?? '').replace(/[:|]/g, ' ');
}

/** Serialize columns into the `columns=key:Label:type|…` spec the NEO export endpoint parses. */
export function serializeExportColumns(columns) {
  return columns
    .map(({ key, label, type }) => {
      const head = `${sanitizeSpecPart(key)}:${sanitizeSpecPart(label)}`;
      return type ? `${head}:${type}` : head;
    })
    .join('|');
}
