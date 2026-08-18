import { useCallback, useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';

/**
 * useOrganizationData — loads and saves the "Organización" screen data.
 *
 * Confirmed via artifacts/organization/contract.json (ETP-4749):
 *   - spec "organization", entity "organization"  -> AD_Org     (name, socialName, currency, etgoBusinessType)
 *   - spec "organization", entity "information"   -> AD_OrgInfo (locationAddress, taxID, yourCompanyDocumentImage,
 *     etgoEmail, etgoPhone, etgoWeb)
 *
 * Contact fields (email/phone/website) used to be read from the linked Business
 * Partner's own record (via `information.businessPartner`, fetched from the `contacts`
 * spec). Ivan added 3 dedicated columns directly on AD_OrgInfo instead
 * (EM_Etgo_Email/Phone/Web) — these are unrelated to any Business Partner, always
 * optional, and always editable. The Business Partner integration (separate fetch,
 * "no BP linked" state, "BP linked but failed to load" state, retry affordance) was
 * removed entirely along with it — there is nothing left on this screen that depends
 * on a linked Business Partner.
 */
export function useOrganizationData(orgId, apiBaseUrl) {
  const organizationApiFetch = useApiFetch(`${neoBase(apiBaseUrl)}/organization`);

  const [state, setState] = useState({
    loading: false,
    error: null,
    header: null,
    info: null,
  });

  const load = useCallback(async () => {
    if (!orgId) {
      setState({ loading: false, error: null, header: null, info: null });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [headerRes, infoRes] = await Promise.all([
        organizationApiFetch(`/organization/${orgId}`),
        organizationApiFetch(`/information/${orgId}`),
      ]);
      if (!headerRes.ok) throw new Error(`HTTP ${headerRes.status}`);
      if (!infoRes.ok) throw new Error(`HTTP ${infoRes.status}`);
      // GET-by-id still wraps the record in response.data[0] (NEO Headless convention,
      // confirmed via fetchBp() in fiscal-monitor/ContactDetailModal.jsx) — NOT a bare object.
      // A previous version of this hook read response.data directly and silently got an
      // array back, so every field read as undefined (e.g. the logo fallback always showed
      // "?" because orgName was always empty). Keep the [0] indexing.
      const header = (await headerRes.json())?.response?.data?.[0] ?? null;
      const info = (await infoRes.json())?.response?.data?.[0] ?? null;

      setState({ loading: false, error: null, header, info });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, [orgId, organizationApiFetch]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async ({ header, info }) => {
    const requests = [];
    if (header) {
      requests.push(organizationApiFetch(`/organization/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(header),
      }));
    }
    if (info) {
      requests.push(organizationApiFetch(`/information/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(info),
      }));
    }
    const results = await Promise.all(requests);
    const failed = results.find(r => !r.ok);
    if (failed) throw new Error(`HTTP ${failed.status}`);
  }, [orgId, organizationApiFetch]);

  return {
    ...state,
    refetch: load,
    save,
  };
}
