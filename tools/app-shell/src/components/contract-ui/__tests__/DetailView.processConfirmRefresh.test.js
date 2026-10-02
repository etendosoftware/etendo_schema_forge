import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'DetailView.jsx'), 'utf8');

// ETP-5547 — confirming a reactivated draft payment from the processConfirmModal left the
// payment-in detail on "Borrador": the modal's onRefresh re-read the record through
// fetchById WITHOUT { force: true }, so the cached pre-confirm record came back. The modal's
// onRefresh must go through refreshRecordAfterMutation (invalidate + forced refetch + list
// reload) — or at the very least pass force: true.
describe('DetailView processConfirmModal onRefresh — ETP-5547 forced refresh', () => {
  const callMatch = src.match(/renderProcessConfirmModal\(\s*confirmProcess,[\s\S]*?\n\s*\)\}/);

  it('renders the processConfirmModal through renderProcessConfirmModal', () => {
    assert.ok(callMatch, 'renderProcessConfirmModal(confirmProcess, ...) call not found in DetailView.jsx');
  });

  it('passes an onRefresh that force-refetches the record', () => {
    const call = callMatch[0];
    const forced = /refreshRecordAfterMutation\(\s*hook\s*,/.test(call)
      || /fetchById\?*\.?\([^)]*force:\s*true/.test(call);
    assert.ok(forced, `processConfirmModal onRefresh does not force the refetch:\n${call}`);
  });

  it('does not re-read the record with a cache-served fetchById', () => {
    const call = callMatch[0];
    const unforced = call.match(/fetchById\?*\.?\(([^)]*)\)/g) || [];
    unforced.forEach((c) => assert.match(c, /force:\s*true/, `unforced fetchById in onRefresh: ${c}`));
  });

  it('refreshes the record currently shown, falling back to the route id', () => {
    assert.match(callMatch[0], /refreshRecordAfterMutation\(\s*hook\s*,\s*data\?\.id\s*\|\|\s*recordId\s*\)/);
  });
});

describe('detailViewHelpers.refreshRecordAfterMutation — source contract', () => {
  const helpers = readFileSync(join(__dirname, '..', 'detailViewHelpers.jsx'), 'utf8');
  const fn = helpers.match(/export function refreshRecordAfterMutation\(hook, id\) \{[\s\S]*?\n\}/);

  it('is exported from detailViewHelpers.jsx', () => {
    assert.ok(fn, 'refreshRecordAfterMutation not found');
  });

  it('invalidates, force-refetches and reloads, each optional-chained', () => {
    const body = fn[0];
    assert.match(body, /hook\.invalidateEntityCache\?\.\(\)/);
    assert.match(body, /hook\.fetchById\?\.\(id,\s*\{\s*force:\s*true\s*\}\)/);
    assert.match(body, /hook\.refresh\?\.\(\)/);
  });
});
