import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  classifyField,
  inferDerivation,
  buildSchema,
  buildReference,
  parseValidationRule,
} from '../src/extract-fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const systemColumns = JSON.parse(
  await readFile(join(ROOT, 'core-maps', 'system-columns.json'), 'utf-8')
);
const refMap = JSON.parse(
  await readFile(join(ROOT, 'core-maps', 'ad-reference-map.json'), 'utf-8')
);

function makeRow(overrides = {}) {
  return {
    ad_window_id: '100',
    window_name: 'Sales Order',
    ad_tab_id: '200',
    tab_name: 'Order',
    tablevel: 0,
    tab_seq: 10,
    tablename: 'C_Order',
    entity_classname: null,
    entity_alias: null,
    entity_javapackage: null,
    ad_field_id: '300',
    field_name: 'Test Field',
    field_isactive: 'Y',
    isdisplayed: 'Y',
    isreadonly: 'N',
    isshowninstatusbar: 'N',
    displaylogic: null,
    displaylogic_server: null,
    displaylogicgrid: null,
    readonlylogic: null,
    field_seq: 10,
    columnname: 'TestColumn',
    obdal_name: 'TestColumn',
    ad_reference_id: 10,
    ismandatory: 'N',
    isupdateable: 'Y',
    defaultvalue: null,
    fieldlength: 60,
    valuemin: null,
    valuemax: null,
    ad_val_rule_id: null,
    val_rule_name: null,
    val_rule_code: null,
    ad_reference_value_id: null,
    reference_name: 'String',
    callout_class: null,
    ref_table_target: null,
    ref_table_display: null,
    ref_table_key: null,
    ref_table_filter: null,
    ref_table_orderby: null,
    ref_search_target: null,
    ref_search_column: null,
    ref_selector_name: null,
    ref_selector_target: null,
    ref_selector_filter: null,
    ref_selector_hql: null,
    onchangefunction: null,
    isidentifier: 'N',
    isselectioncolumn: 'N',
    isfilterable: 'N',
    precision: null,
    istranslated: 'N',
    help_text: null,
    field_group_name: null,
    ui_pattern: null,
    whereclause: null,
    orderbyclause: null,
    filterclause: null,
    hqlwhereclause: null,
    hqlorderbyclause: null,
    hqlfiltclause: null,
    column_module_id: null,
    table_module_id: null,
    ad_process_id: null,
    em_obuiapp_process_id: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyField — edge cases not in main test
// ---------------------------------------------------------------------------

describe('classifyField — additional cases', () => {
  it('classifies inactive field (field_isactive=N) as discarded', () => {
    const row = makeRow({ field_isactive: 'N', columnname: 'SomeField' });
    const result = classifyField(row, systemColumns);
    assert.equal(result.visibility, 'discarded');
  });

  it('classifies non-updateable field as readOnly', () => {
    const row = makeRow({ columnname: 'LockedField', isupdateable: 'N' });
    const result = classifyField(row, systemColumns);
    assert.equal(result.visibility, 'readOnly');
  });

  it('classifies hidden + shown in status bar as readOnly (not system)', () => {
    const row = makeRow({ columnname: 'StatusField', isdisplayed: 'N', isshowninstatusbar: 'Y' });
    const result = classifyField(row, systemColumns);
    assert.equal(result.visibility, 'readOnly');
  });

  it('classifies hidden field ending in _ID as system/internal', () => {
    const row = makeRow({ columnname: 'Custom_ID', isdisplayed: 'N' });
    const result = classifyField(row, systemColumns);
    assert.equal(result.visibility, 'system');
    assert.equal(result.systemCategory, 'internal');
  });

  it('classifies hidden field starting with Is as system/internal', () => {
    const row = makeRow({ columnname: 'IsProcessed', isdisplayed: 'N' });
    const result = classifyField(row, systemColumns);
    assert.equal(result.visibility, 'system');
    assert.equal(result.systemCategory, 'internal');
  });

  it('classifies hidden field with no special pattern as system without category', () => {
    const row = makeRow({ columnname: 'SomeHidden', isdisplayed: 'N' });
    const result = classifyField(row, systemColumns);
    assert.equal(result.visibility, 'system');
    assert.equal(result.systemCategory, undefined);
  });

  it('priority: inactive beats primary key', () => {
    const row = makeRow({ columnname: 'C_Order_ID', tablename: 'C_Order', field_isactive: 'N' });
    const result = classifyField(row, systemColumns);
    assert.equal(result.visibility, 'discarded');
  });

  it('priority: primary key beats system column', () => {
    // AD_Org_ID is a known system column, but if table were AD_Org, it would be the PK
    const row = makeRow({ columnname: 'AD_Org_ID', tablename: 'AD_Org' });
    const result = classifyField(row, systemColumns);
    assert.equal(result.visibility, 'system');
    assert.equal(result.systemCategory, 'internal');
    assert.deepEqual(result.derivation, { type: 'sequence' });
  });
});

// ---------------------------------------------------------------------------
// inferDerivation — additional cases
// ---------------------------------------------------------------------------

describe('inferDerivation — additional cases', () => {
  it('parses @SQL= with complex query', () => {
    const sql = '@SQL=SELECT COALESCE(MAX(Line),0)+10 FROM C_OrderLine WHERE C_Order_ID=@C_Order_ID@';
    const result = inferDerivation(sql);
    assert.equal(result.type, 'lookup');
    assert.ok(result.source.includes('COALESCE'));
  });

  it('parses @varName@ with underscore as fromConfig', () => {
    const result = inferDerivation('@M_Warehouse_ID@');
    assert.equal(result.type, 'fromConfig');
    assert.equal(result.source, 'context.mWarehouseId');
  });

  it('parses Y/N plain values as computed', () => {
    assert.deepEqual(inferDerivation('Y'), { type: 'computed', source: 'Y' });
    assert.deepEqual(inferDerivation('N'), { type: 'computed', source: 'N' });
  });
});

// ---------------------------------------------------------------------------
// buildReference — additional cases
// ---------------------------------------------------------------------------

describe('buildReference — additional cases', () => {
  it('returns known FK reference for CreatedBy', () => {
    const row = makeRow({ columnname: 'CreatedBy', reference_name: 'TableDir' });
    const ref = buildReference(row);
    assert.ok(ref, 'should return a reference for CreatedBy');
    assert.equal(ref.targetTable, 'AD_User');
    assert.equal(ref.keyColumn, 'AD_User_ID');
    assert.equal(ref.displayColumn, 'Name');
  });

  it('returns known FK reference for UpdatedBy', () => {
    const row = makeRow({ columnname: 'UpdatedBy', reference_name: 'TableDir' });
    const ref = buildReference(row);
    assert.ok(ref);
    assert.equal(ref.targetTable, 'AD_User');
  });

  it('uses ref_table_orderby when present', () => {
    const row = makeRow({
      columnname: 'M_Product_ID',
      reference_name: 'Table',
      ref_table_target: 'M_Product',
      ref_table_key: 'M_Product_ID',
      ref_table_display: 'Name',
      ref_table_orderby: 'Name ASC',
    });
    const ref = buildReference(row);
    assert.equal(ref.orderBy, 'Name ASC');
  });

  it('includes selector HQL when present', () => {
    const row = makeRow({
      columnname: 'M_Product_ID',
      ref_selector_target: 'M_Product',
      ref_selector_name: 'Product Selector',
      ref_selector_hql: "e.productCategory.id = :catId",
    });
    const ref = buildReference(row);
    assert.equal(ref.type, 'Selector');
    assert.equal(ref.hql, "e.productCategory.id = :catId");
  });
});

// ---------------------------------------------------------------------------
// parseValidationRule — edge cases
// ---------------------------------------------------------------------------

describe('parseValidationRule — additional cases', () => {
  it('returns empty arrays when code has no variables', () => {
    const result = parseValidationRule("IsActive='Y'");
    assert.deepEqual(result.contextParams, []);
    assert.deepEqual(result.cascadeParams, []);
    assert.equal(result.code, "IsActive='Y'");
  });

  it('skips @SQL as a cascade param', () => {
    const result = parseValidationRule("@SQL=SELECT 1 WHERE @AD_Org_ID@=e.org");
    assert.ok(!result.cascadeParams.includes('SQL'));
    assert.ok(result.cascadeParams.includes('AD_Org_ID'));
  });

  it('handles multiple context params', () => {
    const result = parseValidationRule("AD_Client_ID IN (@#AD_Client_ID@) AND AD_Org_ID IN (@#User_Org@)");
    assert.ok(result.contextParams.includes('AD_Client_ID'));
    assert.ok(result.contextParams.includes('User_Org'));
    assert.equal(result.cascadeParams.length, 0);
  });
});

// ---------------------------------------------------------------------------
// buildSchema — additional cases
// ---------------------------------------------------------------------------

describe('buildSchema — additional cases', () => {
  it('attaches enum values for list-type fields', () => {
    const enumValuesMap = {
      '350': [
        { value: 'DR', name: 'Draft' },
        { value: 'CO', name: 'Completed' },
      ],
    };
    const rows = [
      makeRow({
        columnname: 'DocStatus',
        field_name: 'Document Status',
        ad_reference_id: 17,
        reference_name: 'List',
        ad_reference_value_id: '350',
      }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap, enumValuesMap);
    const field = schema.entities[0].fields.find((f) => f.columnName === 'DocStatus');
    assert.ok(field.enumValues, 'should have enumValues');
    assert.equal(field.enumValues.length, 2);
    assert.equal(field.enumValues[0].value, 'DR');
  });

  it('deduplicates fields with same camelCase name', () => {
    const rows = [
      makeRow({ columnname: 'TestColumn', obdal_name: 'TestColumn', field_seq: 10 }),
      makeRow({ columnname: 'TestColumn', obdal_name: 'TestColumn', field_seq: 20, ad_field_id: '301' }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap);
    const names = schema.entities[0].fields.map((f) => f.name);
    // Second field should get a numeric suffix
    assert.ok(names.includes('testColumn'));
    assert.ok(names.includes('testColumn2'));
  });

  it('attaches callout class when present', () => {
    const rows = [
      makeRow({ columnname: 'QtyOrdered', callout_class: 'com.example.QtyCallout' }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap);
    const field = schema.entities[0].fields.find((f) => f.columnName === 'QtyOrdered');
    assert.equal(field.callout, 'com.example.QtyCallout');
  });

  it('attaches field metadata (isIdentifier, isSelectionColumn, help, fieldGroup)', () => {
    const rows = [
      makeRow({
        columnname: 'DocumentNo',
        isidentifier: 'Y',
        isselectioncolumn: 'Y',
        isfilterable: 'Y',
        help_text: 'Unique document number',
        field_group_name: 'Main Info',
      }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap);
    const field = schema.entities[0].fields.find((f) => f.columnName === 'DocumentNo');
    assert.equal(field.isIdentifier, true);
    assert.equal(field.isSelectionColumn, true);
    assert.equal(field.isFilterable, true);
    assert.equal(field.help, 'Unique document number');
    assert.equal(field.fieldGroup, 'Main Info');
  });

  it('attaches displayLogic and readOnlyLogic when present', () => {
    const rows = [
      makeRow({
        columnname: 'Discount',
        displaylogic: "@IsSOTrx@='Y'",
        readonlylogic: "@DocStatus@='CO'",
      }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap);
    const field = schema.entities[0].fields.find((f) => f.columnName === 'Discount');
    assert.equal(field.displayLogic, "@IsSOTrx@='Y'");
    assert.equal(field.readOnlyLogic, "@DocStatus@='CO'");
  });

  it('assigns processId for button fields with OBUIAPP process', () => {
    const rows = [
      makeRow({
        columnname: 'DocAction',
        ad_reference_id: 28,
        reference_name: 'Button',
        em_obuiapp_process_id: 'PROC001',
        ad_process_id: 'PROC_CLASSIC',
      }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap);
    const field = schema.entities[0].fields.find((f) => f.columnName === 'DocAction');
    // OBUIAPP takes priority over classic
    assert.equal(field.processId, 'PROC001');
    assert.equal(field.processType, 'obuiapp');
  });

  it('assigns classic processId when no OBUIAPP process', () => {
    const rows = [
      makeRow({
        columnname: 'Posted',
        ad_reference_id: 28,
        reference_name: 'Button',
        em_obuiapp_process_id: null,
        ad_process_id: 'PROC_CLASSIC_002',
      }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap);
    const field = schema.entities[0].fields.find((f) => f.columnName === 'Posted');
    assert.equal(field.processId, 'PROC_CLASSIC_002');
    assert.equal(field.processType, 'classic');
  });

  it('infers window category from name keywords', () => {
    const salesRows = [makeRow({ window_name: 'Sales Order' })];
    assert.equal(buildSchema(salesRows, systemColumns, refMap).window.category, 'sales');

    const purchaseRows = [makeRow({ window_name: 'Purchase Invoice' })];
    assert.equal(buildSchema(purchaseRows, systemColumns, refMap).window.category, 'purchasing');

    const inventoryRows = [makeRow({ window_name: 'Inventory Count' })];
    assert.equal(buildSchema(inventoryRows, systemColumns, refMap).window.category, 'inventory');

    const generalRows = [makeRow({ window_name: 'Custom Window' })];
    assert.equal(buildSchema(generalRows, systemColumns, refMap).window.category, 'general');
  });

  it('attaches tab clauses when present', () => {
    const rows = [
      makeRow({
        whereclause: "IsActive='Y'",
        orderbyclause: 'Name ASC',
      }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap);
    assert.equal(schema.entities[0].whereClause, "IsActive='Y'");
    assert.equal(schema.entities[0].orderByClause, 'Name ASC');
  });

  it('sets subline level for tabLevel > 1', () => {
    const rows = [
      makeRow({ tablevel: 2, tab_seq: 30, tab_name: 'Tax', ad_tab_id: '210' }),
    ];
    const schema = buildSchema(rows, systemColumns, refMap);
    assert.equal(schema.entities[0].level, 'subline');
  });
});
