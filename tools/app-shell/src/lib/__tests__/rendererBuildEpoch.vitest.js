// ETP-5125 — the define→constant wiring, and the two consumers that must use the
// composed predicate.
//
// WHY THIS FILE IS SEPARATE from attachmentFreshness.test.js: the epoch reaches the
// module as a build-time global (`__RENDERER_BUILD_EPOCH_MS__`, injected by
// `vite.config.js`'s `define`), read ONCE at module load. Exercising that path needs
// `vi.stubGlobal` plus a module re-import, which `node --test` cannot do — so the pure
// predicates are specced there with an explicit epoch argument, and the wiring is
// specced here.
//
// This is the test that matters most, because the failure mode is SILENT and
// fail-open: if the `define` key and the `typeof` guard ever stop matching (a rename, a
// typo, a merge that drops the define), the constant falls back to 0, the whole
// invalidation disappears, and every cached printable silently serves the old design
// again — with no error anywhere. Exactly the bug ETP-5125 reported.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GLOBAL_KEY = '__RENDERER_BUILD_EPOCH_MS__';

const BUNDLE_BUILT_MS = Date.parse('2026-09-03T00:00:00Z');
const WRITTEN_BEFORE_BUNDLE = { updatedAt: '2026-09-02T23:00:00Z' };
const WRITTEN_AFTER_BUNDLE = { updatedAt: '2026-09-03T01:00:00Z' };
// Older than both files, so ETP-4787's record-vs-file half reads "fresh" on its own
// and only the bundle check can catch the stale rendering.
const RECORD_UPDATED = '2026-09-01T00:00:00Z';

/** Re-imports the module so its load-time read of the global is re-evaluated. */
async function importWithEpoch(value) {
  vi.resetModules();
  if (value === undefined) vi.unstubAllGlobals();
  else vi.stubGlobal(GLOBAL_KEY, value);
  return import('../attachmentFreshness.js');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('RENDERER_BUILD_EPOCH_MS — the Vite define reaches the module (ETP-5125)', () => {
  it('adopts the injected build instant', async () => {
    const { RENDERER_BUILD_EPOCH_MS } = await importWithEpoch(BUNDLE_BUILT_MS);
    expect(RENDERER_BUILD_EPOCH_MS).toBe(BUNDLE_BUILT_MS);
  });

  it('invalidates a cached rendering from an older bundle using only the default argument', async () => {
    const { isCachedRenderingStale, isAttachmentStale } = await importWithEpoch(BUNDLE_BUILT_MS);
    // The consumers call it with two arguments, so the constant must be picked up by
    // the default parameter — not supplied by the caller.
    expect(isAttachmentStale(WRITTEN_BEFORE_BUNDLE, RECORD_UPDATED)).toBe(false);
    expect(isCachedRenderingStale(WRITTEN_BEFORE_BUNDLE, RECORD_UPDATED)).toBe(true);
  });

  it('keeps serving a rendering produced by the running bundle', async () => {
    const { isCachedRenderingStale } = await importWithEpoch(BUNDLE_BUILT_MS);
    expect(isCachedRenderingStale(WRITTEN_AFTER_BUNDLE, RECORD_UPDATED)).toBe(false);
  });

  // The counterparty-document opt-out has to survive an ACTIVE epoch — this is the
  // data-loss guard, and it is the case an active epoch could plausibly break.
  it('still never flags a window that opted out, even with the epoch active', async () => {
    const { isCachedRenderingStale } = await importWithEpoch(BUNDLE_BUILT_MS);
    const counterpartyDocument = { uploadedAt: '2001-01-01T00:00:00Z' };
    expect(isCachedRenderingStale(counterpartyDocument, null)).toBe(false);
    expect(isCachedRenderingStale(counterpartyDocument, undefined)).toBe(false);
  });

  it('goes inert when the global is absent, so nothing changes outside a Vite build', async () => {
    const { RENDERER_BUILD_EPOCH_MS, isCachedRenderingStale } = await importWithEpoch(undefined);
    expect(RENDERER_BUILD_EPOCH_MS).toBe(0);
    expect(isCachedRenderingStale(WRITTEN_BEFORE_BUNDLE, RECORD_UPDATED)).toBe(false);
  });

  // `define` performs textual substitution, so a non-numeric value would land in the
  // bundle as-is; the `typeof … === 'number'` guard must reject it rather than produce
  // NaN comparisons.
  it('ignores a non-numeric injected value', async () => {
    for (const bad of ['2026-09-03T00:00:00Z', true, {}]) {
      const { RENDERER_BUILD_EPOCH_MS } = await importWithEpoch(bad);
      expect(RENDERER_BUILD_EPOCH_MS).toBe(0);
    }
  });
});

describe('vite.config.js declares the define this module reads (ETP-5125)', () => {
  it('injects the same global name the module guards on', () => {
    const viteConfig = readFileSync(join(__dirname, '..', '..', '..', 'vite.config.js'), 'utf8');
    const module = readFileSync(join(__dirname, '..', 'attachmentFreshness.js'), 'utf8');
    expect(viteConfig).toContain(`${GLOBAL_KEY}: JSON.stringify(Date.now())`);
    expect(module).toContain(`typeof ${GLOBAL_KEY} === 'number'`);
  });

  it('keeps the E2E VITE_API_BASE override inside the same define block', () => {
    // The define used to be a conditional spread; merging it must not drop the E2E
    // override, or every integration spec times out on login (see the comment there).
    const viteConfig = readFileSync(join(__dirname, '..', '..', '..', 'vite.config.js'), 'utf8');
    expect(viteConfig).toMatch(/E2E_BUILD \? \{ 'import\.meta\.env\.VITE_API_BASE': JSON\.stringify\(''\) \} : \{\}/);
  });
});

describe('both cache consumers use the composed predicate (ETP-5125)', () => {
  // A consumer left on the bare `isAttachmentStale` would keep serving the old design
  // on its half only — the asymmetry that makes this class of bug so confusing (the
  // preview shows one PDF, print shows another).
  const CONSUMERS = [
    ['read side', join(__dirname, '..', '..', 'windows', 'custom', 'shared', 'pdfUtils.js')],
    ['write side', join(__dirname, '..', '..', 'windows', 'custom', 'shared', 'useMainAttachment.js')],
  ];

  it.each(CONSUMERS)('%s decides staleness with isCachedRenderingStale', (_label, path) => {
    const src = readFileSync(path, 'utf8');
    expect(src).toMatch(/isCachedRenderingStale\(\s*main,\s*recordUpdated\s*\)/);
  });

  it('write side no longer references the record-only predicate at all', () => {
    const src = readFileSync(CONSUMERS[1][1], 'utf8');
    expect(src).not.toContain('isAttachmentStale');
  });

  // The read side keeps importing it, but only to name the cause in the console line —
  // never to gate the cache.
  it('read side uses the record-only predicate solely for the diagnostic message', () => {
    const src = readFileSync(CONSUMERS[0][1], 'utf8');
    const calls = src.match(/isAttachmentStale\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(src).toMatch(/function staleReason[\s\S]*isAttachmentStale\(/);
  });
});
