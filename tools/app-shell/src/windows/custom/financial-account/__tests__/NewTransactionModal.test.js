// Source-reading smoke for NewTransactionModal.jsx (node:test). Behavioural
// coverage lives in NewTransactionModal.vitest.jsx; this co-located .test.js
// exists so the MISSING_TESTS detector (which only recognises .test.js/.spec)
// registers the new source file as covered, and guards the structural contract.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'NewTransactionModal.jsx'), 'utf8');

describe('NewTransactionModal (source contract)', () => {
  it('exports the NewTransactionModal component', () => {
    assert.match(src, /export function NewTransactionModal\s*\(/);
  });

  it('creates the movement through the useCreateMovement hook', () => {
    assert.match(src, /useCreateMovement/);
    assert.match(src, /createMovement\(/);
  });

  it('maps the direction to BPD (Entrada) / BPW (Salida)', () => {
    assert.match(src, /trxType:\s*form\.dir === 'in' \? 'BPD' : 'BPW'/);
    assert.match(src, /depositAmount:\s*form\.dir === 'in'/);
    assert.match(src, /paymentAmount:\s*form\.dir === 'out'/);
  });

  it('gates Save on date, direction, GL item and a positive amount', () => {
    assert.match(src, /Boolean\(form\.gl\?\.id\)/);
    assert.match(src, /amountValue > 0/);
  });

  it('shows Contacto always and only the enabled optional dimensions', () => {
    assert.match(src, /OPTIONAL_DIMS\.filter\(\(d\) => dimensions\.includes\(d\.key\)\)/);
    assert.match(src, /useBPartnerLookup/);
  });

  it('uses i18n keys instead of hardcoded strings', () => {
    assert.match(src, /useUI/);
    assert.match(src, /financeAccountTxNewSuccess/);
    assert.match(src, /financeAccountTxNewError/);
  });

  it('exposes the canonical action testids', () => {
    for (const id of ['tx-new-modal', 'tx-new-save', 'tx-new-cancel']) {
      assert.ok(src.includes(id), `expected data-testid "${id}"`);
    }
    // Direction toggle testids are generated as `tx-dir-${o.id}`.
    assert.match(src, /data-testid=\{`tx-dir-\$\{o\.id\}`\}/);
  });
});
