// ETP-5445 — source-reading guard for the shared Void helper. The module imports through the
// `@/` alias (unresolvable under plain `node --test`), so behavior is covered by
// voidInternalConsumption.vitest.js; this file pins the contract both callers rely on.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'voidInternalConsumption.js'), 'utf8');

describe('voidInternalConsumption helper (ETP-5445)', () => {
  it('exports VOID_BODY as a flat { action: VO } JSON body (not wrapped in fieldValues)', () => {
    assert.match(src, /export const VOID_BODY = JSON\.stringify\(\{\s*action:\s*'VO'\s*\}\);/);
    assert.doesNotMatch(src, /fieldValues/);
    assert.doesNotMatch(src, /action:\s*'CO'/);
  });

  it('exports isVoidableRow gated on status CO', () => {
    assert.match(src, /export function isVoidableRow\(row\)\s*\{\s*return row\?\.status === 'CO';\s*\}/);
  });

  it('exports an async voidInternalConsumption({ apiFetch, basePath = \'\', recordId, ui })', () => {
    assert.match(src, /export async function voidInternalConsumption\(\{\s*apiFetch,\s*basePath = '',\s*recordId,\s*ui\s*\}\)/);
  });

  it('POSTs VOID_BODY to the processNow action with an encoded record id', () => {
    assert.match(src, /apiFetch\(`\$\{basePath\}\/internalConsumption\/\$\{encodeURIComponent\(recordId\)\}\/action\/processNow`/);
    assert.match(src, /method:\s*'POST'/);
    assert.match(src, /body:\s*VOID_BODY/);
    assert.doesNotMatch(src, /Authorization:\s*`Bearer/);
  });

  it('never throws: a rejected request is caught and toasted as actionFailed', () => {
    assert.match(src, /\}\s*catch\s*\{\s*toast\.error\(ui\('actionFailed'\),\s*\{\s*duration:\s*PROCESS_FAILURE_TOAST_DURATION_MS\s*\}\);\s*return \{ success: false \};/);
  });

  it('routes a rejection through extractErrorMessage into internalConsumptionVoidError', () => {
    assert.match(src, /import \{ extractErrorMessage, PROCESS_FAILURE_TOAST_DURATION_MS \} from '@\/hooks\/useEntity\.js'/);
    assert.match(src, /await extractErrorMessage\(res, ui\)/);
    assert.match(src, /ui\('internalConsumptionVoidError'\)\.replace\('\{error\}',\s*message \|\| ui\('actionFailed'\)\)/);
  });

  it('shows the success toast via the internalConsumptionVoided key', () => {
    assert.match(src, /toast\.success\(ui\('internalConsumptionVoided'\)\)/);
  });

  it('leaves refreshing and menu closing to the caller', () => {
    assert.doesNotMatch(src, /onRefresh|onClose|refresh\(/);
  });
});
