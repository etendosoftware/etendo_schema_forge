import {useState, useEffect, useMemo, useRef} from 'react';
import {X, Loader2, Search, ChevronDown, Check} from 'lucide-react';
import {useUI, useLabel} from '@/i18n';
import {useAuth} from '@/auth/AuthContext.jsx';
import {toast} from 'sonner';

const EMPTY_FORM = {
    address: '',
    address2: '',
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

function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

async function fetchSelectorPage(url, headers) {
    const response = await fetch(url, {headers});
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

function PickerMessage({text}) {
    return <div className="px-4 py-6 text-center text-sm text-gray-500">{text}</div>;
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
            className="fixed inset-0 z-[160] flex items-center justify-center bg-black/30 p-4"
            onMouseDown={onClose}
        >
            <div
                className="w-full max-w-md max-h-[540px] bg-white rounded-xl shadow-2xl flex flex-col"
                onMouseDown={onContentMouseDown}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        aria-label={closeAriaLabel}
                    >
                        <X size={16} data-testid="X__927831" />
                    </button>
                </div>
                <div className="px-4 py-3 border-b border-gray-100">
                    <div className="relative">
                        <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            data-testid="Search__927831" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchValue}
                            onChange={onSearchChange}
                            placeholder={searchPlaceholder}
                            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-auto py-1">
                    {renderCountryPickerBody(isLoading, loadingText, hasLoadFailed, loadErrorText, filteredCountries, emptyText, renderCountryRow)}
                    {!isLoading && !hasLoadFailed && (
                        <div ref={loadMoreRef} className="flex justify-center py-2">
                            {isLoadingMore ? <Loader2
                                size={14}
                                className="animate-spin text-gray-400"
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
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 14, textAlign: 'left', border: 'none', cursor: 'pointer', background: form.region === region.id ? '#F5F7F9' : '#fff', color: form.region === region.id ? '#121217' : '#374151', fontWeight: form.region === region.id ? 600 : 400 }}
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
 * underlying C_Location fields (address lines, city, postal code, country, region).
 *
 * All CRUD operations go through the contacts/locationAddress endpoint so that
 * the user only needs AD_Window_Access to the Contacts window (ID 123), replicating
 * Classic Etendo's child-tab permission model.
 *
 * Props:
 *   open            — boolean: controls visibility
 *   onClose         — () => void
 *   onSaved         — () => void: called after successful save; caller re-fetches address state
 *   onParentRefresh — () => void: called when backend indicates the parent record changed (e.g. tax key auto-updated)
 *   rowId           — string|null: C_BPartner_Location_ID of existing record (null = create)
 *   bpId            — string: parent Business Partner ID (required for create)
 *   apiBase         — string: e.g. "/sws/neo/contacts"
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
                                            }) {
    const ui = useUI();
    const t = useLabel();
    const {token} = useAuth();
    const [form, setForm] = useState(EMPTY_FORM);
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

    const authHeader = {Authorization: `Bearer ${token}`};

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
            acc.push({
                id: item.id,
                label: item.label || item.name || item._identifier || item.id,
            });
            return acc;
        }, []);
    }, [countries]);

    const filteredCountries = useMemo(() => {
        const q = normalizeText(countryQuery.trim());
        if (!q) return countryOptions;
        return countryOptions.filter((country) => normalizeText(country.label).includes(q));
    }, [countryOptions, countryQuery]);

    const selectedCountryLabel = useMemo(() => {
        if (!form.country) return '—';
        return countryOptions.find((country) => country.id === form.country)?.label || form.countryLabel || form.country;
    }, [countryOptions, form.country, form.countryLabel]);

    const regionOptions = useMemo(() => {
        const seen = new Set();
        return (regions ?? []).reduce((acc, item) => {
            if (!item?.id || seen.has(item.id)) return acc;
            seen.add(item.id);
            acc.push({
                id: item.id,
                label: item.label || item.name || item._identifier || item.id,
            });
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

    // Reset and load data on open
    useEffect(() => {
        if (!open) return;

        let cancelled = false;

        setForm(EMPTY_FORM);
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
                    const {items, hasMore} = await fetchSelectorPage(`${baseUrl}?${params.toString()}`, authHeader);
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
            // ContactsLocationAddressHandler enriches the GET-by-ID response with C_Location fields.
            fetch(`${contactsApiBase}/locationAddress/${bplLinkId}`, {headers: authHeader})
                .then(r => (r.ok ? r.json() : null))
                .then(d => {
                    const rec = d?.response?.data?.[0] ?? d;
                    if (rec?.id) {
                        setForm({
                            address: rec.address ?? rec.addressLine1 ?? '',
                            address2: rec.address2 ?? rec.addressLine2 ?? '',
                            postalCode: rec.postalCode ?? '',
                            city: rec.city ?? rec.cityName ?? '',
                            country: rec.country ?? '',
                            // Store the known label so the picker shows "Spain" even if the selector
                            // returns a different ID format or hasn't loaded yet.
                            countryLabel: rec['country$_identifier'] ?? '',
                            region: rec.region ?? '',
                            regionLabel: rec['region$_identifier'] ?? '',
                            shipToAddress: rec.shipToAddress === 'Y' || rec.shipToAddress === true,
                            invoiceToAddress: rec.invoiceToAddress === 'Y' || rec.invoiceToAddress === true,
                        });
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
                        `${baseUrl}?${params.toString()}`,
                        authHeader
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

                fetchSelectorPage(`${countrySelectorBase}?${params.toString()}`, authHeader)
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
        token,
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

                fetchSelectorPage(`${regionSelectorBase}?${params.toString()}`, authHeader)
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
        token,
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

    async function handleSave() {
        if (saving || initialLoading) return;
        if (!form.country) {
            toast.error(ui('locationCountryRequired'));
            return;
        }
        setSaving(true);
        try {
            const name = [form.city, form.address].filter(Boolean).join(', ')
                || [form.regionLabel || form.region, form.countryLabel || form.country].filter(Boolean).join(', ')
                || 'Location';
            const payload = {
                name,
                addressLine1: form.address || null,
                addressLine2: form.address2 || null,
                postalCode: form.postalCode || null,
                cityName: form.city || null,
                country: form.country || null,
                region: form.region || null,
                shipToAddress: form.shipToAddress ? 'Y' : 'N',
                invoiceToAddress: form.invoiceToAddress ? 'Y' : 'N',
            };
            const postHeaders = {...authHeader, 'Content-Type': 'application/json'};

            if (bplLinkId) {
                // EDIT: ContactsLocationAddressHandler updates C_Location + C_BPartner_Location atomically
                const res = await fetch(`${contactsApiBase}/locationAddress/${bplLinkId}`, {
                    method: 'PUT',
                    headers: postHeaders,
                    body: JSON.stringify(payload),
                });
                if (res.ok) {
                    const data = await res.json().catch(() => null);
                    showBackendMessages(data?.response?.data?.[0]?.messages);
                    onSaved?.();
                }
                return;
            }

            // CREATE: ContactsLocationAddressHandler creates C_Location + C_BPartner_Location atomically
            const res = await fetch(`${contactsApiBase}/locationAddress?parentId=${bpId}`, {
                method: 'POST',
                headers: postHeaders,
                body: JSON.stringify({...payload, businessPartner: bpId}),
            });

            if (!res.ok) {
                console.error('[LocationEditorModal] locationAddress POST failed with status', res.status);
                return;
            }

            const data = await res.json();
            if ((data?.response?.status ?? 0) !== 0) {
                console.error('[LocationEditorModal] locationAddress POST returned NEO error:', data?.response);
                return;
            }

            const newRecord = data?.response?.data?.[0] ?? data?.data?.[0] ?? null;
            showBackendMessages(newRecord?.messages);
            onSaved?.(newRecord?.id ?? null, newRecord?.name ?? name);
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    const INPUT = {
        width: '100%', fontSize: 14, padding: '8px 12px',
        border: '1px solid #D1D4DB', borderRadius: 8, height: 40,
        boxSizing: 'border-box', color: '#121217', outline: 'none', background: '#fff',
    };

    const FIELD_LABEL = { fontSize: 14, color: '#121217', fontWeight: 400, marginBottom: 6 };

    const PICKER_BTN = {
        ...INPUT, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', gap: 8, background: '#fff',
    };

    const PICKER_MODAL = {
        position: 'fixed', inset: 0, zIndex: 160,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(18,18,23,.35)',
    };

    const PICKER_CONTENT = {
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440,
        maxHeight: 520, margin: 16, display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(18,18,23,.18)',
        animation: 'fm-modal-in .2s cubic-bezier(.4,0,.2,1)',
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(18,18,23,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(18,18,23,.18)', width: '100%', maxWidth: 560, margin: 16, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 64px)', animation: 'fm-modal-in .2s cubic-bezier(.4,0,.2,1)' }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 20px 0', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ font: '700 20px/28px system-ui', color: '#121217' }}>
                            {ui('locationSelectorTitle')}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label={ui('close')}
                        style={{ width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'none', color: '#828FA3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}
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
                                style={{ animation: 'spin 1s linear infinite', color: '#828FA3' }}
                                data-testid="Loader2__927831" />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                            {/* Línea 1 */}
                            <div>
                                <div style={FIELD_LABEL}>{ui('addressLine1')}</div>
                                <input autoFocus type="text" value={form.address} onChange={e => setField('address', e.target.value)} style={INPUT} />
                            </div>

                            {/* Línea 2 */}
                            <div>
                                <div style={FIELD_LABEL}>{ui('addressLine2')}</div>
                                <input type="text" value={form.address2} onChange={e => setField('address2', e.target.value)} style={INPUT} />
                            </div>

                            {/* CP + Ciudad en grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                                <div>
                                    <div style={FIELD_LABEL}>{ui('postalCodeLabel')}</div>
                                    <input type="text" value={form.postalCode} onChange={e => setField('postalCode', e.target.value)} style={INPUT} />
                                </div>
                                <div>
                                    <div style={FIELD_LABEL}>{ui('cityLabel')}</div>
                                    <input type="text" value={form.city} onChange={e => setField('city', e.target.value)} style={INPUT} />
                                </div>
                            </div>

                            {/* País */}
                            <div>
                                <div style={FIELD_LABEL}>{ui('countryLabel')}</div>
                                <button
                                    type="button"
                                    onClick={() => setCountryPickerOpen(true)}
                                    aria-haspopup="dialog"
                                    aria-expanded={countryPickerOpen}
                                    style={PICKER_BTN}
                                >
                                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: form.country ? '#121217' : '#828FA3' }}>
                                        {selectedCountryLabel}
                                    </span>
                                    <ChevronDown
                                        size={15}
                                        style={{ color: '#828FA3', flexShrink: 0 }}
                                        data-testid="ChevronDown__927831" />
                                </button>
                            </div>

                            {/* Región */}
                            <div>
                                <div style={FIELD_LABEL}>{ui('regionLabel')}</div>
                                <button
                                    type="button"
                                    onClick={() => { if (form.country) setRegionPickerOpen(true); }}
                                    disabled={!form.country}
                                    aria-haspopup="dialog"
                                    aria-expanded={regionPickerOpen}
                                    style={{ ...PICKER_BTN, opacity: form.country ? 1 : 0.5, cursor: form.country ? 'pointer' : 'not-allowed' }}
                                >
                                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: form.region ? '#121217' : '#828FA3' }}>
                                        {!form.country ? ui('selectCountryFirst') : selectedRegionLabel}
                                    </span>
                                    <ChevronDown
                                        size={15}
                                        style={{ color: '#828FA3', flexShrink: 0 }}
                                        data-testid="ChevronDown__927831" />
                                </button>
                            </div>

                            {/* Checkboxes */}
                            <div style={{ display: 'flex', gap: 24, paddingTop: 4 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#121217', cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={form.shipToAddress} onChange={e => setField('shipToAddress', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#121217' }} />
                                    {t('IsShipTo') || 'Shipping Address'}
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#121217', cursor: 'pointer', userSelect: 'none' }}>
                                    <input type="checkbox" checked={form.invoiceToAddress} onChange={e => setField('invoiceToAddress', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#121217' }} />
                                    {t('IsBillTo') || 'Invoicing Address'}
                                </label>
                            </div>

                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '14px 20px', borderTop: '1px solid #E8EAEF', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        onClick={onClose}
                        style={{ font: '400 14px/20px system-ui', padding: '9px 20px', borderRadius: 20, border: '1px solid #D1D4DB', cursor: 'pointer', background: '#fff', color: '#121217' }}
                    >
                        {ui('cancel')}
                    </button>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={handleSave}
                            disabled={saving || initialLoading}
                            style={{ font: '600 14px/20px system-ui', padding: '9px 20px', borderRadius: 20, border: '1px solid #121217', cursor: 'pointer', background: '#121217', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: (saving || initialLoading) ? 0.5 : 1 }}
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
            {countryPickerOpen && (
                <div style={PICKER_MODAL} onMouseDown={() => setCountryPickerOpen(false)}>
                    <div style={PICKER_CONTENT} onMouseDown={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E8EAEF' }}>
                            <span style={{ font: '600 16px/22px system-ui', color: '#121217' }}>{ui('countryLabel')}</span>
                            <button onClick={() => setCountryPickerOpen(false)} aria-label={ui('cancel')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#828FA3', fontSize: 16 }}>✕</button>
                        </div>
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid #F5F7F9' }}>
                            <div style={{ position: 'relative' }}>
                                <Search
                                    size={14}
                                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#828FA3' }}
                                    data-testid="Search__927831" />
                                <input ref={countrySearchRef} type="text" value={countryQuery} onChange={e => setCountryQuery(e.target.value)} placeholder={ui('countrySearchPlaceholder')} style={{ ...INPUT, paddingLeft: 36 }} />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                            {countriesLoading && <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: '#828FA3' }}>{ui('loading')}</div>}
                            {countriesLoadFailed && <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: '#828FA3' }}>{ui('countryLoadError')}</div>}
                            {!countriesLoading && !countriesLoadFailed && filteredCountries.length === 0 && <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 14, color: '#828FA3' }}>{ui('noResults')}</div>}
                            {filteredCountries.map(country => (
                                <button key={country.id} type="button" onClick={() => handleCountrySelect(country.id)}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontSize: 14, textAlign: 'left', border: 'none', cursor: 'pointer', background: form.country === country.id ? '#F5F7F9' : '#fff', color: form.country === country.id ? '#121217' : '#374151', fontWeight: form.country === country.id ? 600 : 400 }}>
                                    <span style={{ width: 16, flexShrink: 0 }}>{form.country === country.id && <Check size={13} data-testid="Check__927831" />}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{country.label}</span>
                                </button>
                            ))}
                            <div ref={countryLoadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                                {countryLoadingMore && <Loader2
                                    size={14}
                                    style={{ animation: 'spin 1s linear infinite', color: '#828FA3' }}
                                    data-testid="Loader2__927831" />}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Region picker */}
            {regionPickerOpen && (
                <div style={PICKER_MODAL} onMouseDown={() => setRegionPickerOpen(false)}>
                    <div style={PICKER_CONTENT} onMouseDown={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E8EAEF' }}>
                            <span style={{ font: '600 16px/22px system-ui', color: '#121217' }}>{ui('regionLabel')}</span>
                            <button onClick={() => setRegionPickerOpen(false)} aria-label={ui('cancel')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#828FA3', fontSize: 16 }}>✕</button>
                        </div>
                        <div style={{ padding: '12px 20px', borderBottom: '1px solid #F5F7F9' }}>
                            <div style={{ position: 'relative' }}>
                                <Search
                                    size={14}
                                    style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#828FA3' }}
                                    data-testid="Search__927831" />
                                <input ref={regionSearchRef} type="text" value={regionQuery} onChange={e => setRegionQuery(e.target.value)} placeholder={ui('regionSearchPlaceholder')} style={{ ...INPUT, paddingLeft: 36 }} />
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                            {renderRegionPickerBody(regionsLoading, ui, regionsLoadFailed, filteredRegions, handleRegionSelect, form)}
                            <div ref={regionLoadMoreRef} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                                {regionLoadingMore && <Loader2
                                    size={14}
                                    style={{ animation: 'spin 1s linear infinite', color: '#828FA3' }}
                                    data-testid="Loader2__927831" />}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
