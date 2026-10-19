// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/useOrg390Identity.js
//
// Modelo 390 "Identificación" / "Representante": the name shown is the one classic writes into
// the file (AEAT390Report2014.generateDatIdent). The texts classic will cut are reported by the
// backend as NAME_TRUNCATED incidents (Fiscal390IncidentRulesTest, incidents390.vitest.js).
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

import useOrg390Identity, { taxpayerName390, toActivities } from '../useOrg390Identity.js';

const long = (n) => 'A'.repeat(n);

describe('taxpayerName390', () => {
  it('legal entity: the social name, or the organization name when it is empty', () => {
    expect(taxpayerName390({ isPerson: false, header: { socialName: 'Acme Sociedad Limitada', name: 'Acme' } }))
      .toBe('Acme Sociedad Limitada');
    expect(taxpayerName390({ isPerson: false, header: { socialName: '  ', name: 'Acme' } })).toBe('Acme');
    expect(taxpayerName390({ isPerson: false, header: null, sessionOrg: { name: 'From session' } })).toBe('From session');
  });

  it('natural person: surname 1 + surname 2 + first name of the Organization information', () => {
    const information = { aeat390Firstname: 'Ana', aeat390Surname1: 'Pérez', aeat390Surname2: 'Gómez' };
    expect(taxpayerName390({ isPerson: true, header: { socialName: 'Ignored SL' }, information }))
      .toBe('Pérez Gómez Ana');
    expect(taxpayerName390({ isPerson: true, information: { aeat390Firstname: 'Ana', aeat390Surname1: 'Pérez' } }))
      .toBe('Pérez Ana');
  });
});

describe('toActivities — "Datos estadísticos" A/B/C columns', () => {
  const row = (over) => ({
    id: 'x', default: false, lineNo: 10,
    'epgrafeIAE$_identifier': '1 - 6732 - OTROS CAFES Y BARES',
    'epiaeType$_identifier': '1 - Epígrafes correspondientes a: Actividades empresariales sujetas al IAE',
    'epiaeCode$_identifier': 'A03 - Resto de actividades empresariales no incluídas en los dos subtipos anteriores.',
    ...over,
  });

  it('splits the identifiers into description (A), code (B) and the AEAT-formatted epigraph (C)', () => {
    const [a] = toActivities([row({ default: 'Y' })]);
    expect(a).toMatchObject({
      description: 'OTROS CAFES Y BARES',
      code: 'A03',
      codeDescription: 'Resto de actividades empresariales no incluídas en los dos subtipos anteriores.',
      epigraph: '673.2',
      isDefault: true,
      rank: 0,
    });
    expect(a.typeLabel).toContain('Actividades empresariales sujetas al IAE');
  });

  it('keeps a description that itself contains the separator, and short epigraphs as they are', () => {
    const [a] = toActivities([row({ 'epgrafeIAE$_identifier': '1 - 012 - GANADO - BOVINO', 'epiaeCode$_identifier': null })]);
    expect(a).toMatchObject({ description: 'GANADO - BOVINO', epigraph: '012', code: '', codeDescription: '' });
  });

  it('prefers the raw epigraph / code fields (_extraProperties) over the identifiers', () => {
    const [a] = toActivities([row({
      'epgrafeIAE$_identifier': 'broken', 'epiaeCode$_identifier': 'broken',
      'epgrafeIAE$epigraph': '6732', 'epgrafeIAE$description': 'CAFES - BARES',
      'epiaeCode$code': 'A03', 'epiaeCode$description': 'Resto',
    })]);
    expect(a).toMatchObject({ description: 'CAFES - BARES', epigraph: '673.2', code: 'A03', codeDescription: 'Resto' });
  });

  it('orders main first, then the others by line, ranked 1…n as classic writes them', () => {
    const list = toActivities([
      row({ id: 'o2', lineNo: 30 }),
      row({ id: 'main', lineNo: 20, default: 'Y' }),
      row({ id: 'o1', lineNo: 10 }),
    ]);
    expect(list.map(a => [a.id, a.rank])).toEqual([['main', 0], ['o1', 1], ['o2', 2]]);
  });
});

describe('useOrg390Identity', () => {
  const ok = (data) => ({ ok: true, json: () => Promise.resolve(data) });
  const rows = (data) => ok({ response: { data } });

  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('reads the social name from the organization record', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.endsWith('/session')) return Promise.resolve(ok({ organization: { taxId: 'B12345678', name: 'Acme' } }));
      if (url.includes('/organization/organization/')) return Promise.resolve(rows([{ name: 'Acme', socialName: long(40) }]));
      if (url.includes('/organization/information/')) return Promise.resolve(rows([{ aeat390Isperson: false }]));
      return Promise.resolve(rows([]));
    });
    const { result } = renderHook(() => useOrg390Identity({ apiBaseUrl: 'http://h/sws/neo/fiscal-models', orgId: 'ORG1' }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('http://h/sws/neo/organization/organization/ORG1', { baseUrl: '' });
    expect(result.current.name).toBe(long(40));
  });

  it('a natural person shows the surnames and first name, even when the organization record fails', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.endsWith('/session')) return Promise.resolve(ok({ organization: { taxId: '12345678Z', name: 'Org' } }));
      if (url.includes('/organization/organization/')) return Promise.resolve({ ok: false });
      if (url.includes('/organization/information/')) {
        return Promise.resolve(rows([{ aeat390Isperson: 'Y', aeat390Firstname: 'Ana', aeat390Surname1: 'Pérez', aeat390Surname2: '' }]));
      }
      return Promise.resolve(rows([]));
    });
    const { result } = renderHook(() => useOrg390Identity({ apiBaseUrl: 'http://h/sws/neo/fiscal-models', orgId: 'ORG1' }));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.isPerson).toBe(true);
    expect(result.current.name).toBe('Pérez Ana');
  });
});
