import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse a gradle.properties file into a key-value object.
 * Skips comments (#) and empty lines.
 */
function parseGradleProperties(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const props = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    props[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return props;
}

/**
 * Resolve DB config from (in priority order):
 * 1. Explicit config object passed as argument
 * 2. Environment variables (ETENDO_DB_HOST, etc.)
 * 3. gradle.properties file (auto-discovered or via ETENDO_GRADLE_PROPERTIES env var)
 *
 * @param {object} [config] - Explicit DB config (host, port, user, password, database)
 * @param {string} [gradlePropertiesPath] - Path to gradle.properties (overrides auto-discovery)
 */
export function createDbPool(config, gradlePropertiesPath) {
  if (config && config.host) {
    return new pg.Pool(config);
  }

  // Try to read gradle.properties
  let gradle = null;
  const gradlePath = gradlePropertiesPath
    || process.env.ETENDO_GRADLE_PROPERTIES
    || findGradleProperties();

  if (gradlePath) {
    try {
      gradle = parseGradleProperties(gradlePath);
    } catch {
      // File not found or unreadable — fall through to env vars / defaults
    }
  }

  // Resolve host: gradle bbdd.url contains jdbc:postgresql://host:port
  let gradleHost = null;
  let gradlePort = null;
  if (gradle) {
    if (gradle['bbdd.url']) {
      const urlMatch = gradle['bbdd.url'].match(/postgresql:\/\/([^:/]+)(?::(\d+))?/);
      if (urlMatch) {
        gradleHost = urlMatch[1];
        if (urlMatch[2]) gradlePort = parseInt(urlMatch[2], 10);
      }
    }
    // bbdd.port overrides URL port if present
    if (gradle['bbdd.port']) {
      gradlePort = parseInt(gradle['bbdd.port'], 10);
    }
  }

  return new pg.Pool({
    host: process.env.ETENDO_DB_HOST || (gradleHost === 'db' ? 'localhost' : gradleHost) || 'localhost',
    port: parseInt(process.env.ETENDO_DB_PORT, 10) || gradlePort || 5432,
    user: process.env.ETENDO_DB_USER || gradle?.['bbdd.user'] || 'etendo',
    password: process.env.ETENDO_DB_PASSWORD || gradle?.['bbdd.password'] || '',
    database: process.env.ETENDO_DB_NAME || gradle?.['bbdd.sid'] || 'etendo_dev',
    max: 5,
  });
}

/**
 * Auto-discover gradle.properties by walking up from the CLI source dir.
 * Schema Forge lives at {etendo_root}/schema_forge/cli/src/db.js
 * so gradle.properties is at ../../.. relative to this file.
 */
function findGradleProperties() {
  // Try: schema_forge/../gradle.properties (etendo root)
  const candidate = join(__dirname, '..', '..', '..', 'gradle.properties');
  try {
    readFileSync(candidate, 'utf-8');
    return candidate;
  } catch {
    return null;
  }
}

export async function closePool(pool) {
  await pool.end();
}
