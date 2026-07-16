/*
 * remote.js — Remote-connection profiles + SSH tunnel management for the
 * data-fixes TUI.
 *
 * A "remote" target is an Etendo database that lives behind an SSH bastion
 * (typically an RDS instance in a private VPC). The heavy lifting — opening the
 * tunnel and picking the right SSL mode per client — is owned by the single
 * source of truth, `scripts/db-tunnel.sh`; this module just drives it from Node
 * and reads/writes the connection profiles the script also understands.
 *
 * Profiles are stored OUTSIDE the repo so credentials are never committed:
 *   ~/.config/schema-forge/remote/<name>.env   (or $SF_REMOTE_DIR)
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repo root: this file is at <root>/cli/src/data-fixes/lib/remote.js */
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const TUNNEL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'db-tunnel.sh');

/** Directory holding <name>.env connection profiles. */
export function remoteDir() {
  return process.env.SF_REMOTE_DIR || path.join(os.homedir(), '.config', 'schema-forge', 'remote');
}

const PROFILE_KEYS = ['SSH_HOST', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'LOCAL_PORT'];

/** List saved profile names (files ending in .env), sorted. */
export function listProfiles() {
  const dir = remoteDir();
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.env'))
      .map(f => f.slice(0, -'.env'.length))
      .sort();
  } catch {
    return [];
  }
}

/** Parse a `KEY=value` env file, stripping optional surrounding quotes. */
export function readProfile(name) {
  const file = path.join(remoteDir(), `${name}.env`);
  const content = fs.readFileSync(file, 'utf8');
  const cfg = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    cfg[key] = val;
  }
  return cfg;
}

/**
 * Persist a profile as a `<name>.env` file with 0600 perms. Values are wrapped
 * in single quotes so passwords with shell metacharacters ( ( ) ! = ... ) round
 * trip through both this reader and the bash `source` in db-tunnel.sh.
 */
export function saveProfile(name, cfg) {
  const dir = remoteDir();
  fs.mkdirSync(dir, { recursive: true });
  const lines = PROFILE_KEYS
    .filter(k => cfg[k] !== undefined && cfg[k] !== '')
    .map(k => `${k}='${String(cfg[k]).replace(/'/g, "'\\''")}'`);
  const file = path.join(dir, `${name}.env`);
  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  return file;
}

/** Build the inline connection flags db-tunnel.sh expects from a cfg object. */
function connectionFlags(cfg) {
  const flags = [];
  const map = {
    SSH_HOST: '--ssh-host', DB_HOST: '--db-host', DB_PORT: '--db-port',
    DB_NAME: '--db-name', DB_USER: '--db-user', DB_PASSWORD: '--db-password',
    LOCAL_PORT: '--local-port',
  };
  for (const [key, flag] of Object.entries(map)) {
    if (cfg[key] !== undefined && cfg[key] !== '') flags.push(flag, String(cfg[key]));
  }
  return flags;
}

/**
 * A stable control-socket key for a connection, so open/close pair up even for
 * a not-yet-saved config. Namespaced under "tui-" to avoid clashing with a
 * user's own `make db-tunnel` sessions.
 */
export function socketName(cfg) {
  const raw = `${cfg.SSH_HOST || ''}-${cfg.LOCAL_PORT || '15432'}`;
  return 'tui-' + raw.replace(/[^A-Za-z0-9_.-]/g, '_');
}

/** The resolved local port the tunnel forwards (default 15432). */
export function localPort(cfg) {
  return parseInt(cfg.LOCAL_PORT, 10) || 15432;
}

function runScript(cfg, command, { name } = {}) {
  const args = [TUNNEL_SCRIPT, ...connectionFlags(cfg), '--name', name || socketName(cfg), command];
  return spawnSync('bash', args, { encoding: 'utf8' });
}

/** Open the tunnel (idempotent). Throws with stderr on failure. */
export function tunnelUp(cfg) {
  const res = runScript(cfg, 'up');
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || 'tunnel failed to open').trim());
  }
  return { localPort: localPort(cfg) };
}

/** Close the tunnel. Best-effort — never throws (safe in exit handlers). */
export function tunnelDown(cfg) {
  try { runScript(cfg, 'down'); } catch { /* best effort */ }
}

/**
 * Build the pg pool config for a remote connection. The tunnel terminates at
 * 127.0.0.1, so the RDS cert CN never matches — encrypt without verifying the
 * hostname (mirrors the psql `sslmode=require` the script uses).
 */
export function remoteDbConfig(cfg) {
  return {
    host: 'localhost',
    port: localPort(cfg),
    database: cfg.DB_NAME || 'etendo',
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD || '',
    ssl: { rejectUnauthorized: false },
    source: 'remote',
  };
}
