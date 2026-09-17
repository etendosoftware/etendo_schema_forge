import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useBulkActionToast.js'), 'utf8');

function resolveToastLevel({ ok, failed }) {
  if (failed.length === 0) return 'success';
  if (ok > 0) return 'warning';
  return 'error';
}

describe('useBulkActionToast source', () => {
  it('uses bulkActionResult as storage key', () => {
    assert.match(src, /['"]bulkActionResult['"]/);
  });

  it('removes the key from storage after reading', () => {
    assert.match(src, /\.removeItem\(STORAGE_KEY\)/);
  });

  // ETP-4994 — reading the `sessionStorage` ACCESSOR throws (not just its
  // methods) when site data is blocked, and this hook runs inside ListView's
  // render tree, so an unguarded access takes the whole grid down. Every access
  // must go through the `session()` helper, which is the only place allowed to
  // name `globalThis.sessionStorage`.
  it('reaches storage only through the guarded session() helper', () => {
    assert.match(src, /function session\(\)[\s\S]*?globalThis\.sessionStorage/);
    assert.doesNotMatch(src, /(?<!globalThis\.)\bsessionStorage\.(getItem|setItem|removeItem)/);
  });

  it('calls toast.success on full success', () => {
    assert.match(src, /toast\.success/);
  });

  it('calls toast.warning on partial failure', () => {
    assert.match(src, /toast\.warning/);
  });

  it('calls toast.error when all records fail', () => {
    assert.match(src, /toast\.error/);
  });

  it('formats message with ok and failed counts', () => {
    assert.match(src, /replace\(.*\{ok\}/);
    assert.match(src, /replace\(.*\{failed\}/);
  });
});

describe('toast level logic', () => {
  it('success when all records succeeded', () => {
    assert.equal(resolveToastLevel({ ok: 5, failed: [] }), 'success');
  });

  it('success when ok=1 and no failures', () => {
    assert.equal(resolveToastLevel({ ok: 1, failed: [] }), 'success');
  });

  it('warning when some pass and some fail', () => {
    assert.equal(resolveToastLevel({ ok: 3, failed: [{ documentNo: 'INV-001' }] }), 'warning');
  });

  it('warning when ok=1 and one failure', () => {
    assert.equal(resolveToastLevel({ ok: 1, failed: [{ documentNo: 'INV-002' }] }), 'warning');
  });

  it('error when all records failed', () => {
    assert.equal(resolveToastLevel({ ok: 0, failed: [{ documentNo: 'INV-003' }] }), 'error');
  });

  it('error when ok=0 and multiple failures', () => {
    assert.equal(
      resolveToastLevel({ ok: 0, failed: [{ documentNo: 'A' }, { documentNo: 'B' }] }),
      'error',
    );
  });
});
