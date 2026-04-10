#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDbPool, closePool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
const CACHE_PATH = join(ROOT, 'core-maps', 'ad-menu-cache.json');

/**
 * SQL to extract the full AD_Menu tree with resolved types.
 * Includes windows, processes, reports, forms, and folders.
 */
const MENU_TREE_SQL = `
  SELECT
    m.AD_Menu_ID AS id,
    m.Name AS name,
    m.Action AS action,
    m.IsSummary AS is_summary,
    m.AD_Window_ID AS window_id,
    m.AD_Process_ID AS process_id,
    p.IsReport AS is_report,
    CASE
      WHEN m.IsSummary = 'Y' THEN 'folder'
      WHEN m.Action = 'W' THEN 'window'
      WHEN m.Action = 'R' THEN 'report'
      WHEN m.Action = 'P' AND COALESCE(p.IsReport, 'N') = 'Y' THEN 'report'
      WHEN m.Action = 'P' THEN 'process'
      WHEN m.Action = 'X' THEN 'form'
      ELSE 'other'
    END AS type
  FROM AD_Menu m
  LEFT JOIN AD_Process p ON m.AD_Process_ID = p.AD_Process_ID
  WHERE m.IsActive = 'Y'
  ORDER BY m.Name
`;

/**
 * Refresh the menu cache from the database.
 * Writes core-maps/ad-menu-cache.json.
 * @returns {object[]} The cached menu entries
 */
export async function refreshCache() {
  const pool = createDbPool();
  try {
    const { rows } = await pool.query(MENU_TREE_SQL);
    const entries = rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      windowId: r.window_id || null,
      processId: r.process_id || null,
    }));

    const cache = {
      refreshedAt: new Date().toISOString(),
      count: entries.length,
      entries,
    };

    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    return entries;
  } finally {
    await closePool(pool);
  }
}

/**
 * Load the cache from disk. Returns null if not found.
 */
export async function loadCache() {
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Search menu entries by name. Case-insensitive, supports partial match.
 * If no results found in cache, auto-refreshes and retries once.
 *
 * @param {string} query - Search term
 * @param {object} [options]
 * @param {string} [options.type] - Filter by type: window, process, report, form, folder
 * @param {boolean} [options.noAutoRefresh] - Skip auto-refresh on miss
 * @returns {object[]} Matching entries
 */
export async function searchMenu(query, options = {}) {
  let cache = await loadCache();

  if (!cache) {
    console.log('Menu cache not found, building from database...');
    const entries = await refreshCache();
    cache = { entries };
  }

  let results = filterEntries(cache.entries, query, options.type);

  // Auto-refresh if no results and not disabled
  if (results.length === 0 && !options.noAutoRefresh) {
    console.log(`No results for "${query}" in cache (${cache.refreshedAt}). Refreshing...`);
    const entries = await refreshCache();
    cache = { entries };
    results = filterEntries(cache.entries, query, options.type);
  }

  return results;
}

/**
 * Filter entries by query and optional type.
 * Supports: exact match, substring, and simple word matching.
 */
function filterEntries(entries, query, type) {
  const q = query.toLowerCase();
  let filtered = entries;

  if (type) {
    filtered = filtered.filter(e => e.type === type);
  }

  // Score each entry: exact > starts-with > word-boundary > substring
  const scored = filtered
    .map(e => {
      const name = e.name.toLowerCase();
      let score = 0;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else {
        // Word matching: "sales order" matches "Sales Order"
        const queryWords = q.split(/\s+/);
        const nameWords = name.split(/\s+/);
        const allMatch = queryWords.every(qw => nameWords.some(nw => nw.includes(qw)));
        if (allMatch) score = 40;
      }
      return { ...e, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // Remove score from output
  return scored.map(({ score, ...rest }) => rest);
}

/**
 * Format entries as a human-readable table.
 */
function formatTable(entries) {
  if (entries.length === 0) return '  No results found.';

  const typeColors = { window: 'W', process: 'P', report: 'R', form: 'F', folder: '📁' };
  const lines = entries.map(e => {
    const t = typeColors[e.type] || '?';
    const refId = e.windowId || e.processId || '-';
    return `  [${t}] ${e.name.padEnd(45)} ${refId}`;
  });
  return lines.join('\n');
}

// CLI entry point
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith('menu-cache.js') ||
  process.argv[1].endsWith('sf-menu')
);

if (isMainModule) {
  const command = process.argv[2];
  const arg = process.argv.slice(3).join(' ');

  if (command === 'refresh') {
    const entries = await refreshCache();
    console.log(`Menu cache refreshed: ${entries.length} entries written to ${CACHE_PATH}`);
  } else if (command === 'search' && arg) {
    // Parse optional --type flag
    let type = null;
    let query = arg;
    const typeMatch = arg.match(/--type\s+(window|process|report|form|folder)/);
    if (typeMatch) {
      type = typeMatch[1];
      query = arg.replace(typeMatch[0], '').trim();
    }
    const results = await searchMenu(query, { type });
    console.log(`Search: "${query}"${type ? ` (type: ${type})` : ''} — ${results.length} results\n`);
    console.log(formatTable(results));
  } else if (command === 'list') {
    // List by type
    const type = arg || null;
    const cache = await loadCache();
    if (!cache) {
      console.log('No cache found. Run: node menu-cache.js refresh');
      process.exit(1);
    }
    const filtered = type ? cache.entries.filter(e => e.type === type) : cache.entries;
    console.log(`Menu entries${type ? ` (${type})` : ''}: ${filtered.length} of ${cache.count} total (cached ${cache.refreshedAt})\n`);
    console.log(formatTable(filtered));
  } else {
    console.log('Usage:');
    console.log('  node menu-cache.js refresh                     # Rebuild cache from DB');
    console.log('  node menu-cache.js search <term>               # Search by name');
    console.log('  node menu-cache.js search <term> --type window # Filter by type');
    console.log('  node menu-cache.js list [type]                 # List all (or by type)');
    console.log('');
    console.log('Types: window, process, report, form, folder');
  }
}
