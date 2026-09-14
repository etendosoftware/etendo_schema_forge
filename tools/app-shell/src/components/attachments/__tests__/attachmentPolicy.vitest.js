import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FALLBACK_ATTACHMENT_POLICY,
  normalizeAttachmentPolicy,
  resolveAttachmentPolicy,
  resetAttachmentPolicyCache,
  isFileTypeAllowed,
  buildAcceptAttribute,
  buildTypesLabel,
} from '../attachmentPolicy.js';

function makeFile({ type = '', name = 'file' } = {}) {
  // A plain File is enough here — none of the helpers under test read its bytes.
  return new File(['content'], name, { type });
}

describe('isFileTypeAllowed', () => {
  it('rejects a .txt / text/plain file against the fallback policy', () => {
    const file = makeFile({ type: 'text/plain', name: 'notes.txt' });
    expect(isFileTypeAllowed(file, FALLBACK_ATTACHMENT_POLICY)).toBe(false);
  });

  it('accepts application/pdf against the fallback policy', () => {
    const file = makeFile({ type: 'application/pdf', name: 'doc.pdf' });
    expect(isFileTypeAllowed(file, FALLBACK_ATTACHMENT_POLICY)).toBe(true);
  });

  it('accepts a file with empty type but a .pdf name via extension fallback', () => {
    const file = makeFile({ type: '', name: 'report.pdf' });
    expect(isFileTypeAllowed(file, FALLBACK_ATTACHMENT_POLICY)).toBe(true);
  });

  it('rejects a file with empty type and a .txt name', () => {
    const file = makeFile({ type: '', name: 'notes.txt' });
    expect(isFileTypeAllowed(file, FALLBACK_ATTACHMENT_POLICY)).toBe(false);
  });

  it('accepts image/png and rejects application/pdf under a wildcard image/* override', () => {
    const policy = { allowedMimeTypes: ['image/*'], allowedExtensions: [] };
    expect(isFileTypeAllowed(makeFile({ type: 'image/png', name: 'a.png' }), policy)).toBe(true);
    expect(isFileTypeAllowed(makeFile({ type: 'application/pdf', name: 'a.pdf' }), policy)).toBe(false);
  });

  it('accepts everything when the policy has no type rules (backwards compatibility)', () => {
    const file = makeFile({ type: 'application/octet-stream', name: 'anything.bin' });
    expect(isFileTypeAllowed(file, {})).toBe(true);
    expect(isFileTypeAllowed(file, { allowedMimeTypes: [], allowedExtensions: [] })).toBe(true);
    expect(isFileTypeAllowed(file, undefined)).toBe(true);
  });
});

describe('buildAcceptAttribute', () => {
  it('contains both MIME types and dotted extensions', () => {
    const accept = buildAcceptAttribute(FALLBACK_ATTACHMENT_POLICY);
    expect(accept).toContain('application/pdf');
    expect(accept).toContain('.pdf');
    expect(accept).toContain('.zip');
  });

  it('returns undefined for an empty policy', () => {
    expect(buildAcceptAttribute({})).toBeUndefined();
    expect(buildAcceptAttribute()).toBeUndefined();
  });
});

describe('buildTypesLabel', () => {
  const ui = (key) => key;

  it('derives the joined translated groups from typeGroups', () => {
    const label = buildTypesLabel({ typeGroups: ['pdf', 'image'] }, ui);
    expect(label).toBe('attachmentsTypeGroupPdf, attachmentsTypeGroupImage');
  });

  it('derives pdf from allowedMimeTypes when typeGroups is absent', () => {
    const label = buildTypesLabel({ allowedMimeTypes: ['application/pdf'] }, ui);
    expect(label).toBe('attachmentsTypeGroupPdf');
  });

  it('returns null when nothing is derivable', () => {
    expect(buildTypesLabel({}, ui)).toBeNull();
    expect(buildTypesLabel({ allowedMimeTypes: ['application/octet-stream'] }, ui)).toBeNull();
  });
});

describe('normalizeAttachmentPolicy', () => {
  it('unwraps a {response:{data}} shape', () => {
    const result = normalizeAttachmentPolicy({
      response: { data: { maxSizeMB: 25, allowedMimeTypes: ['application/pdf'] } },
    });
    expect(result.maxSizeMB).toBe(25);
    expect(result.allowedMimeTypes).toEqual(['application/pdf']);
    expect(result.degraded).toBe(false);
  });

  it('unwraps a {data} shape', () => {
    const result = normalizeAttachmentPolicy({ data: { maxSizeMB: 5 } });
    expect(result.maxSizeMB).toBe(5);
  });

  it('falls back per-field on garbage input', () => {
    const result = normalizeAttachmentPolicy({ maxSizeMB: -1, allowedMimeTypes: 'not-an-array' });
    expect(result.maxSizeMB).toBe(FALLBACK_ATTACHMENT_POLICY.maxSizeMB);
    expect(result.allowedMimeTypes).toEqual([...FALLBACK_ATTACHMENT_POLICY.allowedMimeTypes]);
    expect(result.allowedExtensions).toEqual([...FALLBACK_ATTACHMENT_POLICY.allowedExtensions]);
    expect(result.typeGroups).toEqual([...FALLBACK_ATTACHMENT_POLICY.typeGroups]);
  });

  it('lowercases extensions', () => {
    const result = normalizeAttachmentPolicy({ allowedExtensions: ['PDF', 'Zip'] });
    expect(result.allowedExtensions).toEqual(['pdf', 'zip']);
  });

  it('handles null/undefined input', () => {
    const result = normalizeAttachmentPolicy(null);
    expect(result.maxSizeMB).toBe(FALLBACK_ATTACHMENT_POLICY.maxSizeMB);
    expect(normalizeAttachmentPolicy(undefined).maxSizeMB).toBe(FALLBACK_ATTACHMENT_POLICY.maxSizeMB);
  });
});

describe('resolveAttachmentPolicy', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    resetAttachmentPolicyCache();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the parsed policy with degraded:false on a 200 response', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { maxSizeMB: 15, allowedMimeTypes: ['application/pdf'] } } }),
    });

    const policy = await resolveAttachmentPolicy(apiFetch, { token: 'tok' });

    expect(policy.maxSizeMB).toBe(15);
    expect(policy.allowedMimeTypes).toEqual(['application/pdf']);
    expect(policy.degraded).toBe(false);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('caches the resolved policy across calls (no second fetch)', async () => {
    const apiFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: { maxSizeMB: 7 } } }),
    });

    const first = await resolveAttachmentPolicy(apiFetch);
    const second = await resolveAttachmentPolicy(apiFetch);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it('returns the fallback with degraded:true and logs on a non-ok response', async () => {
    const apiFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const policy = await resolveAttachmentPolicy(apiFetch);

    expect(policy.degraded).toBe(true);
    expect(policy.maxSizeMB).toBe(FALLBACK_ATTACHMENT_POLICY.maxSizeMB);
    expect(policy.allowedMimeTypes).toEqual(FALLBACK_ATTACHMENT_POLICY.allowedMimeTypes);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the fallback with degraded:true and logs when fetch throws', async () => {
    const apiFetch = vi.fn().mockRejectedValue(new Error('network down'));

    const policy = await resolveAttachmentPolicy(apiFetch);

    expect(policy.degraded).toBe(true);
    expect(policy.maxSizeMB).toBe(FALLBACK_ATTACHMENT_POLICY.maxSizeMB);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
