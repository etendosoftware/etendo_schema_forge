// Modelo 390 — the organization data the read-only blocks show (ETP-5716): Identificación (NIF,
// name), Datos estadísticos (IAE activities) and Representante (natural-person representative, or
// the first 3 legal representatives by line). All of it is edited in the Organization window
// (docs/generated-custom-windows/organization.md, "Representante Legal and Modelo 390 identity");
// the 390 only reads it, the same way the classic report does.
//
// The Identificación name is the one classic writes into the file (AEAT390Report2014
// .generateDatIdent): a legal entity's AD_Org.socialName, or its name when that is empty; a natural
// person (information.aeat390Isperson) the aeat390Surname1 + aeat390Surname2 + aeat390Firstname of
// the Organization information. Classic cuts those texts to fixed lengths in the file; the
// backend reports the ones it will cut as NAME_TRUNCATED incidents (Fiscal390IncidentRules), so
// the length rule lives in one place (incidents390.js `nameWarningsFromIncidents390`).
//
// Requests (each one independent — a failed one only leaves its own block empty):
//   GET {neo}/session                                              → organization.taxId / name
//   GET {neo}/organization/organization/<orgId>                     → socialName / name
//   GET {neo}/organization/information/<orgId>                      → aeat390Isperson, aeat390Rep*
//   GET {neo}/organization/actividadesDelIae?parentId=<orgId>       → IAE activities (+ the raw
//       epigraph / code fields through `_extraProperties`, IAE_EXTRA_PROPERTIES)
//   GET {neo}/organization/representanteLegal?parentId=<orgId>      → legal representatives
import { useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { neoBase } from '@/components/related-documents/helpers.js';
import {
  sortByLineNo, isEtendoTrue, activeRepresentatives, MODELO_390_REPRESENTATIVE_LIMIT,
} from '@/windows/custom/organization/representanteLegal.js';
import { formatIaeEpigraph390 } from './fm390Layouts.js';

export const EMPTY_ORG_IDENTITY = Object.freeze({
  loaded: false,
  nif: '',
  name: '',
  activities: [],
  isPerson: false,
  personRepresentative: null,
  representatives: [],
});

const isBlank = (v) => v == null || String(v).trim() === '';

/** Legal representative name as classic composes it: first name, surname 1, surname 2. */
const legalRepresentativeName = (r) => [r?.firstName, r?.lastname1, r?.lastname2].filter(v => !isBlank(v)).join(' ');

/**
 * The taxpayer name the file carries: a natural person's "surname1 surname2 firstname", a legal
 * entity's social name (its name when the social name is empty, as classic does).
 */
export function taxpayerName390({ isPerson, header, information, sessionOrg }) {
  if (isPerson) {
    const info = information ?? {};
    return [info.aeat390Surname1, info.aeat390Surname2, info.aeat390Firstname].filter(v => !isBlank(v)).join(' ');
  }
  if (!isBlank(header?.socialName)) return header.socialName;
  return header?.name ?? sessionOrg?.name ?? '';
}

async function readJson(res) {
  if (!res?.ok) return null;
  return res.json().catch(() => null);
}

const rowsOf = (json) => (Array.isArray(json?.response?.data) ? json.response.data : []);

/**
 * The raw IAE fields the "Datos estadísticos" block needs, asked through the datasource's
 * `_extraProperties` (NEO allowlists what a GET requests this way, neo-headless.md §4.3.5). They
 * come back flat: `epgrafeIAE$epigraph`, `epgrafeIAE$description`, `epiaeCode$code`,
 * `epiaeCode$description`.
 */
export const IAE_EXTRA_PROPERTIES = 'epgrafeIAE.epigraph,epgrafeIAE.description,epiaeCode.code,epiaeCode.description';

const rawOrNull = (v) => (v == null ? null : String(v).trim());

// Fallback when the raw fields are absent (an older backend): the IAE selectors as identifiers,
// composed from the AD identifier columns:
// EPIAE_Epigraph = "Key - Epigraph - Description" ("1 - 6732 - OTROS CAFES Y BARES"),
// EPIAE_Code = "Code - Description" ("A03 - Resto de actividades…"). A description may itself
// contain " - ", so only the leading parts are split off.
const IDENTIFIER_SEPARATOR = ' - ';

function splitIdentifier(identifier, leading) {
  const parts = String(identifier ?? '').split(IDENTIFIER_SEPARATOR);
  const head = parts.slice(0, leading).map(v => v.trim());
  while (head.length < leading) head.push('');
  return [...head, parts.slice(leading).join(IDENTIFIER_SEPARATOR).trim()];
}

/**
 * IAE row → what the "Datos estadísticos" block lists, matching the form's columns per activity:
 * A (`description`, the epigraph description), B (`code` + `codeDescription`) and C (`epigraph`,
 * AEAT format). Order is the one classic writes (AEAT390Utility.getEpigraphOrgInfo): the main
 * activity first, then the others by line; `rank` is 0 for the main one and 1…n for the others.
 * `typeLabel` (the IAE key, "Actividades empresariales sujetas al IAE") is not a form column.
 */
export function toActivities(rows) {
  let otherRank = 0;
  return [...rows]
    .sort((a, b) => Number(isEtendoTrue(b?.default)) - Number(isEtendoTrue(a?.default))
      || (Number(a?.lineNo) || 0) - (Number(b?.lineNo) || 0))
    .map(r => {
      const isDefault = isEtendoTrue(r?.default);
      const [, parsedEpigraph, parsedDescription] = splitIdentifier(r['epgrafeIAE$_identifier'], 2);
      const [parsedCode, parsedCodeDescription] = splitIdentifier(r['epiaeCode$_identifier'], 1);
      const epigraph = rawOrNull(r['epgrafeIAE$epigraph']) ?? parsedEpigraph;
      const description = rawOrNull(r['epgrafeIAE$description']) ?? parsedDescription;
      const code = rawOrNull(r['epiaeCode$code']) ?? parsedCode;
      const codeDescription = rawOrNull(r['epiaeCode$description']) ?? parsedCodeDescription;
      return {
        id: r.id,
        description,
        code,
        codeDescription,
        epigraph: formatIaeEpigraph390(epigraph),
        typeLabel: r['epiaeType$_identifier'] ?? '',
        isDefault,
        rank: isDefault ? 0 : ++otherRank,
      };
    });
}

/**
 * Legal representative rows → `{ id, nif, name, powerDate, notary }`: the first 3 ACTIVE rows by
 * line, exactly what classic writes (`AEAT390ReportDao.getOrgRepresentatives` reads them through
 * OBCriteria, which filters on active by default) and what the Organization grid marks "390".
 */
export function toRepresentatives(rows) {
  return activeRepresentatives(sortByLineNo(rows)).slice(0, MODELO_390_REPRESENTATIVE_LIMIT).map(r => ({
    id: r.id,
    nif: r.taxID ?? '',
    name: legalRepresentativeName(r),
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
      const [session, head, info, iae, reps] = await Promise.all([
        get('/session'),
        orgId ? get(`/organization/organization/${encodeURIComponent(orgId)}`) : null,
        orgId ? get(`/organization/information/${encodeURIComponent(orgId)}`) : null,
        orgId ? get(`/organization/actividadesDelIae?parentId=${encodeURIComponent(orgId)}&_limit=100&_extraProperties=${encodeURIComponent(IAE_EXTRA_PROPERTIES)}`) : null,
        orgId ? get(`/organization/representanteLegal?parentId=${encodeURIComponent(orgId)}&_limit=100&_sortBy=lineNo`) : null,
      ]);
      if (cancelled) return;
      const org = session?.organization ?? {};
      const header = rowsOf(head)[0] ?? null;
      const information = rowsOf(info)[0] ?? {};
      const isPerson = isEtendoTrue(information.aeat390Isperson);
      const repNif = information.aeat390RepNif ?? '';
      const repName = information.aeat390RepName ?? '';
      const repRows = rowsOf(reps);
      setIdentity({
        loaded: true,
        nif: org.taxId ?? information.taxID ?? '',
        name: taxpayerName390({ isPerson, header, information, sessionOrg: org }),
        activities: toActivities(rowsOf(iae)),
        isPerson,
        personRepresentative: isPerson && (repNif || repName) ? { nif: repNif, name: repName } : null,
        representatives: toRepresentatives(repRows),
      });
    })();
    return () => { cancelled = true; };
  }, [apiBaseUrl, orgId, apiFetch]);

  return identity;
}
