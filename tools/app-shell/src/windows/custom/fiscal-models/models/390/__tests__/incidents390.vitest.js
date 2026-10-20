// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/incidents390.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/fm390Api.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/incompleteYear390.js
//
// ETP-5716 — Modelo 390 incidents on the frontend: the backend computes the rules
// (Fiscal390IncidentRules); the page groups them into Bloqueantes / Advertencias, translates each
// one by its code with its params, and offers its action. Also the two requests that carry
// them: `POST /fiscal390/validate` and the 409 BLOCKING_INCIDENTS of `GET /fiscal390/generate`.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import esES from '@/locales/es_ES.json';
import enUS from '@/locales/en_US.json';
import esAR from '@/locales/es_AR.json';

vi.mock('@etendosoftware/app-shell-core/auth/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import {
  groupIncidents390, incidentText390, incidentActions390, organizationPath,
  nameWarningsFromIncidents390, ORGANIZATION_SECTION_ANCHOR, INCIDENT_KEY_PREFIX_390,
  incidentOrigin390, normalizeIncidents390,
} from '../incidents390.js';
import { validate390, generate390File, fetchBoxes390 } from '../fm390Api.js';
import {
  incompleteFiscalYearOf, incompleteFiscalYearText, parseMissingPeriods, FISCAL_CALENDAR_ROUTE,
} from '../incompleteYear390.js';
import { ORG_SECTION_ANCHOR } from '@/windows/custom/organization/OrganizationPage.jsx';

/** Every code Fiscal390IncidentRules can produce (com.etendoerp.go). */
const RULE_CODES = [
  'NO_MAIN_IAE', 'IAE_WITHOUT_CODE', 'TOO_MANY_IAE', 'UNSUPPORTED_RATE', 'COMPUTE_FAILED',
  'SUBSTITUTE_ID_INVALID', 'TERRITORY_PERCENT_MAX', 'TERRITORY_PERCENT_SUM', 'NO_ORG_NIF',
  'PERSON_NAME_MISSING', 'PERSON_REPRESENTATIVE_INCOMPLETE', 'COMPENSATION_NEGATIVE',
  'COMPENSATION_WITH_TERRITORY', 'COMPENSATION_BOTH', 'REFUND_WITHOUT_MONTHLY_REGISTER',
  'LAST_PERIOD_REFUND_CONFLICT', 'NO_LEGAL_REPRESENTATIVE', 'UNPOSTED_INVOICES', 'MISSING_303',
  'DIFF_303', 'INACTIVE_TAX_WITH_OPERATIONS', 'NAME_TRUNCATED',
  'BOX98_WITH_96_97', 'NO_BOX',
];
const ACTION_KEYS = [
  'fm.m390.incidents.go_to_box', 'fm.m390.incidents.view_invoices',
  'fm.m390.incidents.view_sales_invoices', 'fm.m390.incidents.view_purchase_invoices',
  'fm.m390.incidents.origin.box', 'fm.m390.incidents.origin.organization',
  'fm.m390.incidents.origin.invoices', 'fm.m390.incidents.origin.declaration',
];

/** A `t` that echoes the key and its params, so the tests see what was asked. */
const t = (key, params) => (params && Object.keys(params).length ? `${key}|${JSON.stringify(params)}` : key);

describe('groupIncidents390', () => {
  it('splits Bloqueantes and Advertencias keeping the order; a blank severity is blocking', () => {
    const items = [
      { origin: 'NO_MAIN_IAE', severity: 'block' },
      { origin: 'MISSING_303', severity: 'warn' },
      { origin: 'LEGACY', severity: undefined },
    ];
    const { blocking, warnings } = groupIncidents390(items);
    expect(blocking.map(i => i.origin)).toEqual(['NO_MAIN_IAE', 'LEGACY']);
    expect(warnings.map(i => i.origin)).toEqual(['MISSING_303']);
    expect(groupIncidents390(undefined)).toEqual({ blocking: [], warnings: [] });
  });
});

describe('incidentText390', () => {
  it('translates a rule incident by its code with its params', () => {
    expect(incidentText390({ origin: 'MISSING_303', params: { periods: 'T3, T4' }, message: 'x' }, t))
      .toBe('fm.m390.incident.MISSING_303|{"periods":"T3, T4"}');
  });

  it('formats amounts and rates, and names the truncated field', () => {
    const diff = incidentText390({ origin: 'DIFF_303', params: { difference: '2.00', expected: '100.00', result: '102.00', tolerance: '1.00' } }, t);
    expect(diff).toMatch(/^fm\.m390\.incident\.DIFF_303\|/);
    expect(diff).toContain('2,00');
    const cut = incidentText390({ origin: 'NAME_TRUNCATED', params: { field: 'legalRepresentative', limit: 36, label: '123Z' } }, t);
    expect(cut).toContain('fm.m390.ident.field.legalRepresentative|{\\"name\\":\\"123Z\\"}');
  });

  it('falls back to the stored message when the code has no translation', () => {
    const missing = (key) => key;
    expect(incidentText390({ origin: 'NEW_RULE', message: 'Fallback text' }, missing)).toBe('Fallback text');
  });

  it('never translates an AEAT answer', () => {
    expect(incidentText390({ origin: 'AEAT-E390001', message: 'NIF no identificado' }, t)).toBe('NIF no identificado');
  });
});

describe('incidentActions390', () => {
  it('box → "Ir a la casilla", sources → "Ver facturas"', () => {
    expect(incidentActions390({ action: { type: 'box', box: 87 } }))
      .toEqual([{ id: 'box', kind: 'box', box: 87, labelKey: 'fm.m390.incidents.go_to_box' }]);
    expect(incidentActions390({ action: { type: 'sources', box: '5' } }))
      .toEqual([{ id: 'sources', kind: 'sources', box: 5, labelKey: 'fm.m390.incidents.view_invoices' }]);
  });

  it('organization → "Editar en Organización" deep-linked to the section', () => {
    expect(incidentActions390({ action: { type: 'organization', section: 'iae' } }))
      .toEqual([{ id: 'organization', kind: 'navigate', path: '/organization#org-section-iae', labelKey: 'fm.m390.edit_in_organization' }]);
    expect(organizationPath('unknown')).toBe('/organization');
  });

  it('invoices → one link per side with invoices', () => {
    expect(incidentActions390({ action: { type: 'invoices', sales: 2, purchase: 0 } }).map(a => a.path))
      .toEqual(['/sales-invoice']);
    expect(incidentActions390({ action: { type: 'invoices', sales: 1, purchase: 3 } }).map(a => a.id))
      .toEqual(['sales', 'purchase']);
  });

  it('no action, a malformed one or an unknown type → nothing', () => {
    expect(incidentActions390({})).toEqual([]);
    expect(incidentActions390({ action: { type: 'box' } })).toEqual([]);
    expect(incidentActions390({ action: { type: 'later' } })).toEqual([]);
  });

  it('the section anchors are the ones the Organization page declares', () => {
    expect(ORGANIZATION_SECTION_ANCHOR).toEqual({
      identity: ORG_SECTION_ANCHOR.fiscal, iae: ORG_SECTION_ANCHOR.iae, modelo390: ORG_SECTION_ANCHOR.modelo390,
    });
  });
});

describe('nameWarningsFromIncidents390', () => {
  it('maps the NAME_TRUNCATED incidents to the blocks\' notice shape', () => {
    expect(nameWarningsFromIncidents390([
      { origin: 'NAME_TRUNCATED', params: { field: 'socialName', limit: 37 } },
      { origin: 'NAME_TRUNCATED', params: { field: 'legalRepresentative', limit: 36, label: 'N1' } },
      { origin: 'NO_MAIN_IAE' },
    ])).toEqual([
      { field: 'socialName', limit: 37 },
      { field: 'legalRepresentative', limit: 36, label: 'N1' },
    ]);
  });
});

describe('incidentOrigin390 / normalizeIncidents390 (shared Incidencias table)', () => {
  it('reads the origin from the action; an AEAT answer keeps its code', () => {
    expect(incidentOrigin390({ origin: 'X', action: { type: 'box', box: 5 } }, t)).toBe('fm.m390.incidents.origin.box|{"box":"05"}');
    expect(incidentOrigin390({ origin: 'X', action: { type: 'sources', box: 86 } }, t)).toBe('fm.m390.incidents.origin.box|{"box":"86"}');
    expect(incidentOrigin390({ origin: 'X', action: { type: 'organization', section: 'iae' } }, t)).toBe('fm.m390.incidents.origin.organization');
    expect(incidentOrigin390({ origin: 'X', action: { type: 'invoices', sales: 1 } }, t)).toBe('fm.m390.incidents.origin.invoices');
    expect(incidentOrigin390({ origin: 'X' }, t)).toBe('fm.m390.incidents.origin.declaration');
    expect(incidentOrigin390({ origin: 'AEAT-123', message: 'm' }, t)).toBe('AEAT-123');
  });

  it('normalises the severities and recounts them like groupIncidents390', () => {
    const out = normalizeIncidents390({ items: [{ origin: 'A' }, { origin: 'B', severity: 'warn' }, { origin: 'C', severity: 'block' }] });
    expect(out.items.map(i => i.severity)).toEqual(['block', 'warn', 'block']);
    expect(out.blocking).toBe(2);
    expect(out.warning).toBe(1);
    expect(normalizeIncidents390(null)).toEqual({ items: [], blocking: 0, warning: 0 });
  });
});

describe('i18n of the incidents', () => {
  it.each([['es_ES', esES], ['en_US', enUS], ['es_AR', esAR]])('%s translates every rule code and action', (_, dict) => {
    const labels = dict.genericLabels;
    const missing = [...RULE_CODES.map(c => `${INCIDENT_KEY_PREFIX_390}${c}`), ...ACTION_KEYS].filter(k => !labels[k]);
    expect(missing).toEqual([]);
  });
});

describe('fm390Api — incidents requests', () => {
  const decl = { id: 'D1', year: 2026, period: '0A' };
  const opts = { token: 'tok', apiBaseUrl: 'http://h/sws/neo/fiscal-models' };

  beforeEach(() => { apiFetch.mockReset(); });

  it('validate390 POSTs the declaration id and maps the answer', async () => {
    apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ frozen: false, data: [{ code: 'NO_MAIN_IAE', severity: 'block', message: 'm', action: { type: 'organization', section: 'iae' } }] }),
    });
    const res = await validate390(decl, opts);
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe('http://h/sws/neo/fiscal390/validate?year=2026&period=0A&id=D1');
    expect(init.method).toBe('POST');
    expect(res.blocking).toBe(1);
    expect(res.items[0].action.section).toBe('iae');
    expect(res.frozen).toBe(false);
  });

  it('validate390 resolves null on a failure, so the caller keeps what it has', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 500 });
    expect(await validate390(decl, opts)).toBeNull();
    apiFetch.mockRejectedValue(new Error('network'));
    expect(await validate390(decl, opts)).toBeNull();
    expect(await validate390({ year: 2026 }, opts)).toBeNull();
  });

  it('generate390File reports a 409 BLOCKING_INCIDENTS with its incidents', async () => {
    apiFetch.mockResolvedValue({
      ok: false, status: 409,
      text: async () => JSON.stringify({ error: { status: 409, code: 'BLOCKING_INCIDENTS', message: 'm', incidents: [{ code: 'NO_ORG_NIF', severity: 'block', message: 'x' }] } }),
    });
    const res = await generate390File(decl, opts);
    expect(res).toEqual({ ok: false, error: 'blocking_incidents', incidents: { blocking: 1, warning: 0, items: [{ origin: 'NO_ORG_NIF', message: 'x', severity: 'block' }] } });
  });

  it('generate390File keeps the server message of any other failure', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 409, text: async () => JSON.stringify({ error: { message: 'already submitted' } }) });
    expect(await generate390File(decl, opts)).toEqual({ ok: false, error: 'http_409', serverMessage: 'already submitted' });
  });

  // ETP-5716 — an exercise without its fiscal-calendar periods (422 INCOMPLETE_FISCAL_YEAR).
  it('generate390File reports a 422 INCOMPLETE_FISCAL_YEAR with the year and the missing months', async () => {
    apiFetch.mockResolvedValue({
      ok: false, status: 422,
      text: async () => JSON.stringify({ error: { status: 422, code: 'INCOMPLETE_FISCAL_YEAR', message: 'org=X…', year: 2025, missingPeriods: [11, 12] } }),
    });
    expect(await generate390File(decl, opts)).toEqual({ ok: false, error: 'incomplete_fiscal_year', year: 2025, missingPeriods: [11, 12] });
  });

  it('fetchBoxes390 throws an error carrying the structured code, year and months', async () => {
    apiFetch.mockResolvedValue({
      ok: false, status: 422,
      text: async () => JSON.stringify({ error: { status: 422, code: 'INCOMPLETE_FISCAL_YEAR', message: 'm', year: 2025, missingPeriods: [1, 2] } }),
    });
    const err = await fetchBoxes390(decl, opts).catch(e => e);
    expect(err).toMatchObject({ status: 422, code: 'INCOMPLETE_FISCAL_YEAR', year: 2025, missingPeriods: [1, 2] });
    expect(incompleteFiscalYearOf(err)).toEqual({ year: 2025, missingPeriods: [1, 2] });
  });
});

describe('incompleteYear390 — the exercise has no periods in the fiscal calendar', () => {
  it('recognises the structured error, an incident and nothing else', () => {
    expect(incompleteFiscalYearOf({ code: 'INCOMPLETE_FISCAL_YEAR', year: '2025', missingPeriods: [12, 1] }))
      .toEqual({ year: 2025, missingPeriods: [1, 12] });
    expect(incompleteFiscalYearOf({ origin: 'INCOMPLETE_FISCAL_YEAR', params: { year: '2025', missingPeriods: '3,4' } }))
      .toEqual({ year: 2025, missingPeriods: [3, 4] });
    expect(incompleteFiscalYearOf({ code: 'BLOCKING_INCIDENTS' })).toBeNull();
    expect(incompleteFiscalYearOf(null)).toBeNull();
    expect(parseMissingPeriods('0,13,x,5,5')).toEqual([5]);
  });

  it('names the missing months, or "todos los meses" when the 12 (or an unknown list) are missing', () => {
    expect(incompleteFiscalYearText({ year: 2025, missingPeriods: [11, 12] }, t))
      .toBe('fm.m390.incomplete_year.months|{"year":2025,"months":"fm.m390.month.11, fm.m390.month.12"}');
    const all = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(incompleteFiscalYearText({ year: 2025, missingPeriods: all }, t)).toBe('fm.m390.incomplete_year.all|{"year":2025}');
    expect(incompleteFiscalYearText({ year: 2025, missingPeriods: [] }, t)).toBe('fm.m390.incomplete_year.all|{"year":2025}');
  });

  it('the INCOMPLETE_FISCAL_YEAR incident is explained by the helper (never its stored text) and opens the calendar', () => {
    const item = { origin: 'INCOMPLETE_FISCAL_YEAR', severity: 'block', message: 'The fiscal year 2025 of org=ABC…', params: { year: '2025', missingPeriods: '1,2,3,4,5,6,7,8,9,10,11,12' }, action: { type: 'fiscalCalendar' } };
    expect(incidentText390(item, t)).toBe('fm.m390.incomplete_year.all|{"year":2025}');
    expect(incidentActions390(item)).toEqual([{ id: 'fiscalCalendar', kind: 'navigate', path: FISCAL_CALENDAR_ROUTE, labelKey: 'fm.m390.incomplete_year.go_to_calendar' }]);
  });

  it('has its texts in every locale', () => {
    ['fm.m390.incomplete_year.months', 'fm.m390.incomplete_year.all', 'fm.m390.incomplete_year.go_to_calendar', 'fm.aeat.error.incompleteFiscalYear']
      .forEach((k) => [esES, enUS, esAR].forEach(d => expect(d.genericLabels?.[k] ?? d[k], k).toBeTruthy()));
  });
});
