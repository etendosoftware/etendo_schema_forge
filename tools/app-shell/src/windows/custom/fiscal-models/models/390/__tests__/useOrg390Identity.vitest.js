// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/useOrg390Identity.js
//
// Modelo 390 "Identificación" / "Representante": the name shown is the one classic writes into
// the file (AEAT390Report2014.generateDatIdent) and the texts classic will cut are reported.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

import useOrg390Identity, {
  aeat390FileText, taxpayerName390, nameTruncations390, NAME_LIMITS_390,
} from '../useOrg390Identity.js';

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

describe('aeat390FileText — what classic AEAT390String keeps', () => {
  it('upper-cases, folds accented vowels and drops every other non [A-Z0-9. ] character', () => {
    expect(aeat390FileText('Peña, S.L. & Cía')).toBe('PEA S.L.  CIA');
    expect(aeat390FileText(null)).toBe('');
  });
});

describe('nameTruncations390', () => {
  it('legal entity: social name over 37 and a legal representative name over 36', () => {
    expect(nameTruncations390({ isPerson: false, header: { socialName: long(37) } })).toEqual([]);
    expect(nameTruncations390({
      isPerson: false,
      header: { socialName: long(38) },
      representatives: [
        { taxID: '12345678Z', firstName: long(12), lastname1: long(12), lastname2: long(11), lineNo: 10 }, // 37 with spaces
        { taxID: '87654321X', firstName: 'Ana', lastname1: 'Pérez', lineNo: 20 },
      ],
    })).toEqual([
      { field: 'socialName', limit: NAME_LIMITS_390.socialName },
      { field: 'legalRepresentative', limit: 36, label: '12345678Z' },
    ]);
  });

  it('counts the characters the file keeps, not the ones classic strips', () => {
    expect(nameTruncations390({ isPerson: false, header: { socialName: `${long(37)},,,` } })).toEqual([]);
  });

  it('natural person: each name part over 15, and the representative name over 37 when it has a NIF', () => {
    const information = {
      aeat390Firstname: long(16), aeat390Surname1: long(15), aeat390Surname2: long(16),
      aeat390RepNif: '12345678Z', aeat390RepName: long(38),
    };
    expect(nameTruncations390({ isPerson: true, header: { socialName: long(60) }, information }).map(w => w.field))
      .toEqual(['surname2', 'firstName', 'personRepresentative']);
    expect(nameTruncations390({ isPerson: true, information: { ...information, aeat390RepNif: '' } }).map(w => w.field))
      .toEqual(['surname2', 'firstName']);
  });
});

describe('useOrg390Identity', () => {
  const ok = (data) => ({ ok: true, json: () => Promise.resolve(data) });
  const rows = (data) => ok({ response: { data } });

  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('reads the social name from the organization record and reports the cut names', async () => {
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
    expect(result.current.nameWarnings).toEqual([{ field: 'socialName', limit: 37 }]);
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
    expect(result.current.nameWarnings).toEqual([]);
  });
});
