import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, createDbPool } from '../../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ETENDO_GRADLE_PROPERTIES = join(
  __dirname,
  '..',
  '..',
  '..',
  'etendo_core',
  'gradle.properties'
);

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function decodeJwtPayload(token) {
  const [, payload] = String(token || '').split('.');
  if (!payload) return {};
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

function resolveGradlePropertiesPath(params) {
  if (params['db-gradle-properties']) return params['db-gradle-properties'];
  if (process.env.STRESS_DB_GRADLE_PROPERTIES) return process.env.STRESS_DB_GRADLE_PROPERTIES;
  if (process.env.ETENDO_GRADLE_PROPERTIES) return process.env.ETENDO_GRADLE_PROPERTIES;
  return existsSync(DEFAULT_ETENDO_GRADLE_PROPERTIES) ? DEFAULT_ETENDO_GRADLE_PROPERTIES : undefined;
}

function resolveResetDocumentIds({ scenario, documentId, documentIds }) {
  if (scenario === 'double-send') return unique([documentId]);
  return unique(documentIds || []);
}

export async function resetEmailSafetyBeforeRun({
  params,
  scenario,
  token,
  windowName,
  documentId,
  documentIds,
}) {
  const contractName = `${windowName}-send`;
  const jwt = decodeJwtPayload(token);
  const resetDocumentIds = resolveResetDocumentIds({ scenario, documentId, documentIds });
  const gradlePropertiesPath = resolveGradlePropertiesPath(params);

  const pool = createDbPool(undefined, gradlePropertiesPath);
  try {
    const throttleResult = await pool.query(`
      delete from etgo_email_safety
      where record_type = 'THROTTLE'
        and isactive = 'Y'
        and contract_name = $1
        and scope = 'RECORD'
        and bucket_key = any($2::text[])
    `, [contractName, resetDocumentIds]);

    let auditDeleted = 0;
    if (resetDocumentIds.length > 0) {
      const auditResult = await pool.query(`
        delete from etgo_email_safety
        where record_type = 'AUDIT'
          and isactive = 'Y'
          and contract_name = $1
          and (
            idempotency_key like any($2::text[])
            or payload::text like any($3::text[])
          )
      `, [
        contractName,
        resetDocumentIds.flatMap(id => [
          `${contractName}:%:${id}:%`,
          `${contractName}:${id}:%`,
        ]),
        resetDocumentIds.map(id => `%"recordId":"${id}"%`),
      ]);
      auditDeleted = auditResult.rowCount || 0;
    }

    console.log(
      `[reset-safety] Deleted ${throttleResult.rowCount || 0} record-throttle row(s) and ${auditDeleted} audit row(s)` +
      ` for ${contractName}` +
      (resetDocumentIds.length ? ` document(s): ${resetDocumentIds.join(',')}` : '') +
      (jwt.client ? ` tenant=${jwt.client}` : '') +
      (jwt.user ? ` user=${jwt.user}` : '')
    );
  } finally {
    await closePool(pool);
  }
}
