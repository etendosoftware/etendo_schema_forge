import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { resolveBackendSort, buildBackendFilter } from '@/lib/gridQuery.js';
import { translateBackendError } from '@/lib/backendErrors.js';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { trackDocumentCreated, trackTransactionPosted } from '@/lib/observability/health-events.js';
import { OBSERVABILITY_EVENTS } from '@/lib/observability/events.js';
import { startTiming } from '@/lib/observability/timing.js';
import {
    isCompletionProcess,
    trackDocumentCompleted,
    trackRecordCreated,
    trackRecordUpdated,
} from '@/lib/productUsageTelemetry.js';
import { incrementSurveyCounter } from '@/lib/surveys/survey-state.js';
import { isInvoiceSpec, isOrderSpec } from '@/lib/surveys/surveys.js';
import { useLogout } from '@/auth/useLogout.js';
import { emitSurveyTrigger } from '@/lib/surveys/survey-engine.js';
import { isEmailField, getEmailFieldError, getWebsiteFieldError, getPhoneFieldError } from '@/components/contract-ui/recipientEdits.js';
import { getNumericFieldError, numericFieldToastId, trackSaveBlockToast, dismissSaveBlockToasts } from '@/lib/numericValidation.js';
import { getReadOnly, getVisible, getMissingRequiredFields, mergeValidationFields } from '@/lib/requiredFields.js';
import { useFormValidity, fieldsSignature } from '@/hooks/useFormValidity.js';

// ETP-5022: header policy has ONE home (app-shell-core/auth). This module used to
// carry its own buildHeaders copy, which is how header sets drift apart.
import { buildHeaders } from '@/auth/api.js';
// Re-exported for back-compat: isEmailField lives in recipientEdits.js (the
// dependency-light email util) so the grid components can reuse it without
// importing this heavy hook module.
export { isEmailField };

export function pickMessageFromObject(node) {
    if (typeof node === 'object') {
        const preferredKeys = ['message', 'errorMessage', 'text', 'description', 'title'];
        for (const key of preferredKeys) {
            const msg = pickMessage(node[key]);
            if (msg) return msg;
        }
        for (const value of Object.values(node)) {
            const msg = pickMessage(value);
            if (msg) return msg;
        }
    }
    return null;
}

export function pickMessage(node) {
    if (!node) return null;
    if (typeof node === 'string') {
        const txt = node.trim();
        return txt ? txt : null;
    }
    if (Array.isArray(node)) {
        for (const item of node) {
            const msg = pickMessage(item);
            if (msg) return msg;
        }
        return null;
    }
    return pickMessageFromObject(node);
}

/**
 * Extract a human-readable error message from a NEO Headless error response.
 */
export async function extractErrorMessage(res, ui) {
    // Declared outside the try block (and thus outside the `data = await res.json()`
    // call that can throw for non-JSON bodies, e.g. an HTML error page) so the final
    // fallback below — `translate('error', 'Error')` — stays in scope even when
    // res.json() fails.
    const translate = (key, fallback, params = {}) => {
        if (typeof ui !== 'function') {
            let text = fallback;
            Object.keys(params).forEach((p) => {
                text = text.replace(`{${p}}`, params[p]);
            });
            return text;
        }

        const translated = ui(key, params);
        if (!translated || translated === key) {
            let text = fallback;
            Object.keys(params).forEach((p) => {
                text = text.replace(`{${p}}`, params[p]);
            });
            return text;
        }
        return translated;
    };

    try {
        const data = await res.json();

        const decodeHtml = (input) => {
            if (typeof input !== 'string') return '';
            return input
                .replace(/&quot;/g, '"')
                .replace(/&#34;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
        };

        const toReadableLabel = (columnName) => {
            const normalized = String(columnName || '').trim();
            if (!normalized) return translate('validationFieldGeneric', 'Field');

            const withSpaces = normalized
                .replace(/_/g, ' ')
                .replace(/([a-z])([A-Z])/g, '$1 $2')
                .toLowerCase();

            return withSpaces.replace(/\b\w/g, (ch) => ch.toUpperCase());
        };

        const REQUIRED_LABELS_BY_TABLE = {
            c_bpartner: {
                value: 'validationFieldSearchKey',
                name: 'validationFieldName',
                c_bp_group_id: 'validationFieldBusinessPartnerCategory',
                em_obtik_tax_id_key: 'validationFieldNifCountryKey',
            },
        };

        const REQUIRED_LABELS = {
            value: 'validationFieldSearchKey',
            name: 'validationFieldName',
            ad_org_id: 'validationFieldOrganization',
            ad_client_id: 'validationFieldClient',
        };

        const normalizeServerError = (rawMessage) => {
            const decoded = decodeHtml(rawMessage);
            if (!decoded) return null;

            const requiredMatch = decoded.match(/null value in column\s+"([^"]+)"\s+of relation\s+"([^"]+)"/i);
            if (requiredMatch) {
                const column = requiredMatch[1];
                const relation = requiredMatch[2]?.toLowerCase?.() || '';
                const tableLabels = REQUIRED_LABELS_BY_TABLE[relation] || {};
                const labelKey = tableLabels[column.toLowerCase()] || REQUIRED_LABELS[column.toLowerCase()];
                const label = labelKey
                    ? translate(labelKey, toReadableLabel(column))
                    : toReadableLabel(column);
                return translate('validationRequiredField', 'The field "{field}" is required.', { field: label });
            }

            if (/violates\s+not-null\s+constraint/i.test(decoded)) {
                return translate('validationRequiredGeneric', 'A required field is missing.');
            }

            if (/duplicate key value violates unique constraint/i.test(decoded)) {
                return translate('validationDuplicateRecord', 'A record with the same value already exists.');
            }

            // Delete rejected by a DB foreign-key/RESTRICT constraint — the record
            // has dependent rows in another table. The raw text reaching here is the
            // underlying Postgres exception (Etendo's DefaultJsonDataService passes it
            // through largely untranslated), so it can come in English or Spanish
            // depending on the DB server locale. ETP-4656: standardize both into one
            // clear, actionable message.
            //
            // IMPORTANT — this must NOT match on the bare "violates foreign key
            // constraint" / "viola la (llave|clave) foránea" phrase alone: Postgres
            // emits that identical wording for BOTH directions of an FK error —
            // delete/update blocked by a dependent row (RESTRICT) AND insert/update
            // with a reference to a non-existent row (e.g. saving a line with a
            // stale product id). `normalizeServerError` is shared by handleSave/
            // handleAddChild/handleSaveAndProcess too, not just handleDelete, so a
            // save-side FK error must NOT get mislabeled with a delete-specific
            // message. Only match the DETAIL-line wording that is unique to the
            // delete-blocked (RESTRICT) side: "is still referenced from table" (EN)
            // / "(aún )?se hace referencia a la (llave|clave)" (ES) — the
            // insert/update side's DETAIL instead reads "is not present in table" /
            // "no está presente en la tabla", which never matches here.
            if (
                /is\s+still\s+referenced\s+from\s+table/i.test(decoded)
                || /(a[uú]n\s+)?se\s+hace\s+referencia\s+a\s+la\s+(llave|clave)/i.test(decoded)
            ) {
                return translate('deleteBlockedByReferences', 'This record cannot be deleted because it has associated records.');
            }

            // Classic Etendo AD_Message "ForeignKeyViolation" (AD_MESSAGE_ID
            // 716A7D748A979ED8E040007F01015931 / 81B47DEBF9E94A369C4629562A90A2B2 — two
            // near-duplicate ES translation rows exist, match both) — the actual
            // real-world path for most AD-managed entities (e.g. Contacts): OBDal's
            // `ErrorTextParser.handleConstraintViolation` (schema_forge's sibling Etendo
            // core, org.openbravo.erpCommon.utility) recognizes the raw Postgres FK
            // constraint text via the DB catalog and — BEFORE it ever reaches this
            // function — replaces it with this already-translated, generic AD_Message,
            // so the "is still referenced from table" branch above never fires for this
            // path. English: "This record cannot be deleted because it is associated
            // with other existing elements. Please see Linked Items".
            //
            // NOTE: unlike the raw-Postgres branch above, this AD_Message is used by
            // ErrorTextParser for BOTH directions of an FK violation (its own source
            // comment: "Text is always 'You cannot delete this record...' as we do not
            // have enough context information to distinguish insert/update or delete
            // here") — Etendo's own backend already mislabels the insert/update case
            // with "cannot be deleted" wording before this ever reaches the frontend, so
            // standardizing it here does not introduce a new mislabeling beyond that
            // pre-existing upstream limitation (there is no textual signal left to
            // disambiguate by the time it gets here, unlike the raw-Postgres path).
            if (
                /cannot\s+be\s+deleted\s+because\s+it\s+is\s+associated\s+with\s+other\s+existing\s+elements/i.test(decoded)
                || /relacionad[oa]\s+con\s+otros\s+elementos(\s+existentes)?/i.test(decoded)
            ) {
                return translate('deleteBlockedByReferences', 'This record cannot be deleted because it has associated records.');
            }

            // ETP-4597: Etendo AD's backend core sometimes rewrites the raw Postgres
            // unique-constraint violation into an already-translated sentence that
            // names the AD entity's technical field group before it reaches the
            // frontend, e.g. (Spanish) "Ya existe un/a Categoría del producto con el
            // mismo (Entidad, Organización, Identificador). (Entidad, Organización,
            // Identificador) debe ser único. Cambie los valores introducidos" — or the
            // English equivalent naming (Client, Organization, Identifier). The regex
            // above only matches the RAW Postgres wording, so this AD-translated
            // sentence needs its own branch to avoid leaking technical field names.
            // Gaps are bounded ({1,200}) rather than unbounded (.+) so the match can't
            // be forced into super-linear backtracking on a pathological input
            // (SonarQube javascript:S5852).
            if (
                /ya existe.{1,200}\(.{1,200}\).{1,200}debe ser único/i.test(decoded)
                || /there is already.{1,200}\(.{1,200}\).{1,200}must be unique/i.test(decoded)
            ) {
                return translate(
                    'validationDuplicateIdentifier',
                    'A record with the same identifier already exists. Please enter a different one.'
                );
            }

            const raw = decoded.replace(/\s+/g, ' ').trim();
            return translateBackendError(raw, ui) || raw;
        };


        // NEO Headless top-level error: { error: { message, status } }
        const neoError = pickMessage(data?.error);
        if (neoError) return normalizeServerError(neoError) || neoError;

        // Etendo JsonDataService wraps errors in response.error
        const serviceError = pickMessage(data?.response?.error);
        if (serviceError) return normalizeServerError(serviceError) || serviceError;

        // SmartClient validation payloads can come in response.errors
        const validationError = pickMessage(data?.response?.errors);
        if (validationError) return normalizeServerError(validationError) || validationError;

        const fallbackMsg = pickMessage(data?.message);
        if (fallbackMsg) return normalizeServerError(fallbackMsg) || fallbackMsg;

        if (data?.response?.status === -4) {
            return translate('validationError', 'Validation error');
        }
    } catch { /* body not JSON */
    }
    return `${translate('error', 'Error')} ${res.status}`;
}

const BATCH_SIZE = 75;

// ETP-4741 — UX budget for how long a creation form stays gated waiting for
// GET /<entity>/defaults. On expiry the gate is released so the user can start
// working, and nothing else: the request is NOT aborted and its session is NOT
// invalidated, so it keeps running, stays cancellable, and its response still
// merges when it lands. See handleNew below.
const DEFAULTS_TIMEOUT_MS = 4000;

const CONTACTS_PRECREATE_BILLING_FIELDS = new Set([
    'priceList',
    'paymentMethod',
    'paymentTerms',
    'account',
    'customerBlocking',
    'purchasePricelist',
    'pOPaymentMethod',
    'pOPaymentTerms',
    'pOFinancialAccount',
    'vendorBlocking',
]);

// ETP-4156: the per-entity `name` / `username` / `searchKey` derivations that used to live
// here (applyContactsRequiredFields, branching on the hardcoded entity names contact /
// adUser / user / businessPartner / bpartner) now run server-side, where they are not tied
// to a window: BusinessPartnerHandler + ContactNameSyncHandler for C_BPartner, and
// ContactHandler for AD_User. See docs/neo-headless-extensibility.md.

/**
 * Resolve the backend sort key for a given column.
 * FK columns have a companion `col$_identifier` in the response — sorting by that
 * produces alphabetical order instead of sorting by the raw UUID.
 */
function resolveSortKey(sortColumn, sampleRow) {
    if (!sampleRow) return sortColumn;
    const identifierKey = `${sortColumn}$_identifier`;
    if (identifierKey in sampleRow) return identifierKey;
    return sortColumn;
}

function deriveRecordId(record, entityName) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    if (record.id != null && record.id !== '') return record.id;
    if (typeof record.$ref === 'string') {
        const refId = record.$ref.split('/').filter(Boolean).at(-1);
        if (refId) return refId;
    }
    if (entityName && record[entityName] != null && record[entityName] !== '') {
        return record[entityName];
    }
    return null;
}

function normalizeRecord(record, entityName) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
    const id = deriveRecordId(record, entityName);
    if (id == null || record.id === id) return record;
    return { ...record, id };
}

function normalizeRows(rows, entityName) {
    return Array.isArray(rows) ? rows.map(row => normalizeRecord(row, entityName)) : [];
}

/**
 * Everything the list response carried alongside the rows.
 *
 * NEO writes a handler's response body verbatim (no output schema, no key
 * whitelist), and `NeoFieldFilter` only ever rewrites `response.data[i]` — so a
 * NeoHandler's `afterHandle` can legitimately attach collection-level aggregates
 * (e.g. a `summary` with balance totals) next to `data`. Returns null when the
 * payload is a bare array or has no siblings worth surfacing.
 */
function extractResponseMeta(data) {
    const envelope = data?.response;
    if (!envelope || typeof envelope !== 'object') return null;
    // Copy-then-delete rather than destructuring `data` into a throwaway binding, which
    // reads as an unused variable (Sonar S1481).
    const rest = { ...envelope };
    delete rest.data;
    return Object.keys(rest).length > 0 ? rest : null;
}

const EMPTY_FILTERS = {};
const EMPTY_DEFS = {};

// ETP-4751 — transient exemption-cause signals stamped by InvoiceLineHandler on the LINE-save
// response ROOT. They are NOT persisted entity fields, so a plain header GET (refreshHeaderTotals)
// does not return them — it must PRESERVE any value already on the client record instead of
// dropping it, otherwise the flag is wiped before the SIF tab's toast effect can observe it.
const EXEMPTION_SIGNAL_KEYS = ['exemptionCauseAutoFilled', 'exemptionCauseWarning'];

export function parseCriteriaInto(v, out) {
    try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) out.push(...parsed);
        else out.push(parsed);
    } catch { /* skip malformed criteria */
    }
}

/**
 * Extract `criteria=...` entries from a raw filter query-string fragment and push the
 * remaining key/value pairs straight into queryParams as passthrough (e.g. `active=true`).
 */
function extractCriteriaFromFilter(filterStr, queryParams) {
    const out = [];
    if (!filterStr) return out;
    for (const p of filterStr.split('&')) {
        if (!p) continue;
        const eqIdx = p.indexOf('=');
        if (eqIdx < 0) continue;
        const k = p.slice(0, eqIdx);
        const v = decodeURIComponent(p.slice(eqIdx + 1));
        if (k === 'criteria') {
            parseCriteriaInto(v, out);
        } else {
            queryParams.append(k, v);
        }
    }
    return out;
}

/**
 * Merge all filter layers into a single `criteria=...` param.
 *
 * Composition order (all AND):
 *   baseFilter (window-scope: subset + quick) → columnFilters (status/date/search) → trailingFilter (funnel)
 *
 * Emitting separate `criteria=` params silently drops all but one on the backend,
 * so everything must collapse into one array. If any sub-entry is an AdvancedCriteria
 * (e.g. the funnel's OR block), wrap the whole result in an outer AdvancedCriteria AND
 * so the OR stays parenthesized.
 */
function applyFilterParams(queryParams, baseFilter, columnFilters, columnDefs, trailingFilter) {
    const baseCriteria = extractCriteriaFromFilter(baseFilter, queryParams);

    const colCriteria = [];
    for (const [key, parsed] of Object.entries(columnFilters)) {
        if (!parsed) continue;
        const c = columnDefs[key] || { key };
        const filterCriteria = buildBackendFilter(c, parsed);
        if (filterCriteria) colCriteria.push(...filterCriteria);
    }

    const trailingCriteria = extractCriteriaFromFilter(trailingFilter, queryParams);

    const allCriteria = [...baseCriteria, ...colCriteria, ...trailingCriteria];
    if (allCriteria.length === 0) return;

    const hasAdvanced = allCriteria.some((c) => c && c._constructor === 'AdvancedCriteria');
    const finalCriteria = hasAdvanced
        ? { _constructor: 'AdvancedCriteria', operator: 'and', criteria: allCriteria }
        : allCriteria;
    queryParams.append('criteria', JSON.stringify(finalCriteria));
}

export function normalizeDefaultValue(val, normalized, key) {
    if (typeof val === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(val)) {
        const [dd, mm, yyyy] = val.split('-');
        normalized[key] = `${yyyy}-${mm}-${dd}`;
    } else if (typeof val === 'string' && /^'.*'$/.test(val)) {
        normalized[key] = val.slice(1, -1).replace(/''/g, "'");
    } else if (typeof val === 'number' && Number.isInteger(val)) {
        // Enum/list fields are stored as strings in the DB (e.g. priority: 5 → "5").
        // The backend /defaults endpoint returns them as JSON integers, but the
        // PATCH/POST API expects string values — otherwise OBDal throws a type error.
        normalized[key] = String(val);
    }
}

// Normalize a creation-defaults response (already id-stripped) from Etendo format,
// per normalizeDefaultValue:
// - Dates: dd-MM-yyyy → yyyy-MM-dd (HTML date input)
// - Quoted SQL literals: 'foo' → foo
// - Integers → strings (list/enum columns are VARCHAR in the DB)
// Booleans are NOT normalized here. The comment this replaces claimed they were
// ("Y" → true), and they never have been — normalizeDefaultValue has no boolean
// branch. NEO canonicalizes them server-side since ETP-4793, and every consumer
// additionally tolerates the raw "Y"/"N" storage encoding — see
// EntityForm.renderCheckboxField and
// e2e/tests/flows/boolean-defaults-tolerance.mocked.spec.js.
// Plus the contacts-window backstop: oBTIKTaxIDKey falls back to '1' (NIF) when
// the backend sends none. Pure — returns a normalized copy, touches no state.
export function normalizeCreationDefaults(rawDefaults, { entity, apiBaseUrl }) {
    const normalized = { ...rawDefaults };
    for (const [key, val] of Object.entries(normalized)) {
        normalizeDefaultValue(val, normalized, key);
    }

    const isContactsBusinessPartner = entity === 'businessPartner'
        && /\/contacts$/i.test(apiBaseUrl || '');
    if (isContactsBusinessPartner && (normalized.oBTIKTaxIDKey == null || normalized.oBTIKTaxIDKey === '')) {
        normalized.oBTIKTaxIDKey = '1';
    }
    return normalized;
}

// ETP-4741 merge guard: apply backend creation defaults over the editing state
// without clobbering anything the user already typed while the request flew.
export function mergeDefaultsPreservingUserEdits(prev, defaults, userChangedKeys) {
    const merged = { ...prev };
    for (const [key, val] of Object.entries(defaults)) {
        if (userChangedKeys.has(key)) continue;
        // A field's $_identifier companion follows its base key: if the user
        // picked a value, its display label must not be replaced by the
        // default's label either.
        if (key.endsWith('$_identifier')
            && userChangedKeys.has(key.slice(0, -'$_identifier'.length))) {
            continue;
        }
        merged[key] = val;
    }
    return merged;
}

export function shouldSkipPayloadField(key, value, backendDefaultKeysRef, userChangedKeysRef, requiredFormKeys, isContactsBusinessPartnerCreate, editing) {
    // Always skip ID fields, identifier companions, and legacy FK keys (e.g. ad_org_id)
    // managed by the backend — these should never be sent by the client on create/update.
    if (key === 'id' || key.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(key)) {
        return true;
    }
    if (value === '' || value == null) {
        return true;
    }

    // Skip NEO sequence placeholders (e.g. "<10000000>") — these are display hints
    // for auto-generated values and must not be sent to the backend on create.
    if (typeof value === 'string' && /^<\d+>$/.test(value)) {
        return true;
    }

    // Skip short numeric legacy FK IDs that came from backend defaults and were not
    // explicitly changed by the user (e.g. language: "181"). These are resolved by the
    // backend automatically; sending them as raw integers causes SmartClient import errors.
    // Exception: required fields must always be sent so the user's chosen value persists.
    if (
        typeof value === 'string'
        && /^\d{3,9}$/.test(value)
        && backendDefaultKeysRef.current.has(key)
        && !userChangedKeysRef.current.has(key)
        && !requiredFormKeys.has(key)
    ) {
        return true;
    }

    // Contacts (Business Partner): keep create aligned with Classic behavior.
    // Billing preference fields are configured only after header creation.
    // If sent here, org/window defaults can persist unwanted values on first save.
    if (isContactsBusinessPartnerCreate && CONTACTS_PRECREATE_BILLING_FIELDS.has(key)) {
        return true;
    }

    // Ignore SmartClient temporary import references (e.g. "100_BusinessPartner")
    // for FK-like fields. These pseudo IDs are client-internal placeholders and are
    // invalid as persistent FK values in NEO POST payloads.
    const hasIdentifierCompanion = Object.prototype.hasOwnProperty.call(editing, `${key}$_identifier`);
    return hasIdentifierCompanion
        && typeof value === 'string'
        && /^\d+_[A-Za-z][A-Za-z0-9]*$/.test(value);

}

// ETP-4933: getReadOnly / getVisible / getMissingRequiredFields moved to
// lib/requiredFields.js so useFormValidity can reuse the predicate without importing
// this module (that would be a cycle, since we import useFormValidity below).
// Re-exported here because ten call sites across components/, windows/ and __tests__/
// still import them from useEntity — moving them outright would be a needless break.
export { getReadOnly, getVisible, getMissingRequiredFields };

// Returns the keys of visible, editable fields whose non-empty value fails the
// given format check (getError returns an i18n key, or null when valid/empty/not
// applicable). Empty values are always valid — these fields are optional.
// ReadOnly/hidden fields are skipped (mirrors getMissingRequiredFields) so a
// server-provided malformed value on a locked field can't block the save.
export function getInvalidFormatFields(fields, editing, getError) {
    const isReadOnly = getReadOnly(editing);
    const isVisible = getVisible(editing);
    return fields
        .filter(f => !isReadOnly(f) && isVisible(f) && getError(f, editing?.[f.key]) !== null)
        .map(f => f.key);
}

// Email/website format collectors — thin, named wrappers over the generic
// getInvalidFormatFields so each format keeps its own testable entry point.
export function getInvalidEmailFields(fields, editing) {
    return getInvalidFormatFields(fields, editing, getEmailFieldError);
}

export function getInvalidWebsiteFields(fields, editing) {
    return getInvalidFormatFields(fields, editing, getWebsiteFieldError);
}

export function getInvalidPhoneFields(fields, editing) {
    return getInvalidFormatFields(fields, editing, getPhoneFieldError);
}

// Generic numeric constraint gate (min / integer), declared per-field in the
// contract. Unlike the format checks, it runs against ALL currently registered
// fields (not just ones the user touched this session): the blur toast in
// EntityForm fires independently of onChange, so a field the user never
// "changed" per userChangedKeysRef can still be visibly invalid — that case must
// still block save. Naturally a no-op for any window whose fields declare neither
// `min` nor `integer` (getNumericFieldError returns null for them). ETP-4542.
// Returns { key, errorKey, errorParams } for the first violating field, or null
// when clean. `errorParams` carries the i18n interpolation values (e.g. { min })
// so the toast can render "Value must be at least 1" rather than a generic text.
export function getNumericFieldViolation(fields, editing) {
    const isReadOnly = getReadOnly(editing);
    const isVisible = getVisible(editing);
    for (const f of fields) {
        if (isReadOnly(f) || !isVisible(f)) continue;
        const err = getNumericFieldError(f, editing?.[f.key]);
        if (err) return { key: f.key, errorKey: err.key, errorParams: err.params };
    }
    return null;
}

// Block the save on a format-invalid field (email, website, …) and surface a
// toast ONLY — unlike the required-field path, format errors deliberately do NOT
// set an inline fieldError under the input (the toast is the single signal).
// Empty stays valid (checked before this is called); the null return blocks save.
// `toastId` is optional and backward-compatible: the email/website/phone
// gates below don't pass it (they have no blur+click race to dedupe against,
// since those fields don't fire a competing toast on blur), so they keep
// stacking a fresh toast per call exactly as before. Only the numeric gate
// passes a stable id, shared with EntityForm's blur toast for the same field.
export function reportInvalidFormatField(messageKey, ui, setSaveError, setIsSaving, toastId, params = {}) {
    const msg = ui(messageKey, params);
    setSaveError(msg);
    // Call with exactly one arg when there's no toastId — passing `undefined`
    // explicitly as a second argument still counts as a 2-arg call to test
    // spies (toHaveBeenCalledWith), which would break the existing
    // email/website/phone assertions that expect the pre-ETP-4542 single-arg call.
    if (toastId) {
        toast.error(msg, { id: toastId });
        // ETP-5002: remember it so a later successful save can clear it — see
        // trackSaveBlockToast. Only stable-id toasts are trackable; the
        // email/website/phone gates stack auto-id toasts and are left as they were.
        trackSaveBlockToast(toastId);
    } else {
        toast.error(msg);
    }
    setIsSaving(false);
    return null;
}

// Back-compat wrapper for the email case (kept as a named entry point).
export function reportInvalidEmailFields(ui, setSaveError, setIsSaving) {
    return reportInvalidFormatField('sendModalInvalidEmail', ui, setSaveError, setIsSaving);
}

export function getUrl(isNew, apiBaseUrl, entity, editing) {
    return isNew ? `${apiBaseUrl}/${entity}` : `${apiBaseUrl}/${entity}/${editing.id}`;
}

export function getMethod(isNew) {
    return isNew ? 'POST' : 'PATCH';
}

export function buildPatchPayload(editing, selected) {
    const payload = {};
    for (const [key, value] of Object.entries(editing)) {
        if (key === 'id') continue;
        if (value !== selected[key]) payload[key] = value;
    }
    return payload;
}

export function buildSavePayload({
    isNew,
    selected,
    editing,
    entity,
    apiBaseUrl,
    backendDefaultKeysRef,
    userChangedKeysRef,
    formFieldsRef,
}) {
    if (!isNew && selected) {
        return buildPatchPayload(editing, selected);
    }

    const payload = {};
    const isContactsBusinessPartnerCreate = entity === 'businessPartner'
        && /\/contacts$/i.test(apiBaseUrl || '');
    const requiredFormKeys = new Set(
        [...formFieldsRef.current.values()].flat().filter(f => f.required).map(f => f.key),
    );

    buildCreatePayload(
        editing,
        backendDefaultKeysRef,
        userChangedKeysRef,
        requiredFormKeys,
        isContactsBusinessPartnerCreate,
        payload,
    );
    return payload;
}

export async function handleSaveErrorResponse(res, ui, setFieldErrors, setSaveError) {
    // ETP-3894: parse a structured MISSING_REQUIRED_FIELDS 400 from the backend so
    // the UI can highlight the missing fields. Falls back to the regular error
    // extraction for any other error shape.
    let backendFieldErrors = null;
    try {
        const cloned = res.clone();
        const body = await cloned.json();
        const errCode = body?.error?.code;
        const errFields = body?.error?.fields;
        if (errCode === 'MISSING_REQUIRED_FIELDS' && Array.isArray(errFields)) {
            backendFieldErrors = {};
            for (const k of errFields) backendFieldErrors[k] = ui('fieldRequired');
        }
    } catch {
        // ignore — fall through to the legacy extractor
    }
    if (backendFieldErrors) {
        setFieldErrors(backendFieldErrors);
        const msg = ui('requiredFieldsMissing');
        setSaveError(msg);
        toast.error(msg);
        return;
    }
    const msg = await extractErrorMessage(res, ui);
    setSaveError(msg);
    toast.error(msg);
}

export function getSaveSuccessMessage(isNew, ui) {
    return isNew ? ui('recordCreated') : ui('recordSaved');
}

export function buildCreatePayload(editing, backendDefaultKeysRef, userChangedKeysRef, requiredFormKeys, isContactsBusinessPartnerCreate, payload) {
    for (const [key, value] of Object.entries(editing)) {
        if (shouldSkipPayloadField(key, value, backendDefaultKeysRef, userChangedKeysRef, requiredFormKeys, isContactsBusinessPartnerCreate, editing)) continue;

        payload[key] = value;
    }
}

export function reportMissingRequiredFields(missing, ui, setFieldErrors, setSaveError, setIsSaving) {
    const fieldsErr = {};
    for (const k of missing) fieldsErr[k] = ui('fieldRequired');
    setFieldErrors(fieldsErr);
    const msg = ui('requiredFieldsMissing');
    setSaveError(msg);
    toast.error(msg);
    setIsSaving(false);
    return null;
}

export function shouldRefetchAfterSave(saved, refetchAfterSave) {
    return saved?.id && refetchAfterSave;
}

export async function resolveSavedRecordAfterSave(saved, {
    apiBaseUrl,
    entity,
    headers,
    refetchAfterSave,
}) {
    if (!shouldRefetchAfterSave(saved, refetchAfterSave)) {
        return saved;
    }
    try {
        const refetchRes = await fetch(`${apiBaseUrl}/${entity}/${saved.id}`, { headers });
        const refetchData = refetchRes.ok ? await refetchRes.json() : null;
        return normalizeRecord(refetchData?.response?.data?.[0] ?? refetchData ?? saved, entity);
    } catch {
        return saved;
    }
}

// ETP-4830 — stable id for the generic post-save toast. Any caller that needs to
// REPLACE this toast with its own (e.g. a window's `onAfterCreate` showing a custom
// "record created, do X next" message) MUST pass this same id to `toast.success()`
// rather than calling `toast.dismiss()` first: sonner's `ToastState.create()` treats
// a toast whose id already exists as an in-place UPDATE (one synchronous `publish`,
// same code path as a fresh toast — see node_modules/sonner's `Observer.create`),
// while `toast.dismiss()` with no id schedules its removal via `requestAnimationFrame`
// on a DIFFERENT internal timer than the `setTimeout` a subsequent `toast.success()`
// uses to add itself — two independently-scheduled callbacks with no ordering
// guarantee between them. Calling dismiss() then success() back-to-back (as the
// User window's onAfterCreate originally did) raced exactly that: on a real page,
// with a route navigation and a heavier re-render immediately following in the same
// tick, the dismiss-then-add race can resolve so the replacement toast never mounts.
// Passing the SAME id turns "dismiss the old one, show a new one" into a single
// atomic update — no race window at all.
export const RECORD_SAVE_TOAST_ID = 'record-save-toast';

export function showSaveSuccessToast(silent, isNew, ui) {
    if (silent) return;
    // ETP-5002: retire the save-blocking error toasts this success supersedes BEFORE
    // showing the confirmation. RECORD_SAVE_TOAST_ID's in-place update (ETP-4830) does
    // not promote the toast to the front, so a newer error toast would otherwise keep
    // `data-front` and the user who just fixed the value would still see the error.
    // Dismissing a DIFFERENT id than the one we are about to create means there is no
    // cross-timer race here — unlike ETP-4830's dismiss-then-add of the same toast.
    dismissSaveBlockToasts(toast.dismiss);
    toast.success(getSaveSuccessMessage(isNew, ui), { id: RECORD_SAVE_TOAST_ID });
}

function afterSaveNotifications(data, { silent, isNew, entity, specName, ui }) {
    const backendMessages = data?.messages ?? [];
    if (backendMessages.length > 0) {
        for (const msg of backendMessages) {
            const type = (msg.type || '').toLowerCase();
            const title = msg.title || '';
            const description = msg.text || undefined;
            if (type === 'success') toast.success(title, { description });
            else if (type === 'error') toast.error(title, { description });
            else if (type === 'warning') toast.warning(title, { description });
            else if (title) toast.info(title, { description });
        }
    } else {
        showSaveSuccessToast(silent, isNew, ui);
    }
    if (isNew) {
        trackDocumentCreated();
        trackRecordCreated({ entity, specName });
    } else {
        trackRecordUpdated({ entity, specName });
    }
}

export function useEntity(entity, childEntity, {
    token,
    apiBaseUrl,
    childSortBy,
    baseFilter,
    columnFilters = EMPTY_FILTERS,
    columnDefs = EMPTY_DEFS,
    skipListFetch = false,
    trailingFilter = null,
    refetchAfterSave = false,
    specName = null,
    initialSortColumn = 'creationDate',
    initialSortDirection = 'desc',
    // ETP-4933: the contract-declared descriptor set (`Form.fields`, emitted as a
    // static by the generator). When supplied it REPLACES the mounted-form registry
    // for validity, because the registry only knows what is currently rendered and
    // the "Others" tab mounts only while it is the active tab. Optional: surfaces
    // whose form predates the static fall back to the registry (see below).
    contractFields = null,
}) {
    const logout = useLogout();
    const ui = useUI();
    const [items, setItems] = useState([]);
    // The list response envelope minus the rows — i.e. any sibling of `response.data`
    // the backend chose to send (`totalRows`, `hasMore`, and notably aggregates like
    // `summary`). NEO serializes handler responses verbatim, so a NeoHandler can attach
    // collection-level aggregates in its afterHandle; without this they were parsed and
    // dropped. Consumers read it through ListView's `headerContent({ meta })`.
    const [meta, setMeta] = useState(null);
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(null);
    const [children, setChildren] = useState([]);
    const [childDefaults, setChildDefaults] = useState({});
    const [childrenLoading, setChildrenLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    // ETP-4741: true while handleNew's defaults request is in flight, so the
    // creation form can gate itself instead of letting the user race the merge.
    const [defaultsLoading, setDefaultsLoading] = useState(false);
    // ETP-5002: true while the defaults SESSION is still pending — which is NOT the
    // same window as defaultsLoading above. defaultsLoading is a 4s UX budget: it
    // releases early so the user can start working while the request keeps running.
    // This flag tracks the request itself, and only clears when the response lands,
    // errors, or the session is neutralized. The required-field gate (ETP-4933) needs
    // the request window, not the UX window: on a slow `GET /<entity>/defaults` the
    // budget expired, the form unlocked, and the gate then blocked the primary action
    // on a required field whose default was still in the air (`purchase-order`
    // /`warehouse`, the ETP-5002 rectificativa E2E failures). Blocking is deferred
    // until we actually know whether the value is coming.
    const [defaultsPending, setDefaultsPending] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // ETP-4542: identifier of the header process currently running (POST in flight),
    // or null when idle. A per-process id (not a global boolean) gives per-button
    // granularity so only the button that was clicked reflects the loading state.
    const [runningProcess, setRunningProcess] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [saveError, setSaveError] = useState(null);
    // ETP-3894: per-field error map. Set when handleSave fails because mandatory fields
    // are empty (either client-side or via backend MISSING_REQUIRED_FIELDS) so EntityForm
    // can highlight each input. Cleared on successful save and on field change.
    const [fieldErrors, setFieldErrors] = useState({});
    const [sortColumn, setSortColumn] = useState(initialSortColumn);
    const [sortDirection, setSortDirection] = useState(initialSortDirection);
    const startRowRef = useRef(0);
    const sampleRowRef = useRef(null);
    // Keys returned by the backend /defaults endpoint for the current new-record session.
    const backendDefaultKeysRef = useRef(new Set());
    // Fields explicitly changed by the user (via handleChange) in the current new-record session.
    const userChangedKeysRef = useRef(new Set());
    // ETP-4741: monotonic id of the current defaults fetch. A response (or its
    // timer) only acts while its epoch is still current — bumping the epoch is
    // how the timeout and newer handleNew calls make in-flight responses inert,
    // even when the underlying fetch implementation ignores the abort signal.
    const defaultsEpochRef = useRef(0);
    // ETP-4741: AbortController of the in-flight defaults fetch, null when none
    // is pending. Lets record loads neutralize the /new session (see below).
    const defaultsAbortRef = useRef(null);
    // ETP-3894: per-form snapshot of visible fields registered by each EntityForm instance.
    // Keyed by a stable formId (React.useId) so multiple EntityForms accumulate rather than
    // overwrite each other. handleSave flattens all entries to validate the complete form.
    const formFieldsRef = useRef(new Map());
    // ETP-4933: reactive mirror of the registry above, so the Save button can gate on
    // required-field completeness instead of only reporting it after the click.
    //
    // We mirror a SIGNATURE, not the field arrays. The registering effect in
    // EntityForm re-runs on every visibility change (its `displayFields` are
    // recomputed each render), so a state write on that path would re-render →
    // recompute → re-fire the effect → loop. The guard is the identity return in the
    // updater below: when the signature is unchanged React bails out of the re-render
    // entirely, so a re-registration carrying the same fields costs nothing.
    const [registeredFieldsKey, setRegisteredFieldsKey] = useState('');
    const syncRegisteredFields = useCallback(() => {
        const next = fieldsSignature([...formFieldsRef.current.values()].flat());
        setRegisteredFieldsKey(prev => (prev === next ? prev : next));
    }, []);

    // True when editing has diverged from the last-saved selected state.
    // For new records (selected === null): dirty as soon as any non-id field has a value.
    const isDirtyHeader = useMemo(() => {
        if (!selected) {
            return Object.keys(editing || {}).some(
                k => k !== 'id' && editing[k] != null && editing[k] !== ''
            );
        }
        return Object.entries(editing || {}).some(
            ([key, val]) => key !== 'id' && val !== selected[key]
        );
    }, [editing, selected]);

    const headers = buildHeaders(token);

    const refresh = useCallback(() => {
        startRowRef.current = 0;
        setHasMore(true);
        setLoading(true);

        const colDef = columnDefs[sortColumn] || { key: sortColumn };
        const sortKey = resolveBackendSort(colDef, sortDirection);

        const queryParams = new URLSearchParams();
        queryParams.append('_sortBy', sortKey);
        queryParams.append('_startRow', '0');
        queryParams.append('_endRow', String(BATCH_SIZE - 1));

        applyFilterParams(queryParams, baseFilter, columnFilters, columnDefs, trailingFilter);

        fetch(`${apiBaseUrl}/${entity}?${queryParams.toString()}`, { headers })
            .then(res => {
                if (res.status === 401) {
                    logout();
                    throw new Error('401');
                }
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then(data => {
                const rows = normalizeRows(data?.response?.data ?? (Array.isArray(data) ? data : []), entity);
                setItems(rows);
                setMeta(extractResponseMeta(data));
                startRowRef.current = rows.length;
                if (rows.length < BATCH_SIZE) setHasMore(false);
                setLoading(false);
            })
            .catch((e) => {
                console.error('refresh error', e);
                setItems([]);
                setMeta(null);
                setHasMore(false);
                setLoading(false);
            });
    }, [apiBaseUrl, entity, token, sortColumn, sortDirection, baseFilter, columnFilters, columnDefs, trailingFilter, logout]);

    const loadMore = useCallback(() => {
        if (!hasMore || loadingMore || loading) return;
        setLoadingMore(true);
        const start = startRowRef.current;

        const colDef = columnDefs[sortColumn] || { key: sortColumn };
        const sortKey = resolveBackendSort(colDef, sortDirection);

        const queryParams = new URLSearchParams();
        queryParams.append('_sortBy', sortKey);
        queryParams.append('_startRow', String(start));
        queryParams.append('_endRow', String(start + BATCH_SIZE - 1));

        applyFilterParams(queryParams, baseFilter, columnFilters, columnDefs, trailingFilter);

        fetch(`${apiBaseUrl}/${entity}?${queryParams.toString()}`, { headers })
            .then(res => {
                if (res.status === 401) {
                    logout();
                    throw new Error('401');
                }
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then(data => {
                const rows = normalizeRows(data?.response?.data ?? (Array.isArray(data) ? data : []), entity);
                setItems(prev => [...prev, ...rows]);
                // Aggregates are computed over the whole collection server-side, so each
                // page repeats the same values — refreshing keeps them in sync if the
                // backend ever recomputes, and never mixes page-scoped with total-scoped.
                setMeta(extractResponseMeta(data));
                startRowRef.current = start + rows.length;
                if (rows.length < BATCH_SIZE) setHasMore(false);
                setLoadingMore(false);
            })
            .catch((e) => {
                console.error('loadMore error', e);
                setLoadingMore(false);
                setHasMore(false);
            });
    }, [apiBaseUrl, entity, token, sortColumn, sortDirection, hasMore, loadingMore, loading, baseFilter, columnFilters, columnDefs, trailingFilter, logout]);

    // List fetch is a mount-time decision. Flipping skipListFetch after mount
    // (e.g. a detail view whose recordId goes 'new' → ':id') must NOT retroactively
    // trigger a list fetch — that caused the whole DetailView to show "Loading"
    // post-save. Callers that need to reload the list call refresh() explicitly.
    const didListFetchRef = useRef(false);
    useEffect(() => {
        if (didListFetchRef.current) return;
        if (skipListFetch) return;
        didListFetchRef.current = true;
        refresh();
    }, [refresh, skipListFetch]);

    const fetchChildren = useCallback((parentId, { silent = false } = {}) => {
        if (!childEntity || !parentId) {
            setChildren([]);
            if (!silent) setChildrenLoading(false);
            return;
        }
        // `silent` skips the childrenLoading flag entirely (used by handleSave's
        // post-save background refresh, ETP-4512): toggling childrenLoading while
        // children.length is still 0 makes DetailView's isInitialChildrenLoading
        // gate swap bottomSection.linesEmptyState for a spinner for one render —
        // unmounting any in-flight click handler on that component (e.g. an
        // "Import from receipt" button awaiting handleSave() before opening its
        // modal) and silently dropping its queued setState. See
        // purchase-invoice-import-from-receipt.mocked.spec.js and
        // return-to-vendor-shipment.mocked.spec.js.
        if (!silent) setChildrenLoading(true);
        // NEO Headless uses ?parentId= to filter child entity records
        fetch(`${apiBaseUrl}/${childEntity}?parentId=${parentId}${childSortBy ? `&_sortBy=${childSortBy}` : ''}`, { headers })
            .then(res => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then(data => {
                const rows = normalizeRows(data?.response?.data ?? (Array.isArray(data) ? data : []), childEntity);
                setChildren(rows);
            })
            // Silent refreshes must not blank a table the user is already looking
            // at just because one background request failed transiently.
            .catch(() => { if (!silent) setChildren([]); })
            .finally(() => { if (!silent) setChildrenLoading(false); });
    }, [apiBaseUrl, childEntity, token, childSortBy]);

    // HandleDefaults: fetch backend-resolved defaults for a NEW child line under the
    // given parent and normalize them (dates, booleans, enum ints) exactly as
    // handleNew does for the header. Returns a {key: value} map (also stored in
    // childDefaults). Best-effort: {} when childEntity/parentId is missing or on error.
    const fetchChildDefaults = useCallback(async (parentId) => {
        if (!childEntity || !parentId) {
            setChildDefaults({});
            return {};
        }
        try {
            const res = await fetch(`${apiBaseUrl}/${childEntity}/defaults?parentId=${parentId}`, { headers });
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json();
            // Copy the resolved defaults and drop the backend id (never seeded into
            // the add-row); normalize the remaining values in place.
            const normalized = { ...(data?.defaults ?? {}) };
            delete normalized.id;
            for (const [key, val] of Object.entries(normalized)) {
                normalizeDefaultValue(val, normalized, key);
            }
            setChildDefaults(normalized);
            return normalized;
        } catch {
            setChildDefaults({});
            return {};
        }
        // NOTE: `headers` is intentionally omitted — buildHeaders(token) returns a
        // fresh object every render, so depending on it would make this callback
        // unstable and re-fire DetailView's fetch effect every render (infinite
        // loop / network never idles). token covers the only header that changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBaseUrl, childEntity, token]);

    // ETP-4741 (QA BUG-1) — loading an EXISTING record while a /new defaults
    // request is still in flight must kill that request the same way a newer
    // handleNew does: bump the epoch so the late response is inert, abort the
    // fetch, and release defaultsLoading explicitly. The explicit release
    // matters — once the epoch moves, handleNew's own finally skips its
    // release, so relying on it would latch the gate true forever. Neutralized
    // sessions emit no defaults_block event. No-op when nothing is pending.
    const neutralizePendingDefaults = useCallback(() => {
        const controller = defaultsAbortRef.current;
        if (!controller) return;
        defaultsAbortRef.current = null;
        defaultsEpochRef.current += 1;
        setDefaultsLoading(false);
        setDefaultsPending(false);
        controller.abort();
    }, []);

    const fetchById = useCallback((id) => {
        if (!id) return;
        neutralizePendingDefaults();
        setLoading(true);
        fetch(`${apiBaseUrl}/${entity}/${id}`, { headers })
            .then(res => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then(data => {
                const row = normalizeRecord(data?.response?.data?.[0] ?? data, entity);
                setSelected(row);
                setEditing({ ...row });
                fetchChildren(row?.id);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [apiBaseUrl, entity, token, fetchChildren, neutralizePendingDefaults]);

    // Lightweight header refresh used after line add/update/delete operations.
    // Unlike fetchById, this preserves fields the user has explicitly edited (tracked in
    // userChangedKeysRef) so pending header changes survive line operations.
    // Only server-computed fields (totals, sequence numbers) get updated in editing.
    const refreshHeaderTotals = useCallback((id) => {
        if (!id) return;
        fetch(`${apiBaseUrl}/${entity}/${id}`, { headers })
            .then(res => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then(data => {
                const row = normalizeRecord(data?.response?.data?.[0] ?? data, entity);
                // ETP-4751 — carry forward the transient exemption-cause signals: the header GET
                // does not echo them (they are not entity fields), so a naive setSelected(row)
                // would wipe the flag a line-save just set before the SIF toast effect runs.
                setSelected(prev => {
                    const next = { ...row };
                    if (prev) {
                        for (const key of EXEMPTION_SIGNAL_KEYS) {
                            if (prev[key] !== undefined) next[key] = prev[key];
                        }
                    }
                    return next;
                });
                setEditing(prev => {
                    if (!prev) return { ...row };
                    const merged = { ...prev };
                    for (const [key, val] of Object.entries(row)) {
                        if (!userChangedKeysRef.current.has(key)) merged[key] = val;
                    }
                    // Signal keys are transient client-only flags — never overwrite them from the GET.
                    for (const key of EXEMPTION_SIGNAL_KEYS) {
                        if (prev[key] !== undefined) merged[key] = prev[key];
                    }
                    return merged;
                });
            })
            .catch(() => {
            });
    }, [apiBaseUrl, entity, headers]);

    // ETP-4751 — surface the invoice-line handler's transient exemption-cause signals
    // (exemptionCauseAutoFilled / exemptionCauseWarning) to the header state so the SIF
    // tab can toast. The backend (InvoiceLineHandler#autoFillExemptionCauseAfterLineSave)
    // stamps AT MOST ONE of these on the LINE-save response body; they are mutually
    // exclusive and never real entity fields. We mirror the value into BOTH `selected`
    // and `editing` so it never shows up as a PATCH diff (buildPatchPayload compares the
    // two), and we ALWAYS write the resolved boolean (true when present, false when not)
    // so the flag flips back to false between saves — that reset is what lets the SIF
    // tab's one-shot toast guard re-arm and fire again on the next qualifying line save.
    const applyExemptionCauseSignals = useCallback((serverLineRecord) => {
        if (!serverLineRecord || typeof serverLineRecord !== 'object') return;
        const patch = {};
        for (const key of EXEMPTION_SIGNAL_KEYS) {
            patch[key] = serverLineRecord[key] === true || serverLineRecord[key] === 'true';
        }
        setSelected(prev => (prev ? { ...prev, ...patch } : prev));
        setEditing(prev => (prev ? { ...prev, ...patch } : prev));
    }, []);

    // ETP-4029 — narrow escape hatch for refreshHeaderTotals's userChangedKeysRef
    // protection above, scoped to ONE known cross-surface-sync case (see call site
    // in DetailView.jsx: the Exchange Rates secondary tab on sales-invoice /
    // purchase-invoice reverse-syncing the header's hidden eTGOCurrencyRate field).
    //
    // handleChange marks a field in userChangedKeysRef the moment the user edits
    // it via the header form, and — by design — that mark is never cleared by a
    // save, only by loading a different record (see handleSelect below). That is
    // correct for its original purpose: protecting a genuinely UNSAVED header
    // edit from being clobbered when a line add/update triggers refreshHeaderTotals
    // mid-edit. But eTGOCurrencyRate is unusual: it can ALSO be written from a
    // completely different UI surface (the Exchange Rates tab's own PATCH, whose
    // backend handler — InvoiceExchangeRateHandler — mirrors the new value onto
    // the invoice header as a reverse sync). If the user had earlier edited the
    // rate via the header's CurrencyRatePicker in the same visit (already saved,
    // long done), that stale mark would permanently block refreshHeaderTotals from
    // ever showing the tab's newer, already-persisted value — the header would
    // keep displaying the old rate until a manual reload.
    //
    // This forgets the "user changed" mark for exactly one caller-supplied key, so
    // the NEXT refreshHeaderTotals call is free to update it from the fresh GET.
    // It is intentionally NOT a general escape hatch from the unsaved-edit
    // protection — callers must only use it where they can prove the field was
    // just re-derived from an authoritative backend write (as the Exchange Rates
    // tab's PATCH response is), never to paper over an unrelated staleness bug.
    const clearUserChangedKey = useCallback((key) => {
        userChangedKeysRef.current.delete(key);
    }, []);

    const handleSelect = useCallback((row) => {
        // Reset the per-session changed-keys set when a different record is loaded,
        // so format validation (email/website/phone) only ever re-checks fields the
        // user actually edits in THIS record — never legacy values inherited from a
        // previously-edited record. Safe for payloads: userChangedKeysRef only feeds
        // buildCreatePayload (new records), not the existing-record PATCH diff.
        neutralizePendingDefaults();
        userChangedKeysRef.current = new Set();
        setSelected(row);
        setEditing(row ? { ...row } : null);
        fetchChildren(row?.id);
    }, [fetchChildren, neutralizePendingDefaults]);

    const handleNew = useCallback(async () => {
        backendDefaultKeysRef.current = new Set();
        userChangedKeysRef.current = new Set();
        setFieldErrors({});
        setSelected(null);
        setEditing({}); // Start with empty so UI is responsive

        // ETP-4741 — the defaults GET races the user, who can already be typing
        // into the open form. Guards: an epoch check discards any response whose
        // session was superseded (a newer handleNew, or a record load via
        // neutralizePendingDefaults), and the merge never touches user-changed
        // keys.
        //
        // The timeout is a UX budget, NOT a correctness mechanism: it only
        // releases the gate so the user can start working. It deliberately does
        // not bump the epoch, drop the abort handle, or abort the request, so
        // the response still merges when it lands and a later record load can
        // still neutralize the session. Full rationale — including the
        // regression that discarding the late response caused (a form with
        // neither defaults nor initial callouts) — lives in
        // docs/generated-custom-windows/app-shell-functional-flows.md §4.
        const epoch = defaultsEpochRef.current + 1;
        defaultsEpochRef.current = epoch;
        const isCurrent = () => defaultsEpochRef.current === epoch;
        const settleTiming = startTiming(OBSERVABILITY_EVENTS.DEFAULTS_BLOCK, {
            properties: { entity },
        });
        const controller = new AbortController();
        defaultsAbortRef.current = controller;
        const timeoutId = setTimeout(() => {
            if (!isCurrent()) return;
            setDefaultsLoading(false);
            settleTiming({ status: 'timeout' });
        }, DEFAULTS_TIMEOUT_MS);

        setDefaultsLoading(true);
        // ETP-5002: deliberately NOT cleared by timeoutId above — see the state decl.
        setDefaultsPending(true);
        try {
            const res = await fetch(`${apiBaseUrl}/${entity}/defaults`, { headers, signal: controller.signal });
            if (!isCurrent()) return;
            if (res.ok) {
                const data = await res.json();
                if (!isCurrent()) return;
                if (data.defaults) {
                    // backendDefaultKeysRef intentionally captures the keys BEFORE
                    // the contacts backstop can add oBTIKTaxIDKey — a backstopped
                    // key must not be treated as backend-provided by
                    // shouldSkipPayloadField.
                    const rawDefaults = { ...data.defaults };
                    delete rawDefaults.id;
                    backendDefaultKeysRef.current = new Set(Object.keys(rawDefaults));
                    const normalized = normalizeCreationDefaults(rawDefaults, { entity, apiBaseUrl });
                    setEditing(prev => mergeDefaultsPreservingUserEdits(prev, normalized, userChangedKeysRef.current));
                }
            }
            // Deliberately not awaited: settleTiming ends in client.track(),
            // a real network call once Mixpanel is enabled. Awaiting it would
            // put the gate release in `finally` behind an analytics endpoint,
            // and a hung track() would latch the form shut forever. track()
            // already swallows provider failures internally, so nothing here
            // needs the result. Same below on the catch path.
            settleTiming({ status: res.ok ? 'ok' : 'error' });
        } catch {
            // Defaults are best-effort; proceed with empty form if endpoint fails
            if (isCurrent()) settleTiming({ status: 'error' });
        } finally {
            if (isCurrent()) {
                clearTimeout(timeoutId);
                defaultsAbortRef.current = null;
                setDefaultsLoading(false);
                setDefaultsPending(false);
            }
        }
    }, [apiBaseUrl, entity, token, headers]);

    const handleChange = useCallback((field, value) => {
        userChangedKeysRef.current.add(field);
        setEditing(prev => ({ ...prev, [field]: value }));
        // ETP-3894: clear the field-level error as soon as the user touches the field.
        // Note: email format errors are toast-only (no inline fieldError is ever set
        // for them), so there is no email-specific clear branch here.
        setFieldErrors(prev => {
            if (!prev || !prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    }, []);

    // ETP-3894: EntityForm calls this on mount/update with its visible fields and a stable
    // formId. Passing fields=null on unmount removes that form's entry so stale fields
    // (e.g. conditionally hidden blocks) don't pollute the validation set.
    const registerFields = useCallback((fields, formId = '__default__') => {
        if (fields === null) {
            formFieldsRef.current.delete(formId);
        } else {
            formFieldsRef.current.set(formId, Array.isArray(fields) ? fields : []);
        }
        // ETP-4933: keep the reactive mirror in step. Guarded — see syncRegisteredFields.
        syncRegisteredFields();
    }, [syncRegisteredFields]);

    const handleSave = useCallback(async ({ silent = false } = {}) => {
        if (!editing) return;
        setIsSaving(true);
        setSaveError(null);
        const isNew = !editing.id;
        // ETP-3894: client-side check for required+editable fields. Skips the network
        // round-trip and shows per-field errors immediately. Only runs on create — for
        // existing records, `editing` already includes server-resolved values.
        if (isNew) {
            const fields = [...formFieldsRef.current.values()].flat();
            const missing = getMissingRequiredFields(fields, editing);
            if (missing.length > 0) {
                return reportMissingRequiredFields(missing, ui, setFieldErrors, setSaveError, setIsSaving);
            }
            setFieldErrors({});
        }
        // Generic numeric constraint (min / integer) hard save-block, checked against ALL
        // currently registered fields for this form — not scoped to isNew or to fields the
        // user "changed" this session. The EntityForm blur toast already warns on invalid
        // values independently of onChange, so the save block must cover the same surface or
        // the toast becomes purely cosmetic. No-op for every window whose fields declare
        // neither `min` nor `integer`. ETP-4542.
        const allFormFields = [...formFieldsRef.current.values()].flat();
        const numericViolation = getNumericFieldViolation(allFormFields, editing);
        if (numericViolation) {
            // Same id as EntityForm's on-blur toast for this field (ETP-4542):
            // when Save is clicked without leaving the input first, blur fires
            // right before this onClick — sonner dedupes the two identical
            // toasts into one instead of stacking them.
            return reportInvalidFormatField(
                numericViolation.errorKey,
                ui,
                setSaveError,
                setIsSaving,
                numericFieldToastId(numericViolation.key),
                numericViolation.errorParams,
            );
        }
        // Format validation (email/website/phone) is scoped to fields the user
        // actually edited THIS session — never untouched legacy values on an
        // existing record (which would otherwise block an unrelated edit). On new
        // records, every entered field is a "changed" key, so new invalid input is
        // still blocked. Toast-only, empty is valid, and never makes a field required.
        const changedFormFields = [...formFieldsRef.current.values()]
            .flat()
            .filter(f => userChangedKeysRef.current.has(f.key));
        const invalidEmails = getInvalidEmailFields(changedFormFields, editing);
        if (invalidEmails.length > 0) {
            return reportInvalidFormatField('sendModalInvalidEmail', ui, setSaveError, setIsSaving);
        }
        const invalidWebsites = getInvalidWebsiteFields(changedFormFields, editing);
        if (invalidWebsites.length > 0) {
            return reportInvalidFormatField('websiteInsecureUrl', ui, setSaveError, setIsSaving);
        }
        const invalidPhones = getInvalidPhoneFields(changedFormFields, editing);
        if (invalidPhones.length > 0) {
            return reportInvalidFormatField('phoneInvalidChars', ui, setSaveError, setIsSaving);
        }
        const url = getUrl(isNew, apiBaseUrl, entity, editing);
        // Use PATCH for existing records (partial update), POST for new
        const method = getMethod(isNew);
        const payload = buildSavePayload({
            isNew,
            selected,
            editing,
            entity,
            apiBaseUrl,
            backendDefaultKeysRef,
            userChangedKeysRef,
            formFieldsRef,
        });
        // NEO Headless expects flat field values — NeoServlet handles wrapping for JsonDataService
        const body = JSON.stringify(payload);
        try {
            const res = await fetch(url, { method, headers, body });
            if (res.ok) {
                const data = await res.json();
                const saved = normalizeRecord(data?.response?.data?.[0] ?? data, entity);
                const resolvedSaved = await resolveSavedRecordAfterSave(saved, {
                    apiBaseUrl,
                    entity,
                    headers,
                    refetchAfterSave,
                });
                setSelected(resolvedSaved);
                setEditing({ ...resolvedSaved });
                setSaveError(null);
                setFieldErrors({});
                // Refresh children after every save, not just create: a header field
                // can drive a backend NeoHandler side effect on a child/join entity
                // (e.g. syncing AD_User_Roles from a role field, ETP-4512) that the
                // frontend has no other way to learn about. Mirrors the reasoning
                // DetailView's justSaved fast-path already applies for the create
                // path ("children ... must be loaded") — this extends it to update.
                // `silent: true`: this call must not toggle childrenLoading — see
                // fetchChildren's own comment for why (it unmounts bottomSection
                // .linesEmptyState mid-click on windows whose "import" flow calls
                // handleSave() before opening its modal).
                fetchChildren(resolvedSaved?.id, { silent: true });
                afterSaveNotifications(data, { silent, isNew, entity, specName, ui });
                return saved;
            } else {
                await handleSaveErrorResponse(res, ui, setFieldErrors, setSaveError);
                return null;
            }
        } catch (err) {
            const msg = err?.message || 'Network error';
            setSaveError(msg);
            toast.error(msg);
            return null;
        } finally {
            setIsSaving(false);
        }
    }, [editing, selected, apiBaseUrl, entity, specName, refetchAfterSave, token, ui, fetchChildren]);

    // Returns true on success, false on failure — callers (e.g. DetailView's
    // confirmHeaderDelete) MUST check this before navigating away, otherwise a
    // failed delete (e.g. FK constraint) silently navigates as if it succeeded.
    const handleDelete = useCallback(async () => {
        if (!selected?.id) return false;
        try {
            const res = await fetch(`${apiBaseUrl}/${entity}/${selected.id}`, { method: 'DELETE', headers });
            if (res.ok) {
                setSelected(null);
                setEditing(null);
                setChildren([]);
                toast.success(ui('recordDeleted'));
                refresh();
                return true;
            } else {
                const msg = await extractErrorMessage(res, ui);
                toast.error(msg);
                return false;
            }
        } catch (err) {
            toast.error(err?.message || 'Network error');
            return false;
        }
    }, [selected, apiBaseUrl, entity, token, refresh, ui]);

    const handleAddChild = useCallback(async (childData) => {
        if (!childEntity || !apiBaseUrl || !token || !selected?.id) return;
        try {
            const body = {};
            // Include all fields from childData, skipping internal/companion keys.
            // Numeric fields (quantity, amount, decimal, integer) are coerced to JS numbers
            // in DataTable.jsx onChange — they arrive here already typed correctly.
            for (const [key, val] of Object.entries(childData)) {
                // Skip internal/companion keys
                if (key === 'id' || key.includes('$_identifier') || /^[a-zA-Z]+_[A-Z]{2,4}$/.test(key)) continue;
                // Skip callout internal fields
                if (key === 'CURSOR_FIELD' || key.startsWith('has')) continue;
                // Skip empty values — let backend defaults handle them
                if (val === '' || val == null) continue;
                body[key] = val;
            }

            // Include parentId in the body — the backend resolves it to the correct FK field name
            // and uses it to load parent record values for @FieldName@ defaults (generic, no hardcoding).
            body.parentId = selected.id;
            const res = await fetch(`${apiBaseUrl}/${childEntity}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const msg = await extractErrorMessage(res, ui);
                setSaveError(msg);
                toast.error(msg);
                return null;
            }
            const data = await res.json().catch(() => null);
            // Refresh children and header totals. refreshHeaderTotals preserves any
            // pending header edits in editing while updating server-computed fields (totals).
            fetchChildren(selected.id);
            refreshHeaderTotals(selected.id);
            const savedLine = normalizeRecord(data?.response?.data?.[0] ?? data, childEntity);
            // ETP-4751 — the exemption-cause signals live at the RESPONSE ROOT
            // (InvoiceLineHandler#augmentResponseWithSignal does body.put(signalKey, true) on the
            // full NEO response, i.e. {response:{data:[line]}, exemptionCauseWarning:true}), NOT on
            // the nested line record. Pass the raw parsed root `data` so applyExemptionCauseSignals
            // can read data.exemptionCauseWarning / data.exemptionCauseAutoFilled; `savedLine` is
            // still what we return / feed to the children refresh.
            applyExemptionCauseSignals(data);
            setSaveError(null);
            toast.success(ui('lineAdded'));
            return savedLine ?? true;
        } catch (err) {
            const msg = err?.message || 'Network error';
            setSaveError(msg);
            toast.error(msg);
            return null;
        }
    }, [childEntity, apiBaseUrl, token, selected, headers, fetchChildren, ui, refreshHeaderTotals, applyExemptionCauseSignals]);

    const handleUpdateChild = useCallback((childId, fieldOrObject, value, signalSource) => {
        setChildren(prev => prev.map(c => {
            if (String(c.id) !== String(childId)) return c;
            if (typeof fieldOrObject === 'object') return { ...c, ...fieldOrObject };
            return { ...c, [fieldOrObject]: value };
        }));
        // ETP-4751 — mirror the transient exemption-cause signals onto the header like
        // handleAddChild does. The backend stamps them at the RESPONSE ROOT
        // (InvoiceLineHandler#augmentResponseWithSignal), NOT on the nested line record, so the
        // caller must pass the raw PATCH/PUT response root as `signalSource`. `fieldOrObject` is
        // the client-side / nested-line object and never carries the flag, so fall back to it only
        // to keep the resolved boolean flipping back to false between saves (which re-arms the
        // one-shot toast guard). Prefer signalSource when provided; otherwise keep the original
        // object-only behaviour so unrelated single-field (string) updates don't reset the flag.
        if (signalSource) applyExemptionCauseSignals(signalSource);
        else if (typeof fieldOrObject === 'object') applyExemptionCauseSignals(fieldOrObject);
        if (selected?.id) refreshHeaderTotals(selected.id);
    }, [selected, refreshHeaderTotals, applyExemptionCauseSignals]);

    const handleDeleteChild = useCallback((childId) => {
        setChildren(prev => prev.filter(c => String(c.id) !== String(childId)));
        // ETP-4751 — reset the transient exemption-cause signals to false on line delete.
        // The backend only stamps these flags on LINE-SAVE responses (POST/PATCH), never on
        // a delete, so without this reset the flag keeps whatever value the last line save
        // left it at. On an edited invoice that previously warned (flag stuck `true`),
        // deleting all lines then re-adding an exempt line stamps `true` again with no
        // intervening `true→false` transition, so the SIF tab's one-shot toast guard never
        // re-arms and the warning silently fails to re-fire. Passing an empty object makes
        // applyExemptionCauseSignals write both keys as `false` (resolved boolean), which is
        // exactly the reset the guard needs. Ordered BEFORE refreshHeaderTotals so the false
        // is what refreshHeaderTotals carries forward (it copies the signal keys from `prev`
        // when the header GET returns), not overwritten by it.
        applyExemptionCauseSignals({});
        // Refresh header to update totals after line deletion
        if (selected?.id) refreshHeaderTotals(selected.id);
    }, [selected, refreshHeaderTotals, applyExemptionCauseSignals]);

    const handleSaveAndProcess = useCallback(async (draftModeConfig) => {
        const saved = await handleSave({ silent: true });
        if (!saved?.id) return null;

        const { processField, processValue, extraParams } = draftModeConfig;
        const url = `${apiBaseUrl}/${entity}/${saved.id}/action/${processField}`;
        // `extraParams` are merged at the top level of the body (not inside fieldValues)
        // so processes whose AD parameters are validated against the request root —
        // e.g. M_Internal_Consumption_Post requiring `action` — receive them.
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ fieldValues: { [processField]: processValue }, ...(extraParams || {}) }),
        });
        if (!res.ok) {
            const msg = await extractErrorMessage(res, ui);
            toast.error(msg);
            return null;
        }
        toast.success(ui('recordProcessed'));
        trackTransactionPosted();
        trackDocumentCompleted({
            entity,
            specName,
            source: 'detail_view',
            operation: 'complete',
        });
        if (isInvoiceSpec(specName)) {
            incrementSurveyCounter('invoicing');
            emitSurveyTrigger();
        } else if (isOrderSpec(specName)) {
            incrementSurveyCounter('order');
            emitSurveyTrigger();
        }
        refresh();
        // Fetch updated record and update selected state so the detail view reflects the new status
        try {
            const updatedRes = await fetch(`${apiBaseUrl}/${entity}/${saved.id}`, { method: 'GET', headers });
            if (updatedRes.ok) {
                const data = await updatedRes.json();
                const updated = normalizeRecord(data?.response?.data?.[0] ?? data, entity);
                setSelected(updated);
                return updated;
            }
        } catch { /* ignore, fall back to saved */
        }
        return saved;
    }, [handleSave, apiBaseUrl, entity, specName, token, refresh, ui]);

    const handleProcess = useCallback(async (process, paramValues = {}) => {
        if (!selected?.id) return;
        // ETP-4542: mark this process as running so consumers (DetailView) can show a
        // loading state and block re-clicks. The id must match the one the button uses
        // to render (columnName ?? name). Cleared in the finally block below on both
        // success and error, so the button always returns to its normal state.
        const processId = process.columnName ?? process.name;
        setRunningProcess(processId);
        // Build field values: start with hidden params from process definition, then merge user-supplied values
        const fieldValues = {};
        for (const p of (process.params ?? [])) {
            if (p.hidden) fieldValues[p.key] = p.value;
        }
        Object.assign(fieldValues, paramValues);
        const url = `${apiBaseUrl}/${entity}/${selected.id}/action/${process.columnName ?? process.name}`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ fieldValues }),
            });
            if (res.ok) {
                const specificKey = `${process.columnName ?? process.name}Completed`;
                const specificMsg = ui(specificKey);
                const fallbackMsg = process.label ? `${ui(process.label) || process.label} completed` : 'Process completed';
                toast.success(specificMsg !== specificKey ? specificMsg : fallbackMsg);
                window.dispatchEvent(new CustomEvent('neo:processSuccess', {
                    detail: {
                        process,
                        entity,
                        recordId: selected.id
                    }
                }));
                if (isCompletionProcess(process)) {
                    trackDocumentCompleted({
                        entity,
                        specName,
                        source: 'process_action',
                        operation: 'complete',
                    });
                }
                fetchById(selected.id);
                refresh();
            } else {
                const msg = await extractErrorMessage(res, ui);
                toast.error(msg);
            }
        } catch (err) {
            toast.error(err?.message || 'Network error');
        } finally {
            setRunningProcess(null);
        }
    }, [selected, entity, specName, apiBaseUrl, token, refresh, fetchById, ui]);

    // Prime the hook state with a freshly-saved record so consumers (DetailView) can
    // navigate /new → /:id without triggering a redundant GET /<entity>/:id. The POST
    // response already carries the full record — primeSaved makes that explicit for
    // callers that need to skip the "empty store → fetchById" path post-save.
    // See docs/plans/sales-order-save-performance.md (Etapa 1.2).
    const primeSaved = useCallback((saved) => {
        if (!saved?.id) return;
        setSelected(saved);
        setEditing({ ...saved });
    }, []);

    // ETP-4933: the registered fields, re-read whenever the mirrored signature moves.
    // Reading the ref during render is safe precisely because the signature is what
    // gates this memo — and any VALUE change re-renders anyway (via `editing`), so
    // validity stays live per keystroke without the fields themselves being state.
    const registeredFields = useMemo(
        () => [...formFieldsRef.current.values()].flat(),
        [registeredFieldsKey],
    );

    // `skipUnchangedInvalid` is on only for existing records (ETP-4933 §3.2): a legacy
    // row with an empty required column must stay saveable, or the user cannot correct
    // an unrelated field. New records validate everything, matching handleSave.
    // ETP-4933: UNION of the contract set and what actually got registered — neither is
    // sufficient alone, and picking one loses required fields either way.
    //
    // The contract is mount-independent, so it covers sections the registry never sees
    // (`section: 'other'` was entirely invisible to validation before). But it only
    // carries fields the generator emitted, i.e. `form: true` in the contract: `assets`
    // marks its 10 required fields `form: false` and renders them from a hand-written
    // formFooter panel, so a contract-only gate saw 3 optional fields, found nothing
    // missing, and left Save enabled on an empty new record.
    //
    // Union is the safe direction: it can only ever ADD a required field, never drop
    // one. Deduped by key, contract descriptor winning — it is the richer one (carries
    // readOnlyLogic / displayLogic straight from the AD).
    const validationFields = useMemo(
        () => mergeValidationFields(contractFields, registeredFields),
        [contractFields, registeredFields]
    );
    // ETP-5002: `deferBlocking` while the creation defaults are still pending. Scoped to
    // NEW records on purpose — an existing record has no defaults session (fetchById
    // neutralizes any in flight), and its own policy (skipUnchangedInvalid) already
    // spares untouched empties, so widening this would only mask a real block.
    const { isValid, missingRequired, missingRequiredFields } = useFormValidity({
        fields: validationFields,
        values: editing,
        changedKeys: userChangedKeysRef.current,
        skipUnchangedInvalid: Boolean(editing?.id),
        deferBlocking: defaultsPending && !editing?.id,
    });

    return {
        items, meta, selected, editing, children, childDefaults, childrenLoading, loading, defaultsLoading, defaultsPending, loadingMore, hasMore, saveError, isSaving,
        runningProcess,
        isDirtyHeader,
        isValid, missingRequired, missingRequiredFields,
        fieldErrors, registerFields,
        handleSelect, handleNew, handleChange, handleSave, handleSaveAndProcess, handleDelete, handleProcess,
        handleAddChild, handleUpdateChild, handleDeleteChild, primeSaved,
        refresh, fetchById, fetchChildren, fetchChildDefaults, loadMore, refreshHeaderTotals, clearUserChangedKey,
        sortColumn, sortDirection, setSortColumn, setSortDirection,
    };
}
