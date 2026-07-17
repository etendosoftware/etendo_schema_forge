import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InvoiceLinesTable.jsx'), 'utf8');

describe('InvoiceLinesTable', () => {
  it('exports a default shared component', () => {
    assert.match(src, /export default InvoiceLinesTable/);
  });

  it('uses useCurrency to get the org currency code', () => {
    assert.match(src, /useCurrency/);
  });

  it('enriches rows with currency$_identifier fallback', () => {
    assert.match(src, /currency\$_identifier/);
    assert.match(src, /currencyCode/);
  });

  it('defines listPrice column with type amount', () => {
    assert.match(src, /key: 'listPrice'/);
    assert.match(src, /type: 'amount'/);
  });

  it('keeps product and tax required flags configurable', () => {
    assert.match(src, /productRequired = false/);
    assert.match(src, /taxRequired = false/);
    assert.match(src, /productRequired \? \{ required: true \}/);
    assert.match(src, /taxRequired \? \{ required: true \}/);
  });

  it('uses InlineLinesPanel for inline edit mode and DataTable for add-row mode', () => {
    assert.match(src, /InlineLinesPanel/);
    assert.match(src, /DataTable/);
    assert.match(src, /linesLayout === 'inlineEditable'/);
    assert.match(src, /!props\.addRow\?\.active/);
  });

  // ETP-4543 — config-gated accounting-dimension columns (project/costcenter).
  // Declared unconditionally here; actual visibility is enforced dynamically
  // by DetailView's hiddenColumns (derived from lineDisplayLogic.visibility),
  // which both InlineLinesPanel and DataTable honor.
  it('defines a project column with type selector and lookup enabled', () => {
    assert.match(src, /key: 'project'/);
    assert.match(src, /column: 'C_Project_ID'/);
    assert.match(src, /key: 'project'[^}]*type: 'selector'/s);
    assert.match(src, /key: 'project'[^}]*lookup: true/s);
  });

  it('defines a costcenter column with type selector', () => {
    assert.match(src, /key: 'costcenter'/);
    assert.match(src, /column: 'C_Costcenter_ID'/);
    assert.match(src, /key: 'costcenter'[^}]*type: 'selector'/s);
  });
});
