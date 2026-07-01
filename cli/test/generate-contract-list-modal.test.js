import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateFrontendContract } from '../src/generate-contract.js';

// ---------------------------------------------------------------------------
// Curated schema for a list-modal window. Two grid fields carry the inline
// affordances (`inlineToggle` / `inlineEdit`) so we can assert applyGridHints
// maps them into the frontend contract field. The window declares
// layoutType "list-modal" with a templateConfig.
// ---------------------------------------------------------------------------

const listModalSchema = {
  version: '0.1.0',
  window: {
    id: '700',
    name: 'Match Rules',
    primaryEntity: 'etgoMatchRuleHeader',
    category: 'financial',
    layoutType: 'list-modal',
    templateConfig: {
      titleKey: 'matchRuleNewTitle',
      bannerKey: 'matchRuleBanner',
      autoPriorityField: 'priority',
      autoPriorityStep: 10,
      sections: [{ key: 'general' }, { key: 'dimensions', label: 'matchRuleSectionDimensions' }],
    },
  },
  entities: [{
    name: 'etgoMatchRuleHeader',
    table: 'ETGO_SF_Match_Rule',
    level: 'header',
    fields: [
      { name: 'active', column: 'IsActive', type: 'boolean', visibility: 'editable',
        required: false, searchable: false, grid: true, form: false, inlineToggle: true },
      { name: 'priority', column: 'Priority', type: 'integer', visibility: 'editable',
        required: false, searchable: false, grid: true, form: true, inlineEdit: true },
      { name: 'name', column: 'Name', type: 'string', visibility: 'editable',
        required: true, searchable: true, grid: true, form: true },
      // FK selector field opting into the searchable combobox via searchSelect.
      { name: 'financialAccount', column: 'Fin_Financial_Account_ID', type: 'foreignKey',
        visibility: 'editable', required: false, searchable: false, grid: false, form: true,
        reference: 'FinancialAccount', inputMode: 'selector', searchSelect: true },
      // FK selector field opting into the (future) inline-create affordance.
      { name: 'businessPartner', column: 'C_BPartner_ID', type: 'foreignKey',
        visibility: 'editable', required: false, searchable: false, grid: false, form: true,
        reference: 'BusinessPartner', inputMode: 'selector', searchSelect: true, allowCreate: true },
      // Plain FK selector WITHOUT either flag — must not gain a searchSelect key.
      { name: 'project', column: 'C_Project_ID', type: 'foreignKey',
        visibility: 'editable', required: false, searchable: false, grid: false, form: true,
        reference: 'Project', inputMode: 'selector' },
    ],
  }],
};

describe('generateFrontendContract — applyGridHints (inline affordances)', () => {
  it('carries inlineToggle: true from a curated field into the mapped field', () => {
    const fc = generateFrontendContract(listModalSchema);
    const active = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'active');
    assert.ok(active, 'active field should be present');
    assert.equal(active.inlineToggle, true, 'inlineToggle should be carried into the contract');
  });

  it('carries inlineEdit: true from a curated field into the mapped field', () => {
    const fc = generateFrontendContract(listModalSchema);
    const priority = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'priority');
    assert.ok(priority, 'priority field should be present');
    assert.equal(priority.inlineEdit, true, 'inlineEdit should be carried into the contract');
  });

  it('does NOT add inlineToggle / inlineEdit to fields that lack them', () => {
    const fc = generateFrontendContract(listModalSchema);
    const name = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'name');
    assert.equal(name.inlineToggle, undefined, 'plain field should not have inlineToggle');
    assert.equal(name.inlineEdit, undefined, 'plain field should not have inlineEdit');
  });
});

describe('generateFrontendContract — searchSelect / allowCreate opt-in flags', () => {
  it('carries searchSelect: true from a curated FK selector field into the mapped field', () => {
    const fc = generateFrontendContract(listModalSchema);
    const financialAccount = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'financialAccount');
    assert.ok(financialAccount, 'financialAccount field should be present');
    assert.equal(financialAccount.searchSelect, true, 'searchSelect should be carried into the contract');
  });

  it('carries allowCreate: true from a curated FK selector field into the mapped field', () => {
    const fc = generateFrontendContract(listModalSchema);
    const businessPartner = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'businessPartner');
    assert.ok(businessPartner, 'businessPartner field should be present');
    assert.equal(businessPartner.allowCreate, true, 'allowCreate should be carried into the contract');
  });

  it('does NOT add a searchSelect key to a plain selector field that lacks the flag', () => {
    const fc = generateFrontendContract(listModalSchema);
    const project = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'project');
    assert.ok(project, 'project field should be present');
    assert.equal(project.searchSelect, undefined, 'plain selector field should not have searchSelect');
    assert.equal(project.allowCreate, undefined, 'plain selector field should not have allowCreate');
  });

  it('does NOT confuse searchSelect with the pre-existing searchable filter flag', () => {
    const fc = generateFrontendContract(listModalSchema);
    // `name` is searchable:true (a list-API filter) but NOT a searchSelect combobox.
    const name = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'name');
    assert.equal(name.searchSelect, undefined, 'searchable filter field must not gain searchSelect');
  });
});

describe('generateFrontendContract — templateConfig on list-modal window', () => {
  it('includes templateConfig on the window when layoutType is list-modal', () => {
    const fc = generateFrontendContract(listModalSchema);
    assert.equal(fc.window.layoutType, 'list-modal');
    assert.ok(fc.window.templateConfig, 'templateConfig should be present for list-modal');
    assert.equal(fc.window.templateConfig.titleKey, 'matchRuleNewTitle');
    assert.equal(fc.window.templateConfig.autoPriorityField, 'priority');
    assert.equal(fc.window.templateConfig.autoPriorityStep, 10);
  });

  it('templateConfig is null when not declared on a list-modal window', () => {
    const schema = {
      ...listModalSchema,
      window: { ...listModalSchema.window, templateConfig: undefined },
    };
    const fc = generateFrontendContract(schema);
    assert.equal(fc.window.layoutType, 'list-modal');
    assert.ok('templateConfig' in fc.window, 'list-modal window should always carry the templateConfig key');
    assert.equal(fc.window.templateConfig, null);
  });

  it('does NOT attach templateConfig on a default-layout window', () => {
    const schema = {
      ...listModalSchema,
      window: { ...listModalSchema.window, layoutType: undefined, templateConfig: undefined },
    };
    const fc = generateFrontendContract(schema);
    assert.equal(fc.window.layoutType, 'default');
    assert.equal(fc.window.templateConfig, undefined, 'default layout should not carry templateConfig');
  });
});

describe('generateFrontendContract — inline-create create keys', () => {
  function schemaWithInlineCreate() {
    return {
      ...listModalSchema,
      entities: [{
        ...listModalSchema.entities[0],
        fields: [
          ...listModalSchema.entities[0].fields,
          {
            name: 'transactionType',
            column: 'ETGO_Transaction_Type_ID',
            type: 'foreignKey',
            visibility: 'editable',
            required: false,
            searchable: false,
            grid: false,
            form: true,
            reference: 'EtgoTransactionType',
            inputMode: 'selector',
            searchSelect: true,
            allowCreate: true,
            createLabelKey: 'addTransactionType',
            createTitleKey: 'newTransactionType',
            createNamePlaceholderKey: 'typeNamePh',
            createSpec: 'transaction-type',
            createEntity: 'EtgoTransactionType',
          },
        ],
      }],
    };
  }

  it('carries createLabelKey into the mapped field', () => {
    const fc = generateFrontendContract(schemaWithInlineCreate());
    const f = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'transactionType');
    assert.equal(f.createLabelKey, 'addTransactionType');
  });

  it('carries createTitleKey into the mapped field', () => {
    const fc = generateFrontendContract(schemaWithInlineCreate());
    const f = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'transactionType');
    assert.equal(f.createTitleKey, 'newTransactionType');
  });

  it('carries createNamePlaceholderKey into the mapped field', () => {
    const fc = generateFrontendContract(schemaWithInlineCreate());
    const f = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'transactionType');
    assert.equal(f.createNamePlaceholderKey, 'typeNamePh');
  });

  it('carries createSpec into the mapped field', () => {
    const fc = generateFrontendContract(schemaWithInlineCreate());
    const f = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'transactionType');
    assert.equal(f.createSpec, 'transaction-type');
  });

  it('carries createEntity into the mapped field', () => {
    const fc = generateFrontendContract(schemaWithInlineCreate());
    const f = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'transactionType');
    assert.equal(f.createEntity, 'EtgoTransactionType');
  });

  it('does NOT emit create keys on a field that lacks them', () => {
    const fc = generateFrontendContract(schemaWithInlineCreate());
    const name = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'name');
    assert.equal(name.createLabelKey, undefined);
    assert.equal(name.createSpec, undefined);
    assert.equal(name.createEntity, undefined);
  });
});

describe('generateFrontendContract — displayLogicJs standalone path', () => {
  function schemaWithDisplayLogicJs() {
    return {
      ...listModalSchema,
      entities: [{
        ...listModalSchema.entities[0],
        fields: [
          ...listModalSchema.entities[0].fields,
          {
            name: 'conditionalField',
            column: 'ConditionalField',
            type: 'string',
            visibility: 'editable',
            required: false,
            searchable: false,
            grid: false,
            form: true,
            displayLogicJs: "row.status === 'A'",
          },
        ],
      }],
    };
  }

  it('sets displayLogic.js from displayLogicJs when no raw displayLogic exists', () => {
    const fc = generateFrontendContract(schemaWithDisplayLogicJs());
    const f = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'conditionalField');
    assert.ok(f.displayLogic, 'displayLogic should be set');
    assert.equal(f.displayLogic.js, "row.status === 'A'");
    assert.equal(f.displayLogic.evaluable, true);
  });

  it('does NOT add displayLogic to fields that lack displayLogicJs', () => {
    const fc = generateFrontendContract(schemaWithDisplayLogicJs());
    const name = fc.entities.etgoMatchRuleHeader.fields.find(f => f.name === 'name');
    assert.equal(name.displayLogic, undefined);
  });
});
