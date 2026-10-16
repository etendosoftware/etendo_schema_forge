// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/useOrg390Identity.js
//
// Modelo 390 "Identificación" / "Representante": the name shown is the one classic writes into
// the file (AEAT390Report2014.generateDatIdent). The texts classic will cut are reported by the
// backend as NAME_TRUNCATED incidents (Fiscal390IncidentRulesTest, incidents390.vitest.js).
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

import useOrg390Identity, { taxpayerName390 } from '../useOrg390Identity.js';

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
