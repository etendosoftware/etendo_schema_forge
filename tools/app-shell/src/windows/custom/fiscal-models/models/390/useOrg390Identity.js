// Modelo 390 — the organization data the read-only blocks show (ETP-5716): Identificación (NIF,
// name), Datos estadísticos (IAE activities) and Representante (natural-person representative, or
// the first 3 legal representatives by line). All of it is edited in the Organization window
// (docs/generated-custom-windows/organization.md, "Representante Legal and Modelo 390 identity");
// the 390 only reads it, the same way the classic report does.
//
// Requests (each one independent — a failed one only leaves its own block empty):
//   GET {neo}/session                                              → organization.taxId / name
//   GET {neo}/organization/information/<orgId>                      → aeat390Isperson, aeat390Rep*
//   GET {neo}/organization/actividadesDelIae?parentId=<orgId>       → IAE activities
//   GET {neo}/organization/representanteLegal?parentId=<orgId>      → legal representatives
import { useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import {
  sortByLineNo, isEtendoTrue, MODELO_390_REPRESENTATIVE_LIMIT,
} from '@/windows/custom/organization/representanteLegal.js';

export const EMPTY_ORG_IDENTITY = Object.freeze({
  loaded: false,
  nif: '',
  name: '',
  activities: [],
  isPerson: false,
  personRepresentative: null,
  representatives: [],
});

async function readJson(res) {
  if (!res?.ok) return null;
  return res.json().catch(() => null);
}

const rowsOf = (json) => (Array.isArray(json?.response?.data) ? json.response.data : []);

/** IAE row → what the "Datos estadísticos" block lists. Principal first, then by line. */
export function toActivities(rows) {
  return [...rows]
    .sort((a, b) => Number(isEtendoTrue(b?.default)) - Number(isEtendoTrue(a?.default))
      || (Number(a?.lineNo) || 0) - (Number(b?.lineNo) || 0))
    .map(r => ({
      id: r.id,
      activity: r['epgrafeIAE$_identifier'] ?? '',
      type: r['epiaeType$_identifier'] ?? '',
      code: r['epiaeCode$_identifier'] ?? '',
      isDefault: isEtendoTrue(r?.default),
    }));
}

/** Legal representative row → `{ id, nif, name, powerDate, notary }` (first 3 by line). */
export function toRepresentatives(rows) {
  return sortByLineNo(rows).slice(0, MODELO_390_REPRESENTATIVE_LIMIT).map(r => ({
    id: r.id,
    nif: r.taxID ?? '',
    name: [r.firstName, r.lastname1, r.lastname2].filter(Boolean).join(' '),
    powerDate: r.powerDate ?? null,
    notary: r.notaryName ?? '',
  }));
}

export default function useOrg390Identity({ apiBaseUrl, orgId }) {
  const apiFetch = useApiFetch(apiBaseUrl);
  const [identity, setIdentity] = useState(EMPTY_ORG_IDENTITY);

  useEffect(() => {
    if (!apiBaseUrl) return undefined;
    let cancelled = false;
    const base = neoBase(apiBaseUrl);
    const get = (path) => apiFetch(`${base}${path}`, { baseUrl: '' }).then(readJson).catch(() => null);
    (async () => {
      const [session, info, iae, reps] = await Promise.all([
        get('/session'),
        orgId ? get(`/organization/information/${encodeURIComponent(orgId)}`) : null,
        orgId ? get(`/organization/actividadesDelIae?parentId=${encodeURIComponent(orgId)}&_limit=100`) : null,
        orgId ? get(`/organization/representanteLegal?parentId=${encodeURIComponent(orgId)}&_limit=100&_sortBy=lineNo`) : null,
      ]);
      if (cancelled) return;
      const org = session?.organization ?? {};
      const information = rowsOf(info)[0] ?? {};
      const isPerson = isEtendoTrue(information.aeat390Isperson);
      const repNif = information.aeat390RepNif ?? '';
      const repName = information.aeat390RepName ?? '';
      setIdentity({
        loaded: true,
        nif: org.taxId ?? information.taxID ?? '',
        name: org.name ?? '',
        activities: toActivities(rowsOf(iae)),
        isPerson,
        personRepresentative: isPerson && (repNif || repName) ? { nif: repNif, name: repName } : null,
        representatives: toRepresentatives(rowsOf(reps)),
      });
    })();
    return () => { cancelled = true; };
  }, [apiBaseUrl, orgId, apiFetch]);

  return identity;
}
