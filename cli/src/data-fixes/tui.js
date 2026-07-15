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
import {
  listProfiles, readProfile, saveProfile,
  tunnelUp, tunnelDown, remoteDbConfig,
} from './lib/remote.js';

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

// ── remote (SSH tunnel) connection ─────────────────────────────────────────

/** Prompt the full set of connection fields for a remote profile. */
async function promptRemoteFields(initial = {}) {
  const ssh = exitOnCancel(await p.text({
    message: 'SSH bastion host (alias from ~/.ssh/config, or user@host)',
    placeholder: 'etendo-go-staging',
    initialValue: initial.SSH_HOST || '',
    validate: v => v.trim() ? undefined : 'Required',
  }));
  const dbHost = exitOnCancel(await p.text({
    message: 'DB host (as seen FROM the bastion)',
    placeholder: 'my-db.rds.amazonaws.com',
    initialValue: initial.DB_HOST || '',
    validate: v => v.trim() ? undefined : 'Required',
  }));
  const dbPort = exitOnCancel(await p.text({
    message: 'DB port', initialValue: initial.DB_PORT || '5432',
    validate: v => /^\d+$/.test(v.trim()) ? undefined : 'Must be a number',
  }));
  const dbName = exitOnCancel(await p.text({
    message: 'Database', initialValue: initial.DB_NAME || 'etendo',
    validate: v => v.trim() ? undefined : 'Required',
  }));
  const dbUser = exitOnCancel(await p.text({
    message: 'DB user', initialValue: initial.DB_USER || 'postgres',
    validate: v => v.trim() ? undefined : 'Required',
  }));
  const dbPassword = exitOnCancel(await p.password({
    message: 'DB password (leave blank if none)',
  }));
  const localPort = exitOnCancel(await p.text({
    message: 'Local port to forward', initialValue: initial.LOCAL_PORT || '15432',
    validate: v => /^\d+$/.test(v.trim()) ? undefined : 'Must be a number',
  }));
  return {
    SSH_HOST: ssh.trim(), DB_HOST: dbHost.trim(), DB_PORT: dbPort.trim(),
    DB_NAME: dbName.trim(), DB_USER: dbUser.trim(), DB_PASSWORD: dbPassword || '',
    LOCAL_PORT: localPort.trim(),
  };
}

/**
 * Pick a saved profile or build a new one, offering to save it. Returns the
 * profile cfg (env-shaped: SSH_HOST, DB_HOST, ...).
 */
async function promptRemoteProfile() {
  const saved = listProfiles();
  let cfg;

  if (saved.length > 0) {
    const choice = exitOnCancel(await p.select({
      message: 'Connection profile',
      options: [
        ...saved.map(name => ({ value: name, label: name })),
        { value: '__new__', label: '＋ New connection…' },
      ],
    }));
    if (choice !== '__new__') {
      cfg = readProfile(choice);
      const edit = exitOnCancel(await p.confirm({
        message: `Use "${choice}" as-is? (${cfg.DB_USER}@${cfg.DB_HOST}:${cfg.DB_PORT || 5432} via ${cfg.SSH_HOST})`,
        initialValue: true,
      }));
      if (edit) return cfg;
      cfg = await promptRemoteFields(cfg);
    } else {
      cfg = await promptRemoteFields();
    }
  } else {
    p.note('No saved profiles yet — enter the connection details.');
    cfg = await promptRemoteFields();
  }

  const save = exitOnCancel(await p.confirm({
    message: 'Save this connection as a profile for next time?',
    initialValue: true,
  }));
  if (save) {
    const name = exitOnCancel(await p.text({
      message: 'Profile name',
      placeholder: 'staging',
      validate: v => /^[A-Za-z0-9_.-]+$/.test(v.trim()) ? undefined : 'Use letters, digits, _ . -',
    }));
    const file = saveProfile(name.trim(), cfg);
    p.note(`Saved to ${file}`);
  }
  return cfg;
}

/**
 * Configure a remote connection: pick/build a profile, open the SSH tunnel, and
 * return { config, cleanup } where config is the pg pool config (localhost end
 * of the tunnel, SSL on) and cleanup() closes the tunnel.
 */
async function setupRemoteConnection() {
  const profile = await promptRemoteProfile();

  const s = p.spinner();
  s.start(`Opening SSH tunnel via ${profile.SSH_HOST}…`);
  try {
    tunnelUp(profile);
  } catch (err) {
    s.stop(`Tunnel failed: ${err.message}`);
    p.cancel('Could not open the SSH tunnel.');
    process.exit(1);
  }
  s.stop(`Tunnel up on localhost:${profile.LOCAL_PORT || 15432}.`);

  // Close the tunnel on any exit path (normal, cancel, Ctrl-C).
  const cleanup = () => tunnelDown(profile);
  process.once('exit', cleanup);
  process.once('SIGINT', () => { cleanup(); process.exit(130); });

  return { config: remoteDbConfig(profile), cleanup };
}

// ── connection orchestration ────────────────────────────────────────────────

async function promptAndVerifyConnection() {
  const target = exitOnCancel(await p.select({
    message: 'Where is the database?',
    options: [
      { value: 'local',  label: 'Local  (gradle.properties / env vars)' },
      { value: 'remote', label: 'Remote (through an SSH tunnel)' },
    ],
  }));

  let cleanup = null;
  while (true) {
    let config;
    if (target === 'remote') {
      ({ config, cleanup } = await setupRemoteConnection());
    } else {
      config = await promptDbConfig();
    }

    const s = p.spinner();
    s.start('Testing connection…');
    const result = await testConnection(config);
    if (result.ok) {
      s.stop('Connection OK.');
      return { config, cleanup };
    }
    s.stop(`Connection failed: ${result.error}`);

    // A failed remote attempt leaves a tunnel open — tear it down before retry.
    if (cleanup) { cleanup(); cleanup = null; }

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

  const { config, cleanup } = await promptAndVerifyConnection();

  try {
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

    return await runMain({ dbConfig: config, argv });
  } finally {
    // Tear down the SSH tunnel (no-op for local connections).
    if (cleanup) cleanup();
  }
}
