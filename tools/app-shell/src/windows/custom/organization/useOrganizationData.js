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

  /**
   * Saves both tabs, one request AFTER the other — never with `Promise.all` (ETP-5112).
   *
   * This screen is the only one that writes two entities in a single save, and running the two
   * PATCHes concurrently made one of them fail with a 500 carrying core's "the record has already
   * been changed by another user" message, against a record nobody else had touched.
   *
   * The cause is in core, not here: `JsonToDataConverter` holds its date parser in a
   * `private final static SimpleDateFormat` (line 129 of that file), and `SimpleDateFormat` is not
   * thread-safe — it keeps parsing state in a shared `Calendar` between calls. Both PATCHes
   * arrived in the same millisecond on two Tomcat threads, both parsed their `updated` token
   * through that one shared instance, and whichever lost the race got a corrupted `Date`. The
   * concurrency check (`areDatesEqual`) then compared that garbage against the stored value, found
   * a difference, and threw `OBStaleObjectException`. Verified in the Tomcat log: two `body
   * recibido` lines stamped 21:07:38,375 on `exec-2` and `exec-3`, identical `updated` tokens, one
   * 200 and one 500.
   *
   * Awaiting them in sequence removes the overlap, so the shared parser is only ever used by one
   * thread at a time on this path. It costs one extra round trip on a screen that is saved rarely.
   *
   * This does NOT fix core's race — any other concurrent writer can still hit it, and the real
   * repair is a `ThreadLocal` or a `DateTimeFormatter` in `JsonToDataConverter`. That lives in
   * `modules_core` and affects all of Etendo, so it is deliberately out of scope here; this only
   * stops the one screen that reproduces it 100% of the time.
   */
  const save = useCallback(async ({ header, info }) => {
    const responses = [];
    if (header) {
      responses.push(await organizationApiFetch(`/organization/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(header),
      }));
    }
    if (info) {
      responses.push(await organizationApiFetch(`/information/${orgId}`, {
        method: 'PATCH',
        body: JSON.stringify(info),
      }));
    }
    const failed = responses.find(r => !r.ok);
    if (failed) throw new Error(`HTTP ${failed.status}`);
  }, [orgId, organizationApiFetch]);

  return {
    ...state,
    refetch: load,
    save,
  };
}
