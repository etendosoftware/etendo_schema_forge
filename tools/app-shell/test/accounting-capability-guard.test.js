// @covers tools/app-shell/src/lib/capabilityVisibility.js
/**
 * ETP-5684 — every posting-status surface follows "Show Accounting Fields".
 *
 * The capability gate (`visibleWhenCapability: 'showAccountingFields'`) is opt-in per field.
 * ETP-4520 applied it to five windows; ten more postable windows were configured afterwards
 * without it, and several hand-written list tables re-declared `posted` with no gate at all,
 * so a Sales or Purchasing role saw "Contabilizado" everywhere. Nothing failed, nothing
 * warned. This guard makes the next ungated `posted` fail the build instead:
 *
 * 1. Every `decisions.json` entity whose `posted` field is shown (not `discarded`/`system`)
 *    must carry the gate. Every entity, not just `header`: financial-account's
 *    reconciliations are a secondary entity rendered through the contract.
 * 2. Every resolved `contract.json` field on an accounting-status column (`Posted`,
 *    `EM_Etblkp_Accountingstatus` — the same set the backend's `NeoAccountingAccessPolicy`
 *    hides) that the form or the grid shows must carry the gate. This is what catches a field
 *    `decisions.json` never mentions: goods-shipment showed `etblkpAccountingstatus` in its
 *    "Others" tab by default, so check 1 had nothing to read (QA CP-8).
 * 3. Every hand-written list column declared as `key: 'posted'` or
 *    `key: 'etblkpAccountingstatus'` with a `column:` (a DataTable column definition in a
 *    custom window) must carry the gate on the same declaration.
 *
 * The posting ACTIONS (Contabilizar / Descontabilizar) are not checked here: the three action
 * renderers gate them structurally on `neoAction`/`value`, so a new window is covered without
 * declaring anything (see `filterPostingActions` in `src/lib/capabilityVisibility.js`).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACCOUNTING_CAPABILITY = 'showAccountingFields';
const HIDDEN_VISIBILITIES = new Set(['discarded', 'system']);
// AD columns holding a posting status. They share no AD reference (Posted is a Button on list
// 234, the bulk-posting extension a List on its own), so the set is explicit.
const ACCOUNTING_STATUS_COLUMNS = new Set(['posted', 'em_etblkp_accountingstatus']);

const appShellRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appShellRoot, '..', '..');
const artifactsDir = join(repoRoot, 'artifacts');

function listDecisionFiles() {
  return readdirSync(artifactsDir)
    .map((name) => join(artifactsDir, name, 'decisions.json'))
    .filter((file) => existsSync(file));
}

function listContractFiles() {
  return readdirSync(artifactsDir)
    .map((name) => join(artifactsDir, name, 'contract.json'))
    .filter((file) => existsSync(file));
}

function walkSources(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'generated' || name === 'coverage') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkSources(full, out);
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.(test|vitest)\./.test(name)) out.push(full);
  }
  return out;
}

function customSourceFiles() {
  const artifactCustomDirs = readdirSync(artifactsDir).map((name) => join(artifactsDir, name, 'custom'));
  return [
    ...walkSources(join(appShellRoot, 'src')),
    ...artifactCustomDirs.flatMap((dir) => walkSources(dir)),
  ];
}

/**
 * Every single-line object literal that declares a `posted` list column. Multi-line
 * declarations are matched from `key: 'posted'` to the next closing brace on the same line,
 * which is how every DataTable column in this codebase is written today.
 */
function postedColumnDeclarations(source) {
  return source.split('\n')
    .map((line, i) => ({ line, lineNo: i + 1 }))
    .filter(({ line }) => /key:\s*['"](posted|etblkpAccountingstatus)['"]/.test(line) && /column:\s*['"]/.test(line));
}

describe('ETP-5684 — posted fields in decisions.json carry the accounting gate', () => {
  it('finds the decisions files to check (sanity)', () => {
    assert.ok(listDecisionFiles().length > 10, 'expected the artifacts to contain decisions.json files');
  });

  it('every shown posted field declares visibleWhenCapability: showAccountingFields', () => {
    const offenders = [];
    for (const file of listDecisionFiles()) {
      const decisions = JSON.parse(readFileSync(file, 'utf8'));
      for (const [entityName, entity] of Object.entries(decisions.entities ?? {})) {
        const posted = entity?.fields?.posted;
        if (!posted || HIDDEN_VISIBILITIES.has(posted.visibility)) continue;
        if (posted.visibleWhenCapability !== ACCOUNTING_CAPABILITY) {
          offenders.push(`${relative(repoRoot, file)} → entities.${entityName}.fields.posted`);
        }
      }
    }
    assert.deepEqual(offenders, [], `posted shown without the accounting gate:\n  ${offenders.join('\n  ')}`);
  });
});

describe('ETP-5684 — shown accounting-status fields in contract.json carry the accounting gate', () => {
  it('every form or grid field on an accounting-status column declares visibleWhenCapability', () => {
    const offenders = [];
    for (const file of listContractFiles()) {
      const contract = JSON.parse(readFileSync(file, 'utf8'));
      for (const [entityName, entity] of Object.entries(contract.frontendContract?.entities ?? {})) {
        for (const field of entity?.fields ?? []) {
          if (!ACCOUNTING_STATUS_COLUMNS.has(String(field.column ?? '').toLowerCase())) continue;
          if (HIDDEN_VISIBILITIES.has(field.visibility)) continue;
          const shown = field.form !== false || field.grid === true;
          if (shown && field.visibleWhenCapability !== ACCOUNTING_CAPABILITY) {
            offenders.push(`${relative(repoRoot, file)} → ${entityName}.${field.name}`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `accounting status shown without the gate:\n  ${offenders.join('\n  ')}`);
  });
});

describe('ETP-5684 — hand-written accounting-status list columns carry the accounting gate', () => {
  it('every custom `posted` / `etblkpAccountingstatus` DataTable column declares visibleWhenCapability', () => {
    const offenders = [];
    for (const file of customSourceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const { line, lineNo } of postedColumnDeclarations(source)) {
        if (!/visibleWhenCapability:/.test(line)) offenders.push(`${relative(repoRoot, file)}:${lineNo}`);
      }
    }
    assert.deepEqual(offenders, [], `posted column without the accounting gate:\n  ${offenders.join('\n  ')}`);
  });
});
