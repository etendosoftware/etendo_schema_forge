// @covers artifacts/payment-term/decisions.json
// @covers artifacts/payment-term/contract.json
// @covers artifacts/payment-term/contract.mcp.json
// @covers artifacts/payment-term/generated/web/payment-term/HeaderForm.jsx
// @covers artifacts/payment-term/generated/web/payment-term/HeaderTable.jsx
// @covers artifacts/payment-term/generated/web/payment-term/HeaderPage.jsx
//
// Guards the simplified Payment Term window against a regen silently undoing it:
// searchKey / offsetMonthDue are derived server-side (PaymentTermHandler.enrichCreate)
// and must never reach the form, the grid, the required list, the filters or the MCP
// create contract.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactDir = join(__dirname, '..');
const generatedDir = join(artifactDir, 'generated', 'web', 'payment-term');

const readJson = (file) => JSON.parse(readFileSync(join(artifactDir, file), 'utf8'));
const readGenerated = (file) => readFileSync(join(generatedDir, file), 'utf8');

const decisions = readJson('decisions.json');
const contract = readJson('contract.json');
const mcp = readJson('contract.mcp.json');
const formSrc = readGenerated('HeaderForm.jsx');
const tableSrc = readGenerated('HeaderTable.jsx');
const pageSrc = readGenerated('HeaderPage.jsx');

const HIDDEN = ['searchKey', 'offsetMonthDue'];

/**
 * Evaluates the literal assigned inside a `@sf-generated-start <block>` region, so the
 * assertions run on the generated data (keys, order, props) instead of on its formatting.
 */
function generatedLiteral(src, block, varName) {
  const start = src.indexOf(`// @sf-generated-start ${block}`);
  const end = src.indexOf(`// @sf-generated-end ${block}`);
  assert.ok(start >= 0 && end > start, `generated block ${block} not found`);
  const region = src.slice(start, end);
  const match = region.match(new RegExp(`const ${varName} = ([\\s\\S]*?);\\s*$`));
  assert.ok(match, `const ${varName} not found in block ${block}`);
  // eslint-disable-next-line no-new-func -- evaluating a generated data literal, no code
  return new Function(`return (${match[1]});`)();
}

const headerDecisions = decisions.entities.header.fields;
const contractHeader = contract.frontendContract.entities.header;
const formFields = generatedLiteral(formSrc, 'fields:header', 'fields');
const gridColumns = generatedLiteral(tableSrc, 'columns:header', 'columns');
const requiredHeaderFields = generatedLiteral(pageSrc, 'requiredHeaderFields:header', 'requiredHeaderFields');
const tableFilters = tableSrc.match(/const filters = (\[[^\]]*\]);/);

describe('payment-term window simplification', () => {
  describe('server-derived fields (searchKey, offsetMonthDue)', () => {
    for (const name of HIDDEN) {
      it(`declares ${name} as a system field in decisions`, () => {
        assert.equal(headerDecisions[name]?.visibility, 'system');
      });

      it(`keeps ${name} out of the frontend contract fields`, () => {
        assert.equal(contractHeader.fields.some((f) => f.name === name), false);
      });

      it(`keeps ${name} out of the generated form and grid`, () => {
        assert.equal(formFields.some((f) => f.key === name), false);
        assert.equal(gridColumns.some((c) => c.key === name), false);
      });

      it(`keeps ${name} out of requiredHeaderFields`, () => {
        assert.equal(requiredHeaderFields.includes(name), false);
      });

      it(`keeps ${name} out of every supportedFilters list`, () => {
        const lists = [
          contract.apiPrediction.crud.header.supportedFilters,
          mcp.apiPrediction.crud.header.supportedFilters,
          ...contract.backendContract.endpoints.map((e) => e.supportedFilters),
        ];
        for (const list of lists) assert.equal(list.includes(name), false);
        assert.ok(tableFilters, 'HeaderTable filters literal not found');
        assert.equal(JSON.parse(tableFilters[1].replaceAll("'", '"')).includes(name), false);
      });
    }

    it('requires only name and overduePaymentDaysRule on create', () => {
      assert.deepEqual(requiredHeaderFields, ['name', 'overduePaymentDaysRule']);
    });
  });

  describe('attachments', () => {
    it('disables attachments at window level in decisions and contract', () => {
      assert.equal(decisions.window.attachments, false);
      assert.equal(contract.frontendContract.window.attachments, false);
    });

    it('renders no attachments tab in HeaderPage', () => {
      assert.doesNotMatch(pageSrc, /AttachmentsTab/);
      assert.doesNotMatch(pageSrc, /customTabs/);
    });
  });

  describe('form layout', () => {
    const FORM_ORDER = ['name', 'overduePaymentDaysRule', 'default', 'nextBusinessDay'];

    it('orders the form fields by seq in decisions', () => {
      const ordered = Object.entries(headerDecisions)
        .filter(([, f]) => typeof f.seq === 'number')
        .sort(([, a], [, b]) => a.seq - b.seq)
        .map(([name]) => name);
      assert.deepEqual(ordered, FORM_ORDER);
    });

    it('generates the form and the contract form in that order', () => {
      assert.deepEqual(formFields.map((f) => f.key), FORM_ORDER);
      const contractForm = contractHeader.fields
        .filter((f) => f.form !== false)
        .sort((a, b) => a.seq - b.seq);
      assert.deepEqual(contractForm.map((f) => f.name), FORM_ORDER);
    });
  });

  describe('grid layout', () => {
    const GRID_ORDER = ['name', 'overduePaymentDaysRule', 'nextBusinessDay', 'default'];

    it('orders the grid columns by gridOrder', () => {
      assert.deepEqual(gridColumns.map((c) => c.key), GRID_ORDER);
      const contractGrid = contractHeader.fields
        .filter((f) => f.grid)
        .sort((a, b) => a.gridOrder - b.gridOrder);
      assert.deepEqual(contractGrid.map((f) => f.name), GRID_ORDER);
    });

    it('grows only the name column', () => {
      const grown = gridColumns.filter((c) => c.grow).map((c) => c.key);
      assert.deepEqual(grown, ['name']);
    });

    for (const key of ['nextBusinessDay', 'default']) {
      it(`shows ${key} as a green/neutral badge column`, () => {
        const col = gridColumns.find((c) => c.key === key);
        assert.ok(col, `${key} grid column missing`);
        assert.equal(col.badge, true);
        assert.deepEqual(col.badgeVariants, { true: 'green', false: 'neutral' });
      });
    }
  });

  describe('English labels', () => {
    // Without these overrides the en_US header falls back to the AD name
    // ("Overdue Payment Days Rule").
    const EXPECTED = { NetDays: 'Days', IsNextBusinessDay: 'Next Business Day' };
    const pageApi = JSON.parse(pageSrc.match(/export const api = (\{[\s\S]*?\n\});/)[1]);

    for (const [column, label] of Object.entries(EXPECTED)) {
      it(`labels ${column} as "${label}" in en_US`, () => {
        assert.equal(decisions.window.labelOverrides.en_US[column], label);
        assert.equal(contract.frontendContract.window.labelOverrides.en_US[column], label);
        assert.equal(pageApi.labelOverrides.en_US[column], label);
      });
    }
  });

  describe('editing behavior', () => {
    it('auto-saves on blur at window level', () => {
      assert.equal(decisions.window.autoSaveOnBlur, true);
      assert.equal(contract.frontendContract.window.autoSaveOnBlur, true);
      assert.match(pageSrc, /<DetailView[\s\S]*?\bautoSaveOnBlur\b[\s\S]*?\/>/);
    });

    it('defaults nextBusinessDay to Y on new records', () => {
      assert.equal(headerDecisions.nextBusinessDay.defaultExpr, 'Y');
    });
  });

  describe('MCP create contract', () => {
    it('lists only name and overduePaymentDaysRule as minimum create fields', () => {
      assert.deepEqual(mcp.agentProfile.minimumCreate.headerFields, ['name', 'overduePaymentDaysRule']);
    });

    it('keeps the server-derived fields out of the createHeader example and form state', () => {
      const createHeader = mcp.agentProfile.examples.find((e) => e.operation === 'createHeader');
      assert.ok(createHeader, 'createHeader example missing');
      const formStateFields = Object.keys(mcp.formState.entities.header.fields);
      for (const name of HIDDEN) {
        assert.equal(createHeader.fields.includes(name), false, `createHeader includes ${name}`);
        assert.equal(formStateFields.includes(name), false, `formState includes ${name}`);
      }
    });
  });
});
