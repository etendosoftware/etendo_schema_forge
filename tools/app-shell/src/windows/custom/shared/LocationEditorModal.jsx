import {useState, useEffect, useMemo, useRef} from 'react';
import {useUnsavedChangesGuard} from '@/hooks/useUnsavedChangesGuard.js';
import {X, Loader2, Search, ChevronDown, Check} from 'lucide-react';
import {useUI} from '@/i18n';
import {toast} from 'sonner';
import {SquareCheckbox} from './SquareCheckbox';
import RequiredMark from '@/components/ui/required-mark.jsx';
import {CopyButton} from '@/components/ui/copy-button.jsx';
import {
    DEFAULT_COUNTRY_LIMIT,
    DEFAULT_COUNTRY_QUERY,
    findDefaultCountryOption,
} from '@/lib/defaultCountry.js';
import { matchOptionByLabel } from '@/lib/matchOptionLabel.js';

import { useApiFetch } from '@/auth/useApiFetch.js';
import { useTbaiPostalCodeContext, shouldWarnMissingTbaiPostalCode } from './tbaiPostalCodeWarning.js';
import { useCapabilitiesSafe } from '@/hooks/useCapabilitiesSafe.js';
const EMPTY_FORM = {
    address: '',
    address2: '',
    streetName: '',
    buildingNumber: '',
    buildingName: '',
    postalCode: '',
    city: '',
    country: '',
    countryLabel: '',
    region: '',
    regionLabel: '',
    shipToAddress: true,
    invoiceToAddress: true
};
const SELECTOR_PAGE_SIZE = 120;

// ETP-5806 — length of C_Location.Address1/Address2, NOT the 70 of EM_OBSEPA_StrtNm.
const ADDRESS_LINE_MAX_LENGTH = 60;

// ETP-5806 follow-up — DB column lengths of the 3 structured SEPA fields themselves
// (org.openbravo.sepa.iso20022's AD_COLUMN.FIELDLENGTH for EM_OBSEPA_StrtNm/BldgNb/BldgNm).
// Enforced here as `maxLength` so the user can never type past what the backend can store —
// the backend (StructuredAddressComposer#fieldsExceedingMaxLength) is the real source of truth
// and rejects an over-length value with a 400; without this client-side cap a value sent through
// another path (e.g. paste) used to reach OBDal.flush() as a raw data-truncation SQL error (500).
const STREET_NAME_MAX_LENGTH = 70;
const BUILDING_NUMBER_MAX_LENGTH = 16;
const BUILDING_NAME_MAX_LENGTH = 35;

/** Concatenates two parts with `sep` only when BOTH are non-empty — mirrors Java's `append`. */
function appendPart(base, sep, part) {
    if (!base) return part;
    if (!part) return base;
    return `${base}${sep}${part}`;
}

/**
 * Client-side PREVIEW of the composed Address1/Address2 (ETP-5806), shown as "Dirección
 * resultante" so the user sees what will be saved before submitting. This is a UX convenience
 * only — the backend (`StructuredAddressComposer.composeAddressLines`, ported from Classic's
 * `LocationSEPA.java::fillAddressLines`) is the source of truth and recomputes the same thing
 * server-side for every channel, REST and MCP alike. Keep this in exact lockstep with the Java
 * algorithm: same separators (", " and " - "), same 60-char line length, same precedence of
 * truncation cases.
 */
function composeAddressLines(streetName, buildingNumber, buildingName) {
    const street = (streetName || '').trim();
    const number = (buildingNumber || '').trim();
    const name = (buildingName || '').trim();

    const streetAndNumber = appendPart(street, ', ', number);
    const wholeAddress = appendPart(streetAndNumber, ' - ', name);

    if (wholeAddress.length <= ADDRESS_LINE_MAX_LENGTH) {
        return {address1: wholeAddress, address2: ''};
    }
    if (streetAndNumber.length <= ADDRESS_LINE_MAX_LENGTH) {
        return {address1: streetAndNumber, address2: name.slice(0, ADDRESS_LINE_MAX_LENGTH)};
    }
    return {
        address1: street.slice(0, ADDRESS_LINE_MAX_LENGTH),
        address2: appendPart(number, ' - ', name).slice(0, ADDRESS_LINE_MAX_LENGTH),
    };
}

/**
 * Whether a record has free-text Address1/Address2 but none of the 3 structured fields filled in.
 *
 * Two callers, same test (ETP-5806, widened by ETP-5654 round 2):
 *   - EDIT mode: an EXISTING record loaded from the backend — "legacy" in the sense that it
 *     predates the structured fields and was never migrated.
 *   - CREATE mode: the seed patch applied by `applyInitialSeed` (e.g. OCR'd vendor address). A
 *     seed never carries the 3 structured fields (see `pickSeedText`), so this is true exactly
 *     when the seed carried free-text `address` — i.e. "unstructured", not "legacy", but the same
 *     banner applies: the user must still fill Street/Number to be able to save.
 *   A brand-new, UNSEEDED address has every field empty and must NOT trigger this — empty is not
 *   unstructured, just unfilled yet.
 */
function isLegacyAddressRecord(loaded) {
    const hasStructured = Boolean(loaded.streetName || loaded.buildingNumber || loaded.buildingName);
    const hasLegacyText = Boolean(loaded.address || loaded.address2);
    return !hasStructured && hasLegacyText;
}

// ETP-5103 — Spain is the default country for a NEW address. This modal's selector pages
// 120 rows at a time ordered by the BASE name, so Spain sits ~200th and never lands in
// the first page: it has to be asked for explicitly with `q`, unlike the "Nuevo contacto"
// popup, which holds the whole catalog and matches the aliases straight away. The term
// and the aliases are shared by both popups — see @/lib/defaultCountry.js.

/**
 * Shallow form comparison for the unsaved-changes baseline (ETP-5022). Compares by sorted
 * keys rather than JSON.stringify so a differing key order never reads as a change.
 */
function sameForm(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
        if (a[key] !== b[key]) return false;
    }
    return true;
}

/**
 * Marks a picker button as "nothing chosen yet".
 *
 * A picker BUTTON always has text -- the placeholder -- so anything reading its
 * label as a value would consider an untouched field already answered. The
 * walkthrough engine's `requireValue` gate is one such reader.
 */
function placeholderAttr(value) {
    return value ? {} : { 'data-placeholder': '' };
}

/** Picker label colour: a real value reads as text, a placeholder as disabled. */
function pickerTextColor(value) {
    return value ? 'hsl(var(--foreground))' : 'hsl(var(--text-disabled))';
}

/** A picker that is inert until its prerequisite is chosen (region needs a country). */
function pickerButtonStyle(base, enabled) {
    return { ...base, opacity: enabled ? 1 : 0.5, cursor: enabled ? 'pointer' : 'not-allowed' };
}

function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

async function fetchSelectorPage(apiFetch, url) {
    const response = await apiFetch(url);
    if (!response.ok) {
        throw new Error(`Selector request failed: ${response.status}`);
    }
    const data = await response.json();
    const items = data?.items ?? data?.response?.data ?? [];
    return {
        items: Array.isArray(items) ? items : [],
        hasMore: Boolean(data?.hasMore),
    };
}

/**
 * Normalize one raw selector row into the { id, label } shape the pickers render.
 * Shared by the country and region option lists and by the default-country lookup,
 * so all three agree on which server field wins as the display label.
 */
function toSelectorOption(item) {
    return {
        id: item.id,
        label: item.label || item.name || item._identifier || item.id,
    };
}

/**
 * Resolve the default-country option (ETP-5103) from a `?q=` selector page.
 *
 * Returns null when it cannot be resolved — no alias matched, or the request failed.
 * The country field then simply stays empty, which is the pre-ETP-5103 behaviour and
 * lets the user pick manually. Never guess an id: a wrong country the user cannot see
 * is worse than an empty one.
 */
async function fetchDefaultCountryOption(apiFetch, url) {
    const {items} = await fetchSelectorPage(apiFetch, url);
    return findDefaultCountryOption(items.map(toSelectorOption));
}

/**
 * Apply a resolved default country to the form (ETP-5103).
 *
 * Module-level on purpose: it writes the unsaved-changes baseline by the SAME delta it
 * writes to the form, because a prefill is not a user edit — without that, the ETP-5022
 * guard would warn about a form nobody touched.
 */
function applyDefaultCountryOption(option, setForm, baselineRef) {
    const patch = {country: option.id, countryLabel: option.label};
    setForm(prev => ({...prev, ...patch}));
    baselineRef.current = {...(baselineRef.current || EMPTY_FORM), ...patch};
}

/**
 * Text fields of a caller-supplied seed (ETP-5654), trimmed, empty ones dropped.
 *
 * Only the three free-text keys are honoured. Region is deliberately NOT seedable, and the
 * country travels as a NAME (`countryName`) because it has to be resolved to a selector id.
 */
function pickSeedText(initialValues) {
    const patch = {};
    for (const key of ['address', 'postalCode', 'city']) {
        const value = String(initialValues?.[key] ?? '').trim();
        if (value) patch[key] = value;
    }
    return patch;
}

/** Country name carried by a seed, or '' (ETP-5654). */
function seedCountryName(initialValues) {
    return String(initialValues?.countryName ?? '').trim();
}

/**
 * Apply a caller-supplied seed to a NEW address (ETP-5654), e.g. the vendor address read
 * from an OCR'd invoice. Edit mode (`rowId`) never takes a seed: the record's own data wins.
 *
 * Like `applyDefaultCountryOption` it writes the unsaved-changes baseline by the same delta
 * as the form — a prefill is not a user edit, so the ETP-5022 guard must stay quiet.
 *
 * @returns the applied patch (so the caller can decide whether it counts as "unstructured" —
 *          see `isLegacyAddressRecord` below, ETP-5654 round 2), or `null` when nothing was seeded.
 */
function applyInitialSeed({initialValues, rowId, setForm, baselineRef}) {
    if (rowId) return null;
    const patch = pickSeedText(initialValues);
    if (Object.keys(patch).length === 0) return null;
    setForm(prev => ({...prev, ...patch}));
    baselineRef.current = {...(baselineRef.current || EMPTY_FORM), ...patch};
    return patch;
}

/**
 * Resolve the country option to preselect (ETP-5654).
 *
 * The seeded country NAME is tried first, through the same `?q=` selector the default
 * lookup uses and matched by `matchOptionByLabel` (exact or prefix, accent-insensitive,
 * never guesses). When there is no name, nothing matches, or the request fails, it falls
 * back to the ETP-5103 default (Spain). Returns null when neither resolves.
 */
async function resolveCountryOption({apiFetch, selectorBase, buildParams, preferredName}) {
    const urlFor = (q, limit) =>
        `${selectorBase}?${buildParams({q, limit: String(limit), offset: '0'}).toString()}`;
    if (preferredName) {
        try {
            const {items} = await fetchSelectorPage(apiFetch, urlFor(preferredName, SELECTOR_PAGE_SIZE));
            const options = items.map(toSelectorOption);
            const matchedId = matchOptionByLabel(options, preferredName);
            if (matchedId) return options.find(option => option.id === matchedId);
        } catch (_error) {
            // Fall through to the default country.
        }
    }
    return fetchDefaultCountryOption(apiFetch, urlFor(DEFAULT_COUNTRY_QUERY, DEFAULT_COUNTRY_LIMIT));
}

/**
 * Save gating (ETP-5103, widened by ETP-5806): Street, Number, City and Country are the
 * mandatory fields (stricter than Classic, where the 3 SEPA fields are optional — a product
 * decision), and a save in flight or an in-progress initial load blocks too.
 *
 * Module-level so the modal body stays flat — a chain of `||` inside the component
 * counts against its cognitive complexity, which is already at its budget.
 */
function isSaveBlocked({saving, initialLoading, structuredAddressEnabled, address, streetName, buildingNumber, city, country}) {
    if (saving || initialLoading) return true;
    // ETP-5806 — `structured-address-for-sepa` (backend-only flag, TTL 2026-11-15) off: legacy mandatory
    // fields are just the free-text address line and country, matching pre-ETP-5806 behavior.
    if (!structuredAddressEnabled) {
        if (address.trim() === '') return true;
        return country === '';
    }
    if (streetName.trim() === '') return true;
    if (buildingNumber.trim() === '') return true;
    if (city.trim() === '') return true;
    return country === '';
}

/**
 * ETP-5103 — preselect Spain in the country field while CREATING an address.
 *
 * Extracted from the modal body so the prefill can be reasoned about on its own.
 *
 * A non-null `rowId` means edit mode: an existing record's country is never overwritten
 * and the request is not even issued. `selectorBase` is the URL that won the modal's
 * 8-fallback cascade: depending on it means no prefill happens when every fallback came
 * back empty — deliberately, since an instance exposing no countries has nothing to
 * preselect — and saves this hook from re-walking the cascade itself.
 *
 * The one-shot ref is the same guard as AccountFormStep (ETP-4896): without it the
 * default would snap back over a country the user had already picked while the catalog
 * was still loading. It resets while the modal is closed.
 *
 * @param {boolean}       open          modal visibility
 * @param {string|null}   rowId         existing record id; null means create
 * @param {string}        selectorBase  resolved country-selector URL, '' while unknown
 * @param {Function}      apiFetch      authenticated fetch bound to the window's API base
 * @param {Function}      buildParams   builds the selector query string with window context
 * @param {Function}      onResolved    receives the resolved { id, label } option
 * @param {string}        [preferredCountryName] seeded country name tried before Spain (ETP-5654)
 */
function useDefaultCountryPrefill({open, rowId, selectorBase, apiFetch, buildParams, onResolved, preferredCountryName = ''}) {
    const appliedRef = useRef(false);

    useEffect(() => {
        if (!open || rowId) {
            appliedRef.current = false;
            return undefined;
        }
        if (!selectorBase || appliedRef.current) return undefined;

        let cancelled = false;

        resolveCountryOption({apiFetch, selectorBase, buildParams, preferredName: preferredCountryName})
            .then(option => {
                if (cancelled || !option || appliedRef.current) return;
                appliedRef.current = true;
                onResolved(option);
            })
            .catch(() => {
                // Best-effort: the field stays empty and the user picks a country manually.
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, rowId, selectorBase]);
}

function PickerMessage({text}) {
    return <div className="px-4 py-6 text-center text-sm text-muted-foreground">{text}</div>;
}

function renderCountryPickerBody(isLoading, loadingText, hasLoadFailed, loadErrorText, filteredCountries, emptyText, renderCountryRow) {
    if (isLoading) return <PickerMessage text={loadingText} data-testid="PickerMessage__927831" />;
    if (hasLoadFailed) return <PickerMessage text={loadErrorText} data-testid="PickerMessage__927831" />;
    if (filteredCountries.length === 0) return <PickerMessage text={emptyText} data-testid="PickerMessage__927831" />;
    return filteredCountries.map(renderCountryRow);
}

function CountryPicker({
                           onClose,
                           onContentMouseDown,
                           title,
                           closeAriaLabel,
                           searchInputRef,
                           searchValue,
                           onSearchChange,
                           searchPlaceholder,
                           isLoading,
                           loadingText,
                           hasLoadFailed,
                           loadErrorText,
                           emptyText,
                           filteredCountries,
                           renderCountryRow,
                           loadMoreRef,
                           isLoadingMore,
                       }) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[160] flex items-center justify-center bg-foreground/30 p-4"
            onMouseDown={onClose}
        >
            <div
                className="w-full max-w-md max-h-[540px] bg-card rounded-xl shadow-2xl flex flex-col"
                onMouseDown={onContentMouseDown}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-muted-foreground hover:text-muted-foreground transition-colors"
                        aria-label={closeAriaLabel}
                    >
                        <X size={16} data-testid="X__927831" />
                    </button>
                </div>
                <div className="px-4 py-3 border-b border-border-subtle">
                    <div className="relative">
                        <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            data-testid="Search__927831" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchValue}
                            onChange={onSearchChange}
                            placeholder={searchPlaceholder}
                            className="w-full border border-border-control rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus-ring"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-auto py-1">
                    {renderCountryPickerBody(isLoading, loadingText, hasLoadFailed, loadErrorText, filteredCountries, emptyText, renderCountryRow)}
                    {!isLoading && !hasLoadFailed && (
                        <div ref={loadMoreRef} className="flex justify-center py-2">
                            {isLoadingMore ? <Loader2
                                size={14}
                                className="animate-spin text-muted-foreground"
                                data-testid="Loader2__927831" /> :
                                <span className="h-3"/>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function renderRegionPickerBody(regionsLoading, ui, regionsLoadFailed, filteredRegions, handleRegionSelect, form) {
    if (regionsLoading) return <PickerMessage text={ui('loading')} data-testid="PickerMessage__927831" />;
    if (regionsLoadFailed) return <PickerMessage text={ui('regionLoadError')} data-testid="PickerMessage__927831" />;
    if (filteredRegions.length === 0) return <PickerMessage text={ui('noResults')} data-testid="PickerMessage__927831" />;
    return filteredRegions.map(region => (
        <button
            key={region.id}
            type="button"
            onClick={() => handleRegionSelect(region.id)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 14, textAlign: 'left', border: 'none', cursor: 'pointer', background: form.region === region.id ? 'hsl(var(--muted))' : 'hsl(var(--card))', color: form.region === region.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))', fontWeight: form.region === region.id ? 600 : 400 }}
        >
            <span style={{ width: 16, flexShrink: 0 }}>
                {form.region === region.id ? <Check size={13} data-testid="Check__927831" /> : null}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{region.label}</span>
        </button>
    ));
}

/**
 * LocationEditorModal — create or edit a C_BPartner_Location record with its
 * underlying C_Location fields (structured street/number/building name, city, postal code,
 * country, region).
 *
 * All CRUD operations go through the contacts/locationAddress endpoint so that
 * the user only needs AD_Window_Access to the Contacts window (ID 123), replicating
 * Classic Etendo's child-tab permission model.
 *
 * ETP-5806: Address Line 1/2 are no longer user-editable. The user fills Street (mandatory),
 * Number (mandatory) and Building Name (optional); Address1/Address2 are computed from those
 * three (see `composeAddressLines` above, which mirrors the backend's
 * `StructuredAddressComposer`/`LocationSEPA.fillAddressLines`) and shown read-only as a preview.
 * An existing record that predates this feature (free-text Address1/Address2, no structured
 * fields) shows a legacy-address warning banner with the old text as reference and a Copy button;
 * Save stays disabled until Street, Number, City and Country are all filled in.
 *
 * Props:
 *   open            — boolean: controls visibility
 *   onClose         — () => void
 *   onSaved         — () => void: called after successful save; caller re-fetches address state
 *   onParentRefresh — () => void: called when backend indicates the parent record changed (e.g. tax key auto-updated)
 *   rowId           — string|null: existing record id (C_BPartner_Location_ID in 'bpartner'
 *                     mode, C_Location_ID in 'location' mode). null = create.
 *   bpId            — string: parent Business Partner ID (required for create in 'bpartner' mode)
 *   apiBase         — string: NEO base for this window, e.g. "/sws/neo/contacts" or "/sws/neo/warehouse"
 *   saveMode        — 'bpartner' (default) | 'location':
 *                       'bpartner' → CRUD through {apiBase}/locationAddress, creates C_Location +
 *                                    C_BPartner_Location (requires bpId on create). Contacts behaviour.
 *                       'location' → CRUD through {apiBase}/location, plain C_Location only, returns
 *                                    the C_Location id. Used by Warehouse's Location field.
 *   initialValues   — optional seed for a NEW address (ignored when rowId is set): `{ address, postalCode,
 *                     city, countryName }`. Text keys prefill the form; `countryName` is resolved to a
 *                     selector option and falls back to Spain. Region is never seeded. ETP-5654.
 *   showAddressTypeCheckboxes — boolean (default true): render the Shipping/Invoicing Address checks.
 *                     Set false for windows (e.g. Warehouse) where address type does not apply.
 */
export default function LocationEditorModal({
                                                open,
                                                onClose,
                                                onSaved,
                                                onParentRefresh,
                                                rowId: bplLinkId,
                                                bpId,
                                                apiBase: contactsApiBase,
                                                selectorContext = {},
                                                saveMode = 'bpartner',
                                                showAddressTypeCheckboxes = true,
                                                initialValues = null,
                                            }) {
    // Entity segment of the NEO path: 'locationAddress' (BP-linked) or 'location' (plain C_Location).
    const entityPath = saveMode === 'location' ? 'location' : 'locationAddress';
    const ui = useUI();
    const apiFetch = useApiFetch(contactsApiBase);
    // ETP-5806 — backend-only `structured-address-for-sepa` flag (TTL 2026-11-15), surfaced via the
    // `capabilities` map already populated on AuthContext at role-selection time
    // (SFWindowAccessMap). When off, this modal renders the pre-ETP-5806 single-line address
    // editor instead of Street/Number/Building Name.
    const capabilities = useCapabilitiesSafe();
    const structuredAddressEnabled = capabilities?.structuredAddressForSepa === true;
    const [form, setForm] = useState(EMPTY_FORM);
    // ETP-5022: this modal holds its own form state, so DetailView's isDirty does not see it.
    // Without registering here, a language change (which reloads) or an F5 threw the typed
    // address away with no warning — verified in the browser before this was added.
    const baselineRef = useRef(null);
    const isDirty = open
        && baselineRef.current !== null
        && !sameForm(form, baselineRef.current);
    useUnsavedChangesGuard(isDirty);
    const [countries, setCountries] = useState([]);
    const [countrySelectorBase, setCountrySelectorBase] = useState('');
    const [countryOffset, setCountryOffset] = useState(0);
    const [countryHasMore, setCountryHasMore] = useState(false);
    const [countryLoadingMore, setCountryLoadingMore] = useState(false);
    const [regions, setRegions] = useState([]);
    const [regionSelectorBase, setRegionSelectorBase] = useState('');
    const [regionOffset, setRegionOffset] = useState(0);
    const [regionHasMore, setRegionHasMore] = useState(false);
    const [regionLoadingMore, setRegionLoadingMore] = useState(false);
    const [countriesLoading, setCountriesLoading] = useState(false);
    const [countriesLoadFailed, setCountriesLoadFailed] = useState(false);
    const [regionsLoading, setRegionsLoading] = useState(false);
    const [regionsLoadFailed, setRegionsLoadFailed] = useState(false);
    const [initialLoading, setInitialLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    // ETP-5806 — inline "Este campo es obligatorio" messages only appear after a first save
    // attempt, never on a freshly-opened (necessarily empty) create form.
    const [attemptedSave, setAttemptedSave] = useState(false);
    // ETP-5806 — true for an EXISTING record that has free-text Address1/Address2 but none of
    // the 3 structured fields; drives the legacy-address warning banner.
    const [isLegacyAddress, setIsLegacyAddress] = useState(false);
    const [countryPickerOpen, setCountryPickerOpen] = useState(false);
    const [countryQuery, setCountryQuery] = useState('');
    const [regionPickerOpen, setRegionPickerOpen] = useState(false);
    const [regionQuery, setRegionQuery] = useState('');
    const countrySearchRef = useRef(null);
    const countryLoadMoreRef = useRef(null);
    const countryLoadingMoreRef = useRef(false);
    const regionSearchRef = useRef(null);
    const regionLoadMoreRef = useRef(null);
    const regionLoadingMoreRef = useRef(false);

    function buildSelectorParams(baseParams = {}) {
        const params = new URLSearchParams();
        Object.entries(selectorContext || {}).forEach(([key, value]) => {
            if (value == null || value === '') return;
            params.set(key, String(value));
        });
        Object.entries(baseParams).forEach(([key, value]) => {
            if (value == null || value === '') return;
            params.set(key, String(value));
        });
        return params;
    }

    const countryOptions = useMemo(() => {
        const seen = new Set();
        return (countries ?? []).reduce((acc, item) => {
            if (!item?.id || seen.has(item.id)) return acc;
            seen.add(item.id);
            acc.push(toSelectorOption(item));
            return acc;
        }, []);
    }, [countries]);

    const filteredCountries = useMemo(() => {
        const q = normalizeText(countryQuery.trim());
        if (!q) return countryOptions;
        return countryOptions.filter((country) => normalizeText(country.label).includes(q));
    }, [countryOptions, countryQuery]);

    // The `form.countryLabel` fallback below is what surfaces a bad server label: it is only
    // reached while the translated option is not yet loaded (countries page in at 120 at a time,
    // ordered by the BASE name, so "Spain" sits ~200th and never lands in the first page). See
    // the ETP-5022 note on countryLabel above for which Java builds that string.
    const selectedCountryLabel = useMemo(() => {
        if (!form.country) return '—';
        return countryOptions.find((country) => country.id === form.country)?.label || form.countryLabel || form.country;
    }, [countryOptions, form.country, form.countryLabel]);

    const regionOptions = useMemo(() => {
        const seen = new Set();
        return (regions ?? []).reduce((acc, item) => {
            if (!item?.id || seen.has(item.id)) return acc;
            seen.add(item.id);
            acc.push(toSelectorOption(item));
            return acc;
        }, []);
    }, [regions]);

    const filteredRegions = useMemo(() => {
        const q = normalizeText(regionQuery.trim());
        if (!q) return regionOptions;
        return regionOptions.filter((region) => normalizeText(region.label).includes(q));
    }, [regionOptions, regionQuery]);

    const selectedRegionLabel = useMemo(() => {
        if (!form.region) return '—';
        return regionOptions.find((region) => region.id === form.region)?.label || form.regionLabel || form.region;
    }, [regionOptions, form.region, form.regionLabel]);

    // ETP-5103: one derived flag feeds the Save button's `disabled`, its opacity and the
    // handleSave guard, so the three can never disagree. Country was already mandatory —
    // handleSave has always refused to save without it — so gating on it only surfaces
    // the rule before the click instead of after; it does not restrict what can be saved.
    const saveDisabled = isSaveBlocked({
        saving,
        initialLoading,
        structuredAddressEnabled,
        address: form.address,
        streetName: form.streetName,
        buildingNumber: form.buildingNumber,
        city: form.city,
        country: form.country,
    });

    // ETP-5824: advisory only — never part of saveDisabled. See tbaiPostalCodeWarning.js.
    const tbaiContext = useTbaiPostalCodeContext({open, saveMode, bpId, apiBase: contactsApiBase});
    const showTbaiPostalCodeWarning = shouldWarnMissingTbaiPostalCode({...tbaiContext, postalCode: form.postalCode});

    // ETP-5806 — client-side preview only; the backend recomputes this itself and is the
    // source of truth (see composeAddressLines' own doc comment above).
    const composedAddress = useMemo(
        () => composeAddressLines(form.streetName, form.buildingNumber, form.buildingName),
        [form.streetName, form.buildingNumber, form.buildingName]
    );

    // Reset and load data on open
    useEffect(() => {
        if (!open) return;

        let cancelled = false;

        setForm(EMPTY_FORM);
        baselineRef.current = EMPTY_FORM;
        setAttemptedSave(false);
        setIsLegacyAddress(false);
        const seedPatch = applyInitialSeed({initialValues, rowId: bplLinkId, setForm, baselineRef});
        // ETP-5654 round 2 — a CREATE seeded with OCR free text (address) but no structured
        // breakdown shows the same banner an EDIT of a legacy record does (see
        // `isLegacyAddressRecord`'s updated doc comment above). Only meaningful while
        // `structured-address-for-sepa` is on — with it off, the address line is directly editable again
        // and there is no "legacy vs structured" distinction to warn about.
        if (seedPatch && structuredAddressEnabled) {
            setIsLegacyAddress(isLegacyAddressRecord(seedPatch));
        }
        setRegions([]);
        setRegionSelectorBase('');
        setRegionOffset(0);
        setRegionHasMore(false);
        setRegionLoadingMore(false);
        regionLoadingMoreRef.current = false;
        setCountries([]);
        setCountrySelectorBase('');
        setCountryOffset(0);
        setCountryHasMore(false);
        setCountryLoadingMore(false);
        countryLoadingMoreRef.current = false;
        setCountriesLoading(false);
        setCountriesLoadFailed(false);
        setRegionsLoading(false);
        setRegionsLoadFailed(false);
        setInitialLoading(false);
        setSaving(false);
        setCountryPickerOpen(false);
        setCountryQuery('');
        setRegionPickerOpen(false);
        setRegionQuery('');

        // Load country catalog
        const loadCountries = async () => {
            setCountriesLoading(true);
            const selectorBases = [
                `${contactsApiBase}/${entityPath}/selectors/C_Country_ID`,
                `${contactsApiBase}/${entityPath}/selectors/country`,
                `${contactsApiBase}/locationAddress/selectors/C_Country_ID`,
                `${contactsApiBase}/intrastatAdquisitions/selectors/country`,
                `${contactsApiBase}/locationAddress/selectors/country`,
                `${contactsApiBase}/bankAccount/selectors/country`,
                `${contactsApiBase}/intrastatAdquisitions/selectors/C_Country_ID`,
                `${contactsApiBase}/bankAccount/selectors/C_Country_ID`,
            ];

            let hasSuccessfulRequest = false;

            for (const baseUrl of selectorBases) {
                try {
                    const params = buildSelectorParams({
                        limit: String(SELECTOR_PAGE_SIZE),
                        offset: '0',
                    });
                    const {items, hasMore} = await fetchSelectorPage(apiFetch, `${baseUrl}?${params.toString()}`);
                    hasSuccessfulRequest = true;
                    if (items.length > 0 || hasMore) {
                        if (cancelled) return;
                        setCountries(items);
                        setCountrySelectorBase(baseUrl);
                        setCountryOffset(items.length);
                        setCountryHasMore(hasMore && items.length > 0);
                        setCountriesLoadFailed(false);
                        setCountriesLoading(false);
                        break;
                    }
                } catch (_error) {
                    // Try next selector source.
                }
            }

            if (!cancelled && !hasSuccessfulRequest) {
                setCountries([]);
                setCountrySelectorBase('');
                setCountryOffset(0);
                setCountryHasMore(false);
                setCountriesLoadFailed(true);
                setCountriesLoading(false);
            }

            if (!cancelled && hasSuccessfulRequest) {
                setCountriesLoading(false);
            }
        };

        loadCountries();

        // Populate form when editing an existing record
        if (bplLinkId) {
            setInitialLoading(true);
            // The handler enriches the GET-by-ID response with C_Location fields
            // (ContactsLocationAddressHandler for 'bpartner', the plain location handler for 'location').
            apiFetch(`/${entityPath}/${bplLinkId}`)
                .then(r => (r.ok ? r.json() : null))
                .then(d => {
                    const rec = d?.response?.data?.[0] ?? d;
                    if (rec?.id) {
                        const loaded = {
                            address: rec.address ?? rec.addressLine1 ?? '',
                            address2: rec.address2 ?? rec.addressLine2 ?? '',
                            // ETP-5806 — structured SEPA address fields.
                            streetName: rec.streetName ?? '',
                            buildingNumber: rec.buildingNumber ?? '',
                            buildingName: rec.buildingName ?? '',
                            postalCode: rec.postalCode ?? '',
                            city: rec.city ?? rec.cityName ?? '',
                            country: rec.country ?? '',
                            // Store the known label so the picker shows the country even if the
                            // selector returns a different ID format or hasn't loaded yet.
                            //
                            // ETP-5022 — WHERE THIS LABEL ACTUALLY COMES FROM. Not from the
                            // standard NEO/DataToJsonConverter path like every other FK field:
                            // this endpoint is served by a CUSTOM Java handler,
                            //   com.etendoerp.go/src/com/etendoerp/go/schemaforge/
                            //     ContactsLocationAddressHandler.java  (~line 350)
                            // which builds `country$_identifier` by hand. It used to call
                            // Country.getName() — the plain Hibernate getter, which ignores the
                            // request language — so this field showed "Spain" with the UI in
                            // Spanish, and only corrected itself to "España" once the user
                            // scrolled far enough for the translated option to load (see
                            // selectedCountryLabel below, which prefers the loaded option).
                            // Fixed there by switching to getIdentifier(). If this ever shows an
                            // untranslated country again, look at that handler FIRST — the bug is
                            // not in this file, and not in Etendo core. WarehouseLocationHandler
                            // has the same hand-built field for the warehouse address.
                            countryLabel: rec['country$_identifier'] ?? '',
                            region: rec.region ?? '',
                            regionLabel: rec['region$_identifier'] ?? '',
                            shipToAddress: rec.shipToAddress === 'Y' || rec.shipToAddress === true,
                            invoiceToAddress: rec.invoiceToAddress === 'Y' || rec.invoiceToAddress === true,
                        };
                        setForm(loaded);
                        baselineRef.current = loaded;
                        if (structuredAddressEnabled) {
                            setIsLegacyAddress(isLegacyAddressRecord(loaded));
                        }
                    }
                })
                .catch(() => {
                })
                .finally(() => {
                    if (!cancelled) setInitialLoading(false);
                });
        }

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, bplLinkId]);

    // ETP-5103 — Spain preselected on create. See useDefaultCountryPrefill above.
    useDefaultCountryPrefill({
        open,
        rowId: bplLinkId,
        selectorBase: countrySelectorBase,
        apiFetch,
        buildParams: buildSelectorParams,
        onResolved: option => applyDefaultCountryOption(option, setForm, baselineRef),
        preferredCountryName: seedCountryName(initialValues),
    });

    // Reload region list when country selection changes
    useEffect(() => {
        let cancelled = false;

        if (!open || !form.country) {
            setRegions([]);
            setRegionSelectorBase('');
            setRegionOffset(0);
            setRegionHasMore(false);
            setRegionLoadingMore(false);
            regionLoadingMoreRef.current = false;
            setRegionsLoading(false);
            setRegionsLoadFailed(false);
            return;
        }

        const loadRegions = async () => {
            setRegionsLoading(true);
            setRegionsLoadFailed(false);
            setRegions([]);
            setRegionOffset(0);
            setRegionHasMore(false);
            setRegionLoadingMore(false);
            regionLoadingMoreRef.current = false;

            const selectorBases = [
                `${contactsApiBase}/${entityPath}/selectors/C_Region_ID`,
                `${contactsApiBase}/${entityPath}/selectors/region`,
                `${contactsApiBase}/locationAddress/selectors/C_Region_ID`,
                `${contactsApiBase}/intrastatAdquisitions/selectors/C_Region_ID`,
                `${contactsApiBase}/bankAccount/selectors/C_Region_ID`,
                `${contactsApiBase}/locationAddress/selectors/region`,
                `${contactsApiBase}/intrastatAdquisitions/selectors/region`,
                `${contactsApiBase}/bankAccount/selectors/region`,
            ];

            let resolvedBase = '';
            let resolvedItems = [];
            let resolvedHasMore = false;
            let fallbackSuccess = null;

            for (const baseUrl of selectorBases) {
                const params = buildSelectorParams({
                    C_Country_ID: form.country,
                    country: form.country,
                    limit: String(SELECTOR_PAGE_SIZE),
                    offset: '0',
                });

                try {
                    const {items, hasMore} = await fetchSelectorPage(
                        apiFetch,
                        `${baseUrl}?${params.toString()}`
                    );

                    if (!fallbackSuccess) {
                        fallbackSuccess = {baseUrl, items, hasMore};
                    }

                    if (items.length > 0 || hasMore) {
                        resolvedBase = baseUrl;
                        resolvedItems = items;
                        resolvedHasMore = hasMore;
                        break;
                    }
                } catch (_error) {
                    // Try next selector source.
                }
            }

            if (!resolvedBase && fallbackSuccess) {
                resolvedBase = fallbackSuccess.baseUrl;
                resolvedItems = fallbackSuccess.items;
                resolvedHasMore = fallbackSuccess.hasMore;
            }

            if (cancelled) return;

            if (!resolvedBase) {
                setRegions([]);
                setRegionSelectorBase('');
                setRegionOffset(0);
                setRegionHasMore(false);
                setRegionsLoadFailed(true);
                setRegionsLoading(false);
                return;
            }

            setRegionSelectorBase(resolvedBase);
            setRegions(resolvedItems);
            setRegionOffset(resolvedItems.length);
            setRegionHasMore(resolvedHasMore && resolvedItems.length > 0);
            setRegionsLoading(false);
        };

        loadRegions();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form.country, open]);

    useEffect(() => {
        if (!countryPickerOpen) {
            setCountryQuery('');
            return;
        }
        const timer = setTimeout(() => countrySearchRef.current?.focus(), 40);
        return () => clearTimeout(timer);
    }, [countryPickerOpen]);

    useEffect(() => {
        if (!regionPickerOpen) {
            setRegionQuery('');
            return;
        }
        const timer = setTimeout(() => regionSearchRef.current?.focus(), 40);
        return () => clearTimeout(timer);
    }, [regionPickerOpen]);

    useEffect(() => {
        if (!countryPickerOpen) return undefined;
        const sentinel = countryLoadMoreRef.current;
        if (!sentinel) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry?.isIntersecting) return;
                if (!countrySelectorBase || !countryHasMore || countriesLoading || countryLoadingMoreRef.current) {
                    return;
                }

                countryLoadingMoreRef.current = true;
                setCountryLoadingMore(true);

                const params = buildSelectorParams({
                    limit: String(SELECTOR_PAGE_SIZE),
                    offset: String(countryOffset),
                });

                fetchSelectorPage(apiFetch, `${countrySelectorBase}?${params.toString()}`)
                    .then(({items, hasMore}) => {
                        setCountries(prev => [...prev, ...items]);
                        setCountryOffset(prev => prev + items.length);
                        setCountryHasMore(hasMore && items.length > 0);
                    })
                    .catch(() => {
                        setCountryHasMore(false);
                    })
                    .finally(() => {
                        countryLoadingMoreRef.current = false;
                        setCountryLoadingMore(false);
                    });
            },
            {threshold: 0.1}
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [
        countryPickerOpen,
        countrySelectorBase,
        countryHasMore,
        countryOffset,
        countriesLoading,
        apiFetch,
    ]);

    useEffect(() => {
        if (!regionPickerOpen) return undefined;
        const sentinel = regionLoadMoreRef.current;
        if (!sentinel) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (!entry?.isIntersecting) return;
                if (
                    !regionSelectorBase
                    || !form.country
                    || !regionHasMore
                    || regionsLoading
                    || regionLoadingMoreRef.current
                ) {
                    return;
                }

                regionLoadingMoreRef.current = true;
                setRegionLoadingMore(true);

                const params = buildSelectorParams({
                    C_Country_ID: form.country,
                    country: form.country,
                    limit: String(SELECTOR_PAGE_SIZE),
                    offset: String(regionOffset),
                });

                fetchSelectorPage(apiFetch, `${regionSelectorBase}?${params.toString()}`)
                    .then(({items, hasMore}) => {
                        setRegions(prev => [...prev, ...items]);
                        setRegionOffset(prev => prev + items.length);
                        setRegionHasMore(hasMore && items.length > 0);
                    })
                    .catch(() => {
                        setRegionHasMore(false);
                    })
                    .finally(() => {
                        regionLoadingMoreRef.current = false;
                        setRegionLoadingMore(false);
                    });
            },
            {threshold: 0.1}
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [
        regionPickerOpen,
        regionSelectorBase,
        regionHasMore,
        regionOffset,
        regionsLoading,
        form.country,
        apiFetch,
    ]);

    function setField(key, value) {
        setForm(prev => {
            const next = {...prev, [key]: value};
            if (key === 'country') next.region = '';
            return next;
        });
    }

    function handleCountrySelect(countryId) {
        const found = countryOptions.find(c => c.id === countryId);
        setForm(prev => ({
            ...prev,
            country: countryId,
            countryLabel: found?.label ?? '',
            region: '',
            regionLabel: '',
        }));
        setCountryPickerOpen(false);
        setRegionPickerOpen(false);
        setRegionQuery('');
    }

    function handleRegionSelect(regionId) {
        const found = regionOptions.find(r => r.id === regionId);
        setForm(prev => ({
            ...prev,
            region: regionId,
            regionLabel: found?.label ?? '',
        }));
        setRegionPickerOpen(false);
    }


    function showBackendMessages(messages) {
        if (!Array.isArray(messages) || messages.length === 0) return;
        for (const msg of messages) {
            const type = (msg.type || '').toLowerCase();
            const title = msg.title || '';
            const description = msg.text || undefined;
            if (type === 'success') toast.success(title, {description});
            else if (type === 'error') toast.error(title, {description});
            else if (type === 'warning') toast.warning(title, {description});
            else if (title) toast.info(title, {description});
        }
        // Parent record may have changed server-side (e.g. tax key auto-updated)
        onParentRefresh?.();
    }

    function buildSavePayload() {
        // ETP-5806 — while `structured-address-for-sepa` is off, Address Line 1/2 are the directly
        // editable `form.address`/`form.address2` (pre-ETP-5806 behavior); the composed
        // preview and the 3 structured fields are not rendered, so they stay empty and are
        // sent as null, which the backend's legacy branch already handles.
        const addressLine1 = structuredAddressEnabled ? composedAddress.address1 : (form.address || '');
        const addressLine2 = structuredAddressEnabled ? composedAddress.address2 : (form.address2 || '');
        const name = [form.city, addressLine1].filter(Boolean).join(', ')
            || [form.regionLabel || form.region, form.countryLabel || form.country].filter(Boolean).join(', ')
            || 'Location';
        const payload = {
            name,
            // ETP-5806 — the backend recomputes Address1/Address2 from the structured fields
            // and ignores these when streetName is present (see StructuredAddressComposer);
            // sent anyway so a caller reading the create/update response sees them immediately
            // without waiting on a round trip, and as a harmless fallback for the handler's
            // own legacy branch (streetName blank, which `saveDisabled` never lets through here).
            addressLine1: addressLine1 || null,
            addressLine2: addressLine2 || null,
            streetName: structuredAddressEnabled ? (form.streetName || null) : null,
            buildingNumber: structuredAddressEnabled ? (form.buildingNumber || null) : null,
            buildingName: structuredAddressEnabled ? (form.buildingName || null) : null,
            postalCode: form.postalCode || null,
            cityName: form.city || null,
            country: form.country || null,
            region: form.region || null,
        };
        // Address-type flags only exist in 'bpartner' mode (C_BPartner_Location);
        // omit them entirely when the checkboxes are hidden (e.g. Warehouse).
        if (showAddressTypeCheckboxes) {
            payload.shipToAddress = form.shipToAddress ? 'Y' : 'N';
            payload.invoiceToAddress = form.invoiceToAddress ? 'Y' : 'N';
        }
        return {payload, name};
    }

    async function saveEdit(payload, name) {
        // EDIT: 'bpartner' updates C_Location + C_BPartner_Location atomically;
        // 'location' updates the plain C_Location.
        const res = await apiFetch(`/${entityPath}/${bplLinkId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            // ETP-5806 — a non-ok response used to be completely silent: no toast, no
            // console output, modal just sat there with nothing visibly wrong. The user
            // had no way to tell a failed save from a successful one that was merely slow,
            // and (worse) nothing here ever re-synced the form with what the backend
            // actually has, so a retry could look like a no-op too. Surface it loudly.
            console.error('[LocationEditorModal] locationAddress PUT failed with status', res.status);
            toast.error(ui('locationSaveError'));
            return;
        }
        const data = await res.json().catch(() => null);
        const rec = data?.response?.data?.[0] ?? null;
        showBackendMessages(rec?.messages);
        // Return id/name so a single-FK field (Warehouse) can refresh its display.
        onSaved?.(rec?.id ?? bplLinkId, rec?.name ?? name);
    }

    async function saveCreate(payload, name) {
        // CREATE:
        //   'bpartner' → creates C_Location + C_BPartner_Location atomically (needs parentId/bpId)
        //   'location' → creates a plain C_Location, no business partner link
        const createPath = saveMode === 'location'
            ? `/${entityPath}`
            : `/locationAddress?parentId=${bpId}`;
        const createBody = saveMode === 'location'
            ? payload
            : {...payload, businessPartner: bpId};
        const res = await apiFetch(createPath, {
            method: 'POST',
            body: JSON.stringify(createBody),
        });

        if (!res.ok) {
            console.error('[LocationEditorModal] locationAddress POST failed with status', res.status);
            toast.error(ui('locationSaveError'));
            return;
        }

        const data = await res.json();
        if ((data?.response?.status ?? 0) !== 0) {
            console.error('[LocationEditorModal] locationAddress POST returned NEO error:', data?.response);
            toast.error(ui('locationSaveError'));
            return;
        }

        const newRecord = data?.response?.data?.[0] ?? data?.data?.[0] ?? null;
        showBackendMessages(newRecord?.messages);
        onSaved?.(newRecord?.id ?? null, newRecord?.name ?? name);
    }

    async function handleSave() {
        setAttemptedSave(true);
        if (saveDisabled) return;
        // Defence in depth: `saveDisabled` already covers an empty country since ETP-5103,
        // so the Save button can no longer reach this branch. It stays for a programmatic
        // or keyboard-driven call, and so that a future change re-enabling the button still
        // tells the user why the save was refused.
        if (!form.country) {
            toast.error(ui('locationCountryRequired'));
            return;
        }
        setSaving(true);
        try {
            const {payload, name} = buildSavePayload();
            if (bplLinkId) {
                await saveEdit(payload, name);
            } else {
                await saveCreate(payload, name);
            }
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    const INPUT = {
        width: '100%', fontSize: 14, padding: '8px 12px',
        border: '1px solid hsl(var(--border-control))', borderRadius: 8, height: 40,
        boxSizing: 'border-box', color: 'hsl(var(--foreground))', outline: 'none', background: 'hsl(var(--card))',
    };

    const FIELD_LABEL = { fontSize: 14, color: 'hsl(var(--foreground))', fontWeight: 400, marginBottom: 6 };

    // ETP-5806 — inline "Este campo es obligatorio" message, shown under a mandatory field
    // once the user has attempted to save with it still empty.
    const FIELD_ERROR = { fontSize: 12, color: 'hsl(var(--destructive))', marginTop: 4 };

    const PICKER_BTN = {
        ...INPUT, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', gap: 8, background: 'hsl(var(--card))',
    };

    const PICKER_MODAL = {
        position: 'fixed', inset: 0, zIndex: 160,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'hsl(var(--foreground) / .35)',
    };

    const PICKER_CONTENT = {
        background: 'hsl(var(--card))', borderRadius: 16, width: '100%', maxWidth: 440,
        maxHeight: 520, margin: 16, display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px hsl(var(--foreground) / .18)',
        animation: 'fm-modal-in .2s cubic-bezier(.4,0,.2,1)',
    };

    return (
        // `role="dialog"` is not decoration here: the walkthrough engine detects an
        // open app dialog by role and suspends its scrim / parks its card so the
        // dialog stays usable (useForeignDialog). Without it a tour that opens this
        // modal dims it from above and the user cannot type. It is also simply
        // correct a11y for a focus-trapping overlay.
        <div role="dialog" aria-modal="true" data-testid="location-modal" style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'hsl(var(--foreground) / .35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'hsl(var(--card))', borderRadius: 16, boxShadow: '0 8px 40px hsl(var(--foreground) / .18)', width: '100%', maxWidth: 560, margin: 16, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 64px)', animation: 'fm-modal-in .2s cubic-bezier(.4,0,.2,1)' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 20px 0', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Titled "Dirección" in Spanish regardless of saveMode — an earlier round
                            tried splitting this by saveMode (location vs bpartner), keeping "Ubicación"
                            for the BP-linked flows (Contacts, fiscal-monitor, shipping/invoicing
                            pickers), but Ivan confirmed the rename applies everywhere this modal is
                            used, Contacts included. English stays "Location" (ETP-4749 review round). */}
                        <div style={{ font: '700 20px/28px system-ui', color: 'hsl(var(--foreground))' }}>
                            {ui('locationSelectorTitle')}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label={ui('close')}
                        style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'none', color: 'hsl(var(--text-disabled))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    {initialLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
                            <Loader2
                                size={20}
                                style={{ animation: 'spin 1s linear infinite', color: 'hsl(var(--text-disabled))' }}
                                data-testid="Loader2__927831" />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                            {/* ETP-5806 — legacy-address banner: an EXISTING record with free-text
                                Address1/Address2 but no structured breakdown. The old text is kept
                                read-only as reference (never editable again) with a Copy button;
                                Save stays disabled until Street and Number are filled in below. */}
                            {structuredAddressEnabled && isLegacyAddress && (
                                <div
                                    data-testid="location-legacy-address-banner"
                                    style={{
                                        display: 'flex', flexDirection: 'column', gap: 8,
                                        padding: '10px 12px', borderRadius: 8,
                                        border: '1px solid hsl(var(--warning, 38 92% 50%) / .4)',
                                        background: 'hsl(var(--warning, 38 92% 50%) / .08)',
                                    }}
                                >
                                    <div style={{ fontSize: 13, color: 'hsl(var(--foreground))' }}>
                                        {ui('legacyAddressWarning')}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                                                {ui('legacyAddressOldTextLabel')}
                                            </div>
                                            <div style={{ fontSize: 13, color: 'hsl(var(--foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {[form.address, form.address2].filter(Boolean).join(', ')}
                                            </div>
                                        </div>
                                        <CopyButton
                                            value={[form.address, form.address2].filter(Boolean).join(', ')}
                                            data-testid="location-legacy-address-copy"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ETP-5806 — gated behind `capabilities.structuredAddressForSepa` (backend-only
                                flag, TTL 2026-11-15). While off, the pre-ETP-5806 single-line
                                Address Line 1/2 editor below renders instead. */}
                            {structuredAddressEnabled ? (
                            <>
                            {/* Calle */}
                            <div>
                                <div style={FIELD_LABEL}>{ui('streetNameLabel')}<RequiredMark data-testid="RequiredMark__927831" /></div>
                                <input autoFocus type="text" maxLength={STREET_NAME_MAX_LENGTH} value={form.streetName} onChange={e => setField('streetName', e.target.value)} data-testid="location-field-streetName" style={INPUT} />
                                {attemptedSave && form.streetName.trim() === '' && (
                                    <div style={FIELD_ERROR}>{ui('fieldRequiredMessage')}</div>
                                )}
                            </div>

                            {/* Número + Nombre del edificio en grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                                <div>
                                    <div style={FIELD_LABEL}>{ui('buildingNumberLabel')}<RequiredMark data-testid="RequiredMark__927831" /></div>
                                    <input type="text" maxLength={BUILDING_NUMBER_MAX_LENGTH} value={form.buildingNumber} onChange={e => setField('buildingNumber', e.target.value)} data-testid="location-field-buildingNumber" style={INPUT} />
                                    {attemptedSave && form.buildingNumber.trim() === '' && (
                                        <div style={FIELD_ERROR}>{ui('fieldRequiredMessage')}</div>
                                    )}
                                </div>
                                <div>
                                    <div style={FIELD_LABEL}>{ui('buildingNameLabel')}</div>
                                    <input type="text" maxLength={BUILDING_NAME_MAX_LENGTH} value={form.buildingName} onChange={e => setField('buildingName', e.target.value)} data-testid="location-field-buildingName" style={INPUT} />
                                </div>
                            </div>

                            {/* ETP-5806 — Address Line 1/2 are no longer user-editable: they are
                                computed from Street/Number/Building Name (same algorithm the
                                backend applies on save) and shown here read-only as a preview.
                                Both rows are ALWAYS visible (Primera línea / Segunda línea), each
                                with its own sub-label, "—" when empty — matching the design's
                                "alta vacía" state. Do not collapse this back into one line. */}
                            <div>
                                <div style={FIELD_LABEL}>{ui('resultingAddressLabel')}</div>
                                <div
                                    data-testid="location-resulting-address-preview"
                                    style={{ ...INPUT, display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 'auto', minHeight: 40, background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))', gap: 6, paddingTop: 8, paddingBottom: 8 }}
                                >
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <span style={{ fontSize: 12, minWidth: 100, flexShrink: 0, color: 'hsl(var(--muted-foreground))' }}>{ui('addressLine1Label')}</span>
                                        <span data-testid="location-resulting-address1">{composedAddress.address1 || '—'}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <span style={{ fontSize: 12, minWidth: 100, flexShrink: 0, color: 'hsl(var(--muted-foreground))' }}>{ui('addressLine2Label')}</span>
                                        <span data-testid="location-resulting-address2">{composedAddress.address2 || '—'}</span>
                                    </div>
                                </div>
                            </div>
                            </>
                            ) : (
                            <>
                            {/* Pre-ETP-5806 legacy editor: Address Line 1/2 directly editable. */}
                            <div>
                                <div style={FIELD_LABEL}>{ui('addressLine1')}<RequiredMark data-testid="RequiredMark__927831" /></div>
                                <input autoFocus type="text" value={form.address} onChange={e => setField('address', e.target.value)} data-testid="location-field-address" style={INPUT} />
                                {attemptedSave && form.address.trim() === '' && (
                                    <div style={FIELD_ERROR}>{ui('fieldRequiredMessage')}</div>
                                )}
                            </div>
                            <div>
                                <div style={FIELD_LABEL}>{ui('addressLine2')}</div>
                                <input type="text" value={form.address2} onChange={e => setField('address2', e.target.value)} data-testid="location-field-address2" style={INPUT} />
                            </div>
                            </>
                            )}

                            {/* CP + Ciudad en grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                                <div>
                                    <div style={FIELD_LABEL}>{ui('postalCodeLabel')}</div>
                                    <input type="text" value={form.postalCode} onChange={e => setField('postalCode', e.target.value)} data-testid="location-field-postalCode" style={INPUT} />
                                </div>
                                <div>
                                    <div style={FIELD_LABEL}>{ui('cityLabel')}<RequiredMark data-testid="RequiredMark__927831" /></div>
                                    <input type="text" value={form.city} onChange={e => setField('city', e.target.value)} data-testid="location-field-city" style={INPUT} />
                                    {attemptedSave && form.city.trim() === '' && (
                                        <div style={FIELD_ERROR}>{ui('fieldRequiredMessage')}</div>
                                    )}
                                </div>
                            </div>
                            {showTbaiPostalCodeWarning && (
                                <div role="note" data-testid="location-postalCode-tbai-warning" className="text-amber-700 dark:text-amber-400" style={{ fontSize: 12, lineHeight: 1.4, marginTop: -6 }}>
                                    {ui('tbaiPostalCodeMissingWarning')}
                                </div>
                            )}

                            {/* País + Región comparten fila (ETP-5806) */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <div style={FIELD_LABEL}>{ui('countryLabel')}<RequiredMark data-testid="RequiredMark__927831" /></div>
                                    <button
                                        type="button"
                                        onClick={() => setCountryPickerOpen(true)}
                                        aria-haspopup="dialog"
                                        aria-expanded={countryPickerOpen}
                                        data-testid="location-field-country"
                                        {...placeholderAttr(form.country)}
                                        style={PICKER_BTN}
                                    >
                                        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: pickerTextColor(form.country) }}>
                                            {selectedCountryLabel}
                                        </span>
                                        <ChevronDown
                                            size={15}
                                            style={{ color: 'hsl(var(--text-disabled))', flexShrink: 0 }}
                                            data-testid="ChevronDown__927831" />
                                    </button>
                                    {attemptedSave && form.country === '' && (
                                        <div style={FIELD_ERROR}>{ui('fieldRequiredMessage')}</div>
                                    )}
                                </div>

                                <div>
                                    <div style={FIELD_LABEL}>{ui('regionLabel')}</div>
                                    <button
                                        type="button"
                                        onClick={() => { if (form.country) setRegionPickerOpen(true); }}
                                        disabled={!form.country}
                                        data-testid="location-field-region"
                                        {...placeholderAttr(form.region)}
                                        aria-haspopup="dialog"
                                        aria-expanded={regionPickerOpen}
                                        style={pickerButtonStyle(PICKER_BTN, !!form.country)}
                                    >
                                        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: pickerTextColor(form.region) }}>
                                            {!form.country ? ui('selectCountryFirst') : selectedRegionLabel}
                                        </span>
                                        <ChevronDown
                                            size={15}
                                            style={{ color: 'hsl(var(--text-disabled))', flexShrink: 0 }}
                                            data-testid="ChevronDown__927831" />
                                    </button>
                                </div>
                            </div>

                            {/* Checkboxes — only for BPartner locations (Contacts), not plain C_Location.
                                ETP-5806: renamed to "Envíos"/"Facturación" via local ui() keys rather than
                                the AD's IsShipTo/IsBillTo labels, so the rename stays scoped to this modal
                                instead of relabeling every other screen that reads those AD labels. */}
                            {showAddressTypeCheckboxes && (
                            <div style={{ display: 'flex', gap: 24, paddingTop: 4 }}>
                                <SquareCheckbox
                                    label={ui('shippingAddressLabel')}
                                    checked={form.shipToAddress}
                                    onChange={val => setField('shipToAddress', val)}
                                    data-testid="SquareCheckbox__location-shipping" />
                                <SquareCheckbox
                                    label={ui('billingAddressLabel')}
                                    checked={form.invoiceToAddress}
                                    onChange={val => setField('invoiceToAddress', val)}
                                    data-testid="SquareCheckbox__location-invoicing" />
                            </div>
                            )}

                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 20px', borderTop: '1px solid hsl(var(--border-subtle))', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={onClose}
                        data-testid="location-cancel"
                        style={{ font: '400 14px/20px system-ui', padding: '9px 20px', borderRadius: 20, border: '1px solid hsl(var(--border-control))', cursor: 'pointer', background: 'hsl(var(--card))', color: 'hsl(var(--foreground))' }}
                    >
                        {ui('cancel')}
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={handleSave}
                            // ETP-5806 follow-up — `aria-disabled`, NOT the native `disabled`
                            // attribute: a natively-disabled button never fires `onClick`, so
                            // `handleSave` (which sets `attemptedSave`) could never run while a
                            // mandatory field was empty, and the "Este campo es obligatorio"
                            // messages below were dead code. `handleSave` itself still refuses
                            // to save while `saveDisabled` is true (see its own guard) — this
                            // only lets the click register so the validation messages can show.
                            aria-disabled={saveDisabled}
                            // Referenced by the `create-contact` walkthrough's closing step
                            // (tools/app-shell/src/walkthrough/flows/create-contact.json).
                            // Renaming it breaks a shipped tour.
                            data-testid="location-save"
                            // Colours live in classes, not in `style`: an inline `background`
                            // beats any Tailwind rule including :hover, so the brand-yellow
                            // hover every other primary action has (ListView's "+ Nuevo
                            // contacto", RecordCreateModal / InlineCreateModal's save) could
                            // never paint. Geometry stays inline — it is not themed.
                            className="border border-[hsl(var(--foreground))] bg-[hsl(var(--foreground))] text-[hsl(var(--card))] transition-colors enabled:hover:border-[hsl(var(--accent-highlight))] enabled:hover:bg-[hsl(var(--accent-highlight))] enabled:hover:text-[hsl(var(--accent-highlight-foreground))]"
                            style={{ font: '600 14px/20px system-ui', padding: '9px 20px', borderRadius: 20, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: saveDisabled ? 0.5 : 1 }}
                        >
                            {saving && <Loader2
                                size={13}
                                style={{ animation: 'spin 1s linear infinite' }}
                                data-testid="Loader2__927831" />}
                            {!saving && <Check size={14} strokeWidth={2} data-testid="Check__927831" />}
                            {ui('save')}
                        </button>
                    </div>
                </div>

            </div>
            {/* Country picker */}
            {/* role="dialog" on the picker: the walkthrough engine detects an open
                app dialog by role and suspends its scrim over it. Without it a tour
                step that points at this picker's trigger keeps dimming the list and
                cuts a band through it (useForeignDialog). Correct a11y regardless. */}
            {countryPickerOpen && (
                <div role="dialog" aria-modal="true" style={PICKER_MODAL} onMouseDown={() => setCountryPickerOpen(false)}>
                    <div style={PICKER_CONTENT} onMouseDown={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                            <span style={{ font: '600 16px/22px system-ui', color: 'hsl(var(--foreground))' }}>{ui('countryLabel')}</span>
                            <button onClick={() => setCountryPickerOpen(false)} aria-label={ui('cancel')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-disabled))', fontSize: 16 }}>✕</button>
                        </div>
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid hsl(var(--muted))' }}>
                            <div style={{ position: 'relative' }}>
                                <Search
                                    size={14}
                                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--text-disabled))' }}
                                    data-testid="Search__927831" />
                                <input ref={countrySearchRef} type="text" value={countryQuery} onChange={e => setCountryQuery(e.target.value)} placeholder={ui('countrySearchPlaceholder')} style={{ ...INPUT, paddingLeft: 36 }} />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                            {countriesLoading && <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: 'hsl(var(--text-disabled))' }}>{ui('loading')}</div>}
                            {countriesLoadFailed && <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: 'hsl(var(--text-disabled))' }}>{ui('countryLoadError')}</div>}
                            {!countriesLoading && !countriesLoadFailed && filteredCountries.length === 0 && <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: 'hsl(var(--text-disabled))' }}>{ui('noResults')}</div>}
                            {filteredCountries.map(country => (
                                <button key={country.id} type="button" onClick={() => handleCountrySelect(country.id)}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 14, textAlign: 'left', border: 'none', cursor: 'pointer', background: form.country === country.id ? 'hsl(var(--muted))' : 'hsl(var(--card))', color: form.country === country.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))', fontWeight: form.country === country.id ? 600 : 400 }}>
                                    <span style={{ width: 16, flexShrink: 0 }}>{form.country === country.id && <Check size={13} data-testid="Check__927831" />}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{country.label}</span>
                                </button>
                            ))}
                            <div ref={countryLoadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                                {countryLoadingMore && <Loader2
                                    size={14}
                                    style={{ animation: 'spin 1s linear infinite', color: 'hsl(var(--text-disabled))' }}
                                    data-testid="Loader2__927831" />}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Region picker */}
            {/* role="dialog" on the picker: the walkthrough engine detects an open
                app dialog by role and suspends its scrim over it. Without it a tour
                step that points at this picker's trigger keeps dimming the list and
                cuts a band through it (useForeignDialog). Correct a11y regardless. */}
            {regionPickerOpen && (
                <div role="dialog" aria-modal="true" style={PICKER_MODAL} onMouseDown={() => setRegionPickerOpen(false)}>
                    <div style={PICKER_CONTENT} onMouseDown={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                            <span style={{ font: '600 16px/22px system-ui', color: 'hsl(var(--foreground))' }}>{ui('regionLabel')}</span>
                            <button onClick={() => setRegionPickerOpen(false)} aria-label={ui('cancel')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-disabled))', fontSize: 16 }}>✕</button>
                        </div>
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid hsl(var(--muted))' }}>
                            <div style={{ position: 'relative' }}>
                                <Search
                                    size={14}
                                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--text-disabled))' }}
                                    data-testid="Search__927831" />
                                <input ref={regionSearchRef} type="text" value={regionQuery} onChange={e => setRegionQuery(e.target.value)} placeholder={ui('regionSearchPlaceholder')} style={{ ...INPUT, paddingLeft: 36 }} />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                            {renderRegionPickerBody(regionsLoading, ui, regionsLoadFailed, filteredRegions, handleRegionSelect, form)}
                            <div ref={regionLoadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                                {regionLoadingMore && <Loader2
                                    size={14}
                                    style={{ animation: 'spin 1s linear infinite', color: 'hsl(var(--text-disabled))' }}
                                    data-testid="Loader2__927831" />}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
