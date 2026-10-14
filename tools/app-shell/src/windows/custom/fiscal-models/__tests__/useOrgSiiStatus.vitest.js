// @covers tools/app-shell/src/windows/custom/fiscal-models/useOrgSiiStatus.js
// ETP-5716 — "is the organization in the SII?", read before activating the Modelo 390.
import { describe, it, expect, vi } from 'vitest';
import { hasActiveSiiConfig, fetchOrgSiiActive } from '../useOrgSiiStatus.js';

const okJson = (data) => ({ ok: true, json: async () => ({ response: { data } }) });

describe('hasActiveSiiConfig', () => {
  it('is true for an active row that is in the SII (or does not say otherwise)', () => {
    expect(hasActiveSiiConfig([{ active: true, acogidaAlSII: 'Y' }])).toBe(true);
    expect(hasActiveSiiConfig([{ active: 'Y' }])).toBe(true);
  });

  it('ignores inactive "Change SIF" trace rows and rows explicitly out of the SII', () => {
    expect(hasActiveSiiConfig([{ active: false, acogidaAlSII: 'Y' }])).toBe(false);
    expect(hasActiveSiiConfig([{ active: true, acogidaAlSII: 'N' }])).toBe(false);
    expect(hasActiveSiiConfig([{ active: 'N' }, { active: true, acogidaAlSII: false }])).toBe(false);
  });

  it('is false for no rows / not an array', () => {
    expect(hasActiveSiiConfig([])).toBe(false);
    expect(hasActiveSiiConfig(undefined)).toBe(false);
  });
});

describe('fetchOrgSiiActive', () => {
  it('reads the organization SII configuration from the sii-config spec', async () => {
    const apiFetch = vi.fn(async () => okJson([{ active: true, acogidaAlSII: 'Y' }]));
    await expect(fetchOrgSiiActive(apiFetch, 'http://h/sws/neo/fiscal-models', 'ORG1')).resolves.toBe(true);
    const url = apiFetch.mock.calls[0][0];
    expect(url).toContain('/sii-config/siiConfiguration?');
    expect(url).toContain('organization=ORG1');
  });

  it('resolves false without an organization or base URL (no request)', async () => {
    const apiFetch = vi.fn();
    await expect(fetchOrgSiiActive(apiFetch, 'http://h/sws/neo/x', null)).resolves.toBe(false);
    await expect(fetchOrgSiiActive(apiFetch, '', 'ORG1')).resolves.toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('resolves false on an HTTP error or a network failure (never warns on "unknown")', async () => {
    await expect(fetchOrgSiiActive(async () => ({ ok: false }), 'http://h/sws/neo/x', 'O')).resolves.toBe(false);
    await expect(fetchOrgSiiActive(async () => { throw new Error('down'); }, 'http://h/sws/neo/x', 'O')).resolves.toBe(false);
  });
});
