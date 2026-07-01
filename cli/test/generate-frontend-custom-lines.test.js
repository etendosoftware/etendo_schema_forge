import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { generatePageComponent } from '../src/generate-frontend.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
//
// These drive the customLines path of generatePageComponent, which delegates
// to the module-private buildCustomLinesParts(windowConfig, specName) helper.
//
//   - windowConfig         = contract.frontendContract.window
//   - specName             = contract.apiPrediction?.specName
//   - customLinesComponent / customLinesLabel live on windowConfig
//
// The referenced component (FakeCustomLinesGrid) does not exist on disk, so
// resolveCustomImport falls through to the artifact-local default convention:
//   '../../../custom/<Component>'
// ---------------------------------------------------------------------------

function makeContract({ customLinesComponent, customLinesLabel, specName } = {}) {
  const window = {
    id: '300',
    name: 'Amortization',
    primaryEntity: 'amortization',
    category: 'finance',
  };
  if (customLinesComponent !== undefined) window.customLinesComponent = customLinesComponent;
  if (customLinesLabel !== undefined) window.customLinesLabel = customLinesLabel;

  const contract = {
    frontendContract: {
      window,
      entities: {
        amortization: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
            { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true },
            { name: 'docStatus', column: 'DocStatus', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          ],
          searchableFields: ['documentNo', 'name'],
          computedFields: [],
        },
        amortizationLine: {
          fields: [
            { name: 'lineNo', column: 'Line', type: 'number', tsType: 'number', visibility: 'editable', required: true, grid: true, form: true },
            { name: 'amount', column: 'Amount', type: 'amount', tsType: 'number', visibility: 'editable', required: true, grid: true, form: true },
          ],
          searchableFields: [],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };
  if (specName !== undefined) contract.apiPrediction = { specName };
  return contract;
}

const RESOLVED_IMPORT = "import FakeCustomLinesGrid from '../../../custom/FakeCustomLinesGrid';";

// ---------------------------------------------------------------------------
// buildCustomLinesParts — truthy branch (customLinesComponent + specName)
// ---------------------------------------------------------------------------

describe('generatePageComponent - customLinesComponent', () => {
  it('emits an import for the custom lines component using the resolved path', () => {
    const code = generatePageComponent('amortization', 'amortizationLine', makeContract({
      customLinesComponent: 'FakeCustomLinesGrid',
      specName: 'amortization',
    }));
    assert.ok(code.includes(RESOLVED_IMPORT), 'should import FakeCustomLinesGrid from artifact-local custom dir');
  });

  it('passes CustomLines={<Comp>} prop to the rendered component', () => {
    const code = generatePageComponent('amortization', 'amortizationLine', makeContract({
      customLinesComponent: 'FakeCustomLinesGrid',
      specName: 'amortization',
    }));
    assert.match(code, /CustomLines=\{FakeCustomLinesGrid\}/);
  });

  it('skips the standard lines Table/Form imports when customLinesComponent is set', () => {
    const code = generatePageComponent('amortization', 'amortizationLine', makeContract({
      customLinesComponent: 'FakeCustomLinesGrid',
      specName: 'amortization',
    }));
    // buildDetailImports returns '' when a customLinesComp is present.
    assert.ok(!code.includes('AmortizationLineTable from'), 'should not import the generated lines Table');
    assert.ok(!code.includes('AmortizationLineForm from'), 'should not import the generated lines Form');
  });

  it('does not emit customLinesLabel when no label is configured', () => {
    const code = generatePageComponent('amortization', 'amortizationLine', makeContract({
      customLinesComponent: 'FakeCustomLinesGrid',
      specName: 'amortization',
    }));
    assert.ok(!code.includes('customLinesLabel='), 'should not emit customLinesLabel prop without a label');
  });

  // -------------------------------------------------------------------------
  // buildCustomLinesParts — label branch
  // -------------------------------------------------------------------------

  it('emits customLinesLabel="<value>" when customLinesLabel is configured', () => {
    const code = generatePageComponent('amortization', 'amortizationLine', makeContract({
      customLinesComponent: 'FakeCustomLinesGrid',
      customLinesLabel: 'Amortization Plan',
      specName: 'amortization',
    }));
    assert.match(code, /customLinesLabel="Amortization Plan"/);
    // The label only makes sense alongside the CustomLines prop.
    assert.match(code, /CustomLines=\{FakeCustomLinesGrid\}/);
  });

  // -------------------------------------------------------------------------
  // Guard: needs both customLinesComponent AND specName
  // -------------------------------------------------------------------------

  it('does NOT emit CustomLines parts when specName is absent', () => {
    const code = generatePageComponent('amortization', 'amortizationLine', makeContract({
      customLinesComponent: 'FakeCustomLinesGrid',
      // no specName
    }));
    assert.ok(!code.includes('CustomLines='), 'should not emit CustomLines prop without specName');
    assert.ok(!code.includes('FakeCustomLinesGrid from'), 'should not import the custom lines component without specName');
  });

  // -------------------------------------------------------------------------
  // buildCustomLinesParts — negative (falsy) branch
  // -------------------------------------------------------------------------

  it('does NOT emit CustomLines prop or import when customLinesComponent is absent', () => {
    const code = generatePageComponent('amortization', 'amortizationLine', makeContract({
      specName: 'amortization',
    }));
    assert.ok(!code.includes('CustomLines='), 'should not emit CustomLines prop');
    assert.ok(!code.includes('customLinesLabel='), 'should not emit customLinesLabel prop');
    assert.ok(!code.includes('FakeCustomLinesGrid'), 'should not reference the custom lines component at all');
  });
});
