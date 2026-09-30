/**
 * ETP-5522 — source-level guard for financialAccountCacheInvalidation.js and its call sites.
 *
 * The hook imports React and the app-shell-core data module, so (same convention as
 * BankConnectionFlowUI.test.js) the invariants are asserted on the source text. The behavioral
 * coverage lives in financialAccountCacheInvalidation.vitest.jsx,
 * ImportedStatementsTab.cacheInvalidation.vitest.jsx and index.cacheInvalidation.vitest.jsx.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(__dirname, '..', name), 'utf8');
const src = read('financialAccountCacheInvalidation.js');
const statementsTabSrc = read('ImportedStatementsTab.jsx');
const detailSrc = read('index.jsx');

describe('financialAccountCacheInvalidation — hook', () => {
  it('exports the useFinancialAccountCacheInvalidation hook', () => {
    assert.match(src, /export function useFinancialAccountCacheInvalidation\s*\(/);
  });

  it('reads the optional shared data cache from app-shell-core', () => {
    assert.match(src, /import\s*\{[^}]*useOptionalDataCache[^}]*\}\s*from\s*'@etendosoftware\/app-shell-core\/data'/);
    assert.match(src, /useOptionalDataCache\(\)\?\.cache/);
  });

  it('invalidates the "account" entity (the Cuentas list query) and no-ops without a cache', () => {
    const literal = /cache\?\.invalidate\(\{\s*entity:\s*'account'\s*\}\)/.test(src);
    const viaConstant = /const ACCOUNT_LIST_ENTITY\s*=\s*'account'/.test(src)
      && /cache\?\.invalidate\(\{\s*entity:\s*ACCOUNT_LIST_ENTITY\s*\}\)/.test(src);
    assert.ok(literal || viaConstant, 'expected cache?.invalidate({ entity: "account" })');
  });

  it('returns invalidateAccountList', () => {
    assert.match(src, /return\s*\{\s*invalidateAccountList\s*\}/);
  });
});

describe('financialAccountCacheInvalidation — call sites', () => {
  it('ImportedStatementsTab invalidates inside refreshStatements', () => {
    assert.match(statementsTabSrc, /useFinancialAccountCacheInvalidation\(\)/);
    assert.match(
      statementsTabSrc,
      /const refreshStatements = useCallback\(\(\) => \{[^}]*invalidateAccountList\(\)/s,
    );
  });

  it('the account detail uses the hook', () => {
    assert.match(detailSrc, /import \{ useFinancialAccountCacheInvalidation \} from '\.\/financialAccountCacheInvalidation'/);
    assert.match(detailSrc, /useFinancialAccountCacheInvalidation\(\)/);
  });
});
