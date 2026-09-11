import { useState, useEffect, useCallback } from 'react';
import { detectProfile, activeOrNull, isActiveRecord } from './fiscalConfig.utils.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

// Confirmed from artifacts/*/contract.json → backendContract.window.primaryEntity
const SII_ENTITY      = 'siiConfiguration';
const TBAI_ENTITY     = 'header';
const VERIFACTU_ENTITY = 'cabeceraDeConfiguraciónVerifactu';

// ETP-5229 — the field each system's config row carries its cutover/"acogida"
// timestamp under. Confirmed against the AD columns: aeatsii_config.monitordate,
// tbai_config.tbaisystemdate, etvfac_verifactu_config.IN_Vfactu_System.
const CUTOVER_FIELD = {
  sii: 'monitordate',
  tbai: 'tbaisystemdate',
  verifactu: 'inVfactuSystem',
};

async function fetchAllRows(apiFetch, specName, entityName, orgId) {
  // NEO reads with NO_ACTIVE_FILTER=true, so an org can carry inactive
  // ("Change SIF") trace rows alongside a live one. We deliberately fetch ALL
  // rows here (not just the active one) — ETP-5229 needs the EARLIEST cutover
  // date across every config row this org ever had for this system, including
  // deactivated ones, to gate whether a historical invoice predates the
  // system's existence for this org at all. A single org/system pair realistically
  // has a handful of config rows (one active + at most a couple of superseded
  // ones from "Change SIF"), so a generous page size avoids a second request
  // without paginating.
  const params = new URLSearchParams({ organization: orgId, _limit: '50' });
  const res = await apiFetch(`/${specName}/${entityName}?${params}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to load ${specName}: HTTP ${res.status}`);
  const json = await res.json();
  return json?.response?.data ?? [];
}

// Prefer the active row rather than blindly taking the first, so a leftover
// inactive trace never masks a real active config.
function pickDisplayRecord(rows) {
  if (rows.length === 0) return null;
  return rows.find(isActiveRecord) ?? rows[0];
}

/**
 * Earliest cutover/"acogida" date across ALL config rows (active or not) an
 * org ever had for one fiscal system. Used to gate whether a document's date
 * predates the system's existence for this org entirely — as opposed to the
 * CURRENTLY active config's own (possibly much later) cutover date, which is
 * the wrong comparison once an org has changed SIF and the new config's
 * cutover post-dates invoices that were genuinely sent under the old one.
 *
 * @param {Array<object>} rows all rows returned for the org+system (active or not)
 * @param {'sii'|'tbai'|'verifactu'} system
 * @returns {string|null} ISO timestamp, or null if no row carries the field
 */
function earliestCutoverDate(rows, system) {
  const field = CUTOVER_FIELD[system];
  let earliestMs = null;
  for (const row of rows) {
    const raw = row?.[field];
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isNaN(ms)) continue;
    if (earliestMs === null || ms < earliestMs) earliestMs = ms;
  }
  return earliestMs === null ? null : new Date(earliestMs).toISOString();
}

export function useFiscalConfig(orgId, apiBaseUrl) {
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [state, setState] = useState({
    loading: false,
    error: null,
    profile: null,
    siiRecord: null,
    tbaiRecord: null,
    verifactuRecord: null,
    // ETP-5229: earliest-ever cutover date per system, across ALL config rows
    // (active or deactivated) — see earliestCutoverDate() above.
    earliestSiiCutoverDate: null,
    earliestTbaiCutoverDate: null,
    earliestVerifactuCutoverDate: null,
  });

  const load = useCallback(async () => {
    if (!orgId) {
      setState({
        loading: false, error: null, profile: 'unconfigured',
        siiRecord: null, tbaiRecord: null, verifactuRecord: null,
        earliestSiiCutoverDate: null, earliestTbaiCutoverDate: null, earliestVerifactuCutoverDate: null,
      });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      // NEO reads with NO_ACTIVE_FILTER=true, so a deactivated ("Change SIF")
      // trace row can come back. We keep ALL rows here (not just the active
      // one) — resolving the profile still drops inactive rows, but ETP-5229's
      // earliest-cutover gate needs the full history.
      const [siiRows, tbaiRows, verifactuRows] = await Promise.all([
        fetchAllRows(apiFetch, 'sii-config', SII_ENTITY, orgId),
        fetchAllRows(apiFetch, 'tbai-config', TBAI_ENTITY, orgId),
        fetchAllRows(apiFetch, 'verifactu-config', VERIFACTU_ENTITY, orgId),
      ]);
      const sii = activeOrNull(pickDisplayRecord(siiRows));
      const tbai = activeOrNull(pickDisplayRecord(tbaiRows));
      const verifactu = activeOrNull(pickDisplayRecord(verifactuRows));
      setState({
        loading: false,
        error: null,
        siiRecord: sii,
        tbaiRecord: tbai,
        verifactuRecord: verifactu,
        profile: detectProfile(sii, tbai, verifactu),
        earliestSiiCutoverDate: earliestCutoverDate(siiRows, 'sii'),
        earliestTbaiCutoverDate: earliestCutoverDate(tbaiRows, 'tbai'),
        earliestVerifactuCutoverDate: earliestCutoverDate(verifactuRows, 'verifactu'),
      });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [orgId, apiFetch]);

  useEffect(() => { load(); }, [load]);

  /**
   * POSTs a minimal record for the complementary system (sii or tbai) under
   * the current org. Returns the created record (first item in response.data).
   * Throws on HTTP error.
   *
   * @param {'sii'|'tbai'} system
   * @param {string} adOrgId
   * @returns {Promise<object|null>}
   */
  async function createComplementary(system, adOrgId) {
    // tbai-config/header  or  sii-config/siiConfiguration
    const specPath = system === 'tbai'
      ? `/tbai-config/${TBAI_ENTITY}`
      : `/sii-config/${SII_ENTITY}`;

    // For SII, include the same defaults the onboarding wizard sets so the record
    // is fully operational from the start (ETP-4783: fix for "Añadir SII" button
    // when TBAI is already configured — the wizard path sets these, but the
    // complementary POST skipped them, leaving the record with empty/false defaults).
    const today = new Date().toISOString().slice(0, 10);
    const body = system === 'sii'
      ? {
          adOrgId,
          acogidaAlSII:      'Y',   // In SII System
          fechaAcogidaSII:   today, // In SII System Date
          monitordate:       today, // From date display in SII Monitor
          entornoDeProduccin: 'Y',  // Production Environment
          adjuntarArchivosXML: 'Y', // Attach XML Files
        }
      : { adOrgId };

    const res = await apiFetch(specPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
    const json = await res.json().catch(() => null);
    return json?.response?.data?.[0] ?? null;
  }

  return { ...state, refetch: load, createComplementary };
}
