#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDbPool, closePool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');

const QUERIES = {
  fields: `
SELECT * FROM (
  -- Fields with AD_Field registration
  SELECT
    w.AD_Window_ID, w.Name AS window_name,
    t.AD_Tab_ID, t.Name AS tab_name, t.TabLevel, t.SeqNo AS tab_seq,
    t.WhereClause, t.OrderByClause, t.FilterClause,
    t.HQLWhereClause, t.HQLOrderByClause, t.HQLFilterClause,
    tbl.TableName, tbl.Classname AS entity_classname, tbl.Entity_Alias,
    pkg.JavaPackage AS entity_javapackage,
    f.AD_Field_ID, f.Name AS field_name, f.IsActive AS field_isactive,
    f.IsDisplayed, f.IsReadOnly, f.IsShownInStatusBar,
    f.DisplayLogic, f.DisplayLogic_Server, f.DisplayLogicGrid,
    f.SeqNo AS field_seq,
    c.ColumnName, c.AD_Reference_ID, c.IsMandatory, c.IsUpdateable,
    c.DefaultValue, c.FieldLength, c.ValueMin, c.ValueMax,
    c.AD_Val_Rule_ID, c.ReadOnlyLogic,
    r.Name AS reference_name,
    mo.Classname AS callout_class
  FROM AD_Field f
  JOIN AD_Tab t ON f.AD_Tab_ID = t.AD_Tab_ID
  JOIN AD_Window w ON t.AD_Window_ID = w.AD_Window_ID
  JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID
  JOIN AD_Table tbl ON c.AD_Table_ID = tbl.AD_Table_ID
  LEFT JOIN AD_Package pkg ON tbl.AD_Package_ID = pkg.AD_Package_ID
  JOIN AD_Reference r ON c.AD_Reference_ID = r.AD_Reference_ID
  LEFT JOIN AD_Model_Object mo ON mo.AD_Callout_ID = c.AD_Callout_ID
  WHERE w.AD_Window_ID = $1
    AND t.IsActive = 'Y'

  UNION ALL

  -- Columns WITHOUT AD_Field (e.g. Created, Updated, parent FKs on child tabs)
  SELECT
    w.AD_Window_ID, w.Name AS window_name,
    t.AD_Tab_ID, t.Name AS tab_name, t.TabLevel, t.SeqNo AS tab_seq,
    t.WhereClause, t.OrderByClause, t.FilterClause,
    t.HQLWhereClause, t.HQLOrderByClause, t.HQLFilterClause,
    tbl.TableName, tbl.Classname AS entity_classname, tbl.Entity_Alias,
    pkg.JavaPackage AS entity_javapackage,
    NULL AS ad_field_id, c.ColumnName AS field_name, 'Y' AS field_isactive,
    'N' AS isdisplayed, 'Y' AS isreadonly, 'N' AS isshowninstatusbar,
    NULL AS displaylogic, NULL AS displaylogic_server, NULL AS displaylogicgrid,
    99999 AS field_seq,
    c.ColumnName, c.AD_Reference_ID, c.IsMandatory, c.IsUpdateable,
    c.DefaultValue, c.FieldLength, c.ValueMin, c.ValueMax,
    c.AD_Val_Rule_ID, c.ReadOnlyLogic,
    r.Name AS reference_name,
    mo.Classname AS callout_class
  FROM AD_Tab t
  JOIN AD_Window w ON t.AD_Window_ID = w.AD_Window_ID
  JOIN AD_Table tbl ON t.AD_Table_ID = tbl.AD_Table_ID
  JOIN AD_Column c ON c.AD_Table_ID = tbl.AD_Table_ID AND c.IsActive = 'Y'
  LEFT JOIN AD_Package pkg ON tbl.AD_Package_ID = pkg.AD_Package_ID
  JOIN AD_Reference r ON c.AD_Reference_ID = r.AD_Reference_ID
  LEFT JOIN AD_Model_Object mo ON mo.AD_Callout_ID = c.AD_Callout_ID
  WHERE w.AD_Window_ID = $1
    AND t.IsActive = 'Y'
    AND NOT EXISTS (
      SELECT 1 FROM AD_Field f2
      WHERE f2.AD_Tab_ID = t.AD_Tab_ID AND f2.AD_Column_ID = c.AD_Column_ID
    )
) combined
ORDER BY tab_seq, field_seq`,

  callouts: `
SELECT co.AD_Callout_ID, co.Name AS callout_name,
       mo.Classname AS callout_class,
       col.ColumnName, col.AD_Table_ID
FROM AD_Callout co
JOIN AD_Column col ON col.AD_Callout_ID = co.AD_Callout_ID
JOIN AD_Tab t ON col.AD_Table_ID = t.AD_Table_ID
LEFT JOIN AD_Model_Object mo ON mo.AD_Callout_ID = co.AD_Callout_ID
WHERE t.AD_Window_ID = $1`,

  'validation-rules': `
SELECT vr.AD_Val_Rule_ID, vr.Name, vr.Code, c.ColumnName
FROM AD_Val_Rule vr
JOIN AD_Column c ON c.AD_Val_Rule_ID = vr.AD_Val_Rule_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = $1`,

  'display-logic': `
SELECT f.Name, f.DisplayLogic, f.DisplayLogic_Server, f.DisplayLogicGrid,
       c.ReadOnlyLogic, c.ColumnName
FROM AD_Field f
JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID
JOIN AD_Tab t ON f.AD_Tab_ID = t.AD_Tab_ID
WHERE t.AD_Window_ID = $1
  AND (f.DisplayLogic IS NOT NULL OR c.ReadOnlyLogic IS NOT NULL)`,

  'document-processes': `
SELECT 'tab_process' AS mechanism,
       p.AD_Process_ID AS process_id, NULL AS obuiapp_process_id,
       p.Name, p.Classname, NULL AS column_name
FROM AD_Process p
JOIN AD_Tab t ON t.AD_Process_ID = p.AD_Process_ID
WHERE t.AD_Window_ID = $1
UNION ALL
SELECT 'classic_process' AS mechanism,
       p.AD_Process_ID AS process_id, NULL AS obuiapp_process_id,
       p.Name, p.Classname, c.ColumnName
FROM AD_Process p
JOIN AD_Column c ON c.AD_Process_ID = p.AD_Process_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = $1
UNION ALL
SELECT 'obuiapp_process' AS mechanism,
       NULL AS process_id, op.OBUIAPP_Process_ID AS obuiapp_process_id,
       op.Name, op.Classname, c.ColumnName
FROM OBUIAPP_Process op
JOIN AD_Column c ON c.EM_OBUIAPP_Process_ID = op.OBUIAPP_Process_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = $1
ORDER BY mechanism, name`,

  'auxiliary-inputs': `
SELECT ai.Name, ai.Code AS validation_code, t.Name AS tab_name, t.AD_Tab_ID
FROM AD_AuxiliarInput ai
JOIN AD_Tab t ON ai.AD_Tab_ID = t.AD_Tab_ID
WHERE t.AD_Window_ID = $1
ORDER BY t.SeqNo, ai.Name`,
};

function rowsToCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val == null) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    });
    lines.push(values.join(','));
  }
  return lines.join('\n') + '\n';
}

async function main(windowId, windowSlug) {
  const pool = createDbPool();
  const outDir = join(ROOT, 'artifacts', windowSlug, 'raw-query-results');
  await mkdir(outDir, { recursive: true });

  try {
    const names = Object.keys(QUERIES);
    const results = await Promise.all(
      names.map((name) => pool.query(QUERIES[name], [windowId]))
    );

    for (let i = 0; i < names.length; i++) {
      const csv = rowsToCsv(results[i].rows);
      const path = join(outDir, `${names[i]}.csv`);
      await writeFile(path, csv, 'utf-8');
      console.log(`  ${names[i]}.csv: ${results[i].rows.length} rows`);
    }

    console.log(`\nCSVs written to ${outDir}`);
  } finally {
    await closePool(pool);
  }
}

// Exports for testing
export { QUERIES, rowsToCsv };

// CLI entry point — only runs when executed directly
const isCLI =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isCLI) {
  const windowId = process.argv[2];
  const windowSlug = process.argv[3];

  if (!windowId || !windowSlug) {
    console.error('Usage: node extract-from-db.js <windowId> <windowSlug>');
    console.error('Example: node extract-from-db.js 143 sales-order');
    process.exit(1);
  }

  main(windowId, windowSlug).catch((err) => {
    console.error('Extraction failed:', err.message);
    process.exit(1);
  });
}
