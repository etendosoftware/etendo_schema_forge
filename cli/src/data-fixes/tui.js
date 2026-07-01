/**
 * tui.js — Interactive wizard for the data-fixes runner.
 *
 * Launched automatically when run.js is invoked with no arguments in a TTY.
 * Guides the user through DB connection setup (pre-filled from gradle.properties)
 * and lets them pick a tenant and action before delegating to runMain().
 */

import * as p from '@clack/prompts';
import { resolveDbDefaults, createDbPool, closePool } from '../db.js';
import { loadCatalog, runMain } from './run.js';

// ── helpers ──────────────────────────────────────────────────────────────────

function exitOnCancel(value) {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
  return value;
}

async function testConnection(config) {
  const pool = createDbPool(config);
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await closePool(pool);
  }
}

async function fetchTenants(config) {
  const pool = createDbPool(config);
  try {
    const { rows } = await pool.query(
      `SELECT ad_client_id, name FROM ad_client WHERE ad_client_id <> '0' ORDER BY name`
    );
    return rows;
  } finally {
    await closePool(pool);
  }
}

// ── wizard steps ─────────────────────────────────────────────────────────────

async function promptDbConfig() {
  const defaults = resolveDbDefaults();
  const SOURCE_LABELS = {
    gradle: 'gradle.properties',
    env: 'env vars',
    defaults: 'built-in defaults',
  };
  const sourceLabel = SOURCE_LABELS[defaults.source] || 'built-in defaults';

  const useDefaults = exitOnCancel(await p.confirm({
    message: `Use DB config from ${sourceLabel}? (${defaults.user}@${defaults.host}:${defaults.port}/${defaults.database})`,
    initialValue: true,
  }));

  if (useDefaults) return defaults;

  p.note('Enter connection details manually.');

  const host = exitOnCancel(await p.text({
    message: 'Host',
    initialValue: defaults.host,
    validate: v => v.trim() ? undefined : 'Required',
  }));

  const portRaw = exitOnCancel(await p.text({
    message: 'Port',
    initialValue: String(defaults.port),
    validate: v => /^\d+$/.test(v.trim()) ? undefined : 'Must be a number',
  }));

  const database = exitOnCancel(await p.text({
    message: 'Database',
    initialValue: defaults.database,
    validate: v => v.trim() ? undefined : 'Required',
  }));

  const user = exitOnCancel(await p.text({
    message: 'User',
    initialValue: defaults.user,
    validate: v => v.trim() ? undefined : 'Required',
  }));

  const password = exitOnCancel(await p.password({
    message: 'Password (leave blank if none)',
  }));

  return { host, port: parseInt(portRaw, 10), database, user, password, source: 'manual' };
}

async function promptAndVerifyConnection() {
  let config;
  while (true) {
    config = await promptDbConfig();

    const s = p.spinner();
    s.start('Testing connection…');
    const result = await testConnection(config);
    if (result.ok) {
      s.stop('Connection OK.');
      return config;
    }
    s.stop(`Connection failed: ${result.error}`);

    const retry = exitOnCancel(await p.confirm({
      message: 'Retry with different settings?',
      initialValue: true,
    }));
    if (!retry) {
      p.cancel('Cannot connect to database.');
      process.exit(1);
    }
  }
}

// ── main export ───────────────────────────────────────────────────────────────

export async function runTui() {
  p.intro(' data-fixes — interactive mode ');

  const config = await promptAndVerifyConnection();

  // Load catalog to surface count to the user
  const catalog = await loadCatalog();
  p.note(`Catalog: ${catalog.length} fix(es) loaded.`);

  const action = exitOnCancel(await p.select({
    message: 'What do you want to do?',
    options: [
      { value: 'list',    label: 'List tenants & status' },
      { value: 'dry-run', label: 'Dry run  (preview, no writes)' },
      { value: 'apply',   label: 'Apply fixes' },
    ],
  }));

  // Fetch tenants for optional scoping
  let tenants;
  {
    const s = p.spinner();
    s.start('Fetching tenants…');
    tenants = await fetchTenants(config);
    s.stop(`${tenants.length} tenant(s) found.`);
  }

  const tenantChoice = exitOnCancel(await p.select({
    message: 'Tenant scope',
    options: [
      { value: '__all__', label: 'All tenants' },
      ...tenants.map(t => ({ value: t.ad_client_id, label: `${t.name}  (${t.ad_client_id})` })),
    ],
  }));

  const clientId = tenantChoice === '__all__' ? null : tenantChoice;

  p.outro('Launching runner…\n');

  // Build argv tokens and delegate to the shared runner logic
  const argv = [];
  if (action === 'list')    argv.push('--list-clients');
  if (action === 'dry-run') argv.push('--dry-run');
  if (clientId)             argv.push('--client', clientId);

  return runMain({ dbConfig: config, argv });
}
