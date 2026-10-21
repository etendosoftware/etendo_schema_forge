// Modelo 390 — incidents (ETP-5716). Pure helpers (no React, no network) for the Incidencias tab
// and card: grouping into Bloqueantes / Advertencias, the translated text of each incident and
// the action it offers.
//
// The rules are computed by the BACKEND (`Fiscal390IncidentRules` in com.etendoerp.go, the single
// source of truth) and stored as incidents of the declaration; `POST /fiscal390/validate`
// recomputes them (validate390, fm390Api.js). Each one is
//   { origin: <code>, severity: 'block' | 'warn', message: <English fallback>,
//     params?: {...}, action?: { type: 'box' | 'sources' | 'organization' | 'invoices', ... } }
// (fetchDeclarationIncidents). An AEAT answer stored by a telematic attempt has an `AEAT-<code>`
// code, a plain AEAT message and no params: it is listed as it came, never translated.
// Contract: {etendo_root}/modules/com.etendoerp.go/docs/aeat-390-endpoints.md, "Incidents".
import { formatAmount, formatPercent } from '../../fiscalModelsUtils.js';
import { isAeatIncident } from './submission390.js';
import { parseAmount } from './fm390Layouts.js';
import {
  FISCAL_CALENDAR_ROUTE, GO_TO_FISCAL_CALENDAR_KEY, incompleteFiscalYearOf, incompleteFiscalYearText,
} from './incompleteYear390.js';

/** i18n key prefix of a rule incident's text: `fm.m390.incident.<CODE>`. */
export const INCIDENT_KEY_PREFIX_390 = 'fm.m390.incident.';

/** Code of the incident that reports an identity text the file will cut (NAME_TRUNCATED). */
export const NAME_TRUNCATED_390 = 'NAME_TRUNCATED';

/**
 * Organization window section of each `organization` action (`/organization#<anchor>`, the
 * section ids of OrganizationPage `ORG_SECTION_ANCHOR`): `identity` is "Datos fiscales" (NIF,
 * razón social), `iae` the IAE activities, `modelo390` the representative / natural person.
 */
export const ORGANIZATION_SECTION_ANCHOR = Object.freeze({
  identity: 'org-section-fiscal',
  iae: 'org-section-iae',
  modelo390: 'org-section-390',
});

/** The window route of each invoice list (`invoices` action). */
export const INVOICE_LIST_ROUTE = Object.freeze({
  sales: '/sales-invoice',
  purchase: '/purchase-invoice',
});

const isBlocking = (item) => item?.severity !== 'warn';

/** The incidents split into `{ blocking, warnings }`, each keeping the backend order. */
export function groupIncidents390(items) {
  const list = Array.isArray(items) ? items : [];
  return {
    blocking: list.filter(isBlocking),
    warnings: list.filter(i => !isBlocking(i)),
  };
}

/** Params of an incident formatted for its text (amounts, percentages, the truncated field). */
function displayParams(item, t) {
  const p = { ...(item?.params ?? {}) };
  ['difference', 'expected', 'result', 'block9'].forEach((k) => {
    if (p[k] != null) p[k] = formatAmount(parseAmount(p[k]) ?? 0);
  });
  if (p.rate != null && p.rate !== '') p.rate = formatPercent(parseAmount(p.rate));
  if (item?.origin === NAME_TRUNCATED_390 && p.field) {
    p.field = t(`fm.m390.ident.field.${p.field}`, { name: p.label ?? '' });
  }
  return p;
}

/**
 * The text of an incident: a rule incident is translated by its code with its params
 * (`fm.m390.incident.<CODE>`); a code without a translation, or an AEAT answer, shows the stored
 * message.
 */
export function incidentText390(item, t) {
  const code = item?.origin ?? '';
  if (!code || isAeatIncident(item)) return item?.message ?? '';
  // The calendar lacks periods: the months by name, never the backend text.
  const incomplete = incompleteFiscalYearOf(item);
  if (incomplete) return incompleteFiscalYearText(incomplete, t);
  const key = `${INCIDENT_KEY_PREFIX_390}${code}`;
  const text = t(key, displayParams(item, t));
  return text && text !== key ? text : (item?.message ?? '');
}

/**
 * The actions an incident offers, as `[{ id, labelKey, kind, ... }]` for the tab to render:
 *   box          → "Ir a la casilla"         `{ box }`
 *   sources      → "Ver facturas"            `{ box }` (the Facturas tab filtered by that box)
 *   organization → "Editar en Organización"  `{ path: '/organization#<anchor>' }`
 *   invoices     → "Ver facturas de venta" / "de compra" `{ path }` (one per non-empty side)
 *   fiscalCalendar → "Ir a Calendario fiscal" `{ path: FISCAL_CALENDAR_ROUTE }`
 *   settlements  → "Ver detalle por trimestre" (block 9 and the year's 303s, where Calcular preloads)
 */
export function incidentActions390(item) {
  const a = item?.action;
  if (!a || typeof a !== 'object') return [];
  const box = Number(a.box);
  switch (a.type) {
    case 'box':
      return Number.isInteger(box) && box > 0 ? [{ id: 'box', kind: 'box', box, labelKey: 'fm.m390.incidents.go_to_box' }] : [];
    case 'sources':
      return Number.isInteger(box) && box > 0 ? [{ id: 'sources', kind: 'sources', box, labelKey: 'fm.m390.incidents.view_invoices' }] : [];
    case 'organization':
      return [{ id: 'organization', kind: 'navigate', path: organizationPath(a.section), labelKey: 'fm.m390.edit_in_organization' }];
    case 'settlements':
      return [{ id: 'settlements', kind: 'settlements', labelKey: 'fm.m390.reconcile.view_detail' }];
    case 'fiscalCalendar':
      return [{ id: 'fiscalCalendar', kind: 'navigate', path: FISCAL_CALENDAR_ROUTE, labelKey: GO_TO_FISCAL_CALENDAR_KEY }];
    case 'invoices': {
      const out = [];
      if (Number(a.sales) > 0) out.push({ id: 'sales', kind: 'navigate', path: INVOICE_LIST_ROUTE.sales, labelKey: 'fm.m390.incidents.view_sales_invoices' });
      if (Number(a.purchase) > 0) out.push({ id: 'purchase', kind: 'navigate', path: INVOICE_LIST_ROUTE.purchase, labelKey: 'fm.m390.incidents.view_purchase_invoices' });
      return out;
    }
    default:
      return [];
  }
}

/** `/organization#<anchor>` for an Organization section (`/organization` when unknown). */
export function organizationPath(section) {
  const anchor = ORGANIZATION_SECTION_ANCHOR[section];
  return anchor ? `/organization#${anchor}` : '/organization';
}

/**
 * The identity texts the file will cut, from the NAME_TRUNCATED incidents, in the shape the
 * Identificación / Representante blocks show: `[{ field, limit, label? }]`.
 */
export function nameWarningsFromIncidents390(items) {
  return (Array.isArray(items) ? items : [])
    .filter(i => i?.origin === NAME_TRUNCATED_390 && i?.params?.field)
    .map(i => (i.params.label != null
      ? { field: i.params.field, limit: i.params.limit, label: i.params.label }
      : { field: i.params.field, limit: i.params.limit }));
}

/**
 * The "Origen" column of the shared Incidencias table: the AEAT code of an AEAT answer, else what
 * the incident is about, read from its action — "Casilla 86", "Organización", "Facturas" — or
 * "Declaración" for a rule with no action.
 */
export function incidentOrigin390(item, t) {
  if (isAeatIncident(item)) return item?.origin ?? null;
  const a = item?.action;
  const box = Number(a?.box);
  if ((a?.type === 'box' || a?.type === 'sources') && Number.isInteger(box) && box > 0) {
    return t('fm.m390.incidents.origin.box', { box: String(box).padStart(2, '0') });
  }
  if (a?.type === 'organization') return t('fm.m390.incidents.origin.organization');
  if (a?.type === 'invoices') return t('fm.m390.incidents.origin.invoices');
  return t('fm.m390.incidents.origin.declaration');
}

/**
 * The incidents in the shape the shared Incidencias table reads: every item's severity normalised
 * to `block` / `warn` (anything not `warn` is blocking, as `groupIncidents390` counts it).
 */
export function normalizeIncidents390(incidents) {
  const items = (Array.isArray(incidents?.items) ? incidents.items : [])
    .map(i => ({ ...i, severity: isBlocking(i) ? 'block' : 'warn' }));
  const { blocking, warnings } = groupIncidents390(items);
  return { ...(incidents ?? {}), items, blocking: blocking.length, warning: warnings.length };
}
