// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/incidents390.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/fm390Api.js
// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/incompleteYear390.js
//
// ETP-5716 — Modelo 390 incidents on the frontend: the backend computes the rules
// (Fiscal390IncidentRules); the page groups them into Bloqueantes / Advertencias, translates each
// one by its code with its params, and offers its action. Also the two requests that carry
// them: `POST /fiscal390/validate` and the 409 BLOCKING_INCIDENTS of `GET /fiscal390/generate`.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  'BOX98_WITH_96_97', 'NO_BOX', 'BLOCK9_NOT_PRELOADED', 'BLOCK9_MISMATCH',
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
    const diff = incidentText390({ origin: 'DIFF_303', params: { difference: '2.00', expected: '100.00', result: '102.00' } }, t);
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

// "Generar fichero 390": one request generates the file and has the AEAT validator check it; the
// file comes back as base64 and is downloaded whatever the validator said.
describe('generate390File — the file validated by the AEAT', () => {
  const decl = { id: 'D1', year: 2026, period: '0A' };
  const opts = { token: 'tok', apiBaseUrl: 'http://h/sws/neo/fiscal-models' };
  // "A", "Ñ" in ISO-8859-1 (0xD1 — not valid UTF-8 on its own), CR, LF.
  const FILE_BYTES = [0x41, 0xD1, 0x0D, 0x0A];
  const FILE_BASE64 = btoa(String.fromCharCode(...FILE_BYTES));
  const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
  let downloads;
  let clickSpy;

  beforeEach(() => {
    apiFetch.mockReset();
    downloads = [];
    URL.createObjectURL = vi.fn((blob) => { downloads.push({ blob }); return 'blob:390'; });
    URL.revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      downloads[downloads.length - 1].name = this.download;
    });
  });
  afterEach(() => { clickSpy.mockRestore(); });

  const bytesOf = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve([...new Uint8Array(reader.result)]);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

  it('POSTs to fiscal390/generate-validated through the shared apiFetch, with no timeout', async () => {
    apiFetch.mockResolvedValue(okResponse({ fileBase64: FILE_BASE64, validation: { outcome: 'accepted' } }));
    await generate390File(decl, opts);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('http://h/sws/neo/fiscal390/generate-validated');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ year: '2026', period: '0A', id: 'D1' });
    expect(init).toEqual({ method: 'POST', baseUrl: '', token: 'tok', timeout: 0 });
  });

  it('decodes fileBase64 to the exact bytes of the file (0xD1 survives) and downloads it as text', async () => {
    apiFetch.mockResolvedValue(okResponse({ fileBase64: FILE_BASE64, validation: { outcome: 'accepted' } }));
    await generate390File(decl, opts);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].blob.type).toBe('text/plain');
    expect(await bytesOf(downloads[0].blob)).toEqual(FILE_BYTES);
    expect(downloads[0].name).toBe('390_0A_2026.txt');
  });

  it('downloads under the name the user typed', async () => {
    apiFetch.mockResolvedValue(okResponse({ fileBase64: FILE_BASE64, validation: { outcome: 'accepted' } }));
    await generate390File(decl, { ...opts, fileName: 'mi390' });
    expect(downloads[0].name).toBe('mi390.txt');
  });

  it.each(['accepted', 'rejected', 'connection_failure', 'not_validated'])(
    'downloads the file and returns the validation when the outcome is %s',
    async (outcome) => {
      apiFetch.mockResolvedValue(okResponse({
        fileBase64: FILE_BASE64,
        validation: { outcome, errors: [{ code: '390E01', message: 'err' }], warnings: [{ code: '390A01', message: 'warn' }] },
      }));
      const res = await generate390File(decl, opts);
      expect(downloads).toHaveLength(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(res).toEqual({
        ok: true,
        validation: { outcome, errors: [{ code: '390E01', message: 'err' }], warnings: [{ code: '390A01', message: 'warn' }] },
      });
    },
  );

  it('a file without a validation block is downloaded and reads as not validated', async () => {
    apiFetch.mockResolvedValue(okResponse({ fileBase64: FILE_BASE64 }));
    const res = await generate390File(decl, opts);
    expect(downloads).toHaveLength(1);
    expect(res).toEqual({ ok: true, validation: { outcome: 'not_validated', errors: [], warnings: [] } });
  });

  it.each([
    ['no fileBase64', { validation: { outcome: 'accepted' } }],
    ['an empty fileBase64', { fileBase64: '', validation: { outcome: 'accepted' } }],
    ['a fileBase64 that is not a string', { fileBase64: 42 }],
    ['no JSON body', null],
  ])('reports no_file and downloads nothing with %s', async (_label, body) => {
    apiFetch.mockResolvedValue(okResponse(body));
    expect(await generate390File(decl, opts)).toEqual({ ok: false, error: 'no_file' });
    expect(downloads).toHaveLength(0);
  });

  it('downloads nothing when the request is refused (409) or the calendar is incomplete (422)', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 409, text: async () => JSON.stringify({ error: { message: 'already submitted' } }) });
    expect(await generate390File(decl, opts)).toEqual({ ok: false, error: 'http_409', serverMessage: 'already submitted' });
    apiFetch.mockResolvedValue({
      ok: false, status: 422,
      text: async () => JSON.stringify({ error: { status: 422, code: 'INCOMPLETE_FISCAL_YEAR', message: 'm', year: 2025, missingPeriods: [12] } }),
    });
    expect(await generate390File(decl, opts)).toEqual({ ok: false, error: 'incomplete_fiscal_year', year: 2025, missingPeriods: [12] });
    expect(downloads).toHaveLength(0);
  });

  it('reports a network failure, and no_token without an API base', async () => {
    apiFetch.mockRejectedValue(new Error('down'));
    expect(await generate390File(decl, opts)).toEqual({ ok: false, error: 'network' });
    apiFetch.mockReset();
    expect(await generate390File(decl, { token: 'tok' })).toEqual({ ok: false, error: 'no_token' });
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('block 9 incidents (AEAT PAR016, ETP-5716)', () => {
  it('format their amounts and offer "Ver detalle por trimestre"', () => {
    const item = { origin: 'BLOCK9_MISMATCH', severity: 'block', params: { difference: '-2.00', block9: '502.00', result: '500.00', box: 86 }, action: { type: 'settlements' } };
    const text = incidentText390(item, t);
    expect(text).toContain('fm.m390.incident.BLOCK9_MISMATCH');
    // block9 is formatted as an amount like difference / result (never the raw "502.00").
    expect(text).not.toContain('"block9":"502.00"');
    expect(text).toMatch(/"block9":"502/);
    expect(incidentActions390(item)).toEqual([{ id: 'settlements', kind: 'settlements', labelKey: 'fm.m390.reconcile.view_detail' }]);
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
