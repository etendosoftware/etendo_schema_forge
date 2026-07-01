import { useState, useMemo, useCallback, useEffect } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import {
  GLC_SEED_PAYLOAD,
} from './mockCatalogs.js';

/**
 * State + dirty-tracking + save boundary for the General Ledger Configuration
 * window. Editable entities: General (single record), Defaults (single record),
 * Dimensions (list of {active, mandatory} per row). Documents is read-only and
 * not tracked here.
 *
 * At runtime the aggregate is loaded via GET and `save()` POSTs the dirty fields
 * per entity; both are handled transactionally by GeneralLedgerConfigurationHandler
 * in com.etendoerp.go. The mockCatalogs seed is the offline fallback used when NEO
 * is unreachable.
 */
export function useGeneralLedgerConfig(apiBaseUrl) {
  const { selectedOrg } = useAuth();
  const base = neoBase(apiBaseUrl);
  const apiFetch = useApiFetch(base);
  const seed = GLC_SEED_PAYLOAD;

  const [general, setGeneral] = useState(seed.general);
  const [defaults, setDefaults] = useState(seed.defaults);
  const [dimensions, setDimensions] = useState(seed.dimensions);
  const [documents, setDocuments] = useState(seed.documents);
  const [orgInfo, setOrgInfo] = useState(seed.orgInfo);
  const [catalogs, setCatalogs] = useState(seed.catalogs);
  const [meta, setMeta] = useState(seed.meta);
  const [loading, setLoading] = useState(false);

  // Snapshots to diff against for dirty state.
  const [baseline, setBaseline] = useState({
    general: seed.general,
    defaults: seed.defaults,
    dimensions: seed.dimensions,
  });

  const mapPayload = useCallback((payload) => ({
    general: payload?.general ?? seed.general,
    defaults: payload?.defaults ?? seed.defaults,
    dimensions: Array.isArray(payload?.dimensions) ? payload.dimensions : seed.dimensions,
    documents: Array.isArray(payload?.documents) ? payload.documents : seed.documents,
    orgInfo: payload?.orgInfo ?? seed.orgInfo,
    catalogs: {
      accounts: Array.isArray(payload?.catalogs?.accounts) ? payload.catalogs.accounts : seed.catalogs.accounts,
      currencies: Array.isArray(payload?.catalogs?.currencies) ? payload.catalogs.currencies : seed.catalogs.currencies,
    },
    meta: { ...seed.meta, ...(payload?.meta ?? {}) },
  }), [seed]);

  const load = useCallback(async () => {
    if (!selectedOrg?.id || !apiBaseUrl) {
      setGeneral(seed.general);
      setDefaults(seed.defaults);
      setDimensions(seed.dimensions);
      setDocuments(seed.documents);
      setOrgInfo(seed.orgInfo);
      setCatalogs(seed.catalogs);
      setMeta(seed.meta);
      setBaseline({ general: seed.general, defaults: seed.defaults, dimensions: seed.dimensions });
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ selectedOrgId: selectedOrg.id, _limit: '1' });
      const res = await apiFetch(`/general-ledger-configuration/General?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const payload = mapPayload(json?.response?.data?.[0]);
      setGeneral(payload.general);
      setDefaults(payload.defaults);
      setDimensions(payload.dimensions);
      setDocuments(payload.documents);
      setOrgInfo(payload.orgInfo);
      setCatalogs(payload.catalogs);
      setMeta(payload.meta);
      setBaseline({ general: payload.general, defaults: payload.defaults, dimensions: payload.dimensions });
    } catch (error) {
      console.warn('[general-ledger-configuration] aggregate load failed, using mock fallback:', error.message);
      setGeneral(seed.general);
      setDefaults(seed.defaults);
      setDimensions(seed.dimensions);
      setDocuments(seed.documents);
      setOrgInfo(seed.orgInfo);
      setCatalogs(seed.catalogs);
      setMeta(seed.meta);
      setBaseline({ general: seed.general, defaults: seed.defaults, dimensions: seed.dimensions });
    } finally {
      setLoading(false);
    }
  }, [selectedOrg?.id, apiBaseUrl, apiFetch, mapPayload, seed]);

  useEffect(() => {
    load();
  }, [load]);

  const setGeneralField = useCallback((field, value) => {
    setGeneral((g) => ({ ...g, [field]: value }));
  }, []);

  const setDefaultField = useCallback((field, value) => {
    setDefaults((d) => ({ ...d, [field]: value }));
  }, []);

  const setDimensionField = useCallback((id, field, value) => {
    setDimensions((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  // ── Dirty diff per entity ──────────────────────────────────────────────────
  const dirtyGeneral = useMemo(() => {
    const out = {};
    for (const k of Object.keys(general)) {
      if (general[k] !== baseline.general[k]) out[k] = general[k];
    }
    return out;
  }, [general, baseline.general]);

  const dirtyDefaults = useMemo(() => {
    const out = {};
    for (const k of Object.keys(defaults)) {
      if (defaults[k] !== baseline.defaults[k]) out[k] = defaults[k];
    }
    return out;
  }, [defaults, baseline.defaults]);

  const dirtyDimensions = useMemo(() => {
    const out = [];
    for (const row of dimensions) {
      const base = baseline.dimensions.find((b) => b.id === row.id);
      if (!base) continue;
      if (row.active !== base.active || row.mandatory !== base.mandatory) {
        out.push({ id: row.id, active: row.active, mandatory: row.mandatory });
      }
    }
    return out;
  }, [dimensions, baseline.dimensions]);

  const isDirty =
    Object.keys(dirtyGeneral).length > 0 ||
    Object.keys(dirtyDefaults).length > 0 ||
    dirtyDimensions.length > 0;

  const reset = useCallback(() => {
    setGeneral(baseline.general);
    setDefaults(baseline.defaults);
    setDimensions(baseline.dimensions);
  }, [baseline]);

  const save = useCallback(async () => {
    if (!selectedOrg?.id) {
      return {
        general: dirtyGeneral,
        defaults: dirtyDefaults,
        dimensions: dirtyDimensions,
      };
    }

    const payload = {
      general: dirtyGeneral,
      defaults: dirtyDefaults,
      dimensions: dirtyDimensions,
      selectedOrgId: selectedOrg.id,
    };

    const params = new URLSearchParams({ selectedOrgId: selectedOrg.id });
    const res = await apiFetch(`/general-ledger-configuration/General?${params}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json?.response?.data?.[0]) throw new Error('save: server acknowledged but returned no payload');
    const saved = mapPayload(json.response.data[0]);

    setGeneral(saved.general);
    setDefaults(saved.defaults);
    setDimensions(saved.dimensions);
    setDocuments(saved.documents);
    setOrgInfo(saved.orgInfo);
    setCatalogs(saved.catalogs);
    setMeta(saved.meta);
    setBaseline({ general: saved.general, defaults: saved.defaults, dimensions: saved.dimensions });
    return saved;
  }, [selectedOrg?.id, dirtyGeneral, dirtyDefaults, dirtyDimensions, apiFetch, mapPayload]);

  return {
    general,
    defaults,
    dimensions,
    documents,
    orgInfo,
    catalogs,
    meta,
    loading,
    setGeneralField,
    setDefaultField,
    setDimensionField,
    isDirty,
    dirty: { general: dirtyGeneral, defaults: dirtyDefaults, dimensions: dirtyDimensions },
    reset,
    save,
    apiFetch,
  };
}
