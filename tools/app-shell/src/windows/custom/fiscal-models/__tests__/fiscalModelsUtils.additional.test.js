import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBoxes303,
  generate303File,
  deriveBoxes303,
  checkModified303,
  compute349Operators,
  generate349File,
  checkModified349,
  computeUpcomingDeadlines,
} from '../fiscalModelsUtils.js';

// ── DOM stub ───────────────────────────────────────────────────────────────
// generate303File/generate349File call triggerDownload(), which touches
// document.createElement/body.appendChild/removeChild. Plain `node --test`
// has no DOM, so we install a minimal stub for the duration of this file.
// URL.createObjectURL/revokeObjectURL are natively available in Node 24.
let savedDocument;
before(() => {
  savedDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ href: '', download: '', click() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
});
after(() => {
  globalThis.document = savedDocument;
});

let savedFetch;
beforeEach(() => {
  savedFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = savedFetch;
});

// ═══════════════════════════════════════════════════════════════════════════
// computeBoxes303 — token/apiBaseUrl path
// ═══════════════════════════════════════════════════════════════════════════

describe('computeBoxes303 — with token and apiBaseUrl', () => {
  it('returns the parsed JSON when the fetch succeeds', async () => {
    globalThis.fetch = async (url, opts) => {
      assert.match(url, /\/fiscal303\/boxes\?/);
      assert.equal(opts.headers.Authorization, 'Bearer tok123');
      return { ok: true, json: async () => ({ boxes: { 1: 10 }, summary: { accrued: 10 } }) };
    };
    const result = await computeBoxes303(
      { year: 2025, period: 'T1' },
      { token: 'tok123', apiBaseUrl: '/sws/neo/fiscal303' }
    );
    assert.deepEqual(result, { boxes: { 1: 10 }, summary: { accrued: 10 } });
  });

  it('falls back to mock data when the response is not ok', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    const result = await computeBoxes303(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: '/sws/neo/fiscal303' }
    );
    assert.ok(result !== null);
    assert.equal(result.boxes[27], 682.08);
  });

  it('falls back to mock data when fetch throws', async () => {
    globalThis.fetch = async () => { throw new Error('network down'); };
    const result = await computeBoxes303(
      { year: 2026, period: 'T2' },
      { token: 'tok', apiBaseUrl: '/sws/neo/fiscal303' }
    );
    assert.ok(result !== null);
    assert.equal(result.boxes[27], 1309.98);
  });

  it('returns null when neither the API nor the mock cover the period', async () => {
    const result = await computeBoxes303({ year: 2020, period: 'T1' });
    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generate303File
// ═══════════════════════════════════════════════════════════════════════════

describe('generate303File — guard clauses', () => {
  it('returns no_token error when token is missing', async () => {
    const result = await generate303File({ year: 2026, period: 'T1' }, { apiBaseUrl: '/x' });
    assert.deepEqual(result, { ok: false, error: 'no_token' });
  });

  it('returns no_token error when apiBaseUrl is missing', async () => {
    const result = await generate303File({ year: 2026, period: 'T1' }, { token: 'tok' });
    assert.deepEqual(result, { ok: false, error: 'no_token' });
  });

  it('requires an IBAN for IBAN-required tipos (e.g. D)', async () => {
    const result = await generate303File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: '/x', identChecks: { tipo_declaracion: 'D' } }
    );
    assert.deepEqual(result, { ok: false, error: 'iban_required' });
  });

  it('rejects a blank/whitespace-only IBAN for IBAN-required tipos', async () => {
    const result = await generate303File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: '/x', identChecks: { tipo_declaracion: 'U', bank_iban: '   ' } }
    );
    assert.equal(result.error, 'iban_required');
  });

  it('does not require an IBAN for tipos outside the IBAN-required list', async () => {
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['data']) });
    const result = await generate303File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: '/x', identChecks: { tipo_declaracion: 'N' } }
    );
    assert.equal(result.ok, true);
  });
});

describe('generate303File — success path with identChecks and manualOverrides', () => {
  it('builds params from identChecks, box overrides, and triggers a download', async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return { ok: true, blob: async () => new Blob(['file-content']) };
    };
    const result = await generate303File(
      { year: 2026, period: 'T2' },
      {
        token: 'tok',
        apiBaseUrl: '/sws/neo/fiscal303',
        identChecks: {
          tipo_declaracion: 'D',
          bank_iban: 'ES91 2100 0418 4502 0005 1332',
          bank_swift_bic: 'CAIXESBBXXX',
          bank_nombre: 'CaixaBank',
          bank_direccion: 'Calle Mayor 1',
          bank_ciudad: 'Madrid',
          bank_pais: 'ES',
          bank_sepa: 'Y',
          baja_domiciliacion: 'N',
          sin_actividad: true,
          complementaria: true,
          nro_justificante: '123456789012',
        },
        manualOverrides: { 42: 100.5, 108: 25 },
      }
    );
    assert.equal(result.ok, true);
    assert.match(capturedUrl, /IBAN=ES9121000418450200051332/);
    assert.match(capturedUrl, /BIC=CAIXESBBXXX/);
    assert.match(capturedUrl, /Declaration_NoActivity=Y/);
    assert.match(capturedUrl, /IsComplementary=Y/);
    assert.match(capturedUrl, /ComplementaryNo=123456789012/);
    assert.match(capturedUrl, /Special_Compensations=100\.5/);
    assert.match(capturedUrl, /AdministrativeCriteriaDiscrepancy=25/);
  });

  it('uses a custom filename when provided', async () => {
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['x']) });
    const result = await generate303File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: '/x', filename: 'custom-303.txt' }
    );
    assert.equal(result.ok, true);
  });

  it('applies rectificativa params with motivo R (RectifyingReason)', async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return { ok: true, blob: async () => new Blob(['x']) };
    };
    await generate303File(
      { year: 2026, period: 'T1' },
      {
        token: 'tok',
        apiBaseUrl: '/x',
        identChecks: {
          tipo_declaracion: 'N',
          bank_iban: 'ES9121000418450200051332',
          rectificativa: true,
          nro_justificante: '999',
          motivo_rectificacion: 'R',
        },
      }
    );
    assert.match(capturedUrl, /IsComplementary=Y/);
    assert.match(capturedUrl, /ComplementaryNo=999/);
    assert.match(capturedUrl, /RectifyingReason=Y/);
  });

  it('applies rectificativa params with motivo D (AdministrativeDiscrepancyRectifyingReason)', async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return { ok: true, blob: async () => new Blob(['x']) };
    };
    await generate303File(
      { year: 2026, period: 'T1' },
      {
        token: 'tok',
        apiBaseUrl: '/x',
        identChecks: {
          tipo_declaracion: 'N',
          bank_iban: 'ES9121000418450200051332',
          rectificativa: true,
          motivo_rectificacion: 'D',
        },
      }
    );
    assert.match(capturedUrl, /AdministrativeDiscrepancyRectifyingReason=Y/);
  });

  it('falls back to decl.result.kind and then N when tipo_declaracion is absent', async () => {
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(['x']) });
    const result = await generate303File(
      { year: 2026, period: 'T1', result: { kind: 'N' } },
      { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result.ok, true);
  });
});

describe('generate303File — error paths', () => {
  it('returns http_<status> with a parsed serverMessage on a JSON error body', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: { message: 'com.foo.SomeException: @AEAT303_BadIban@' } }),
    });
    const result = await generate303File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'http_400');
    assert.equal(result.serverMessage, 'AEAT303_BadIban');
  });

  it('returns http_<status> with undefined serverMessage on a non-JSON error body', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'not json',
    });
    const result = await generate303File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.equal(result.error, 'http_500');
    assert.equal(result.serverMessage, undefined);
  });

  it('returns http_<status> even when reading the error body itself fails', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 502,
      text: async () => { throw new Error('body read failure'); },
    });
    const result = await generate303File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.equal(result.error, 'http_502');
  });

  it('returns a network error when fetch throws', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const result = await generate303File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.deepEqual(result, { ok: false, error: 'network' });
  });

  it('parses a plain message field when error.message is absent', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ message: 'Plain failure text' }),
    });
    const result = await generate303File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.equal(result.serverMessage, 'Plain failure text');
  });

  it('returns undefined serverMessage when the parsed body has no message at all', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ foo: 'bar' }),
    });
    const result = await generate303File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.equal(result.serverMessage, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// deriveBoxes303
// ═══════════════════════════════════════════════════════════════════════════

describe('deriveBoxes303', () => {
  it('returns all-zero summary for empty input', () => {
    const { boxes, summary } = deriveBoxes303({});
    assert.deepEqual(boxes[27], 0);
    assert.deepEqual(boxes[45], 0);
    assert.deepEqual(boxes[46], 0);
    assert.deepEqual(summary, { accrued: 0, deductible: 0, result: 0 });
  });

  it('maps 21% sales rate to boxes 7/9', () => {
    const { boxes } = deriveBoxes303({ salesByRate: { '21': { base: 1000, tax: 210 } } });
    assert.equal(boxes[7], 1000);
    assert.equal(boxes[9], 210);
  });

  it('merges 10%+7%+8% sales rates into boxes 4/6', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: {
        '10': { base: 100, tax: 10 },
        '7': { base: 50, tax: 3.5 },
        '8': { base: 25, tax: 2 },
      },
    });
    assert.equal(boxes[4], 175);
    assert.equal(boxes[6], 15.5);
  });

  it('merges 4%+5% sales rates into boxes 1/3', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: { '4': { base: 100, tax: 4 }, '5': { base: 50, tax: 2.5 } },
    });
    assert.equal(boxes[1], 150);
    assert.equal(boxes[3], 6.5);
  });

  it('maps 0% sales rate to boxes 150/152', () => {
    const { boxes } = deriveBoxes303({ salesByRate: { '0': { base: 500, tax: 0 } } });
    assert.equal(boxes[150], 500);
    assert.equal(boxes[152], undefined);
  });

  it('maps 2% (2026 new rate) sales to boxes 165/167', () => {
    const { boxes } = deriveBoxes303({ salesByRate: { '2': { base: 300, tax: 6 } } });
    assert.equal(boxes[165], 300);
    assert.equal(boxes[167], 6);
  });

  it('maps EU acquisitions to boxes 10/11', () => {
    const { boxes } = deriveBoxes303({ euPurch: { base: 200, tax: 42 } });
    assert.equal(boxes[10], 200);
    assert.equal(boxes[11], 42);
  });

  it('maps ISP (inverse charge) purchases to boxes 12/13', () => {
    const { boxes } = deriveBoxes303({ ispPurch: { base: 150, tax: 31.5 } });
    assert.equal(boxes[12], 150);
    assert.equal(boxes[13], 31.5);
  });

  it('maps recargo equivalencia rates to their box pairs', () => {
    const { boxes } = deriveBoxes303({
      ecByRate: {
        '1.4': { base: 100, tax: 1.4 },
        '5.2': { base: 200, tax: 10.4 },
        '0.5': { base: 300, tax: 1.5 },
        '1.75': { base: 400, tax: 7 },
      },
    });
    assert.equal(boxes[19], 100);
    assert.equal(boxes[21], 1.4);
    assert.equal(boxes[22], 200);
    assert.equal(boxes[24], 10.4);
    assert.equal(boxes[16], 300);
    assert.equal(boxes[18], 1.5);
    assert.equal(boxes[156], 400);
    assert.equal(boxes[158], 7);
  });

  it('maps all 7 purchase categories to their box pairs', () => {
    const data = {
      purchNormal: { base: 10, tax: 1 },
      purchInvGoods: { base: 20, tax: 2 },
      purchImport: { base: 30, tax: 3 },
      purchImportInv: { base: 40, tax: 4 },
      purchIntraCorr: { base: 50, tax: 5 },
      purchIntraInv: { base: 60, tax: 6 },
      purchRectif: { base: 70, tax: 7 },
    };
    const { boxes } = deriveBoxes303(data);
    assert.equal(boxes[28], 10);
    assert.equal(boxes[29], 1);
    assert.equal(boxes[30], 20);
    assert.equal(boxes[31], 2);
    assert.equal(boxes[32], 30);
    assert.equal(boxes[33], 3);
    assert.equal(boxes[34], 40);
    assert.equal(boxes[35], 4);
    assert.equal(boxes[36], 50);
    assert.equal(boxes[37], 5);
    assert.equal(boxes[38], 60);
    assert.equal(boxes[39], 6);
    assert.equal(boxes[40], 70);
    assert.equal(boxes[41], 7);
  });

  it('maps specialComp/invAdjust/proRataFinal to boxes 42/43/44', () => {
    const { boxes } = deriveBoxes303({ specialComp: 5, invAdjust: -2.5, proRataFinal: 1.25 });
    assert.equal(boxes[42], 5);
    assert.equal(boxes[43], -2.5);
    assert.equal(boxes[44], 1.25);
  });

  it('computes accrued (box 27) as the sum of all accrued-tax boxes', () => {
    const { boxes } = deriveBoxes303({ salesByRate: { '21': { base: 1000, tax: 210 } } });
    assert.equal(boxes[27], 210);
  });

  it('computes deductible (box 45) as the sum of all deductible boxes', () => {
    const { boxes } = deriveBoxes303({ purchNormal: { base: 100, tax: 21 } });
    assert.equal(boxes[45], 21);
  });

  it('computes result (box 46) as accrued minus deductible', () => {
    const { boxes } = deriveBoxes303({
      salesByRate: { '21': { base: 1000, tax: 210 } },
      purchNormal: { base: 100, tax: 21 },
    });
    assert.equal(boxes[46], 189);
  });

  it('maps intracommSales and exports to boxes 59/60 (info section)', () => {
    const { boxes } = deriveBoxes303({ intracommSales: 800, exports: 300 });
    assert.equal(boxes[59], 800);
    assert.equal(boxes[60], 300);
  });

  it('omits intracommSales/exports boxes entirely when not provided', () => {
    const { boxes } = deriveBoxes303({});
    assert.equal(boxes[59], undefined);
    assert.equal(boxes[60], undefined);
  });

  it('includes previousCompensation in the summary only when provided', () => {
    const withComp = deriveBoxes303({ previousCompensation: 42 });
    assert.equal(withComp.summary.previousCompensation, 42);

    const withoutComp = deriveBoxes303({});
    assert.equal('previousCompensation' in withoutComp.summary, false);
  });

  it('rounds monetary values to 2 decimal places', () => {
    const { boxes } = deriveBoxes303({ salesByRate: { '21': { base: 10.005, tax: 2.1049 } } });
    assert.equal(boxes[7], 10.01);
    assert.equal(boxes[9], 2.1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkModified303
// ═══════════════════════════════════════════════════════════════════════════

describe('checkModified303', () => {
  it('returns false when token or apiBaseUrl is missing', async () => {
    assert.equal(await checkModified303({ year: 2026, period: 'T1' }, 0, {}), false);
  });

  it('returns true when the server reports modified: true', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ modified: true }) });
    const result = await checkModified303(
      { year: 2026, period: 'T1' }, 12345, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, true);
  });

  it('returns false when the server reports modified: false', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ modified: false }) });
    const result = await checkModified303(
      { year: 2026, period: 'T1' }, 12345, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, false);
  });

  it('returns false when the response is not ok', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    const result = await checkModified303(
      { year: 2026, period: 'T1' }, 0, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, false);
  });

  it('returns false when fetch throws', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const result = await checkModified303(
      { year: 2026, period: 'T1' }, 0, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// compute349Operators
// ═══════════════════════════════════════════════════════════════════════════

describe('compute349Operators — with token', () => {
  it('returns parsed JSON on a successful fetch', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ operators: [], summary: {} }) });
    const result = await compute349Operators(
      { year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.deepEqual(result, { operators: [], summary: {} });
  });

  it('returns null when the response is not ok', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    const result = await compute349Operators(
      { year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, null);
  });

  it('returns null when fetch throws', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const result = await compute349Operators(
      { year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, null);
  });
});

describe('compute349Operators — mock fallback (no token)', () => {
  it('returns mock operators for 2026 T1', async () => {
    const result = await compute349Operators({ year: 2026, period: 'T1' });
    assert.ok(result !== null);
    assert.equal(result.operators.length, 5);
    assert.equal(result.summary.totalA, '19250.00');
  });

  it('returns mock operators for 2026 T2', async () => {
    const result = await compute349Operators({ year: 2026, period: 'T2' });
    assert.ok(result !== null);
    assert.equal(result.operators.length, 5);
  });

  it('returns null for an unsupported period', async () => {
    const result = await compute349Operators({ year: 2025, period: 'T3' });
    assert.equal(result, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generate349File
// ═══════════════════════════════════════════════════════════════════════════

describe('generate349File', () => {
  // Contract changed from a raw boolean to { ok, error, serverMessage? } — same
  // shape as generate303File (see 'generate303File — error paths' above).
  it('returns { ok: false, error: "no_token" } when token or apiBaseUrl is missing', async () => {
    const result = await generate349File({ year: 2026, period: 'T1' }, {});
    assert.equal(result.ok, false);
    assert.equal(result.error, 'no_token');
  });

  it('returns { ok: true } and triggers a download on success, with phone and contact set', async () => {
    let capturedBody;
    globalThis.fetch = async (url, opts) => {
      capturedBody = opts.body;
      assert.equal(opts.method, 'POST');
      return { ok: true, blob: async () => new Blob(['349-data']) };
    };
    const result = await generate349File(
      { year: 2026, period: 'T1' },
      { token: 'tok', apiBaseUrl: '/x', phone: '600123456', contact: 'Jane Doe' }
    );
    assert.equal(result.ok, true);
    assert.match(capturedBody, /phone=600123456/);
    assert.match(capturedBody, /contact=Jane(\+|%20)Doe/);
  });

  it('returns { ok: true } without phone/contact params when they are absent', async () => {
    let capturedBody;
    globalThis.fetch = async (url, opts) => {
      capturedBody = opts.body;
      return { ok: true, blob: async () => new Blob(['349-data']) };
    };
    const result = await generate349File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.equal(result.ok, true);
    assert.doesNotMatch(capturedBody, /phone=/);
    assert.doesNotMatch(capturedBody, /contact=/);
  });

  it('returns { ok: false, error: "http_500" } when the response is not ok', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => '' });
    const result = await generate349File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'http_500');
  });

  it('returns { ok: false, error: "network" } when fetch throws', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const result = await generate349File({ year: 2026, period: 'T1' }, { token: 'tok', apiBaseUrl: '/x' });
    assert.deepEqual(result, { ok: false, error: 'network' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkModified349
// ═══════════════════════════════════════════════════════════════════════════

describe('checkModified349', () => {
  it('returns false when token or apiBaseUrl is missing', async () => {
    assert.equal(await checkModified349({ year: 2026, period: 'T1' }, 0, {}), false);
  });

  it('returns true when the server reports modified: true', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ modified: true }) });
    const result = await checkModified349(
      { year: 2026, period: 'T1' }, 12345, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, true);
  });

  it('returns false when the response is not ok', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    const result = await checkModified349(
      { year: 2026, period: 'T1' }, 0, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, false);
  });

  it('returns false when fetch throws', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const result = await checkModified349(
      { year: 2026, period: 'T1' }, 0, { token: 'tok', apiBaseUrl: '/x' }
    );
    assert.equal(result, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getDeadlineDate (indirectly, via computeUpcomingDeadlines) — unrecognized
// period format returns null and is filtered out.
// ═══════════════════════════════════════════════════════════════════════════

describe('computeUpcomingDeadlines — unrecognized period format', () => {
  it('excludes declarations whose period matches neither T\\d nor \\d{2}', () => {
    const decls = [{ id: 'x', model: '390', year: 2026, period: 'anual', status: 'draft' }];
    assert.equal(computeUpcomingDeadlines(decls).length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getDeadlineDate (indirectly, via computeUpcomingDeadlines) — monthly rules
// ═══════════════════════════════════════════════════════════════════════════

describe('computeUpcomingDeadlines — 303 monthly deadlines', () => {
  const D = (model, year, period, status) => ({ id: `${model}-${year}-${period}`, model, year, period, status });

  it('303 non-January monthly period (05) → deadline is day 30 of the following month', () => {
    const [{ deadline }] = computeUpcomingDeadlines([D('303', 2026, '05', 'draft')]);
    assert.equal(deadline.getFullYear(), 2026);
    assert.equal(deadline.getMonth(), 5); // June
    assert.equal(deadline.getDate(), 30);
  });

  it('303 January monthly period, non-leap year (2026) → deadline is Feb 28', () => {
    const [{ deadline }] = computeUpcomingDeadlines([D('303', 2026, '01', 'draft')]);
    assert.equal(deadline.getFullYear(), 2026);
    assert.equal(deadline.getMonth(), 1); // February
    assert.equal(deadline.getDate(), 28);
  });

  it('303 January monthly period, leap year (2028) → deadline is Feb 29', () => {
    const [{ deadline }] = computeUpcomingDeadlines([D('303', 2028, '01', 'draft')]);
    assert.equal(deadline.getFullYear(), 2028);
    assert.equal(deadline.getMonth(), 1); // February
    assert.equal(deadline.getDate(), 29);
  });
});

describe('computeUpcomingDeadlines — 349 monthly deadlines', () => {
  const D = (model, year, period, status) => ({ id: `${model}-${year}-${period}`, model, year, period, status });

  it('349 July (07) → deadline is September 20, not August 20 (consolidated with August)', () => {
    const [{ deadline }] = computeUpcomingDeadlines([D('349', 2026, '07', 'draft')]);
    assert.equal(deadline.getFullYear(), 2026);
    assert.equal(deadline.getMonth(), 8); // September
    assert.equal(deadline.getDate(), 20);
  });
});

describe('computeUpcomingDeadlines — 303 vs 349 quarterly parity', () => {
  const D = (model, year, period, status) => ({ id: `${model}-${year}-${period}`, model, year, period, status });

  for (const period of ['T1', 'T2', 'T3', 'T4']) {
    it(`${period} deadline is identical for 303 and 349`, () => {
      const [{ deadline: d303 }] = computeUpcomingDeadlines([D('303', 2025, period, 'draft')]);
      const [{ deadline: d349 }] = computeUpcomingDeadlines([D('349', 2025, period, 'draft')]);
      assert.equal(d303.getTime(), d349.getTime());
    });
  }
});
