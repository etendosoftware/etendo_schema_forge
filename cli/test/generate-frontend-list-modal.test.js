import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  generatePageComponent,
  generateListModalPage,
  generateAll,
  buildInlineCreatePart,
} from '../src/generate-frontend.js';

// ---------------------------------------------------------------------------
// Fixtures
//
// Mirrors the real artifact contract at artifacts/match-rule/contract.json:
// a single-entity window with layoutType "list-modal", a templateConfig
// carrying i18n keys + auto-priority hints, grid fields tagged with
// inlineToggle / inlineEdit, and form fields grouped into sections.
// ---------------------------------------------------------------------------

function listModalContract() {
  return {
    apiPrediction: {
      specName: 'match-rule',
      baseUrl: '/sws/neo/match-rule',
      crud: { etgoMatchRuleHeader: { listUrl: '/sws/neo/match-rule/etgoMatchRuleHeader' } },
      selectors: [],
      actions: [],
      queryParams: {},
    },
    frontendContract: {
      window: {
        id: '700',
        name: 'Match Rules',
        primaryEntity: 'etgoMatchRuleHeader',
        category: 'financial',
        layoutType: 'list-modal',
        templateConfig: {
          titleKey: 'matchRuleNewTitle',
          editTitleKey: 'matchRuleEditTitle',
          bannerKey: 'matchRuleBanner',
          searchPlaceholderKey: 'matchRuleSearchPlaceholder',
          newLabelKey: 'matchRuleNew',
          autoPriorityField: 'priority',
          autoPriorityStep: 10,
          backLabelKey: 'matchRuleBack',
          backTo: '/cuentas',
          toolbarFilters: [
            {
              key: 'status',
              field: 'matchType',
              allLabelKey: 'matchRuleAllTypes',
              options: [
                { value: 'A', labelKey: 'matchRuleTypeAuto' },
                { value: 'M', labelKey: 'matchRuleTypeManual' },
              ],
            },
          ],
          sections: [
            { key: 'general' },
            { key: 'dimensions', label: 'matchRuleSectionDimensions' },
          ],
        },
      },
      entities: {
        etgoMatchRuleHeader: {
          tableName: 'ETGO_SF_Match_Rule',
          fields: [
            { name: 'active', column: 'IsActive', type: 'boolean', tsType: 'boolean', visibility: 'editable', required: false, grid: true, form: false, inlineToggle: true },
            { name: 'name', column: 'Name', type: 'string', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true, section: 'general', cellType: 'nameWithSubline', subField: 'businessPartner' },
            { name: 'priority', column: 'Priority', type: 'integer', tsType: 'number', visibility: 'editable', required: false, grid: true, form: true, section: 'general', inlineEdit: true, cellType: 'priorityPill' },
            { name: 'condition', column: 'Condition', type: 'string', tsType: 'string', visibility: 'readOnly', required: false, grid: true, form: false, cellType: 'conditionChip', kindField: 'matchKind', patternField: 'textPattern', kindLabels: { C: 'matchKindContains', S: 'matchKindStarts' } },
            { name: 'matchType', column: 'MatchType', type: 'string', tsType: 'string', visibility: 'readOnly', required: false, grid: true, form: false, cellType: 'typePill', enumValues: [{ value: 'A', name: 'Auto' }, { value: 'M', name: 'Manual' }], tones: { A: 'green', M: 'amber' } },
            { name: 'textPattern', column: 'TextPattern', type: 'string', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true, section: 'general' },
            { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true, section: 'general', reference: 'BusinessPartner', inputMode: 'search' },
            { name: 'project', column: 'C_Project_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true, section: 'dimensions', reference: 'Project', inputMode: 'selector' },
            { name: 'financialAccount', column: 'Fin_Financial_Account_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true, section: 'dimensions', reference: 'FinancialAccount', inputMode: 'selector', searchSelect: true },
            { name: 'costCenter', column: 'C_Costcenter_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: false, grid: false, form: true, section: 'dimensions', reference: 'CostCenter', inputMode: 'selector' },
          ],
          searchableFields: ['name', 'textPattern'],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };
}

// A standard (default) layout master-detail contract — used to guard against
// regressions in generateAll's Table+Form emission.
function defaultLayoutContract() {
  return {
    frontendContract: {
      window: { id: '143', name: 'Sales Order', primaryEntity: 'order', category: 'sales' },
      entities: {
        order: {
          fields: [
            { name: 'documentNo', column: 'DocumentNo', type: 'string', tsType: 'string', visibility: 'readOnly', required: true, grid: true, form: true },
          ],
          searchableFields: ['documentNo'],
          computedFields: [],
        },
        orderLine: {
          fields: [
            { name: 'product', column: 'M_Product_ID', type: 'foreignKey', tsType: 'string', visibility: 'editable', required: true, grid: true, form: true, reference: 'Product', inputMode: 'search' },
          ],
          searchableFields: ['product'],
          computedFields: [],
        },
      },
    },
    backendContract: { processEndpoints: [] },
  };
}

// ---------------------------------------------------------------------------
// generatePageComponent — list-modal early return
// ---------------------------------------------------------------------------

describe('generatePageComponent — layoutType list-modal', () => {
  it('imports ListModalWindow from contract-ui', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    assert.ok(code.includes("import { ListModalWindow } from '@/components/contract-ui'"));
  });

  it('renders <ListModalWindow and NOT <ListView / <DetailView', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    assert.ok(code.includes('<ListModalWindow'), 'should render ListModalWindow');
    assert.ok(!code.includes('<ListView'), 'should NOT render ListView');
    assert.ok(!code.includes('<DetailView'), 'should NOT render DetailView');
  });

  it('delegates to generateListModalPage (identical output)', () => {
    const contract = listModalContract();
    const viaPage = generatePageComponent('etgoMatchRuleHeader', null, contract);
    const viaDirect = generateListModalPage('etgoMatchRuleHeader', contract);
    assert.equal(viaPage, viaDirect);
  });

  it('emits columns, fields and sections array blocks', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    assert.ok(code.includes('const columns = ['), 'should emit a columns block');
    assert.ok(code.includes('const fields = ['), 'should emit a fields block');
    assert.ok(code.includes('const sections = ['), 'should emit a sections block');
  });

  it('marks an inlineToggle grid field with toggle: true', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const columnsMatch = code.match(/const columns = \[([\s\S]*?)\];/);
    assert.ok(columnsMatch, 'columns block should exist');
    const activeLine = columnsMatch[1].split('\n').find(l => l.includes("key: 'active'"));
    assert.ok(activeLine, 'active column should exist');
    assert.ok(activeLine.includes('toggle: true'), 'inlineToggle field should get toggle: true');
  });

  it('marks an inlineEdit grid field with inlineEdit: true', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const columnsMatch = code.match(/const columns = \[([\s\S]*?)\];/);
    assert.ok(columnsMatch, 'columns block should exist');
    const priorityLine = columnsMatch[1].split('\n').find(l => l.includes("key: 'priority'"));
    assert.ok(priorityLine, 'priority column should exist');
    assert.ok(priorityLine.includes('inlineEdit: true'), 'inlineEdit field should get inlineEdit: true');
  });

  it('carries section: dimensions into the fields block for a dimension field', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    assert.ok(fieldsMatch, 'fields block should exist');
    const projectLine = fieldsMatch[1].split('\n').find(l => l.includes("key: 'project'"));
    assert.ok(projectLine, 'project field should exist');
    assert.ok(projectLine.includes("section: 'dimensions'"), 'project field should keep its dimensions section');
  });

  it('emits config={listModalConfig} prop and a listModalConfig object literal', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    assert.ok(code.includes('config={listModalConfig}'), 'should pass config prop');
    assert.ok(code.includes('const listModalConfig = '), 'should declare listModalConfig');
  });

  it('listModalConfig carries the templateConfig keys', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const cfgMatch = code.match(/const listModalConfig = \{([\s\S]*?)\};/);
    assert.ok(cfgMatch, 'listModalConfig literal should exist');
    const cfg = cfgMatch[1];
    assert.ok(cfg.includes('"titleKey": "matchRuleNewTitle"'), 'should carry titleKey');
    assert.ok(cfg.includes('"editTitleKey": "matchRuleEditTitle"'), 'should carry editTitleKey');
    assert.ok(cfg.includes('"bannerKey": "matchRuleBanner"'), 'should carry bannerKey');
    assert.ok(cfg.includes('"autoPriorityField": "priority"'), 'should carry autoPriorityField');
    assert.ok(cfg.includes('"autoPriorityStep": 10'), 'should carry autoPriorityStep');
  });

  it('resolves declared template sections into the sections block', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const secMatch = code.match(/const sections = \[([\s\S]*?)\];/);
    assert.ok(secMatch, 'sections block should exist');
    assert.ok(secMatch[1].includes("key: 'general'"), 'should include the general section');
    assert.ok(secMatch[1].includes("key: 'dimensions'"), 'should include the dimensions section');
    assert.ok(secMatch[1].includes("label: 'matchRuleSectionDimensions'"), 'dimensions section keeps its label');
  });

  it('declares filters array from searchableFields', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const filtersMatch = code.match(/const filters = \[([\s\S]*?)\];/);
    assert.ok(filtersMatch, 'filters block should exist');
    assert.ok(filtersMatch[1].includes("'name'"));
    assert.ok(filtersMatch[1].includes("'textPattern'"));
  });

  it('passes entity and entityLabel props to ListModalWindow', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    assert.ok(code.includes('entity="etgoMatchRuleHeader"'));
    assert.ok(code.includes('entityLabel="Match Rules"'));
  });

  it('does NOT include form:false fields in the fields (modal) block', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    assert.ok(fieldsMatch, 'fields block should exist');
    // `active` is grid:true but form:false → it is a grid column but not a modal field.
    assert.ok(!fieldsMatch[1].includes("key: 'active'"), 'form:false field should not appear in modal fields');
  });

  it('emits searchSelect: true onto a selector field that opts into the combobox', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    assert.ok(fieldsMatch, 'fields block should exist');
    const faLine = fieldsMatch[1].split('\n').find(l => l.includes("key: 'financialAccount'"));
    assert.ok(faLine, 'financialAccount field should exist');
    assert.ok(faLine.includes('searchSelect: true'), 'searchSelect field should emit searchSelect: true');
  });

  it('does NOT emit searchSelect for a selector field without the flag', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    assert.ok(fieldsMatch, 'fields block should exist');
    const projectLine = fieldsMatch[1].split('\n').find(l => l.includes("key: 'project'"));
    assert.ok(projectLine, 'project field should exist');
    assert.ok(!projectLine.includes('searchSelect'), 'plain selector field must not emit searchSelect');
    assert.ok(!projectLine.includes('allowCreate'), 'plain selector field must not emit allowCreate');
  });

  it('falls back to derived sections when templateConfig has none', () => {
    const contract = listModalContract();
    contract.frontendContract.window.templateConfig.sections = undefined;
    const code = generateListModalPage('etgoMatchRuleHeader', contract);
    const secMatch = code.match(/const sections = \[([\s\S]*?)\];/);
    assert.ok(secMatch, 'sections block should exist');
    // Derived from the order in which sections first appear on form fields.
    assert.ok(secMatch[1].includes("key: 'general'"));
    assert.ok(secMatch[1].includes("key: 'dimensions'"));
  });
});

// ---------------------------------------------------------------------------
// generatePageComponent — cell-renderer registry + toolbar filters
//
// Restyled list-modal layout: grid columns carry a `cellType` plus its inputs
// (subField, kindField/patternField, kindLabels, tones), and the templateConfig
// carries a back label + a declarative `toolbarFilters` array. The generator
// must emit these verbatim into the column literals and listModalConfig.
// ---------------------------------------------------------------------------

describe('generatePageComponent — cell-renderer registry columns', () => {
  function columnsBlock() {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const m = code.match(/const columns = \[([\s\S]*?)\];/);
    assert.ok(m, 'columns block should exist');
    return m[1];
  }

  it("emits cellType + subField for a nameWithSubline column", () => {
    const line = columnsBlock().split('\n').find(l => l.includes("key: 'name'"));
    assert.ok(line, 'name column should exist');
    assert.ok(line.includes("cellType: 'nameWithSubline'"), 'name column should carry cellType');
    assert.ok(line.includes("subField: 'businessPartner'"), 'name column should carry subField');
  });

  it("emits cellType: 'priorityPill' for the priority column", () => {
    const line = columnsBlock().split('\n').find(l => l.includes("key: 'priority'"));
    assert.ok(line, 'priority column should exist');
    assert.ok(line.includes("cellType: 'priorityPill'"), 'priority column should carry cellType');
  });

  it('emits cellType + kindField/patternField + kindLabels for a conditionChip column', () => {
    const line = columnsBlock().split('\n').find(l => l.includes("key: 'condition'"));
    assert.ok(line, 'condition column should exist');
    assert.ok(line.includes("cellType: 'conditionChip'"), 'should carry cellType conditionChip');
    assert.ok(line.includes("kindField: 'matchKind'"), 'should carry kindField');
    assert.ok(line.includes("patternField: 'textPattern'"), 'should carry patternField');
    assert.ok(line.includes('kindLabels:'), 'should carry kindLabels');
    assert.ok(line.includes('"C":"matchKindContains"') || line.includes('"C": "matchKindContains"'),
      'kindLabels should map C → matchKindContains');
  });

  it('emits cellType: typePill + tones for a typePill column', () => {
    const line = columnsBlock().split('\n').find(l => l.includes("key: 'matchType'"));
    assert.ok(line, 'matchType column should exist');
    assert.ok(line.includes("cellType: 'typePill'"), 'should carry cellType typePill');
    assert.ok(line.includes('tones:'), 'should carry tones');
    assert.ok(line.includes('"A":"green"') || line.includes('"A": "green"'),
      'tones should map A → green');
  });
});

describe('generatePageComponent — listModalConfig toolbar back + filters', () => {
  function cfgBlock() {
    const code = generatePageComponent('etgoMatchRuleHeader', null, listModalContract());
    const m = code.match(/const listModalConfig = \{([\s\S]*?)\};/);
    assert.ok(m, 'listModalConfig literal should exist');
    return m[1];
  }

  it('carries backLabelKey', () => {
    assert.ok(cfgBlock().includes('"backLabelKey": "matchRuleBack"'), 'should carry backLabelKey');
  });

  it('carries a toolbarFilters array with the declared filter', () => {
    const cfg = cfgBlock();
    assert.ok(cfg.includes('"toolbarFilters"'), 'should carry toolbarFilters');
    assert.ok(cfg.includes('"key": "status"'), 'filter should carry its key');
    assert.ok(cfg.includes('"field": "matchType"'), 'filter should carry its field');
    assert.ok(cfg.includes('"allLabelKey": "matchRuleAllTypes"'), 'filter should carry allLabelKey');
    assert.ok(cfg.includes('"value": "A"'), 'filter options should carry value A');
    assert.ok(cfg.includes('"labelKey": "matchRuleTypeAuto"'), 'filter options should carry labelKey');
  });
});

// ---------------------------------------------------------------------------
// generateAll — list-modal omits Table/Form, default layout keeps them
// ---------------------------------------------------------------------------

describe('generateAll — list-modal file emission', () => {
  it('does NOT emit a header Table.jsx or Form.jsx for a list-modal window', () => {
    const files = generateAll(listModalContract());
    const names = Object.keys(files);
    assert.ok(!names.includes('EtgoMatchRuleHeaderTable.jsx'), 'should not emit a Table for list-modal');
    assert.ok(!names.includes('EtgoMatchRuleHeaderForm.jsx'), 'should not emit a Form for list-modal');
    assert.ok(!names.some(n => n.endsWith('Table.jsx')), 'list-modal should emit no Table files at all');
    assert.ok(!names.some(n => n.endsWith('Form.jsx')), 'list-modal should emit no Form files at all');
  });

  it('emits only Page, index.jsx and mockCatalogs.js for a list-modal window', () => {
    const files = generateAll(listModalContract());
    const names = Object.keys(files).sort();
    assert.deepStrictEqual(names, ['EtgoMatchRuleHeaderPage.jsx', 'index.jsx', 'mockCatalogs.js']);
  });

  it('the list-modal Page file imports ListModalWindow', () => {
    const files = generateAll(listModalContract());
    const page = files['EtgoMatchRuleHeaderPage.jsx'];
    assert.ok(page.includes("import { ListModalWindow } from '@/components/contract-ui'"));
  });

  it('STILL emits Table + Form for a default-layout window (regression guard)', () => {
    const files = generateAll(defaultLayoutContract());
    const names = Object.keys(files);
    assert.ok(names.includes('OrderTable.jsx'), 'default layout must keep header Table');
    assert.ok(names.includes('OrderForm.jsx'), 'default layout must keep header Form');
    assert.ok(names.includes('OrderLineTable.jsx'), 'default layout must keep detail Table');
    assert.ok(names.includes('OrderLineForm.jsx'), 'default layout must keep detail Form');
    assert.ok(names.includes('OrderPage.jsx'));
  });
});

// ---------------------------------------------------------------------------
// buildInlineCreatePart — unit tests for the exported helper
// ---------------------------------------------------------------------------
describe('buildInlineCreatePart', () => {
  it('returns empty string when allowCreate is falsy', () => {
    assert.equal(buildInlineCreatePart({}), '');
    assert.equal(buildInlineCreatePart({ allowCreate: false }), '');
    assert.equal(buildInlineCreatePart({ allowCreate: null }), '');
  });

  it('returns empty string when allowCreate is true but no create keys are set', () => {
    assert.equal(buildInlineCreatePart({ allowCreate: true }), '');
  });

  it('emits createLabelKey when present', () => {
    const out = buildInlineCreatePart({ allowCreate: true, createLabelKey: 'addTransactionType' });
    assert.ok(out.includes(", createLabelKey: 'addTransactionType'"), `got: ${out}`);
  });

  it('emits createTitleKey when present', () => {
    const out = buildInlineCreatePart({ allowCreate: true, createTitleKey: 'newTransactionType' });
    assert.ok(out.includes(", createTitleKey: 'newTransactionType'"), `got: ${out}`);
  });

  it('emits createNamePlaceholderKey when present', () => {
    const out = buildInlineCreatePart({ allowCreate: true, createNamePlaceholderKey: 'typeNamePh' });
    assert.ok(out.includes(", createNamePlaceholderKey: 'typeNamePh'"), `got: ${out}`);
  });

  it('emits createSpec when present', () => {
    const out = buildInlineCreatePart({ allowCreate: true, createSpec: 'transaction-type' });
    assert.ok(out.includes(", createSpec: 'transaction-type'"), `got: ${out}`);
  });

  it('emits createEntity when present', () => {
    const out = buildInlineCreatePart({ allowCreate: true, createEntity: 'EtgoTransactionType' });
    assert.ok(out.includes(", createEntity: 'EtgoTransactionType'"), `got: ${out}`);
  });

  it('escapes single quotes in string values', () => {
    const out = buildInlineCreatePart({ allowCreate: true, createLabelKey: "it's" });
    assert.ok(out.includes("createLabelKey: 'it\\'s'"), `got: ${out}`);
  });

  it('emits all five create keys when all are provided', () => {
    const f = {
      allowCreate: true,
      createLabelKey: 'addType',
      createTitleKey: 'newType',
      createNamePlaceholderKey: 'typePh',
      createSpec: 'transaction-type',
      createEntity: 'EtgoTransactionType',
    };
    const out = buildInlineCreatePart(f);
    assert.ok(out.includes("createLabelKey: 'addType'"));
    assert.ok(out.includes("createTitleKey: 'newType'"));
    assert.ok(out.includes("createNamePlaceholderKey: 'typePh'"));
    assert.ok(out.includes("createSpec: 'transaction-type'"));
    assert.ok(out.includes("createEntity: 'EtgoTransactionType'"));
  });
});

// ---------------------------------------------------------------------------
// list-modal field line — allowCreate + inline-create props + placeholderKey
// ---------------------------------------------------------------------------
describe('generatePageComponent — allowCreate and placeholderKey in field lines', () => {
  function contractWithAllowCreate() {
    const base = listModalContract();
    // Add a field with allowCreate + full inline-create config
    base.frontendContract.entities.etgoMatchRuleHeader.fields.push({
      name: 'transactionType',
      column: 'ETGO_Transaction_Type_ID',
      type: 'foreignKey',
      tsType: 'string',
      visibility: 'editable',
      required: false,
      grid: false,
      form: true,
      section: 'general',
      reference: 'EtgoTransactionType',
      inputMode: 'selector',
      searchSelect: true,
      allowCreate: true,
      createLabelKey: 'addTransactionType',
      createSpec: 'transaction-type',
      createEntity: 'EtgoTransactionType',
      placeholderKey: 'selectTransactionType',
    });
    return base;
  }

  it('emits allowCreate: true on a field that opts in', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, contractWithAllowCreate());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    assert.ok(fieldsMatch, 'fields block should exist');
    const ttLine = fieldsMatch[1].split('\n').find(l => l.includes("key: 'transactionType'"));
    assert.ok(ttLine, 'transactionType field should exist');
    assert.ok(ttLine.includes('allowCreate: true'), `allowCreate missing — got: ${ttLine}`);
  });

  it('emits createLabelKey on an allowCreate field', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, contractWithAllowCreate());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    const ttLine = fieldsMatch[1].split('\n').find(l => l.includes("key: 'transactionType'"));
    assert.ok(ttLine.includes("createLabelKey: 'addTransactionType'"), `got: ${ttLine}`);
  });

  it('emits createSpec on an allowCreate field', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, contractWithAllowCreate());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    const ttLine = fieldsMatch[1].split('\n').find(l => l.includes("key: 'transactionType'"));
    assert.ok(ttLine.includes("createSpec: 'transaction-type'"), `got: ${ttLine}`);
  });

  it('emits placeholderKey on a field that declares it', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, contractWithAllowCreate());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    const ttLine = fieldsMatch[1].split('\n').find(l => l.includes("key: 'transactionType'"));
    assert.ok(ttLine.includes("placeholderKey: 'selectTransactionType'"), `got: ${ttLine}`);
  });

  it('does NOT emit placeholderKey on fields that lack it', () => {
    const code = generatePageComponent('etgoMatchRuleHeader', null, contractWithAllowCreate());
    const fieldsMatch = code.match(/const fields = \[([\s\S]*?)\];/);
    const nameLine = fieldsMatch[1].split('\n').find(l => l.includes("key: 'name'"));
    assert.ok(nameLine, 'name field should exist');
    assert.ok(!nameLine.includes('placeholderKey'), `name should not have placeholderKey — got: ${nameLine}`);
  });
});
