import { createDbPool, closePool } from './db.js';

/**
 * SQL query to resolve a menu entry from AD_Menu by ID.
 * LEFT JOINs AD_Form to get the classname for form source file hints.
 */
export const MENU_QUERY = `
  SELECT m.AD_Menu_ID, m.Name, m.Action, m.AD_Window_ID, m.AD_Process_ID, m.IsSummary,
         f.ClassName AS form_classname
  FROM AD_Menu m
  LEFT JOIN AD_Form f ON f.AD_Form_ID = m.AD_Form_ID AND f.IsActive = 'Y'
  WHERE m.AD_Menu_ID = $1 AND m.IsActive = 'Y'
`;

/**
 * SQL query to resolve a menu entry from AD_Menu by name (case-insensitive).
 * LEFT JOINs AD_Form to get the classname for form source file hints.
 */
export const MENU_QUERY_BY_NAME = `
  SELECT m.AD_Menu_ID, m.Name, m.Action, m.AD_Window_ID, m.AD_Process_ID, m.IsSummary,
         f.ClassName AS form_classname
  FROM AD_Menu m
  LEFT JOIN AD_Form f ON f.AD_Form_ID = m.AD_Form_ID AND f.IsActive = 'Y'
  WHERE LOWER(m.Name) = LOWER($1) AND m.IsActive = 'Y'
`;

/**
 * Convert a name to kebab-case.
 * Lowercases, replaces spaces/underscores with hyphens,
 * removes non-alphanumeric chars except hyphens, collapses multiple hyphens, trims hyphens.
 */
export function toKebabCase(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Resolve a single menu row into a result object.
 * Shared logic for both resolveMenuEntry and resolveMenuByName.
 *
 * @param {object} row - Database row from MENU_QUERY or MENU_QUERY_BY_NAME
 * @returns {{action: string, menuName: string, windowId: string|null, processId: string|null, resolvedMode: string, resolvedName: string}}
 */
export function resolveFromRow(row) {
  const action = row.action;
  const menuName = row.name;
  const windowId = row.ad_window_id || null;
  const processId = row.ad_process_id || null;
  const isSummary = row.issummary;
  if (isSummary === 'Y') {
    throw new Error('Menu entry is a folder, not an actionable item');
  }

  if (action === 'R') {
    return {
      action,
      menuName,
      windowId,
      processId,
      resolvedMode: 'report',
      resolvedName: toKebabCase(menuName),
    };
  }

  if (action === 'X') {
    const formClassname = row.form_classname || null;
    const classSimpleName = formClassname
      ? formClassname.split('.').pop()
      : null;
    const sourceHint = classSimpleName
      ? `\n  Java: src/org/openbravo/erpCommon/ad_forms/${classSimpleName}.java` +
        `\n  HTML: src/org/openbravo/erpCommon/ad_forms/${classSimpleName}.html`
      : '';

    throw new Error(
      `'${menuName}' is an AD_Form. Forms have no extractable metadata and cannot be processed by the pipeline. This must be built manually.${sourceHint}`
    );
  }

  let resolvedMode;
  if (action === 'W') {
    resolvedMode = 'window';
  } else if (action === 'P') {
    resolvedMode = 'process';
  } else {
    throw new Error(`Unsupported menu action '${action}' for menu '${menuName}'`);
  }

  return {
    action,
    menuName,
    windowId,
    processId,
    resolvedMode,
    resolvedName: toKebabCase(menuName),
  };
}

/**
 * Resolve a menu entry from AD_Menu by ID.
 * Returns the action type, linked IDs, resolved mode, and kebab-cased name.
 *
 * @param {string} menuId - AD_Menu_ID to look up
 * @returns {Promise<{action: string, menuName: string, windowId: string|null, processId: string|null, resolvedMode: string, resolvedName: string}>}
 */
export async function resolveMenuEntry(menuId) {
  const pool = createDbPool();
  try {
    const { rows } = await pool.query(MENU_QUERY, [menuId]);

    if (rows.length === 0) {
      throw new Error(`Menu entry not found: ${menuId}`);
    }

    return resolveFromRow(rows[0]);
  } finally {
    await closePool(pool);
  }
}

/**
 * Resolve a menu entry from AD_Menu by name (case-insensitive).
 * Throws if no results or multiple results found.
 *
 * @param {string} menuName - Menu name to look up
 * @returns {Promise<{action: string, menuName: string, windowId: string|null, processId: string|null, resolvedMode: string, resolvedName: string}>}
 */
export async function resolveMenuByName(menuName) {
  const pool = createDbPool();
  try {
    const { rows } = await pool.query(MENU_QUERY_BY_NAME, [menuName]);

    if (rows.length === 0) {
      throw new Error(`Menu entry not found by name: ${menuName}`);
    }

    if (rows.length > 1) {
      const list = rows.map(r => `${r.name} (ID: ${r.ad_menu_id})`).join(', ');
      throw new Error(
        `Multiple menu entries found for '${menuName}': ${list}. Use --menu-id with a specific ID.`
      );
    }

    return resolveFromRow(rows[0]);
  } finally {
    await closePool(pool);
  }
}
