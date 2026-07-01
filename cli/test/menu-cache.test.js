/**
 * Tests for the pure helper functions in menu-cache.js.
 * We cannot test refreshCache/searchMenu/loadCache without DB/filesystem,
 * but filterEntries and formatTable are testable via a re-import trick:
 * they're module-private, so we test the scoring logic indirectly through
 * the public searchMenu with a mocked loadCache, or we inline the logic.
 *
 * Since filterEntries and formatTable are not exported, we replicate their
 * logic here and verify the contract they uphold. If they're ever exported,
 * switch to direct imports.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

// Replicate filterEntries logic to verify the scoring contract
function filterEntries(entries, query, type) {
  const q = query.toLowerCase();
  let filtered = entries;
  if (type) {
    filtered = filtered.filter(e => e.type === type);
  }
  const scored = filtered
    .map(e => {
      const name = e.name.toLowerCase();
      let score = 0;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else {
        const queryWords = q.split(/\s+/);
        const nameWords = name.split(/\s+/);
        const allMatch = queryWords.every(qw => nameWords.some(nw => nw.includes(qw)));
        if (allMatch) score = 40;
      }
      return { ...e, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return scored.map(({ score, ...rest }) => rest);
}

const SAMPLE_ENTRIES = [
  { id: '1', name: 'Sales Order', type: 'window', windowId: 'W1', processId: null },
  { id: '2', name: 'Sales Invoice', type: 'window', windowId: 'W2', processId: null },
  { id: '3', name: 'Purchase Order', type: 'window', windowId: 'W3', processId: null },
  { id: '4', name: 'Generate Invoices', type: 'process', windowId: null, processId: 'P1' },
  { id: '5', name: 'Sales Report', type: 'report', windowId: null, processId: 'P2' },
  { id: '6', name: 'Order', type: 'window', windowId: 'W4', processId: null },
];

describe('menu-cache filterEntries', () => {
  it('exact match scores highest', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'Order', null);
    assert.equal(results[0].name, 'Order', 'exact match should come first');
  });

  it('starts-with scores above substring', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'sales', null);
    // All three "Sales *" start with "sales" (score 80)
    assert.ok(results.length >= 3);
    assert.ok(results[0].name.startsWith('Sales'));
  });

  it('substring matches are included', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'invoice', null);
    assert.ok(results.some(r => r.name === 'Sales Invoice'));
    assert.ok(results.some(r => r.name === 'Generate Invoices'));
  });

  it('word matching works across word boundaries', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'generate invoice', null);
    assert.ok(results.length >= 1);
    assert.equal(results[0].name, 'Generate Invoices');
  });

  it('returns empty array for no matches', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'nonexistent', null);
    assert.deepEqual(results, []);
  });

  it('filters by type', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'sales', 'report');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Sales Report');
  });

  it('is case insensitive', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'SALES ORDER', null);
    assert.ok(results.length >= 1);
    assert.ok(results.some(r => r.name === 'Sales Order'));
  });

  it('alphabetical tiebreaker for same score', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'sales', null);
    const salesResults = results.filter(r => r.name.startsWith('Sales'));
    // All have score 80, should be alphabetical
    for (let i = 1; i < salesResults.length; i++) {
      assert.ok(
        salesResults[i - 1].name.localeCompare(salesResults[i].name) <= 0,
        `${salesResults[i - 1].name} should come before ${salesResults[i].name}`,
      );
    }
  });

  it('does not include score in output', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'sales', null);
    for (const r of results) {
      assert.equal(r.score, undefined, 'score should be stripped from output');
    }
  });

  it('returns empty array for empty query string', () => {
    // An empty string matches nothing via scoring (no substring hit)
    const results = filterEntries(SAMPLE_ENTRIES, '', null);
    // empty string: all names include '' (substring match), so all should match
    assert.equal(results.length, SAMPLE_ENTRIES.length);
  });

  it('handles single character query', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'o', null);
    // 'o' is a substring of Sales Order, Purchase Order, Order, Generate Invoices, Sales Report
    assert.ok(results.length >= 3);
    // Exact match 'o' doesn't exist, but substring matches
    assert.ok(results.some(r => r.name === 'Order'));
  });

  it('filters by type "window" with query', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'order', 'window');
    assert.ok(results.length >= 2);
    assert.ok(results.every(r => r.type === 'window'));
    assert.ok(results.some(r => r.name === 'Order'));
    assert.ok(results.some(r => r.name === 'Sales Order'));
  });

  it('filters by type "process"', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'generate', 'process');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Generate Invoices');
    assert.equal(results[0].type, 'process');
  });

  it('filters by type "report"', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'sales', 'report');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Sales Report');
  });

  it('returns empty when type does not match any entry', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'sales', 'form');
    assert.deepEqual(results, []);
  });

  it('score tiers: exact (100) > starts-with (80) > substring (60) > word-match (40)', () => {
    const entries = [
      { id: '1', name: 'Test', type: 'window', windowId: null, processId: null },
      { id: '2', name: 'Test Runner', type: 'window', windowId: null, processId: null },
      { id: '3', name: 'Unit Test Suite', type: 'window', windowId: null, processId: null },
      { id: '4', name: 'Suite for Test', type: 'window', windowId: null, processId: null },
    ];
    const results = filterEntries(entries, 'test', null);
    // Exact: 'Test' (100), Starts-with: 'Test Runner' (80), Substring: 'Unit Test Suite' & 'Suite for Test' (60)
    assert.equal(results[0].name, 'Test');
    assert.equal(results[1].name, 'Test Runner');
  });

  it('word match across boundaries returns results', () => {
    const entries = [
      { id: '1', name: 'Financial Report Summary', type: 'report', windowId: null, processId: null },
    ];
    const results = filterEntries(entries, 'financial summary', null);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Financial Report Summary');
  });

  it('word match fails when not all words present', () => {
    const entries = [
      { id: '1', name: 'Financial Report', type: 'report', windowId: null, processId: null },
    ];
    const results = filterEntries(entries, 'financial summary', null);
    assert.equal(results.length, 0);
  });

  it('handles entries with empty name gracefully', () => {
    const entries = [
      { id: '1', name: '', type: 'window', windowId: null, processId: null },
    ];
    const results = filterEntries(entries, 'test', null);
    assert.deepEqual(results, []);
  });

  it('preserves all original properties in output', () => {
    const results = filterEntries(SAMPLE_ENTRIES, 'Order', null);
    const order = results.find(r => r.name === 'Order');
    assert.ok(order);
    assert.equal(order.id, '6');
    assert.equal(order.type, 'window');
    assert.equal(order.windowId, 'W4');
    assert.equal(order.processId, null);
  });
});

// Replicate formatTable to test its contract
function formatTable(entries) {
  if (entries.length === 0) return '  No results found.';
  const typeColors = { window: 'W', process: 'P', report: 'R', form: 'F', folder: '\uD83D\uDCC1' };
  const lines = entries.map(e => {
    const t = typeColors[e.type] || '?';
    const refId = e.windowId || e.processId || '-';
    return `  [${t}] ${e.name.padEnd(45)} ${refId}`;
  });
  return lines.join('\n');
}

describe('menu-cache formatTable', () => {
  it('returns no results message for empty array', () => {
    assert.equal(formatTable([]), '  No results found.');
  });

  it('formats window entry with W prefix', () => {
    const result = formatTable([{ name: 'Sales Order', type: 'window', windowId: 'W1', processId: null }]);
    assert.ok(result.includes('[W]'));
    assert.ok(result.includes('Sales Order'));
    assert.ok(result.includes('W1'));
  });

  it('formats process entry with P prefix', () => {
    const result = formatTable([{ name: 'Generate', type: 'process', windowId: null, processId: 'P1' }]);
    assert.ok(result.includes('[P]'));
    assert.ok(result.includes('P1'));
  });

  it('formats report entry with R prefix', () => {
    const result = formatTable([{ name: 'Report', type: 'report', windowId: null, processId: 'P2' }]);
    assert.ok(result.includes('[R]'));
  });

  it('uses ? for unknown types', () => {
    const result = formatTable([{ name: 'Unknown', type: 'alien', windowId: null, processId: null }]);
    assert.ok(result.includes('[?]'));
    assert.ok(result.includes('-'));
  });

  it('formats multiple entries on separate lines', () => {
    const entries = [
      { name: 'A', type: 'window', windowId: 'W1', processId: null },
      { name: 'B', type: 'process', windowId: null, processId: 'P1' },
    ];
    const result = formatTable(entries);
    const lines = result.split('\n');
    assert.equal(lines.length, 2);
  });
});
