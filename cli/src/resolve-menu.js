import { createDbPool, closePool } from './db.js';

/**
 * SQL query to resolve a menu entry from AD_Menu.
 */
export const MENU_QUERY = `
  SELECT m.AD_Menu_ID, m.Name, m.Action, m.AD_Window_ID, m.AD_Process_ID, m.IsSummary
  FROM AD_Menu m
  WHERE m.AD_Menu_ID = $1 AND m.IsActive = 'Y'
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
 * Resolve a menu entry from AD_Menu by ID.
 * Returns the action type, linked IDs, resolved mode, and kebab-cased name.
 *
 * @param {string} menuId - AD_Menu_ID to look up
 * @returns {Promise<{action: string, menuName: string, windowId: string|null, processId: string|null, resolvedMode: string|null, resolvedName: string}>}
 */
export async function resolveMenuEntry(menuId) {
  const pool = createDbPool();
  try {
    const { rows } = await pool.query(MENU_QUERY, [menuId]);

    if (rows.length === 0) {
      throw new Error(`Menu entry not found: ${menuId}`);
    }

    const row = rows[0];
    const action = row.action;
    const menuName = row.name;
    const windowId = row.ad_window_id || null;
    const processId = row.ad_process_id || null;
    const isSummary = row.issummary;

    if (isSummary === 'Y') {
      throw new Error('Menu entry is a folder, not an actionable item');
    }

    if (action === 'R') {
      throw new Error('Report pipelines are not yet supported (Phase 2)');
    }

    if (action === 'X') {
      throw new Error('Form pipelines are not supported');
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
  } finally {
    await closePool(pool);
  }
}
