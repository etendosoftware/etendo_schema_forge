// Is the selected organization in the SII? (ETP-5716) — read by the model catalog before it
// activates a model whose registry entry sets `siiWarningOnActivate` (the annual VAT summary:
// entities in the SII are exempt from filing it, so activating it asks for confirmation).
//
// Source: the organization's SII configuration — the same NEO entity the fiscal-config window
// reads (`sii-config/siiConfiguration`, `aeatsii_config`, see fiscal-config/useFiscalConfig.js).
// NEO serves inactive "Change SIF" trace rows too, so only an ACTIVE row counts (shared
// `isActiveRecord`), and a row explicitly marked out of the SII (`acogidaAlSII = 'N'`) does not.
//
// The date the organization joined the SII (`fechaAcogidaSII`, aeatsii_config.INSIISYSTEMDATE) is
// read too: when it falls after 1 January of the year, the organization was NOT in the SII for the
// whole year, so the catalog words the warning as "en el SII desde <fecha>" instead of implying an
// exemption for the year (`isSiiJoinedDuringYear`).
//
// Any failure (no organization, no SII module, network) resolves "not in the SII": the warning is
// a courtesy, never a gate, so "unknown" means "do not warn".
import { useEffect, useRef } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { useAuthOptional } from '@/auth/AuthContext.jsx';
import { neoBase } from '@/components/related-documents/helpers.js';
import { parseCalendarDate } from '@/lib/dateOnly.js';
import { isActiveRecord, isEtendoFalse } from '@/windows/custom/fiscal-config/fiscalConfig.utils.js';

/** The "not in the SII" status (also the answer to any failure). */
export const SII_STATUS_OFF = Object.freeze({ active: false, since: null });

/** The active SII configuration record among `rows` (one organization's records), or `null`. */
export function findActiveSiiConfig(rows) {
  return (Array.isArray(rows) ? rows : []).find(r => isActiveRecord(r) && !isEtendoFalse(r?.acogidaAlSII)) ?? null;
}

/** True when `rows` (SII configuration records of one organization) hold an active SII config. */
export function hasActiveSiiConfig(rows) {
  return findActiveSiiConfig(rows) != null;
}

/** `{ active, since }` from the SII configuration records: `since` = `fechaAcogidaSII` or `null`. */
export function siiStatusOf(rows) {
  const config = findActiveSiiConfig(rows);
  if (!config) return SII_STATUS_OFF;
  return { active: true, since: config.fechaAcogidaSII || null };
}

/**
 * True when the SII date `since` (date-only) is after 1 January of `year` — the organization joined
 * the SII during that year (or later), so it was not in the SII for the whole year.
 */
export function isSiiJoinedDuringYear(since, year) {
  const date = parseCalendarDate(since);
  if (!date || !Number.isFinite(Number(year))) return false;
  return date > new Date(Number(year), 0, 1);
}

/** Resolves `{ active, since }` for `orgId`; `SII_STATUS_OFF` on any failure. */
export async function fetchOrgSiiStatus(apiFetch, apiBaseUrl, orgId) {
  if (!apiBaseUrl || !orgId) return SII_STATUS_OFF;
  try {
    const params = new URLSearchParams({ organization: orgId, _limit: '50' });
    const res = await apiFetch(`${neoBase(apiBaseUrl)}/sii-config/siiConfiguration?${params}`, { baseUrl: '' });
    if (!res.ok) return SII_STATUS_OFF;
    const json = await res.json();
    return siiStatusOf(json?.response?.data);
  } catch (_) {
    return SII_STATUS_OFF;
  }
}

/** Resolves whether `orgId` has an active SII configuration; `false` on any failure. */
export async function fetchOrgSiiActive(apiFetch, apiBaseUrl, orgId) {
  return (await fetchOrgSiiStatus(apiFetch, apiBaseUrl, orgId)).active;
}

/**
 * Returns `getSiiStatus()` → Promise<{ active, since }> for the selected organization. Fetched
 * once, lazily (only when `enabled`), and memoised for the lifetime of the component.
 */
export default function useOrgSiiStatus({ apiBaseUrl, enabled = true }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const auth = useAuthOptional();
  const orgId = auth?.selectedOrg?.id ?? null;
  const promiseRef = useRef(null);

  useEffect(() => { promiseRef.current = null; }, [orgId, apiBaseUrl]);

  return function getSiiStatus() {
    if (!enabled) return Promise.resolve(SII_STATUS_OFF);
    if (!promiseRef.current) promiseRef.current = fetchOrgSiiStatus(apiFetch, apiBaseUrl, orgId);
    return promiseRef.current;
  };
}
