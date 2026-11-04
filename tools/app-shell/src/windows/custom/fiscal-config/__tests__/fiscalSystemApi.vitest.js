// @covers tools/app-shell/src/windows/custom/fiscal-config/fiscalSystemApi.js
// The window activates a billing system through the organization's backend actions (ETP-6053):
// GET fiscalSystemCatalog for the territory × system rules, POST configureFiscalSystem to create
// the records. Every call goes through the injected `apiFetch` (docs/request-policy.md).
import { describe, it, expect, vi } from 'vitest';
import { fetchFiscalCatalog, configureFiscalSystem, fetchCreatedRecords } from '../fiscalSystemApi.js';
import { FISCAL_SYSTEM_CATALOG } from './fiscalSystemCatalog.fixture.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('fetchFiscalCatalog', () => {
  it('GETs the fiscalSystemCatalog action of the organization through apiFetch', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: FISCAL_SYSTEM_CATALOG } }));

    await fetchFiscalCatalog(apiFetch, 'ORG1');

    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/organization/organization/ORG1/action/fiscalSystemCatalog');
    expect(opts?.method).toBeUndefined();
  });

  it('forwards the abort signal', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: FISCAL_SYSTEM_CATALOG } }));
    const controller = new AbortController();

    await fetchFiscalCatalog(apiFetch, 'ORG1', { signal: controller.signal });

    expect(apiFetch.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it('URL-encodes the organization id', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({}));

    await fetchFiscalCatalog(apiFetch, 'A/B C');

    expect(apiFetch.mock.calls[0][0]).toBe('/organization/organization/A%2FB%20C/action/fiscalSystemCatalog');
  });

  it('unwraps the NEO envelope (response.data object)', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { status: 0, data: FISCAL_SYSTEM_CATALOG } }));

    await expect(fetchFiscalCatalog(apiFetch, 'ORG1')).resolves.toEqual(FISCAL_SYSTEM_CATALOG);
  });

  it('returns a bare body as is', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(FISCAL_SYSTEM_CATALOG));

    await expect(fetchFiscalCatalog(apiFetch, 'ORG1')).resolves.toEqual(FISCAL_SYSTEM_CATALOG);
  });

  it('does not unwrap an array response.data (a list envelope is not an action answer)', async () => {
    const body = { response: { data: [{ id: 'x' }] } };
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(body));

    await expect(fetchFiscalCatalog(apiFetch, 'ORG1')).resolves.toEqual(body);
  });

  it('throws the server message on an error answer', async () => {
    const apiFetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'Could not read the fiscal system catalog.', status: 500 } }, { ok: false, status: 500 }),
    );

    await expect(fetchFiscalCatalog(apiFetch, 'ORG1')).rejects.toThrow('Could not read the fiscal system catalog.');
  });

  it('propagates a network failure', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('networkErrorRetry'));

    await expect(fetchFiscalCatalog(apiFetch, 'ORG1')).rejects.toThrow('networkErrorRetry');
  });
});

describe('configureFiscalSystem', () => {
  const OUTCOME = {
    system: 'SII+TBAI',
    territory: 'alava',
    created: [
      { system: 'SII', spec: 'sii-config', entity: 'siiConfiguration', id: 'sii-1' },
      { system: 'TBAI', spec: 'tbai-config', entity: 'header', id: 'tbai-1' },
    ],
  };

  it('POSTs system and territory as JSON to the configureFiscalSystem action', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: OUTCOME } }));

    await configureFiscalSystem(apiFetch, 'ORG1', { system: 'SII+TBAI', territory: 'alava' });

    const [path, opts] = apiFetch.mock.calls[0];
    expect(path).toBe('/organization/organization/ORG1/action/configureFiscalSystem');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(opts.body)).toEqual({ system: 'SII+TBAI', territory: 'alava' });
  });

  it('leaves the territory out when none is given ("Añadir SII" takes TicketBAI\'s)', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: OUTCOME } }));

    await configureFiscalSystem(apiFetch, 'ORG1', { system: 'SII' });

    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).toEqual({ system: 'SII' });
  });

  it('leaves out a null territory too', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: OUTCOME } }));

    await configureFiscalSystem(apiFetch, 'ORG1', { system: 'SII', territory: null });

    expect(JSON.parse(apiFetch.mock.calls[0][1].body)).not.toHaveProperty('territory');
  });

  it('returns the unwrapped outcome', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ response: { data: OUTCOME } }));

    await expect(configureFiscalSystem(apiFetch, 'ORG1', { system: 'SII+TBAI', territory: 'alava' }))
      .resolves.toEqual(OUTCOME);
  });

  it('throws the server refusal message from error.message', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse(
      { error: { message: 'El territorio Ceuta y Melilla no admite SII.', status: 422 } },
      { ok: false, status: 422 },
    ));

    await expect(configureFiscalSystem(apiFetch, 'ORG1', { system: 'SII', territory: 'ceuta' }))
      .rejects.toThrow('El territorio Ceuta y Melilla no admite SII.');
  });

  it('throws the server refusal message from a plain-string error', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Modo prueba forzado' }, { ok: false, status: 409 }));

    await expect(configureFiscalSystem(apiFetch, 'ORG1', { system: 'VERIFACTU', territory: 'ceuta' }))
      .rejects.toThrow('Modo prueba forzado');
  });

  it('throws the raw body when the refusal is not JSON', async () => {
    const apiFetch = vi.fn().mockResolvedValue(jsonResponse('Bad gateway', { ok: false, status: 502 }));

    await expect(configureFiscalSystem(apiFetch, 'ORG1', { system: 'SII', territory: 'navarra' }))
      .rejects.toThrow('Bad gateway');
  });
});

describe('fetchCreatedRecords', () => {
  function recordFetch(records) {
    return vi.fn(async (path) => {
      const found = records[path];
      if (found === 'fail') return jsonResponse({}, { ok: false, status: 500 });
      if (found === 'reject') throw new Error('network');
      return jsonResponse({ response: { data: found ? [found] : [] } });
    });
  }

  it('reads back each created record from its spec / entity, keyed sii / tbai / verifactu', async () => {
    const apiFetch = recordFetch({
      '/sii-config/siiConfiguration/sii-1': { id: 'sii-1', taxtype: 'IVA' },
      '/tbai-config/header/tbai-1': { id: 'tbai-1', etsgSifTerritory: 'ARABA' },
      [`/verifactu-config/${encodeURIComponent('cabeceraDeConfiguraciónVerifactu')}/vf-1`]: { id: 'vf-1', tAXType: '02' },
    });

    const records = await fetchCreatedRecords(apiFetch, [
      { system: 'SII', id: 'sii-1' },
      { system: 'TBAI', id: 'tbai-1' },
      { system: 'VERIFACTU', id: 'vf-1' },
    ]);

    expect(records).toEqual({
      sii: { id: 'sii-1', taxtype: 'IVA' },
      tbai: { id: 'tbai-1', etsgSifTerritory: 'ARABA' },
      verifactu: { id: 'vf-1', tAXType: '02' },
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
  });

  it('URL-encodes the VERI*FACTU entity name (it carries an accented character)', async () => {
    const apiFetch = recordFetch({});

    await fetchCreatedRecords(apiFetch, [{ system: 'VERIFACTU', id: 'vf-1' }]);

    expect(apiFetch.mock.calls[0][0]).toBe('/verifactu-config/cabeceraDeConfiguraci%C3%B3nVerifactu/vf-1');
  });

  it('keeps the bare { id } of a record that cannot be read back (non-ok)', async () => {
    const apiFetch = recordFetch({ '/sii-config/siiConfiguration/sii-1': 'fail' });

    await expect(fetchCreatedRecords(apiFetch, [{ system: 'SII', id: 'sii-1' }])).resolves.toEqual({ sii: { id: 'sii-1' } });
  });

  it('keeps the bare { id } of a record whose read-back rejects', async () => {
    const apiFetch = recordFetch({ '/tbai-config/header/tbai-1': 'reject' });

    await expect(fetchCreatedRecords(apiFetch, [{ system: 'TBAI', id: 'tbai-1' }])).resolves.toEqual({ tbai: { id: 'tbai-1' } });
  });

  it('keeps the bare { id } when the read-back returns no row', async () => {
    const apiFetch = recordFetch({});

    await expect(fetchCreatedRecords(apiFetch, [{ system: 'SII', id: 'sii-1' }])).resolves.toEqual({ sii: { id: 'sii-1' } });
  });

  it('skips an unknown system and an entry without id, without calling apiFetch', async () => {
    const apiFetch = recordFetch({});

    const records = await fetchCreatedRecords(apiFetch, [{ system: 'OTHER', id: 'x' }, { system: 'SII' }, null]);

    expect(records).toEqual({});
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('returns {} for a missing created list', async () => {
    const apiFetch = recordFetch({});

    await expect(fetchCreatedRecords(apiFetch, undefined)).resolves.toEqual({});
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
