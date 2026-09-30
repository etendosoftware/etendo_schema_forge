import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ETP-5273 — Journal Entries rows sourced from Goods Movements (M_Movement)
// and Internal Consumption (M_Internal_Consumption) rendered the generic
// "Journal" label and no link. The contract SQL must (a) map both tables to a
// docbasetype and (b) map both tables to the SPA window the row links to.

const CONTRACT = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, '../../../artifacts/report-journal-entries/report-contract.json'),
    'utf8',
  ),
);
const SQL = CONTRACT.sql.query;

describe('report-journal-entries — M_MOVEMENT / M_INTERNAL_CONSUMPTION SQL mapping (ETP-5273)', () => {
  it('maps M_MOVEMENT to docbasetype MMM and M_INTERNAL_CONSUMPTION to MIC', () => {
    assert.match(SQL, /WHEN\s+'M_MOVEMENT'\s+THEN\s+'MMM'/i);
    assert.match(SQL, /WHEN\s+'M_INTERNAL_CONSUMPTION'\s+THEN\s+'MIC'/i);
  });

  it('applies the docbasetype fallback in both the projection and the ad_ref_list join', () => {
    assert.equal((SQL.match(/WHEN\s+'M_MOVEMENT'\s+THEN\s+'MMM'/gi) || []).length, 2);
    assert.equal((SQL.match(/WHEN\s+'M_INTERNAL_CONSUMPTION'\s+THEN\s+'MIC'/gi) || []).length, 2);
  });

  it('maps M_MOVEMENT to the goods-movements window', () => {
    assert.match(SQL, /UPPER\(adt\.tablename\)\s*=\s*'M_MOVEMENT'\s+THEN\s+'goods-movements'/i);
  });

  it('maps M_INTERNAL_CONSUMPTION to the internal-consumption window', () => {
    assert.match(SQL, /UPPER\(adt\.tablename\)\s*=\s*'M_INTERNAL_CONSUMPTION'\s+THEN\s+'internal-consumption'/i);
  });

  it('still ends the docbasetype fallback with ELSE NULL (no guessed code for other tables)', () => {
    assert.match(SQL, /WHEN\s+'A_AMORTIZATION'\s+THEN\s+'AMZ'\s+ELSE\s+NULL\s+END/i);
  });
});
