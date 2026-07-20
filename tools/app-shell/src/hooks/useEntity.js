import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { resolveBackendSort, buildBackendFilter } from '@/lib/gridQuery.js';
import { translateBackendError } from '@/lib/backendErrors.js';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { trackDocumentCreated, trackTransactionPosted } from '@/lib/observability/health-events.js';
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
import { createQueryKey, useOptionalDataCache } from '@etendosoftware/app-shell-core/data';

// Re-exported for back-compat: isEmailField lives in recipientEdits.js (the
// dependency-light email util) so the grid components can reuse it without
// importing this heavy hook module.
export { isEmailField };

function buildHeaders(token) {
    let locale = 'es_ES';
    try { locale = localStorage.getItem('schema-forge-locale') || 'es_ES'; } catch { /* SSR/test */ }
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Propagate the UI locale so backend AD_Message translations match the
        // language the user selected in the frontend.
        'Accept-Language': locale,
    };
}

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

function derivePersonName(firstName, lastName) {
    const first = String(firstName ?? '').trim();
    const last = String(lastName ?? '').trim();
    return [first, last].filter(Boolean).join(' ').slice(0, 60);
}

export function applyContactNameDefaults(payload, source) {
    if (!payload.name) {
        const derivedName = derivePersonName(
            payload.firstName ?? source.firstName,
            payload.lastName ?? source.lastName
        );
        if (derivedName) payload.name = derivedName;
    }
    if (!payload.username && payload.name) {
        payload.username = String(payload.name).slice(0, 60);
    }
}

export function applyContactsRequiredFields(entity, payload, source = {}) {
    if (!payload || typeof payload !== 'object') return payload;

    if (entity === 'contact' || entity === 'adUser' || entity === 'user') {
        applyContactNameDefaults(payload, source);
    }

    if (entity === 'businessPartner' || entity === 'bpartner') {
        if (!payload.name && source.name) payload.name = source.name;
        if (!payload.searchKey) {
            const fallback = source.searchKey || source.name || payload.name;
            // C_BPartner.Value (searchKey) is AD-constrained to 40 chars — reproduced via a
            // real create with a long commercial name ("Value too long. Length 48, maximum
            // allowed 40"). Name itself has more headroom (60, same as derivePersonName
            // above), so only this fallback needs truncating.
            if (fallback) payload.searchKey = String(fallback).slice(0, 40);
        }
    }

    return payload;
}

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

const EMPTY_FILTERS = {};
const EMPTY_DEFS = {};

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

export function getMissingRequiredFields(fields, editing) {
    const isReadOnly = getReadOnly(editing);
    const isVisible = getVisible(editing);
    return fields
        .filter(f => f.required && !isReadOnly(f) && isVisible(f) && f.type !== 'checkbox' && f.section !== 'summary')
        .filter(f => {
            const v = editing?.[f.key];
            return v == null || v === '' || (typeof v === 'string' && v.trim() === '');
        })
        .map(f => f.key);
}

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

// Block the save on a format-invalid field (email, website, …) and surface a
// toast ONLY — unlike the required-field path, format errors deliberately do NOT
// set an inline fieldError under the input (the toast is the single signal).
// Empty stays valid (checked before this is called); the null return blocks save.
export function reportInvalidFormatField(messageKey, ui, setSaveError, setIsSaving) {
    const msg = ui(messageKey);
    setSaveError(msg);
    toast.error(msg);
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

export function buildPatchPayload(editing, selected, entity) {
    const payload = {};
    for (const [key, value] of Object.entries(editing)) {
        if (key === 'id') continue;
        if (value !== selected[key]) payload[key] = value;
    }
    applyContactsRequiredFields(entity, payload, editing);
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
        return buildPatchPayload(editing, selected, entity);
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
    applyContactsRequiredFields(entity, payload, editing);
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

export function showSaveSuccessToast(silent, isNew, ui) {
    if (!silent) toast.success(getSaveSuccessMessage(isNew, ui));
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
}) {
    const logout = useLogout();
    const ui = useUI();
    const [items, setItems] = useState([]);
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(null);
    const [children, setChildren] = useState([]);
    const [childDefaults, setChildDefaults] = useState({});
    const [childrenLoading, setChildrenLoading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
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
    // ETP-3894: per-form snapshot of visible fields registered by each EntityForm instance.
    // Keyed by a stable formId (React.useId) so multiple EntityForms accumulate rather than
    // overwrite each other. handleSave flattens all entries to validate the complete form.
    const formFieldsRef = useRef(new Map());
    // ETP-4563: monotonic mutation counter. A read (fetchById) captures its value
    // at start; if a mutation bumps it before the read resolves, the read is stale
    // and must not overwrite newer state (anti-clobber guard).
    const opSeqRef = useRef(0);

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

    // ETP-4563: shared client-side cache (app-shell-core). Null when no
    // DataProvider is mounted (e.g. isolated unit tests) — every read below then
    // falls back to a direct fetch, preserving the pre-cache behavior exactly.
    const dataCache = useOptionalDataCache();
    const cacheScope = dataCache?.scope;

    // Route a read through the cache when available: identical keys dedupe the
    // in-flight request and reuse fresh entries; `force` bypasses freshness.
    const runQuery = useCallback((key, fetcher, { force = false } = {}) => {
        if (dataCache?.cache && key) {
            return dataCache.cache.fetchQuery({
                key,
                fetcher: ({ signal }) => fetcher(signal),
                force,
                staleTime: dataCache.recordStaleTime,
            });
        }
        return fetcher();
    }, [dataCache]);

    // Full identity of the page-0 list query: sort + all filter layers.
    const buildListKey = useCallback(() => {
        if (!cacheScope) return null;
        return createQueryKey({
            ...cacheScope, apiBase: apiBaseUrl, spec: specName, entity,
            filters: { baseFilter, columnFilters, trailingFilter, sortColumn, sortDirection },
        });
    }, [cacheScope, apiBaseUrl, specName, entity, baseFilter, columnFilters, trailingFilter, sortColumn, sortDirection]);

    // Shared list loader. `force=false` (mount) reuses a fresh cached page;
    // `force=true` (explicit refresh) always reaches the backend.
    const loadList = useCallback((force) => {
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

        const url = `${apiBaseUrl}/${entity}?${queryParams.toString()}`;
        const fetcher = (signal) => fetch(url, { headers, signal })
            .then(res => {
                if (res.status === 401) {
                    logout();
                    throw new Error('401');
                }
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then(data => normalizeRows(data?.response?.data ?? (Array.isArray(data) ? data : []), entity));

        runQuery(buildListKey(), fetcher, { force })
            .then(rows => {
                setItems(rows);
                startRowRef.current = rows.length;
                if (rows.length < BATCH_SIZE) setHasMore(false);
                setLoading(false);
            })
            .catch((e) => {
                console.error('refresh error', e);
                setItems([]);
                setHasMore(false);
                setLoading(false);
            });
    }, [apiBaseUrl, entity, token, sortColumn, sortDirection, baseFilter, columnFilters, columnDefs, trailingFilter, logout, runQuery, buildListKey]);

    // Explicit reload always forces a network round-trip.
    const refresh = useCallback(() => loadList(true), [loadList]);

    // ETP-4563: after a header mutation, invalidate this entity's cached lists and
    // records, and bump the anti-stale counter so any read still in flight is
    // discarded on resolve instead of overwriting the newer mutation result.
    const invalidateEntityCache = useCallback(() => {
        opSeqRef.current += 1;
        if (dataCache?.cache && cacheScope) {
            dataCache.cache.invalidate({ ...cacheScope, apiBase: apiBaseUrl, spec: specName, entity });
        }
    }, [dataCache, cacheScope, apiBaseUrl, specName, entity]);

    // Invalidate only the child collection of a specific parent.
    const invalidateChildrenCache = useCallback((parentId) => {
        if (dataCache?.cache && cacheScope && parentId) {
            dataCache.cache.invalidate({ ...cacheScope, apiBase: apiBaseUrl, spec: specName, entity: childEntity, parentId });
        }
    }, [dataCache, cacheScope, apiBaseUrl, specName, childEntity]);

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
        // Initial mount reuses a fresh cached list (unlike explicit refresh()).
        loadList(false);
    }, [loadList, skipListFetch]);

    const fetchChildren = useCallback((parentId) => {
        if (!childEntity || !parentId) {
            setChildren([]);
            setChildrenLoading(false);
            return;
        }
        setChildrenLoading(true);
        // NEO Headless uses ?parentId= to filter child entity records
        const key = cacheScope
            ? createQueryKey({ ...cacheScope, apiBase: apiBaseUrl, spec: specName, entity: childEntity, parentId, filters: { childSortBy } })
            : null;
        const sortParam = childSortBy ? `&_sortBy=${childSortBy}` : '';
        const fetcher = (signal) => fetch(`${apiBaseUrl}/${childEntity}?parentId=${parentId}${sortParam}`, { headers, signal })
            .then(res => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then(data => normalizeRows(data?.response?.data ?? (Array.isArray(data) ? data : []), childEntity));
        runQuery(key, fetcher)
            .then(rows => setChildren(rows))
            .catch(() => setChildren([]))
            .finally(() => setChildrenLoading(false));
    }, [apiBaseUrl, childEntity, token, childSortBy, cacheScope, specName, runQuery]);

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

    const fetchById = useCallback((id) => {
        if (!id) return;
        setLoading(true);
        const seqAtStart = opSeqRef.current;
        const key = cacheScope
            ? createQueryKey({ ...cacheScope, apiBase: apiBaseUrl, spec: specName, entity, recordId: id })
            : null;
        const fetcher = (signal) => fetch(`${apiBaseUrl}/${entity}/${id}`, { headers, signal })
            .then(res => {
                if (!res.ok) throw new Error(`${res.status}`);
                return res.json();
            })
            .then(data => normalizeRecord(data?.response?.data?.[0] ?? data, entity));
        runQuery(key, fetcher)
            .then(row => {
                // A mutation superseded this read while it was in flight: drop the
                // (now stale) result and evict the cache entry it just populated.
                if (opSeqRef.current !== seqAtStart) {
                    if (key) dataCache?.cache?.remove(key);
                    setLoading(false);
                    return;
                }
                setSelected(row);
                setEditing({ ...row });
                fetchChildren(row?.id);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [apiBaseUrl, entity, token, fetchChildren, cacheScope, specName, runQuery, dataCache]);

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
                setSelected(row);
                setEditing(prev => {
                    if (!prev) return { ...row };
                    const merged = { ...prev };
                    for (const [key, val] of Object.entries(row)) {
                        if (!userChangedKeysRef.current.has(key)) merged[key] = val;
                    }
                    return merged;
                });
            })
            .catch(() => {
            });
    }, [apiBaseUrl, entity, headers]);

    const handleSelect = useCallback((row) => {
        // Reset the per-session changed-keys set when a different record is loaded,
        // so format validation (email/website/phone) only ever re-checks fields the
        // user actually edits in THIS record — never legacy values inherited from a
        // previously-edited record. Safe for payloads: userChangedKeysRef only feeds
        // buildCreatePayload (new records), not the existing-record PATCH diff.
        userChangedKeysRef.current = new Set();
        setSelected(row);
        setEditing(row ? { ...row } : null);
        fetchChildren(row?.id);
    }, [fetchChildren]);

    const handleNew = useCallback(async () => {
        backendDefaultKeysRef.current = new Set();
        userChangedKeysRef.current = new Set();
        setFieldErrors({});
        setSelected(null);
        setEditing({}); // Start with empty so UI is responsive
        try {
            const res = await fetch(`${apiBaseUrl}/${entity}/defaults`, { headers });
            if (res.ok) {
                const data = await res.json();
                if (data.defaults) {
                    // Normalize values from Etendo format:
                    // - Dates: dd-MM-yyyy → yyyy-MM-dd (HTML date input)
                    // - Booleans: "Y" → true, "N" → false (NEO defaults returns strings, not booleans)
                    const { id: _discardId, ...rest } = data.defaults;
                    backendDefaultKeysRef.current = new Set(Object.keys(rest));
                    const normalized = { ...rest };
                    for (const [key, val] of Object.entries(normalized)) {
                        normalizeDefaultValue(val, normalized, key);
                    }

                    const isContactsBusinessPartner = entity === 'businessPartner'
                        && /\/contacts$/i.test(apiBaseUrl || '');
                    if (isContactsBusinessPartner && (normalized.oBTIKTaxIDKey == null || normalized.oBTIKTaxIDKey === '')) {
                        normalized.oBTIKTaxIDKey = '1';
                    }

                    setEditing(prev => ({ ...prev, ...normalized }));
                }
            }
        } catch {
            // Defaults are best-effort; proceed with empty form if endpoint fails
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
    }, []);

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
                // Cached record is now stale; invalidate lists/records for this entity.
                invalidateEntityCache();
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
    }, [editing, selected, apiBaseUrl, entity, specName, refetchAfterSave, token, ui, invalidateEntityCache]);

    const handleDelete = useCallback(async () => {
        if (!selected?.id) return;
        try {
            const res = await fetch(`${apiBaseUrl}/${entity}/${selected.id}`, { method: 'DELETE', headers });
            if (res.ok) {
                setSelected(null);
                setEditing(null);
                setChildren([]);
                // Evict the deleted record from cache and invalidate this entity's lists.
                invalidateEntityCache();
                if (cacheScope) {
                    dataCache?.cache?.remove(createQueryKey({ ...cacheScope, apiBase: apiBaseUrl, spec: specName, entity, recordId: selected.id }));
                }
                toast.success(ui('recordDeleted'));
                refresh();
            } else {
                const msg = await extractErrorMessage(res, ui);
                toast.error(msg);
            }
        } catch (err) {
            toast.error(err?.message || 'Network error');
        }
    }, [selected, apiBaseUrl, entity, token, refresh, ui, invalidateEntityCache, cacheScope, specName, dataCache]);

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

            applyContactsRequiredFields(childEntity, body, childData);

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
            invalidateChildrenCache(selected.id);
            fetchChildren(selected.id);
            refreshHeaderTotals(selected.id);
            setSaveError(null);
            toast.success(ui('lineAdded'));
            return normalizeRecord(data?.response?.data?.[0] ?? data, childEntity) ?? true;
        } catch (err) {
            const msg = err?.message || 'Network error';
            setSaveError(msg);
            toast.error(msg);
            return null;
        }
    }, [childEntity, apiBaseUrl, token, selected, headers, fetchChildren, ui, invalidateChildrenCache]);

    const handleUpdateChild = useCallback((childId, fieldOrObject, value) => {
        setChildren(prev => prev.map(c => {
            if (String(c.id) !== String(childId)) return c;
            if (typeof fieldOrObject === 'object') return { ...c, ...fieldOrObject };
            return { ...c, [fieldOrObject]: value };
        }));
        if (selected?.id) { invalidateChildrenCache(selected.id); refreshHeaderTotals(selected.id); }
    }, [selected, refreshHeaderTotals, invalidateChildrenCache]);

    const handleDeleteChild = useCallback((childId) => {
        setChildren(prev => prev.filter(c => String(c.id) !== String(childId)));
        // Refresh header to update totals after line deletion
        if (selected?.id) { invalidateChildrenCache(selected.id); refreshHeaderTotals(selected.id); }
    }, [selected, refreshHeaderTotals, invalidateChildrenCache]);

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

    return {
        items, selected, editing, children, childDefaults, childrenLoading, loading, loadingMore, hasMore, saveError, isSaving,
        isDirtyHeader,
        fieldErrors, registerFields,
        handleSelect, handleNew, handleChange, handleSave, handleSaveAndProcess, handleDelete, handleProcess,
        handleAddChild, handleUpdateChild, handleDeleteChild, primeSaved,
        refresh, fetchById, fetchChildren, fetchChildDefaults, loadMore,
        sortColumn, sortDirection, setSortColumn, setSortDirection,
    };
}
