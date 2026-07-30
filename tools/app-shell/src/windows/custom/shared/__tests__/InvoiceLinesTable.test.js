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

  // ETP-4529 — project/costcenter are no longer plain top-level columns.
  // They are candidates in DIMENSION_FIELD_CANDIDATES_BASE, filtered by
  // hiddenColumns into `dimensionFields`, and nested inside a single
  // synthetic `dimensionsPanel` column only when at least one candidate
  // survives the filter.
  it('declares project as a dimension field candidate with lookup enabled', () => {
    const candidatesMatch = src.match(
      /const DIMENSION_FIELD_CANDIDATES_BASE = \[(.*?)\];/s
    );
    assert.ok(candidatesMatch, 'expected to find DIMENSION_FIELD_CANDIDATES_BASE declaration');
    const candidatesBody = candidatesMatch[1];

    assert.match(candidatesBody, /key: 'project'/);
    assert.match(candidatesBody, /column: 'C_Project_ID'/);
    assert.match(candidatesBody, /key: 'project'[^}]*type: 'selector'/s);
    assert.match(candidatesBody, /key: 'project'[^}]*lookup: true/s);
  });

  it('declares costcenter as a dimension field candidate with type selector', () => {
    const candidatesMatch = src.match(
      /const DIMENSION_FIELD_CANDIDATES_BASE = \[(.*?)\];/s
    );
    assert.ok(candidatesMatch, 'expected to find DIMENSION_FIELD_CANDIDATES_BASE declaration');
    const candidatesBody = candidatesMatch[1];

    assert.match(candidatesBody, /key: 'costcenter'/);
    assert.match(candidatesBody, /column: 'C_Costcenter_ID'/);
    assert.match(candidatesBody, /key: 'costcenter'[^}]*type: 'selector'/s);
  });

  it('builds dimensionFields from the candidates, filtered by hiddenColumns', () => {
    assert.match(src, /const dimensionFields = useMemo\(/);
    assert.match(src, /DIMENSION_FIELD_CANDIDATES_BASE\s*\n?\s*\.filter\(f => !\(props\.hiddenColumns \?\? \[\]\)\.includes\(f\.key\)\)/);
  });

  it('nests dimensionFields inside a single dimensionsPanel column, not flat project/costcenter columns', () => {
    const columnsMatch = src.match(
      /const columns = useMemo\(\(\) => \(\[(.*?)\]\), \[dimensionFields/s
    );
    assert.ok(columnsMatch, 'expected to find the columns array declaration');
    const columnsBody = columnsMatch[1];

    // The dimensionsPanel column exists and carries the candidates.
    assert.match(columnsBody, /type: 'dimensionsPanel'/);
    assert.match(columnsBody, /dimensionFields,/);
    // Only included when there is at least one visible candidate.
    assert.match(columnsBody, /\.\.\.\(dimensionFields\.length > 0 \? \[\{/);

    // project/costcenter must NOT be declared as their own top-level entries
    // in the columns array — only nested via dimensionFields.
    assert.doesNotMatch(columnsBody, /key: 'project'/);
    assert.doesNotMatch(columnsBody, /key: 'costcenter'/);
  });
});
