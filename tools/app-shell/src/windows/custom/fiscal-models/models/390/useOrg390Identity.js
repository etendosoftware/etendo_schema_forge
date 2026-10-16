// Modelo 390 — the organization data the read-only blocks show (ETP-5716): Identificación (NIF,
// name), Datos estadísticos (IAE activities) and Representante (natural-person representative, or
// the first 3 legal representatives by line). All of it is edited in the Organization window
// (docs/generated-custom-windows/organization.md, "Representante Legal and Modelo 390 identity");
// the 390 only reads it, the same way the classic report does.
//
// The Identificación name is the one classic writes into the file (AEAT390Report2014
// .generateDatIdent): a legal entity's AD_Org.socialName, or its name when that is empty; a natural
// person (information.aeat390Isperson) the aeat390Surname1 + aeat390Surname2 + aeat390Firstname of
// the Organization information. Classic cuts those texts to fixed lengths in the file
// (NAME_LIMITS_390); `nameWarnings` lists the ones that will be cut, for a non-blocking warning.
//
// Requests (each one independent — a failed one only leaves its own block empty):
//   GET {neo}/session                                              → organization.taxId / name
//   GET {neo}/organization/organization/<orgId>                     → socialName / name
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
  nameWarnings: [],
});

/**
 * The lengths classic cuts each identity text to in the file (`new AEAT390String(text, N)` in
 * AEAT390Report2014: generateDatIdent, generateRepresentanteFisica, generateRepresentanteJuridica).
 */
export const NAME_LIMITS_390 = Object.freeze({
  socialName: 37,
  firstName: 15,
  surname1: 15,
  surname2: 15,
  personRepresentative: 37,
  legalRepresentative: 36,
});

/**
 * The text as classic writes it (`AEAT390String`: upper case, then `removeStrangeCharacters` —
 * accented vowels to plain ones, every other character outside `[A-Z0-9. ]` dropped, Ñ included).
 * Only used to measure what the file will hold; the screen shows the text as typed.
 */
export function aeat390FileText(text) {
  if (text == null) return '';
  return String(text).toUpperCase()
    .replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E').replace(/[ÍÌÏÎ]/g, 'I')
    .replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U')
    .replace(/[^a-zA-Z0-9. ]/g, '');
}

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

/**
 * The identity texts classic will cut in the file: `[{ field, limit, label? }]`, `field` one of the
 * NAME_LIMITS_390 keys; `label` names the legal representative (its NIF, or its name).
 */
export function nameTruncations390({ isPerson, header, information, sessionOrg, representatives }) {
  const out = [];
  const check = (field, text, label) => {
    if (aeat390FileText(text).length > NAME_LIMITS_390[field]) {
      out.push(label != null ? { field, limit: NAME_LIMITS_390[field], label } : { field, limit: NAME_LIMITS_390[field] });
    }
  };
  const info = information ?? {};
  if (isPerson) {
    check('surname1', info.aeat390Surname1);
    check('surname2', info.aeat390Surname2);
    check('firstName', info.aeat390Firstname);
    // classic only writes the representative when it has a NIF
    if (!isBlank(info.aeat390RepNif)) check('personRepresentative', info.aeat390RepName);
  } else {
    check('socialName', taxpayerName390({ isPerson, header, information, sessionOrg }));
    sortByLineNo(representatives ?? []).slice(0, MODELO_390_REPRESENTATIVE_LIMIT).forEach((r) => {
      const name = legalRepresentativeName(r);
      check('legalRepresentative', name, r.taxID || name);
    });
  }
  return out;
}

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
        orgId ? get(`/organization/actividadesDelIae?parentId=${encodeURIComponent(orgId)}&_limit=100`) : null,
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
      const nameInput = { isPerson, header, information, sessionOrg: org, representatives: repRows };
      setIdentity({
        loaded: true,
        nif: org.taxId ?? information.taxID ?? '',
        name: taxpayerName390(nameInput),
        activities: toActivities(rowsOf(iae)),
        isPerson,
        personRepresentative: isPerson && (repNif || repName) ? { nif: repNif, name: repName } : null,
        representatives: toRepresentatives(repRows),
        nameWarnings: nameTruncations390(nameInput),
      });
    })();
    return () => { cancelled = true; };
  }, [apiBaseUrl, orgId, apiFetch]);

  return identity;
}
