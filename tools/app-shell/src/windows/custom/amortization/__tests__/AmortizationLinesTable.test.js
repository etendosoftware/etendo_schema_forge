import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'AmortizationLinesTable.jsx'), 'utf8');

describe('AmortizationLinesTable — props and imports', () => {
  it('accepts recordId, data, token, apiBaseUrl, api, editing, catalogs, onCountChange props', () => {
    assert.match(src, /recordId/);
    assert.match(src, /token/);
    assert.match(src, /apiBaseUrl/);
    assert.match(src, /catalogs/);
    assert.match(src, /editing/);
    assert.match(src, /onCountChange/);
  });

  it('imports SelectorInput for inline asset selector', () => {
    assert.match(src, /SelectorInput/);
    assert.match(src, /from '@\/components\/contract-ui\/SelectorInput'/);
  });

  it('imports AddLineButton for the add-line split button', () => {
    assert.match(src, /AddLineButton/);
    assert.match(src, /from '@\/components\/ui\/add-line-button'/);
  });

  it('uses useUI and useLabel for translations', () => {
    assert.match(src, /useUI/);
    assert.match(src, /useLabel/);
  });
});

describe('AmortizationLinesTable — fetch pattern', () => {
  it('fetches lines from apiBaseUrl/lines with parentId and sort params', () => {
    assert.match(src, /\/lines\?parentId=\$\{recordId\}/);
    assert.match(src, /_sortBy=sEQNoAsset/);
  });

  it('sends Authorization Bearer token in fetch header', () => {
    assert.match(src, /Authorization.*Bearer.*token/);
  });

  it('calls onCountChange after fetching lines', () => {
    assert.match(src, /onCountChange\?\.\(normalized\.length\)/);
  });

  it('re-fetches on neo:processSuccess event', () => {
    assert.match(src, /neo:processSuccess/);
    assert.match(src, /fetchLines/);
  });
});

describe('AmortizationLinesTable — inline editing', () => {
  it('defines CORE_FIELDS for asset, amortizationPercentage, amortizationAmount', () => {
    assert.match(src, /CORE_FIELDS/);
    assert.match(src, /'asset'/);
    assert.match(src, /'amortizationPercentage'/);
    assert.match(src, /'amortizationAmount'/);
  });

  it('uses editingLineId state to track which row is being edited', () => {
    assert.match(src, /editingLineId/);
    assert.match(src, /setEditingLineId/);
  });

  it('saves field on blur via saveField function', () => {
    assert.match(src, /saveField/);
    assert.match(src, /onBlur/);
  });

  it('saves asset selector immediately on onChange', () => {
    assert.match(src, /saveField\(line\.id.*'asset'/);
  });

  it('closes edit mode when clicking outside via mousedown handler', () => {
    assert.match(src, /mousedown/);
    assert.match(src, /data-row-id/);
  });

  it('saves to apiBaseUrl/lines/{id} via PUT', () => {
    assert.match(src, /`\$\{apiBaseUrl\}\/lines\/\$\{lineId\}`/);
    assert.match(src, /method.*PUT/);
  });

  it('Enter key triggers blur to save', () => {
    assert.match(src, /key.*===.*'Enter'/);
    assert.match(src, /currentTarget\.blur/);
  });

  it('Escape key closes edit mode without saving', () => {
    assert.match(src, /key.*===.*'Escape'/);
    assert.match(src, /setEditingLineId\(null\)/);
  });
});

describe('AmortizationLinesTable — dimensions', () => {
  it('defines DIMENSION_FIELDS with exactly 3 entries: project, costcenter, eTADASBpartner', () => {
    assert.match(src, /DIMENSION_FIELDS/);
    // The three kept dimensions with their AD columns.
    assert.match(src, /'project'/);
    assert.match(src, /C_Project_ID/);
    assert.match(src, /'costcenter'/);
    assert.match(src, /C_Costcenter_ID/);
    assert.match(src, /'eTADASBpartner'/);
    assert.match(src, /EM_Etadas_C_Bpartner_ID/);

    // Assert the array literal holds exactly 3 object entries.
    const block = src.match(/const DIMENSION_FIELDS = \[(.*?)\];/s);
    assert.ok(block, 'DIMENSION_FIELDS array literal not found');
    const entries = block[1].match(/\{\s*key:/g) ?? [];
    assert.equal(entries.length, 3, `expected 3 DIMENSION_FIELDS entries, found ${entries.length}`);

    // The 5 trimmed dimensions must no longer be present.
    assert.doesNotMatch(src, /'stDimension'/);
    assert.doesNotMatch(src, /'ndDimension'/);
    assert.doesNotMatch(src, /'eTADASSalesRegion'/);
    assert.doesNotMatch(src, /'eTADASActivity'/);
    assert.doesNotMatch(src, /'eTADASSalesCampaign'/);
  });

  it('renders the project dimension (no hidden: true on any dimension entry)', () => {
    // Project was intentionally unhidden so it renders in the panel.
    const block = src.match(/const DIMENSION_FIELDS = \[(.*?)\];/s);
    assert.ok(block, 'DIMENSION_FIELDS array literal not found');
    assert.doesNotMatch(block[1], /hidden:\s*true/);
  });

  it('renders DimSummary with Label:Value badges (no n/TOTAL_DIMS counter)', () => {
    assert.match(src, /DimSummary/);
    assert.match(src, /DimBadge/);
    assert.match(src, /MAX_BADGES/);
  });

  it('DimSummary shows empty state with amortizationDimensionsEmpty label', () => {
    assert.match(src, /amortizationDimensionsEmpty/);
  });

  it('DimensionGrid renders selectors with empty resolvedLabel for generic placeholder', () => {
    assert.match(src, /DimensionGrid/);
    assert.match(src, /resolvedLabel=""/);
  });

  it('dimension fields auto-save on onChange via onFieldSave', () => {
    assert.match(src, /onFieldSave/);
  });

  it('uses amortizationDimensionsTitle i18n key for section header', () => {
    assert.match(src, /amortizationDimensionsTitle/);
  });

  it('shows empty state via amortizationDimensionsEmpty when no badges', () => {
    assert.match(src, /amortizationDimensionsEmpty/);
  });
});

describe('AmortizationLinesTable — add and delete lines', () => {
  it('uses AddLineButton with label from addLine i18n key', () => {
    assert.match(src, /AddLineButton/);
    assert.match(src, /label=\{ui\('addLine'\)\}/);
  });

  it('posts new line to apiBaseUrl/lines with amortization parent id', () => {
    assert.match(src, /`\$\{apiBaseUrl\}\/lines`/);
    assert.match(src, /method.*POST/);
    assert.match(src, /amortization.*recordId/);
  });

  it('deletes a line via DELETE to apiBaseUrl/lines/{id}', () => {
    assert.match(src, /method.*DELETE/);
    assert.match(src, /deleteLine/);
  });

  it('hides add and delete actions when document is read-only or processed', () => {
    assert.match(src, /isReadOnly/);
    assert.match(src, /processed.*===.*'Y'/);
  });
});

describe('AmortizationLinesTable — column headers', () => {
  it('uses useLabel to resolve column header labels from AD labelOverrides', () => {
    assert.match(src, /useLabel/);
    assert.match(src, /t\('A_Asset_ID'\)/);
    assert.match(src, /t\('Amortization_Percentage'\)/);
    assert.match(src, /t\('Amortizationamt'\)/);
  });

  it('uses font-semibold text-text-primary for column headers matching standard DataTable style', () => {
    assert.match(src, /font-semibold/);
    assert.match(src, /text-text-primary/);
  });
});
