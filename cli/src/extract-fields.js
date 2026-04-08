import { createReadStream } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDbPool, closePool } from './db.js';
import { toCamelCase, toPropertyName, computeChecksum, generateVersion } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

/**
 * Load a JSON file from the core-maps directory.
 */
async function loadCoreMap(filename) {
  const raw = await readFile(join(ROOT, 'core-maps', filename), 'utf-8');
  return JSON.parse(raw);
}

/**
 * Priority-based classification of a field row (TDD 3.1).
 *
 * Priority order:
 * 1. Primary key (columnName === tableName + '_ID')
 * 2. Known system column (present in systemColumns map)
 * 3. Audit columns (Created/CreatedBy/Updated/UpdatedBy)
 * 4. Not displayed (isDisplayed === 'N')
 * 5. Read-only or not updateable
 * 6. Everything else → editable
 */
export function classifyField(fieldRow, systemColumns) {
  const { columnname, tablename, isdisplayed, isreadonly, isupdateable, defaultvalue, field_isactive, isshowninstatusbar } = fieldRow;

  // 0. Inactive field → discarded
  if (field_isactive === 'N') {
    return {
      visibility: 'discarded',
    };
  }

  // 1. Primary key
  if (columnname === tablename + '_ID') {
    return {
      visibility: 'system',
      systemCategory: 'internal',
      derivation: { type: 'sequence' },
    };
  }

  // 2. Known system column
  if (systemColumns[columnname]) {
    const entry = systemColumns[columnname];
    return {
      visibility: 'system',
      systemCategory: entry.systemCategory,
      derivation: entry.derivation ?? inferDerivation(defaultvalue),
    };
  }

  // 3. Audit columns
  const auditColumns = ['Created', 'CreatedBy', 'Updated', 'UpdatedBy'];
  if (auditColumns.includes(columnname)) {
    return {
      visibility: 'system',
      systemCategory: 'audit',
    };
  }

  // 4. Not displayed (but shown in status bar → readOnly, not system)
  if (isdisplayed === 'N') {
    if (fieldRow.isshowninstatusbar === 'Y') {
      return { visibility: 'readOnly' };
    }
    return {
      visibility: 'system',
      ...(inferCategoryFromColumn(columnname) && {
        systemCategory: inferCategoryFromColumn(columnname),
      }),
    };
  }

  // 5. Read-only or not updateable
  if (isreadonly === 'Y' || isupdateable === 'N') {
    return {
      visibility: 'readOnly',
    };
  }

  // 6. Default: editable
  return {
    visibility: 'editable',
  };
}

/**
 * Attempt to infer a system category from a column name for hidden fields.
 */
function inferCategoryFromColumn(columnName) {
  if (columnName.endsWith('_ID')) return 'internal';
  if (/^(Is|Has)/.test(columnName)) return 'internal';
  return null;
}

/**
 * Parse Etendo default values into derivation objects.
 *
 * - null → null
 * - @VAR@ pattern → { type: 'fromConfig', source: 'context.varName' }
 * - @SQL=... → { type: 'lookup', source: sqlString }
 * - Other → { type: 'computed', source: defaultValue }
 */
export function inferDerivation(defaultValue) {
  if (defaultValue == null) return null;

  // @SQL=... pattern
  if (defaultValue.startsWith('@SQL=')) {
    return {
      type: 'lookup',
      source: defaultValue.slice(5),
    };
  }

  // @VAR@ pattern — match the full string being a single @...@ token
  const varMatch = defaultValue.match(/^@([A-Za-z_][A-Za-z0-9_]*)@$/);
  if (varMatch) {
    const varName = toCamelCase(varMatch[1]);
    return {
      type: 'fromConfig',
      source: `context.${varName}`,
    };
  }

  // Plain value
  return {
    type: 'computed',
    source: defaultValue,
  };
}

/**
 * Parse an AD_Val_Rule code string to extract context and cascade parameters.
 *
 * Etendo validation rules use two variable patterns:
 * - @#VAR@ — session context variables (client, org, role), resolved server-side via OBContext
 * - @FIELD@ — cascade variables referencing other fields in the same record, sent by the frontend
 *
 * Returns null if code is null/undefined.
 */
export function parseValidationRule(code) {
  if (!code) return null;

  const contextParams = new Set();
  const cascadeParams = new Set();

  // First pass: find all @#VAR@ (session context)
  for (const match of code.matchAll(/@#([A-Za-z_][A-Za-z0-9_]*)@/g)) {
    contextParams.add(match[1]);
  }

  // Second pass: find all @VAR@ that are NOT preceded by #
  // Use negative lookbehind to exclude @#VAR@ matches
  for (const match of code.matchAll(/(?<!#)@([A-Za-z_][A-Za-z0-9_]*)@/g)) {
    const varName = match[1];
    if (varName === 'SQL') continue;
    cascadeParams.add(varName);
  }

  return {
    code,
    contextParams: [...contextParams],
    cascadeParams: [...cascadeParams],
  };
}

/**
 * Build reference metadata for foreign key fields.
 * Resolves target table, display column, and filters from AD config tables.
 * Falls back to TableDir convention (column name minus '_ID') when no explicit config exists.
 */
export function buildReference(row) {
  const refName = row.reference_name;

  // Table or TableDir with explicit AD_Ref_Table config
  if (row.ref_table_target) {
    return {
      type: refName,  // 'Table' or 'TableDir'
      targetTable: row.ref_table_target,
      keyColumn: row.ref_table_key || null,
      displayColumn: row.ref_table_display || 'Name',
      filterExpression: row.ref_table_filter || null,
      orderBy: row.ref_table_orderby || null,
    };
  }

  // Search with AD_Ref_Search config
  if (row.ref_search_target) {
    return {
      type: 'Search',
      targetTable: row.ref_search_target,
      keyColumn: row.ref_search_column || null,
      displayColumn: null,  // Search doesn't store display column in ad_ref_search
      filterExpression: null,
    };
  }

  // OBUISEL Selector
  if (row.ref_selector_target) {
    return {
      type: 'Selector',
      targetTable: row.ref_selector_target,
      selectorName: row.ref_selector_name,
      filterExpression: row.ref_selector_filter || null,
      hql: row.ref_selector_hql || null,
      displayColumn: null,  // Comes from obuisel_selector_field, not extracted here yet
    };
  }

  // Convention fallback: infer from column name ({TableName}_ID pattern).
  // Applies to any FK type (TableDir, Search, etc.) when no explicit config exists.
  if (row.columnname?.toUpperCase().endsWith('_ID')) {
    return {
      type: refName || 'TableDir',
      targetTable: row.columnname.slice(0, -3),  // Strip '_ID'
      keyColumn: row.columnname,
      displayColumn: 'Name',
      filterExpression: null,
    };
  }

  // Last-resort fallback for FK columns without _ID suffix (e.g., CreatedBy, UpdatedBy).
  // These are known FK columns that don't follow the {Table}_ID naming convention.
  // We use the column name itself as the best-effort target table hint.
  const KNOWN_FK_COLUMNS = {
    'CreatedBy':  { targetTable: 'AD_User', keyColumn: 'AD_User_ID', displayColumn: 'Name' },
    'UpdatedBy':  { targetTable: 'AD_User', keyColumn: 'AD_User_ID', displayColumn: 'Name' },
    'Createdby':  { targetTable: 'AD_User', keyColumn: 'AD_User_ID', displayColumn: 'Name' },
    'Updatedby':  { targetTable: 'AD_User', keyColumn: 'AD_User_ID', displayColumn: 'Name' },
  };

  const knownRef = KNOWN_FK_COLUMNS[row.columnname];
  if (knownRef) {
    return {
      type: refName || 'TableDir',
      ...knownRef,
      filterExpression: null,
    };
  }

  return null;
}

/**
 * Map a raw tab level string to a semantic level name.
 * '0' -> 'header', '1' -> 'line', anything else -> 'subline'
 */
function mapTabLevel(rawLevel) {
  const level = String(rawLevel);
  if (level === '0') return 'header';
  if (level === '1') return 'line';
  return 'subline';
}

/**
 * Infer a window category from its name using keyword matching.
 */
function inferWindowCategory(windowName) {
  const name = windowName || '';
  if (/Sales|Order/i.test(name)) return 'sales';
  if (/Purchase/i.test(name)) return 'purchasing';
  if (/Invoice/i.test(name)) return 'finance';
  if (/Inventory|Stock|Warehouse/i.test(name)) return 'inventory';
  if (/Account|Journal|Ledger/i.test(name)) return 'accounting';
  if (/Product|Price|BOM/i.test(name)) return 'master';
  if (/Project/i.test(name)) return 'project';
  return 'general';
}

/**
 * Disambiguate duplicate field names within a single entity.
 * Appends a numeric suffix (2, 3, ...) to repeated camelCase names.
 */
function deduplicateFieldNames(fields) {
  const seen = new Map();
  for (const field of fields) {
    const base = field.name;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    if (count > 1) {
      field.name = `${base}${count}`;
    }
  }
  return fields;
}

/**
 * Build the full schema structure from DB rows.
 *
 * Groups rows by tab, maps AD_Reference_IDs to schema types, and produces
 * the schema-raw.json structure per TDD 2.1.
 */
export function buildSchema(rows, systemColumns, refMap, enumValuesMap = {}) {
  if (!rows || rows.length === 0) {
    return { window: null, entities: [] };
  }

  const windowName = rows[0].window_name;
  const windowId = rows[0].ad_window_id;

  // Group rows by tab
  const tabMap = new Map();
  for (const row of rows) {
    const tabId = row.ad_tab_id;
    if (!tabMap.has(tabId)) {
      tabMap.set(tabId, {
        tabId,
        tabName: row.tab_name,
        tabLevel: row.tablevel,
        tabSeq: row.tab_seq,
        uiPattern: row.ui_pattern,
        tableName: row.tablename,
        entityClassname: row.entity_classname,
        entityAlias: row.entity_alias,
        entityJavaPackage: row.entity_javapackage,
        whereClause: row.whereclause,
        orderByClause: row.orderbyclause,
        filterClause: row.filterclause,
        hqlWhereClause: row.hqlwhereclause,
        hqlOrderByClause: row.hqlorderbyclause,
        hqlFilterClause: row.hqlfiltclause,
        fields: [],
      });
    }
    tabMap.get(tabId).fields.push(row);
  }

  // Convert tabs to entities
  const entities = [];
  let primaryEntity = null;

  for (const tab of tabMap.values()) {
    const fields = tab.fields.map((row) => {
      const classification = classifyField(row, systemColumns);
      const schemaType = refMap[String(row.ad_reference_id)] ?? 'string';
      const isPk = row.columnname === tab.tableName + '_ID';
      const isCoreModule = row.table_module_id === '0' || (row.column_module_id != null && row.column_module_id !== '0');
      const apiKey = toPropertyName(row.obdal_name, { isPk, isCoreModule });
      const fieldDef = {
        name: apiKey,
        apiKey,
        columnName: row.columnname,
        label: row.field_name,
        type: schemaType,
        mandatory: row.ismandatory === 'Y',
        ...classification,
      };

      // Add derivation from inferDerivation if not already set by classification
      if (!fieldDef.derivation && row.defaultvalue) {
        const derivation = inferDerivation(row.defaultvalue);
        if (derivation) {
          fieldDef.derivation = derivation;
        }
      }

      // Add constraints if present
      if (row.fieldlength) fieldDef.maxLength = row.fieldlength;
      if (row.valuemin != null) fieldDef.valueMin = row.valuemin;
      if (row.valuemax != null) fieldDef.valueMax = row.valuemax;

      // Add display/readOnly logic if present (convention #6: omit key if null)
      if (row.displaylogic) fieldDef.displayLogic = row.displaylogic;
      if (row.displaylogic_server) fieldDef.displayLogicServer = row.displaylogic_server;
      if (row.displaylogicgrid) fieldDef.displayLogicGrid = row.displaylogicgrid;
      if (row.readonlylogic) fieldDef.readOnlyLogic = row.readonlylogic;

      // Add callout if present
      if (row.callout_class) fieldDef.callout = row.callout_class;

      // Add onChangeFunction if present (JS client-side logic from SmartClient)
      if (row.onchangefunction) fieldDef.onChangeFunction = row.onchangefunction;

      // UI hints from AD metadata
      if (row.defaultvalue) fieldDef.defaultValue = row.defaultvalue;
      if (row.isidentifier === 'Y') fieldDef.isIdentifier = true;
      if (row.isselectioncolumn === 'Y') fieldDef.isSelectionColumn = true;
      if (row.isfilterable === 'Y') fieldDef.isFilterable = true;
      if (row.precision != null && row.precision > 0) fieldDef.precision = Number(row.precision);
      if (row.istranslated === 'Y') fieldDef.isTranslated = true;
      if (row.help_text) fieldDef.help = row.help_text;
      if (row.field_group_name) fieldDef.fieldGroup = row.field_group_name;

      // Add validation rule with parsed params if present
      if (row.val_rule_code) {
        fieldDef.validationRule = parseValidationRule(row.val_rule_code);
      }

      // Add reference metadata for foreign key fields
      if (schemaType === 'foreignKey') {
        const reference = buildReference(row);
        if (reference) {
          fieldDef.reference = reference;
        }
      }

      // Add processId for button-type fields (AD_Reference_ID = 28)
      // Priority: OBUIAPP (modern) > Classic > Hardcoded (no ID)
      if (schemaType === 'button') {
        if (row.em_obuiapp_process_id) {
          fieldDef.processId = row.em_obuiapp_process_id;
          fieldDef.processType = 'obuiapp';
        } else if (row.ad_process_id) {
          fieldDef.processId = row.ad_process_id;
          fieldDef.processType = 'classic';
        }
        // No processId + no processType = hardcoded button (resolved by convention)
      }

      // Attach enum values for List-type fields (AD_Reference_ID = 17)
      if (schemaType === 'enum' && row.ad_reference_value_id) {
        const enumValues = enumValuesMap[row.ad_reference_value_id];
        if (enumValues) {
          fieldDef.enumValues = enumValues;
        }
      }

      return fieldDef;
    });

    // Disambiguate duplicate camelCase field names within this entity
    deduplicateFieldNames(fields);

    const entityClassname = tab.entityClassname || tab.entityAlias || toCamelCase(tab.tableName);
    const entityJavaPackage = tab.entityJavaPackage || null;
    const semanticLevel = mapTabLevel(tab.tabLevel);

    // Track the primary entity (first header-level tab)
    // Prefer tabName (human-readable tab label) over tableName (DB table)
    const entityName = tab.tabName
      ? toCamelCase(tab.tabName)
      : toCamelCase(tab.tableName);

    if (semanticLevel === 'header' && !primaryEntity) {
      primaryEntity = entityName;
    }

    const entity = {
      name: entityName,
      tableName: tab.tableName,
      tabId: tab.tabId,
      entityClassname,
      entityJavaPackage,
      tabName: tab.tabName,
      level: semanticLevel,
      sequence: tab.tabSeq,
      fields,
    };

    // Full qualified Java class: package + classname
    if (entityJavaPackage && entityClassname) {
      entity.entityFullClass = `${entityJavaPackage}.${entityClassname}`;
    }

    // Add tab clauses if present (convention #6: omit key if null)
    if (tab.whereClause) entity.whereClause = tab.whereClause;
    if (tab.orderByClause) entity.orderByClause = tab.orderByClause;
    if (tab.filterClause) entity.filterClause = tab.filterClause;
    if (tab.hqlWhereClause) entity.hqlWhereClause = tab.hqlWhereClause;
    if (tab.hqlOrderByClause) entity.hqlOrderByClause = tab.hqlOrderByClause;
    if (tab.hqlFilterClause) entity.hqlFilterClause = tab.hqlFilterClause;

    entities.push(entity);
  }

  const version = generateVersion();

  return {
    version,
    window: {
      id: windowId,
      name: windowName,
      primaryEntity: primaryEntity || null,
      category: inferWindowCategory(windowName),
    },
    entities,
    meta: {
      version,
      checksum: computeChecksum({ windowId, entities }),
      extractedAt: new Date().toISOString(),
    },
  };
}

/**
 * SQL query to extract all fields for a window (TDD 3.1).
 */
const EXTRACT_SQL = `
SELECT
  w.AD_Window_ID, w.Name AS window_name,
  t.AD_Tab_ID, t.Name AS tab_name, t.TabLevel, t.SeqNo AS tab_seq, t.UIPattern AS ui_pattern,
  t.WhereClause, t.OrderByClause, t.FilterClause,
  t.HQLWhereClause, t.HQLOrderByClause, t.HQLFilterClause,
  tbl.TableName, tbl.Classname AS entity_classname, tbl.Entity_Alias,
  pkg.JavaPackage AS entity_javapackage,
  f.AD_Field_ID, f.Name AS field_name, f.IsActive AS field_isactive,
  f.IsDisplayed, f.IsReadOnly, f.IsShownInStatusBar,
  f.DisplayLogic, f.DisplayLogic_Server, f.DisplayLogicGrid,
  f.SeqNo AS field_seq,
  c.ColumnName, c.Name AS obdal_name, c.AD_Reference_ID, c.IsMandatory, c.IsUpdateable,
  c.DefaultValue, c.FieldLength, c.ValueMin, c.ValueMax,
  c.AD_Val_Rule_ID, c.ReadOnlyLogic,
  c.AD_Reference_Value_ID,
  c.AD_Process_ID,
  c.EM_OBUIAPP_Process_ID,
  c.AD_Module_ID AS column_module_id, NULL AS table_module_id,
  r.Name AS reference_name,
  vr.Name AS val_rule_name,
  vr.Code AS val_rule_code,
  mo.Classname AS callout_class,
  -- Table/TableDir reference config
  rt_tgt.TableName AS ref_table_target,
  rt_disp.ColumnName AS ref_table_display,
  rt_key.ColumnName AS ref_table_key,
  rt.WhereClause AS ref_table_filter,
  rt.OrderByClause AS ref_table_orderby,
  -- Search reference config
  rs_tgt.TableName AS ref_search_target,
  rs_col.ColumnName AS ref_search_column,
  -- Selector reference config
  sel.Name AS ref_selector_name,
  sel_tgt.TableName AS ref_selector_target,
  sel.WhereClause AS ref_selector_filter,
  sel.HQL AS ref_selector_hql,
  f.OnChangeFunction,
  c.IsIdentifier,
  c.IsSelectionColumn,
  c.AllowFiltering AS IsFilterable,
  NULL AS Precision,
  c.IsTranslated,
  COALESCE(f.Help, c.Help) AS help_text,
  fg.Name AS field_group_name
FROM AD_Field f
JOIN AD_Tab t ON f.AD_Tab_ID = t.AD_Tab_ID
JOIN AD_Window w ON t.AD_Window_ID = w.AD_Window_ID
JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID
JOIN AD_Table tbl ON c.AD_Table_ID = tbl.AD_Table_ID
LEFT JOIN AD_Package pkg ON tbl.AD_Package_ID = pkg.AD_Package_ID
LEFT JOIN AD_FieldGroup fg ON fg.AD_FieldGroup_ID = f.AD_FieldGroup_ID
JOIN AD_Reference r ON c.AD_Reference_ID = r.AD_Reference_ID
LEFT JOIN AD_Model_Object mo ON mo.AD_Callout_ID = c.AD_Callout_ID
LEFT JOIN ad_ref_table rt ON c.ad_reference_value_id = rt.ad_reference_id
LEFT JOIN ad_table rt_tgt ON rt.ad_table_id = rt_tgt.ad_table_id
LEFT JOIN ad_column rt_key ON rt.ad_key = rt_key.ad_column_id
LEFT JOIN ad_column rt_disp ON rt.ad_display = rt_disp.ad_column_id
LEFT JOIN ad_ref_search rs ON c.ad_reference_value_id = rs.ad_reference_id
LEFT JOIN ad_table rs_tgt ON rs.ad_table_id = rs_tgt.ad_table_id
LEFT JOIN ad_column rs_col ON rs.ad_column_id = rs_col.ad_column_id
LEFT JOIN ad_val_rule vr ON c.ad_val_rule_id = vr.ad_val_rule_id
LEFT JOIN obuisel_selector sel ON sel.ad_reference_id = c.ad_reference_value_id
LEFT JOIN ad_table sel_tgt ON sel.ad_table_id = sel_tgt.ad_table_id
WHERE w.AD_Window_ID = $1
  AND t.IsActive = 'Y'
ORDER BY t.SeqNo, f.SeqNo
`;

/**
 * SQL to fetch columns that have NO AD_Field in a given window's tabs.
 * These are table columns (e.g. Created, Updated, parent FKs) that exist
 * in the DB but were never registered as fields in the window.
 */
const ORPHAN_COLUMNS_SQL = `
SELECT
  w.AD_Window_ID, w.Name AS window_name,
  t.AD_Tab_ID, t.Name AS tab_name, t.TabLevel, t.SeqNo AS tab_seq, t.UIPattern AS ui_pattern,
  t.WhereClause, t.OrderByClause, t.FilterClause,
  t.HQLWhereClause, t.HQLOrderByClause, t.HQLFilterClause,
  tbl.TableName, tbl.Classname AS entity_classname, tbl.Entity_Alias,
  pkg.JavaPackage AS entity_javapackage,
  NULL AS ad_field_id, c.ColumnName AS field_name, 'Y' AS field_isactive,
  'N' AS isdisplayed, 'Y' AS isreadonly, 'N' AS isshowninstatusbar,
  NULL AS displaylogic, NULL AS displaylogic_server, NULL AS displaylogicgrid,
  99999 AS field_seq,
  c.ColumnName, c.Name AS obdal_name, c.AD_Reference_ID, c.IsMandatory, c.IsUpdateable,
  c.DefaultValue, c.FieldLength, c.ValueMin, c.ValueMax,
  c.AD_Val_Rule_ID, c.ReadOnlyLogic,
  c.AD_Reference_Value_ID,
  c.AD_Process_ID,
  c.EM_OBUIAPP_Process_ID,
  c.AD_Module_ID AS column_module_id, NULL AS table_module_id,
  r.Name AS reference_name,
  vr.Name AS val_rule_name,
  vr.Code AS val_rule_code,
  mo.Classname AS callout_class,
  -- Table/TableDir reference config
  rt_tgt.TableName AS ref_table_target,
  rt_disp.ColumnName AS ref_table_display,
  rt_key.ColumnName AS ref_table_key,
  rt.WhereClause AS ref_table_filter,
  rt.OrderByClause AS ref_table_orderby,
  -- Search reference config
  rs_tgt.TableName AS ref_search_target,
  rs_col.ColumnName AS ref_search_column,
  -- Selector reference config
  sel.Name AS ref_selector_name,
  sel_tgt.TableName AS ref_selector_target,
  sel.WhereClause AS ref_selector_filter,
  sel.HQL AS ref_selector_hql,
  NULL AS onchangefunction,
  c.IsIdentifier, c.IsSelectionColumn, c.AllowFiltering AS IsFilterable,
  NULL AS Precision, c.IsTranslated,
  c.Help AS help_text, NULL AS field_group_name
FROM AD_Tab t
JOIN AD_Window w ON t.AD_Window_ID = w.AD_Window_ID
JOIN AD_Table tbl ON t.AD_Table_ID = tbl.AD_Table_ID
JOIN AD_Column c ON c.AD_Table_ID = tbl.AD_Table_ID AND c.IsActive = 'Y'
LEFT JOIN AD_Package pkg ON tbl.AD_Package_ID = pkg.AD_Package_ID
JOIN AD_Reference r ON c.AD_Reference_ID = r.AD_Reference_ID
LEFT JOIN AD_Model_Object mo ON mo.AD_Callout_ID = c.AD_Callout_ID
LEFT JOIN ad_val_rule vr ON c.ad_val_rule_id = vr.ad_val_rule_id
LEFT JOIN ad_ref_table rt ON c.ad_reference_value_id = rt.ad_reference_id
LEFT JOIN ad_table rt_tgt ON rt.ad_table_id = rt_tgt.ad_table_id
LEFT JOIN ad_column rt_key ON rt.ad_key = rt_key.ad_column_id
LEFT JOIN ad_column rt_disp ON rt.ad_display = rt_disp.ad_column_id
LEFT JOIN ad_ref_search rs ON c.ad_reference_value_id = rs.ad_reference_id
LEFT JOIN ad_table rs_tgt ON rs.ad_table_id = rs_tgt.ad_table_id
LEFT JOIN ad_column rs_col ON rs.ad_column_id = rs_col.ad_column_id
LEFT JOIN obuisel_selector sel ON sel.ad_reference_id = c.ad_reference_value_id
LEFT JOIN ad_table sel_tgt ON sel.ad_table_id = sel_tgt.ad_table_id
WHERE w.AD_Window_ID = $1
  AND t.IsActive = 'Y'
  AND NOT EXISTS (
    SELECT 1 FROM AD_Field f2
    WHERE f2.AD_Tab_ID = t.AD_Tab_ID AND f2.AD_Column_ID = c.AD_Column_ID
  )
ORDER BY t.SeqNo, c.ColumnName
`;

/**
 * Main entry point: connects to DB, queries fields for a window,
 * builds the schema, and writes schema-raw.json.
 *
 * Can be called programmatically (returns the schema object) or via CLI.
 */
export async function main(windowId, windowName) {
  const systemColumns = await loadCoreMap('system-columns.json');
  const refMap = await loadCoreMap('ad-reference-map.json');

  const pool = createDbPool();
  try {
    const [fieldResult, orphanResult] = await Promise.all([
      pool.query(EXTRACT_SQL, [windowId]),
      pool.query(ORPHAN_COLUMNS_SQL, [windowId]),
    ]);
    const rows = [...fieldResult.rows, ...orphanResult.rows];

    if (rows.length === 0) {
      console.warn(`No fields found for window ID ${windowId}`);
      return { window: null, entities: [] };
    }

    // Fetch enum values for List-type fields (AD_Reference_ID = 17)
    const listRefIds = [...new Set(
      rows
        .filter(r => String(r.ad_reference_id) === '17' && r.ad_reference_value_id)
        .map(r => r.ad_reference_value_id)
    )];

    const enumValuesMap = {};
    if (listRefIds.length > 0) {
      const enumResult = await pool.query(
        `SELECT rl.AD_Reference_ID, rl.Value, rl.Name
         FROM AD_Ref_List rl
         WHERE rl.AD_Reference_ID = ANY($1)
           AND rl.IsActive = 'Y'
         ORDER BY rl.SeqNo, rl.Name`,
        [listRefIds]
      );
      for (const row of enumResult.rows) {
        const refId = row.ad_reference_id;
        if (!enumValuesMap[refId]) enumValuesMap[refId] = [];
        enumValuesMap[refId].push({ value: row.value, name: row.name });
      }
    }

    // Use window name from DB if not provided
    const resolvedName = windowName ?? rows[0].window_name;
    const schema = buildSchema(rows, systemColumns, refMap, enumValuesMap);

    // Write to artifacts directory
    const artifactsDir = join(ROOT, 'artifacts', resolvedName);
    await mkdir(artifactsDir, { recursive: true });
    const outputPath = join(artifactsDir, 'schema-raw.json');
    await writeFile(outputPath, JSON.stringify(schema, null, 2), 'utf-8');

    console.log(`Schema written to ${outputPath}`);
    console.log(`  Entities: ${schema.entities.length}`);
    console.log(`  Total fields: ${schema.entities.reduce((sum, e) => sum + e.fields.length, 0)}`);

    return schema;
  } finally {
    await closePool(pool);
  }
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const windowId = process.argv[2];
  const windowName = process.argv[3];

  if (!windowId) {
    console.error('Usage: node extract-fields.js <windowId> [windowName]');
    process.exit(1);
  }

  main(windowId, windowName).catch((err) => {
    console.error('Extraction failed:', err.message);
    process.exit(1);
  });
}
