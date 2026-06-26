import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { createDbPool, closePool, setCacheMode, flushCacheWrites } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = process.env.SF_ROOT || join(__dirname, '..', '..');

// --- SQL Queries (TDD 3.2) ---

const CALLOUTS_SQL = `
SELECT co.AD_Callout_ID, co.Name,
       mo.Classname, col.ColumnName, col.AD_Table_ID
FROM AD_Callout co
JOIN AD_Column col ON col.AD_Callout_ID = co.AD_Callout_ID
JOIN AD_Tab t ON col.AD_Table_ID = t.AD_Table_ID
LEFT JOIN AD_Model_Object mo ON mo.AD_Callout_ID = co.AD_Callout_ID
WHERE t.AD_Window_ID = $1
`;

const VALIDATION_RULES_SQL = `
SELECT vr.AD_Val_Rule_ID, vr.Name, vr.Code, c.ColumnName
FROM AD_Val_Rule vr
JOIN AD_Column c ON c.AD_Val_Rule_ID = vr.AD_Val_Rule_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = $1
`;

const DISPLAY_LOGIC_SQL = `
SELECT f.Name,
       f.DisplayLogic,
       c.ReadOnlyLogic,
       c.ColumnName,
       t.Name        AS tab_name,
       t.AD_Tab_ID   AS tab_id,
       tbl.TableName AS table_name,
       tbl.AD_Table_ID AS table_id,
       c.AD_Column_ID AS column_id,
       f.AD_Field_ID  AS field_id
FROM AD_Field f
JOIN AD_Column c ON f.AD_Column_ID = c.AD_Column_ID
JOIN AD_Tab t ON f.AD_Tab_ID = t.AD_Tab_ID
JOIN AD_Table tbl ON c.AD_Table_ID = tbl.AD_Table_ID
WHERE t.AD_Window_ID = $1
  AND (f.DisplayLogic IS NOT NULL OR c.ReadOnlyLogic IS NOT NULL)
ORDER BY t.SeqNo, t.AD_Tab_ID, f.SeqNo, f.AD_Field_ID, c.AD_Column_ID
`;

const AUXILIARY_INPUTS_SQL = `
SELECT ai.Name, ai.Code AS validation_code, t.Name AS tab_name, t.AD_Tab_ID,
       ai.AD_AuxiliarInput_ID
FROM AD_AuxiliarInput ai
JOIN AD_Tab t ON ai.AD_Tab_ID = t.AD_Tab_ID
WHERE t.AD_Window_ID = $1
ORDER BY t.SeqNo, t.Name, t.AD_Tab_ID, ai.Name, ai.AD_AuxiliarInput_ID
`;

const DOCUMENT_PROCESSES_SQL = `
-- 1. Tab-level process
SELECT 'tab_process' AS mechanism,
       p.AD_Process_ID AS process_id, NULL AS obuiapp_process_id,
       p.Name, p.Classname, NULL AS column_name
FROM AD_Process p
JOIN AD_Tab t ON t.AD_Process_ID = p.AD_Process_ID
WHERE t.AD_Window_ID = $1

UNION ALL

-- 2. Classic process (button column -> AD_Process)
SELECT 'classic_process' AS mechanism,
       p.AD_Process_ID AS process_id, NULL AS obuiapp_process_id,
       p.Name, p.Classname, c.ColumnName
FROM AD_Process p
JOIN AD_Column c ON c.AD_Process_ID = p.AD_Process_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = $1

UNION ALL

-- 3. OBUIAPP Process (button column -> OBUIAPP_Process)
SELECT 'obuiapp_process' AS mechanism,
       NULL AS process_id, op.OBUIAPP_Process_ID AS obuiapp_process_id,
       op.Name, op.Classname, c.ColumnName
FROM OBUIAPP_Process op
JOIN AD_Column c ON c.EM_OBUIAPP_Process_ID = op.OBUIAPP_Process_ID
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
WHERE t.AD_Window_ID = $1

UNION ALL

-- 4. Hardcoded buttons (no process linked)
SELECT 'hardcoded' AS mechanism,
       NULL AS process_id, NULL AS obuiapp_process_id,
       c.ColumnName AS name, NULL AS classname, c.ColumnName
FROM AD_Column c
JOIN AD_Tab t ON c.AD_Table_ID = t.AD_Table_ID
JOIN AD_Reference r ON c.AD_Reference_ID = r.AD_Reference_ID
WHERE t.AD_Window_ID = $1
  AND r.Name = 'Button'
  AND c.AD_Process_ID IS NULL
  AND c.EM_OBUIAPP_Process_ID IS NULL

ORDER BY mechanism, name
`;

// --- Pure functions ---

/**
 * Extract field-effect entries from Java source code.
 * Detects addResult("fieldName", ...) and setFieldValue("fieldName", ...) patterns.
 */
function extractEffects(sourceCode) {
  const effects = [];
  const effectPattern = /(?:addResult|setFieldValue)\s*\(\s*"([^"]+)"/g;
  let match;
  while ((match = effectPattern.exec(sourceCode)) !== null) {
    effects.push({ field: match[1], action: 'setValue', confidence: 'high' });
  }
  return effects;
}

/**
 * Count branch points (if, switch, ternary) in non-comment lines.
 */
function countBranches(lines) {
  let branches = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    branches += (trimmed.match(/\bif\s*\(/g) || []).length;
    branches += (trimmed.match(/\bswitch\s*\(/g) || []).length;
    branches += (trimmed.match(/\?/g) || []).length;
  }
  return branches;
}

/**
 * Count logical lines of code, skipping blank lines and comments.
 */
function countLoc(lines) {
  let loc = 0;
  let inBlockComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (inBlockComment) {
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('//')) continue;
    loc++;
  }
  return loc;
}

/**
 * Regex-based analysis of Java source code.
 * Detects effects, branches, LOC, and DML usage.
 */
export function analyzeJavaSource(sourceCode) {
  if (sourceCode == null) {
    return { effects: [], confidence: 'low', warning: 'Source not found' };
  }

  const effects = extractEffects(sourceCode);
  const lines = sourceCode.split('\n');
  const branches = countBranches(lines);
  const loc = countLoc(lines);
  const dmlPattern = /OBDal|PreparedStatement|createCriteria|ConnectionProvider|executeUpdate|createQuery|getConnection/;
  const hasDml = dmlPattern.test(sourceCode);
  const confidence = effects.length > 0 ? 'high' : 'medium';

  return { effects, confidence, branches, loc, hasDml };
}

/**
 * Fail-safe Etendo expression translator.
 * Converts Etendo display/readOnly logic expressions to JS-like syntax.
 */
export function translateExpression(expr) {
  if (expr == null || expr.trim() === '') {
    return { success: false, error: 'Empty expression' };
  }

  // Abort on framework calls
  if (/OB\.|Utilities\.|checkRule|function\s*\(/i.test(expr)) {
    return { success: false, error: 'Expression contains framework calls' };
  }

  let result = expr;

  // Fix Category 1: convert !' to !=' and !@ to !=@ (Etendo shorthand for "not equal")
  result = result.replace(/!'/g, "!='");
  result = result.replace(/!@/g, '!=@');

  // Fix Category 2: handle @#VAR@ (system preferences) and @$VAR@ (accounting dimensions)
  result = result.replace(/@[#$](\w+)@/g, (_match, name) => {
    return name.charAt(0).toLowerCase() + name.slice(1);
  });

  // Replace @VAR@ with camelCase variable name
  result = result.replace(/@([A-Za-z_]\w*)@/g, (_match, varName) => {
    // camelCase: lowercase first char
    return varName.charAt(0).toLowerCase() + varName.slice(1);
  });

  // Replace | with || and & with &&
  // Must handle carefully to not double-replace || or &&
  result = result.replace(/\|{2}/g, '__DOUBLE_PIPE__');
  result = result.replace(/&{2}/g, '__DOUBLE_AMP__');
  result = result.replace(/\|/g, '||');
  result = result.replace(/&/g, '&&');
  result = result.replace(/__DOUBLE_PIPE__/g, '||');
  result = result.replace(/__DOUBLE_AMP__/g, '&&');

  // Replace 'Y' with true, 'N' with false
  result = result.replace(/'Y'/g, 'true');
  result = result.replace(/'N'/g, 'false');

  // Replace single = with == (but preserve !=, <=, >=)
  result = result.replace(/([^!<>=])=([^=])/g, '$1==$2');

  return { success: true, result: result.trim() };
}

/**
 * Heuristic to determine if a SQL validation is simple or complex.
 */
export function isSimpleValidation(sql) {
  if (sql == null || sql.trim() === '') return true;

  const upper = sql.toUpperCase();

  // Complex indicators
  const hasMultipleJoins = (upper.match(/\bJOIN\b/g) || []).length >= 2;
  const hasExists = /\bEXISTS\s*\(/i.test(upper);
  const hasUnion = /\bUNION\b/i.test(upper);
  const hasSubqueryWithJoin = /\bEXISTS\s*\(\s*SELECT\b/i.test(upper) || hasUnion;

  return !hasMultipleJoins && !hasSubqueryWithJoin && !hasUnion && !hasExists;
}

/**
 * Build a rule object from a callout DB row and its Java source analysis.
 */
export function buildRuleFromCallout(row, sourceAnalysis) {
  const rule = {
    type: 'callout',
    source: 'AD_Callout',
    id: row.ad_callout_id,
    name: row.name,
    className: row.classname,
    triggerColumn: row.columnname,
    effects: sourceAnalysis?.effects ?? [],
    complexity: determineComplexity(sourceAnalysis),
    confidence: sourceAnalysis?.confidence ?? 'low',
  };

  if (sourceAnalysis?.hasDml) {
    rule.hasDml = true;
  }

  if (sourceAnalysis?.branches != null) {
    rule.branches = sourceAnalysis.branches;
  }

  if (sourceAnalysis?.loc != null) {
    rule.loc = sourceAnalysis.loc;
  }

  if (sourceAnalysis?.warning) {
    rule.warning = sourceAnalysis.warning;
  }

  return rule;
}

/**
 * Determine complexity from source analysis.
 */
function determineComplexity(analysis) {
  if (!analysis || analysis.confidence === 'low') return 'unknown';
  if (analysis.hasDml) return 'high';
  if (analysis.branches > 5) return 'high';
  if (analysis.branches > 2) return 'medium';
  return 'low';
}

/**
 * Walk a source directory to find a .java file matching a FQCN.
 * Returns file content string or null.
 */
export async function findSource(sourceDir, className) {
  if (!sourceDir || !className) return null;

  // Convert FQCN to path: com.example.MyClass -> com/example/MyClass.java
  const relativePath = className.replace(/\./g, sep) + '.java';
  const fullPath = join(sourceDir, relativePath);

  try {
    const content = await readFile(fullPath, 'utf-8');
    return content;
  } catch {
    // File not found at expected path, try recursive search
    try {
      const simpleClassName = className.split('.').pop() + '.java';
      const found = await walkForFile(sourceDir, simpleClassName);
      return found;
    } catch {
      return null;
    }
  }
}

/**
 * Recursively walk a directory looking for a file by name.
 */
async function walkForFile(dir, targetName) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = await walkForFile(fullPath, targetName);
      if (result) return result;
    } else if (entry.name === targetName) {
      return readFile(fullPath, 'utf-8');
    }
  }

  return null;
}

async function processCalloutRow(row, sourceDir) {
  let sourceAnalysis;
  if (sourceDir && row.classname) {
    const source = await findSource(sourceDir, row.classname);
    sourceAnalysis = analyzeJavaSource(source);
  } else {
    sourceAnalysis = analyzeJavaSource(null);
  }
  return buildRuleFromCallout(row, sourceAnalysis);
}

function buildValidationRule(row) {
  return {
    type: 'validation',
    source: 'AD_Val_Rule',
    id: row.ad_val_rule_id,
    name: row.name,
    column: row.columnname,
    code: row.code,
    isSimple: isSimpleValidation(row.code),
  };
}

function buildDisplayLogicRule(row, windowName) {
  const translated = translateExpression(row.displaylogic);
  return {
    name: `${windowName}-${row.tab_name}-${row.columnname}-displayLogic`,
    type: 'displayLogic',
    source: 'AD_Field',
    window: windowName,
    tab: row.tab_name,
    fieldName: row.name,
    column: row.columnname,
    rawExpression: row.displaylogic,
    translated: translated.success ? translated.result : null,
    translationError: translated.success ? undefined : translated.error,
  };
}

function buildReadOnlyLogicRule(row) {
  const translated = translateExpression(row.readonlylogic);
  return {
    name: `${row.table_name}-${row.columnname}-readOnlyLogic`,
    type: 'readOnlyLogic',
    source: 'AD_Column',
    table: row.table_name,
    fieldName: row.name,
    column: row.columnname,
    rawExpression: row.readonlylogic,
    translated: translated.success ? translated.result : null,
    translationError: translated.success ? undefined : translated.error,
  };
}

// Rule naming is intentionally derived from the *source* of each logic
// expression so test ids are stable across pipeline runs:
//   - DisplayLogic lives on AD_Field, which is unique per (tab, column)
//     → `${windowName}-${tabName}-${columnName}-displayLogic`
//   - ReadOnlyLogic lives on AD_Column, which is unique per (table, column)
//     → `${tableName}-${columnName}-readOnlyLogic`
// The DISPLAY_LOGIC_SQL query joins AD_Field → AD_Column, so a single
// column that participates in multiple fields/tabs is returned once per
// field. We dedupe ReadOnlyLogic rules per column to avoid emitting the
// same rule N times.
function appendDisplayAndReadOnlyRules(rules, rows, windowName) {
  const seenReadOnlyRule = new Set();
  for (const row of rows) {
    if (row.displaylogic) {
      rules.push(buildDisplayLogicRule(row, windowName));
    }
    if (row.readonlylogic) {
      const ruleName = `${row.table_name}-${row.columnname}-readOnlyLogic`;
      if (seenReadOnlyRule.has(ruleName)) continue;
      seenReadOnlyRule.add(ruleName);
      rules.push(buildReadOnlyLogicRule(row));
    }
  }
}

async function buildProcessRule(row, sourceDir) {
  let sourceAnalysis = null;
  if (sourceDir && row.classname) {
    const source = await findSource(sourceDir, row.classname);
    sourceAnalysis = analyzeJavaSource(source);
  }
  return {
    type: 'process',
    source: row.mechanism === 'obuiapp_process' ? 'OBUIAPP_Process' : 'AD_Process',
    mechanism: row.mechanism,
    id: row.process_id ?? row.obuiapp_process_id,
    name: row.name,
    className: row.classname,
    column: row.column_name,
    ...(sourceAnalysis && {
      hasDml: sourceAnalysis.hasDml,
      loc: sourceAnalysis.loc,
      complexity: determineComplexity(sourceAnalysis),
    }),
  };
}

/**
 * Main orchestrator: queries 4 SQL sources + optional Java analysis.
 * Writes artifacts/{windowName}/rules-raw.json.
 */
export async function main(windowId, windowName) {
  const pool = createDbPool();
  const sourceDir = process.env.ETENDO_SOURCE_DIR ?? null;

  try {
    // Run all 5 queries in parallel
    const [calloutsRes, validationsRes, displayLogicRes, processesRes, auxInputsRes] = await Promise.all([
      pool.query(CALLOUTS_SQL, [windowId]),
      pool.query(VALIDATION_RULES_SQL, [windowId]),
      pool.query(DISPLAY_LOGIC_SQL, [windowId]),
      pool.query(DOCUMENT_PROCESSES_SQL, [windowId]),
      pool.query(AUXILIARY_INPUTS_SQL, [windowId]),
    ]);

    const rules = [];

    for (const row of calloutsRes.rows) {
      rules.push(await processCalloutRow(row, sourceDir));
    }
    for (const row of validationsRes.rows) {
      rules.push(buildValidationRule(row));
    }
    appendDisplayAndReadOnlyRules(rules, displayLogicRes.rows, windowName);
    for (const row of processesRes.rows) {
      rules.push(await buildProcessRule(row, sourceDir));
    }

    // Process auxiliary inputs (computed variables for DisplayLogic)
    const auxiliaryInputs = auxInputsRes.rows.map((row) => ({
      name: row.name,
      code: row.validation_code,
      tabName: row.tab_name,
      tabId: row.ad_tab_id,
    }));

    const output = {
      windowId,
      windowName,
      extractedAt: new Date().toISOString(),
      rules,
      auxiliaryInputs,
      summary: {
        callouts: calloutsRes.rows.length,
        validations: validationsRes.rows.length,
        displayLogic: displayLogicRes.rows.filter((r) => r.displaylogic).length,
        readOnlyLogic: displayLogicRes.rows.filter((r) => r.readonlylogic).length,
        processes: processesRes.rows.length,
        auxiliaryInputs: auxInputsRes.rows.length,
        total: rules.length,
      },
    };

    // Write to artifacts directory
    const artifactsDir = join(ROOT, 'artifacts', windowName);
    await mkdir(artifactsDir, { recursive: true });
    const outputPath = join(artifactsDir, 'rules-raw.json');
    await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');

    console.log(`Rules written to ${outputPath}`);
    console.log(`  Total rules: ${rules.length}`);
    console.log(`  Callouts: ${calloutsRes.rows.length}`);
    console.log(`  Validations: ${validationsRes.rows.length}`);
    console.log(`  Display Logic: ${output.summary.displayLogic}`);
    console.log(`  ReadOnly Logic: ${output.summary.readOnlyLogic}`);
    console.log(`  Processes: ${processesRes.rows.length}`);

    return output;
  } finally {
    await closePool(pool);
  }
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const writeCache = flags.includes('--write-cache');
  const fromCache = flags.includes('--from-cache');
  if (writeCache && fromCache) {
    console.error('Error: --write-cache and --from-cache are mutually exclusive');
    process.exit(1);
  }
  if (writeCache) setCacheMode({ mode: 'write' });
  else if (fromCache) setCacheMode({ mode: 'read' });

  const windowId = positional[0];
  const windowName = positional[1];

  if (!windowId || !windowName) {
    console.error('Usage: node extract-rules.js [--write-cache|--from-cache] <windowId> <windowName>');
    process.exit(1);
  }

  main(windowId, windowName)
    .then(() => {
      if (writeCache) {
        const { written, path } = flushCacheWrites();
        console.log(`Cache: wrote ${written} entries to ${path}`);
      }
    })
    .catch((err) => {
      console.error('Rule extraction failed:', err.message);
      process.exit(1);
    });
}
