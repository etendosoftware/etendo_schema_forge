#!/usr/bin/env node
/**
 * Generates api/reports static manifest for production.
 * Output: tools/app-shell/dist/api/reports (no extension, served as application/json via S3 metadata)
 *
 * This file is created as part of `make build` so that `aws s3 sync dist/` always
 * includes it — preventing the manifest from being deleted by automated deployments.
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = join(__dirname, '../../artifacts');
const OUT_DIR = join(__dirname, '../../tools/app-shell/dist/api');
const OUT_FILE = join(OUT_DIR, 'reports');

const VALID_SOURCES = new Set(['jasper-migration', 'manual', 'sql', 'neo']);

function listReports() {
  const reports = [];
  for (const dir of readdirSync(ARTIFACTS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const contractPath = join(ARTIFACTS_DIR, dir.name, 'report-contract.json');
    if (!existsSync(contractPath)) continue;
    try {
      const c = JSON.parse(readFileSync(contractPath, 'utf8'));
      if (
        c.reportId &&
        c.outputs?.length > 0 &&
        c.type !== 'document' &&
        (VALID_SOURCES.has(c.source) || c.mockDataFile)
      ) {
        reports.push({
          id: c.reportId,
          title: c.title,
          type: c.type,
          category: c.category || 'other',
          orientation: c.orientation,
          outputs: c.outputs,
          parameters: c.parameters || [],
        });
      }
    } catch {
      // skip malformed
    }
  }
  return reports;
}

const reports = listReports();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(reports));
console.log(`reports manifest: ${reports.length} reports → dist/api/reports`);
