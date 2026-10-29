// @covers artifacts/payment-term/decisions.json
// @covers artifacts/payment-term/contract.json
// @covers artifacts/payment-term/contract.mcp.json
// @covers artifacts/payment-term/generated/web/payment-term/HeaderPage.jsx
//
// Guards the simplified Payment Term window against a regen silently undoing it.
// The window is a `list-modal`: a compact list plus a compact create/edit popup, all
// generated into HeaderPage.jsx (no HeaderForm / HeaderTable). searchKey / offsetMonthDue
// are derived server-side (PaymentTermHandler.enrichCreate) and must never reach the
// popup, the grid, the required fields, the filters or the MCP create contract.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const artifactDir = join(__dirname, '..');
const generatedDir = join(artifactDir, 'generated', 'web', 'payment-term');

const readJson = (file) => JSON.parse(readFileSync(join(artifactDir, file), 'utf8'));

const decisions = readJson('decisions.json');
const contract = readJson('contract.json');
const mcp = readJson('contract.mcp.json');
const pageSrc = readFileSync(join(generatedDir, 'HeaderPage.jsx'), 'utf8');

const HIDDEN = ['searchKey', 'offsetMonthDue'];

/** The source between `@sf-generated-start <block>` and its end marker. */
function generatedRegion(src, block) {
  const start = src.indexOf(`// @sf-generated-start ${block}`);
  const end = src.indexOf(`// @sf-generated-end ${block}`);
  assert.ok(start >= 0 && end > start, `generated block ${block} not found`);
  return src.slice(start, end);
}

/**
 * Evaluates the array literal `const <varName> = [ … ];` inside a generated block, so the
 * assertions run on the generated data (keys, order, props) instead of on its formatting.
 * The array must close with `\n];` — the `fields:header` block also holds `sections` and
 * `filters`, so a lazy match up to the last `;` of the block would swallow them.
 */
function generatedArray(src, block, varName) {
  const match = generatedRegion(src, block).match(new RegExp(`const ${varName} = (\\[[\\s\\S]*?\\n\\]);`));
  assert.ok(match, `const ${varName} not found in block ${block}`);
  // eslint-disable-next-line no-new-func -- evaluating a generated data literal, no code
  return new Function(`return (${match[1]});`)();
}

const headerDecisions = decisions.entities.header.fields;
const contractHeader = contract.frontendContract.entities.header;
const contractField = (name) => contractHeader.fields.find((f) => f.name === name);
const gridColumns = generatedArray(pageSrc, 'columns:header', 'columns');
const popupFields = generatedArray(pageSrc, 'fields:header', 'fields');
const pageFilters = generatedRegion(pageSrc, 'fields:header').match(/const filters = (\[[^\]]*\]);/);
const listModalConfig = JSON.parse(pageSrc.match(/const listModalConfig = (\{[\s\S]*?\n\});/)[1]);
const column = (key) => gridColumns.find((c) => c.key === key);
const popupField = (key) => popupFields.find((f) => f.key === key);

describe('payment-term window simplification', () => {
  describe('list-modal layout', () => {
    it('is a list-modal window in decisions and contract', () => {
      assert.equal(decisions.window.layoutType, 'list-modal');
      assert.equal(contract.frontendContract.window.layoutType, 'list-modal');
      assert.match(pageSrc, /<ListModalWindow\b/);
      assert.doesNotMatch(pageSrc, /<DetailView\b|<ListView\b/);
    });

    it('generates no HeaderForm.jsx / HeaderTable.jsx', () => {
      assert.equal(existsSync(join(generatedDir, 'HeaderForm.jsx')), false);
      assert.equal(existsSync(join(generatedDir, 'HeaderTable.jsx')), false);
    });

    const TEMPLATE = {
      modalVariant: 'compact',
      listVariant: 'compact',
      hideBackButton: true,
      hideSearch: true,
      newButtonVariant: 'primary',
      rowClickEdit: true,
      titleKey: 'paymentTermNewTitle',
      editTitleKey: 'paymentTermEditTitle',
      newLabelKey: 'paymentTermNew',
    };

    for (const [key, value] of Object.entries(TEMPLATE)) {
      it(`declares templateConfig.${key} = ${JSON.stringify(value)} and carries it to the page`, () => {
        assert.equal(decisions.window.templateConfig[key], value);
        assert.equal(contract.frontendContract.window.templateConfig[key], value);
        assert.equal(listModalConfig[key], value);
      });
    }
  });

  describe('server-derived fields (searchKey, offsetMonthDue)', () => {
    for (const name of HIDDEN) {
      it(`declares ${name} as a system field in decisions`, () => {
        assert.equal(headerDecisions[name]?.visibility, 'system');
      });

      it(`keeps ${name} out of the frontend contract fields`, () => {
        assert.equal(contractHeader.fields.some((f) => f.name === name), false);
      });

      it(`keeps ${name} out of the generated popup and grid`, () => {
        assert.equal(popupFields.some((f) => f.key === name), false);
        assert.equal(gridColumns.some((c) => c.key === name), false);
      });

      it(`keeps ${name} out of every supportedFilters list`, () => {
        const lists = [
          contract.apiPrediction.crud.header.supportedFilters,
          mcp.apiPrediction.crud.header.supportedFilters,
          ...contract.backendContract.endpoints.map((e) => e.supportedFilters),
        ];
        for (const list of lists) assert.equal(list.includes(name), false);
        assert.ok(pageFilters, 'HeaderPage filters literal not found');
        assert.equal(JSON.parse(pageFilters[1].replaceAll("'", '"')).includes(name), false);
      });
    }

    it('requires exactly name and overduePaymentDaysRule in the popup', () => {
      const required = popupFields.filter((f) => f.required === true).map((f) => f.key);
      assert.deepEqual(required, ['name', 'overduePaymentDaysRule']);
    });

    it('searches by name only', () => {
      assert.deepEqual(JSON.parse(pageFilters[1].replaceAll("'", '"')), ['name']);
    });
  });

  describe('attachments', () => {
    it('renders no attachments tab in HeaderPage', () => {
      assert.doesNotMatch(pageSrc, /AttachmentsTab/);
      assert.doesNotMatch(pageSrc, /customTabs/);
    });
  });

  describe('popup layout', () => {
    // Nombre, Días, Por defecto, Siguiente día hábil.
    const POPUP_ORDER = ['name', 'overduePaymentDaysRule', 'default', 'nextBusinessDay'];

    it('orders the popup fields by seq in decisions', () => {
      const ordered = Object.entries(headerDecisions)
        .filter(([, f]) => typeof f.seq === 'number')
        .sort(([, a], [, b]) => a.seq - b.seq)
        .map(([name]) => name);
      assert.deepEqual(ordered, POPUP_ORDER);
    });

    it('generates the popup and the contract form in that order', () => {
      assert.deepEqual(popupFields.map((f) => f.key), POPUP_ORDER);
      const contractForm = contractHeader.fields
        .filter((f) => f.form !== false)
        .sort((a, b) => a.seq - b.seq);
      assert.deepEqual(contractForm.map((f) => f.name), POPUP_ORDER);
    });

    it('renders overduePaymentDaysRule as a 0–365 integer stepper with its own refusal hint', () => {
      const BOUNDS = {
        stepper: true, min: 0, max: 365, integer: true, stepperRejectedKey: 'paymentTermDaysNotInteger',
      };
      for (const [prop, value] of Object.entries(BOUNDS)) {
        assert.equal(headerDecisions.overduePaymentDaysRule[prop], value, `decisions ${prop}`);
        assert.equal(contractField('overduePaymentDaysRule')[prop], value, `contract ${prop}`);
        assert.equal(popupField('overduePaymentDaysRule')[prop], value, `popup ${prop}`);
      }
    });

    it('caps the name at the DB length (60) in the popup, from the contract validation', () => {
      assert.equal(contractField('name').validation.maxLength, 60);
      assert.equal(popupField('name').maxLength, 60);
    });

    it('translates the refusal key in en_US and es_ES', () => {
      for (const locale of ['en_US', 'es_ES']) {
        const dict = JSON.parse(readFileSync(join(artifactDir, '..', '..', 'tools', 'app-shell', 'src', 'locales', `${locale}.json`), 'utf8'));
        const text = dict.genericLabels?.paymentTermDaysNotInteger;
        assert.ok(typeof text === 'string' && text.length > 0, `${locale} lacks paymentTermDaysNotInteger`);
      }
    });

    it('gives no other popup field a stepper refusal key', () => {
      assert.deepEqual(popupFields.filter((f) => f.stepperRejectedKey).map((f) => f.key), ['overduePaymentDaysRule']);
    });

    it('caps no other popup field (maxLength is text-only)', () => {
      assert.deepEqual(popupFields.filter((f) => f.maxLength != null).map((f) => f.key), ['name']);
    });

    it('starts nextBusinessDay ticked in the create popup', () => {
      assert.equal(headerDecisions.nextBusinessDay.defaultValue, 'Y');
      assert.equal(contractField('nextBusinessDay').defaultValue, 'Y');
      assert.equal(popupField('nextBusinessDay').defaultValue, 'Y');
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

    it('renders the name in bold', () => {
      assert.equal(column('name').cellType, 'boldText');
    });

    it('grows no column (fixed widths plus a spacer take the free width)', () => {
      assert.deepEqual(gridColumns.filter((c) => c.grow).map((c) => c.key), []);
      assert.deepEqual(contractHeader.fields.filter((f) => f.grow).map((f) => f.name), []);
    });

    // decisions columnWidth / columnMaxWidth → contract → page minWidth / maxWidth.
    const WIDTHS = {
      name: { min: 164, max: 240 },
      overduePaymentDaysRule: { min: 124, max: 148 },
      nextBusinessDay: { min: 158 },
      default: { min: 158 },
    };

    for (const [key, { min, max }] of Object.entries(WIDTHS)) {
      it(`fixes the ${key} column at ${min}px${max ? `, capped at ${max}px` : ', uncapped'}`, () => {
        assert.equal(headerDecisions[key].columnWidth, min);
        assert.equal(headerDecisions[key].columnMaxWidth, max);
        assert.equal(contractField(key).columnWidth, min);
        assert.equal(contractField(key).columnMaxWidth, max);
        assert.equal(column(key).minWidth, min);
        assert.equal(column(key).maxWidth, max);
      });
    }

    for (const key of ['nextBusinessDay', 'default']) {
      it(`shows ${key} as a green/neutral badge column`, () => {
        const col = column(key);
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

    for (const [col, label] of Object.entries(EXPECTED)) {
      it(`labels ${col} as "${label}" in en_US`, () => {
        assert.equal(decisions.window.labelOverrides.en_US[col], label);
        assert.equal(contract.frontendContract.window.labelOverrides.en_US[col], label);
        assert.equal(pageApi.labelOverrides.en_US[col], label);
      });
    }
  });

  describe('defaults', () => {
    it('defaults nextBusinessDay to Y server-side on new records', () => {
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
