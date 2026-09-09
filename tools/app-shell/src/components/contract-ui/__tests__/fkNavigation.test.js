/**
 * Unit tests for the ETP-5075 FK click-through navigation registry.
 *
 * Pure logic (no React) — Node test runner, per the repo's test-type table.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

async function loadModule() {
  return import('../fkNavigation.js');
}

test('resolveFkNavigation — column not in the registry returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const result = resolveFkNavigation('Some_Unregistered_Column', { Some_Unregistered_Column: 'X1' });
  assert.equal(result, null);
});

test('resolveFkNavigation — registry entry with idField present resolves to /purchase-invoice/{id}', async () => {
  const { resolveFkNavigation } = await loadModule();
  const record = { C_InvoiceLine_ID: 'line-1', invoiceHeaderId: 'HDR-123' };
  const result = resolveFkNavigation('C_InvoiceLine_ID', record);
  assert.equal(result, '/purchase-invoice/HDR-123');
});

test('resolveFkNavigation — registry entry with idField present resolves to /goods-receipt/{id}', async () => {
  const { resolveFkNavigation } = await loadModule();
  const record = { M_InOutLine_ID: 'line-2', receiptHeaderId: 'RCPT-456' };
  const result = resolveFkNavigation('M_InOutLine_ID', record);
  assert.equal(result, '/goods-receipt/RCPT-456');
});

test('resolveFkNavigation — idField missing from the record returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const record = { C_InvoiceLine_ID: 'line-1' }; // no invoiceHeaderId key at all
  const result = resolveFkNavigation('C_InvoiceLine_ID', record);
  assert.equal(result, null);
});

test('resolveFkNavigation — idField present but null returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const record = { C_InvoiceLine_ID: 'line-1', invoiceHeaderId: null };
  const result = resolveFkNavigation('C_InvoiceLine_ID', record);
  assert.equal(result, null);
});

test('resolveFkNavigation — idField present but empty string returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const record = { C_InvoiceLine_ID: 'line-1', invoiceHeaderId: '' };
  const result = resolveFkNavigation('C_InvoiceLine_ID', record);
  assert.equal(result, null);
});

test('resolveFkNavigation — idField present but whitespace-only returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const record = { C_InvoiceLine_ID: 'line-1', invoiceHeaderId: '   ' };
  const result = resolveFkNavigation('C_InvoiceLine_ID', record);
  assert.equal(result, null);
});

test('resolveFkNavigation — trims a whitespace-padded id before building the route', async () => {
  const { resolveFkNavigation } = await loadModule();
  const record = { C_InvoiceLine_ID: 'line-1', invoiceHeaderId: '  HDR-789  ' };
  const result = resolveFkNavigation('C_InvoiceLine_ID', record);
  assert.equal(result, '/purchase-invoice/HDR-789');
});

test('resolveFkNavigation — null column returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const result = resolveFkNavigation(null, { C_InvoiceLine_ID: 'x', invoiceHeaderId: 'y' });
  assert.equal(result, null);
});

test('resolveFkNavigation — undefined column returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const result = resolveFkNavigation(undefined, { C_InvoiceLine_ID: 'x', invoiceHeaderId: 'y' });
  assert.equal(result, null);
});

test('resolveFkNavigation — null record returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const result = resolveFkNavigation('C_InvoiceLine_ID', null);
  assert.equal(result, null);
});

test('resolveFkNavigation — undefined record returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  const result = resolveFkNavigation('C_InvoiceLine_ID', undefined);
  assert.equal(result, null);
});

test('resolveFkNavigation — both column and record null/undefined returns null', async () => {
  const { resolveFkNavigation } = await loadModule();
  assert.equal(resolveFkNavigation(null, null), null);
  assert.equal(resolveFkNavigation(undefined, undefined), null);
});

// --- Documented fallback path: an entry WITHOUT idField uses the FK's own value ---
//
// The current registry has no such entry (both real entries — C_InvoiceLine_ID and
// M_InOutLine_ID — declare idField, per M_MatchInv's line-based FKs). The header
// comment documents a SECOND case though: "FK that already points at a document
// header — omit idField. The FK's own value IS the target record id." To exercise
// that branch against the REAL exported function (not a reimplementation), this test
// temporarily adds one idField-less entry to the real exported `FK_NAVIGATION_TARGETS`
// object at runtime (it is a plain mutable object, not frozen) and removes it in a
// `finally` — the source file itself is never touched, and every other test in this
// suite runs against the untouched registry.
test('resolveFkNavigation — documented fallback (no idField) uses the FK column\'s own value as the id', async () => {
  const { resolveFkNavigation, FK_NAVIGATION_TARGETS } = await loadModule();

  // Lock today's registry shape first: every REAL current entry uses idField (line-FK case).
  for (const [column, target] of Object.entries(FK_NAVIGATION_TARGETS)) {
    assert.ok(target.idField, `expected ${column} to declare idField per current registry contract`);
  }

  const TEMP_COLUMN = '__etp5075_test_only_header_fk__';
  assert.ok(!(TEMP_COLUMN in FK_NAVIGATION_TARGETS), 'temp column must not already exist in the real registry');
  FK_NAVIGATION_TARGETS[TEMP_COLUMN] = { window: 'some-header-window' };
  try {
    // idField absent → rawId must come from record[column], not record[target.idField].
    const record = { [TEMP_COLUMN]: 'HDR-999' };
    const result = resolveFkNavigation(TEMP_COLUMN, record);
    assert.equal(result, '/some-header-window/HDR-999');

    // Same fail-closed rules still apply: empty/whitespace FK value → null.
    assert.equal(resolveFkNavigation(TEMP_COLUMN, { [TEMP_COLUMN]: '   ' }), null);
    assert.equal(resolveFkNavigation(TEMP_COLUMN, { [TEMP_COLUMN]: null }), null);
  } finally {
    delete FK_NAVIGATION_TARGETS[TEMP_COLUMN];
  }
});
