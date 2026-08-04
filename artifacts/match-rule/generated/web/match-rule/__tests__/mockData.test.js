/**
 * Match Rule — mockData.js structural tests.
 *
 * mockData.js is generated dev-preview data for the etgoMatchRuleHeader
 * entity. These tests lock in that the mock rows stay in sync with the
 * real entity fields declared in contract.json (name, priority,
 * transactionType, textCondition, accountingConcept, matchCount, product,
 * businessPartner, etc.) and that numeric fields are actually numbers.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const src = readFileSync(join(__dirname, '..', 'mockData.js'), 'utf8');
const { etgoMatchRuleHeader } = await import(join(__dirname, '..', 'mockData.js'));

describe('Match Rule mockData — etgoMatchRuleHeader export', () => {
  it('exports an array named etgoMatchRuleHeader', () => {
    assert.match(src, /export const etgoMatchRuleHeader = \[/);
    assert.ok(Array.isArray(etgoMatchRuleHeader));
  });

  it('has a non-empty set of mock rows', () => {
    assert.ok(etgoMatchRuleHeader.length > 0);
  });

  it('every row carries the real entity fields from contract.json', () => {
    const expectedKeys = [
      'id',
      'active',
      'name',
      'priority',
      'textPattern',
      'transactionType',
      'matchCount',
      'businessPartner',
      'financialAccount',
      'project',
      'costCenter',
      'textCondition',
      'accountingConcept',
      'product',
    ];
    for (const row of etgoMatchRuleHeader) {
      for (const key of expectedKeys) {
        assert.ok(key in row, `Expected row ${row.id} to have key "${key}"`);
      }
    }
  });

  it('uses the mock-etgoMatchRuleHeader-NNN id convention', () => {
    for (const row of etgoMatchRuleHeader) {
      assert.match(row.id, /^mock-etgoMatchRuleHeader-\d{3}$/);
    }
  });

  it('priority is numeric (contract type: integer)', () => {
    for (const row of etgoMatchRuleHeader) {
      assert.equal(typeof row.priority, 'number');
    }
  });

  it('matchCount is numeric (contract type: readOnly integer)', () => {
    for (const row of etgoMatchRuleHeader) {
      assert.equal(typeof row.matchCount, 'number');
    }
  });

  it('businessPartner and product use realistic lookup-style labels, not generic placeholders', () => {
    for (const row of etgoMatchRuleHeader) {
      assert.doesNotMatch(row.businessPartner, /^Sample /);
      assert.doesNotMatch(row.product, /^Sample /);
    }
  });
});
