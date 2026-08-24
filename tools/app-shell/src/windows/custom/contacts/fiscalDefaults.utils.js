import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { isEtendoTrue } from '../fiscal-config/fiscalConfig.utils.js';

// ── Organization info spec/entity (ETP-4784) ────────────────────────────────
// `AD_OrgInfo` already carries 3 server-maintained Y/N flags — no need to
// fetch+filter sii-config/tbai-config lists to infer whether SII/TicketBAI
// apply to a Business Partner's organization, a single getById does it.
// NOTE: the live spec name in NEO is `organization` (confirmed via
// GET /sws/neo/organization/information/{orgId} → 200). Do NOT trust
// artifacts/organization/contract.json's specName — it was stale (never
// regenerated after the last real push-to-neo for that window).
const ORG_INFO_SPEC = 'organization';
const ORG_INFO_ENTITY = 'information';

/**
 * Resolves a Business Partner FK-style field (raw UUID, `{id}` object, or
 * mock `{id, name}`) down to a plain string id, or null.
 */
export function resolveOrganizationId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') {
    const id = value.id ?? value.value ?? null;
    return id == null || id === '' ? null : String(id);
  }
  return String(value);
}

async function fetchOrganizationInfo(apiFetch, orgId) {
  try {
    const url = `/${ORG_INFO_SPEC}/${ORG_INFO_ENTITY}/${encodeURIComponent(orgId)}`;
    const res = await apiFetch(url, { headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      console.warn(`[fiscalDefaults] organization info fetch failed: ${res.status} ${url}`);
      return null;
    }
    const body = await res.json();
    return body?.response?.data ?? null;
  } catch {
    // Network error / 404 (spec not installed for this org) → not configured.
    return null;
  }
}

/**
 * Detects whether SII and/or TicketBAI are actively configured for the given
 * Business Partner organization, so `FiscalDefaultsSection` can show only
 * the sub-block(s) that apply. Reads the 3 server-maintained flags off
 * `AD_OrgInfo` (`organization/information/{orgId}`) instead of fetching and
 * filtering the `sii-config`/`tbai-config` lists.
 *
 * - SII "active": `etsgHasSIIConfig` is truthy.
 * - TicketBAI "active": `etsgHasTbaiConfig` is truthy.
 * - `vfactuActive` (`etsgHasVfactuConfig`) is exposed too for a future
 *   Verifactu block — not consumed by `FiscalDefaultsSection` yet.
 *
 * Fail-safe: any fetch error, missing connectivity, or 404 (record not found
 * / module not installed) degrades to `false` for every system — hide the
 * blocks rather than show broken or incorrect data.
 */
export function useSiiTbaiActive(organizationId, apiBaseUrl) {
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));
  const [state, setState] = useState({ loading: true, sii: false, tbai: false, vfactuActive: false });

  useEffect(() => {
    let cancelled = false;

    if (!organizationId) {
      setState({ loading: false, sii: false, tbai: false, vfactuActive: false });
      return undefined;
    }

    setState((s) => ({ ...s, loading: true }));

    (async () => {
      const info = await fetchOrganizationInfo(apiFetch, organizationId);
      if (cancelled) return;
      setState({
        loading: false,
        sii: isEtendoTrue(info?.etsgHasSIIConfig),
        tbai: isEtendoTrue(info?.etsgHasTbaiConfig),
        vfactuActive: isEtendoTrue(info?.etsgHasVfactuConfig),
      });
    })().catch(() => {
      if (!cancelled) setState({ loading: false, sii: false, tbai: false, vfactuActive: false });
    });

    return () => {
      cancelled = true;
    };
  }, [organizationId, apiFetch]);

  return state;
}
