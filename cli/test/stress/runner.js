#!/usr/bin/env node

import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { run as runDoubleSend } from './scenarios/double-send.js';
import { run as runConcurrentLoad } from './scenarios/concurrent-load.js';
import { generateReport } from './report.js';
import { resetEmailSafetyBeforeRun } from './safety-reset.js';

// Setup AsyncLocalStorage to coordinate worker metadata across async calls
const workerContext = new AsyncLocalStorage();

// Parse CLI flags manually to remain dependency-free
const args = process.argv.slice(2);
const params = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const nextArg = args[i + 1];
    if (nextArg && !nextArg.startsWith('--')) {
      params[key] = nextArg;
      i++;
    } else {
      params[key] = true;
    }
  }
}

// Parametrization with environment variables falling back to defaults
const scenario = params['scenario'] || process.env.STRESS_SCENARIO;
const workers = parseInt(params['workers'] || process.env.STRESS_WORKERS || '10', 10);
const documentId = params['document-id'] || process.env.STRESS_DOC_ID;
const documentIdsStr = params['document-ids'] || process.env.STRESS_DOC_IDS;
const count = params['count'] ? parseInt(params['count'], 10) : undefined;
const windowName = params['window-name'] || process.env.STRESS_WINDOW || 'sales-order';
const baseUrl = params['base-url'] || process.env.ETENDO_BASE_URL || 'http://localhost:8080';
const token = params['token'] || process.env.ETENDO_TOKEN;
const delayMs = parseInt(params['delay-ms'] || process.env.STRESS_DELAY_MS || '0', 10);
const timeoutMs = parseInt(params['timeout-ms'] || process.env.STRESS_TIMEOUT_MS || '10000', 10);
const pdfBlobPath = params['pdf-blob'] || process.env.STRESS_PDF_BLOB;
const resetSafety = params['reset-safety'] === true || process.env.STRESS_RESET_SAFETY === '1';

// Validation
if (!scenario || (scenario !== 'double-send' && scenario !== 'concurrent-load')) {
  console.error('Error: --scenario must be either "double-send" or "concurrent-load"');
  process.exit(1);
}

if (!token) {
  console.error('Error: --token (or ETENDO_TOKEN env var) is required');
  process.exit(1);
}

if (scenario === 'double-send' && !documentId) {
  console.error('Error: --document-id (or STRESS_DOC_ID env var) is required for double-send scenario');
  process.exit(1);
}

// Handle PDF Blob resolution
let pdfBlob;
if (pdfBlobPath) {
  try {
    const buffer = fs.readFileSync(pdfBlobPath);
    pdfBlob = new Blob([buffer], { type: 'application/pdf' });
  } catch (err) {
    console.error(`Error loading PDF blob path "${pdfBlobPath}":`, err.message);
    process.exit(1);
  }
} else {
  // Fall back to synthetic 1KB blob as per design spec
  pdfBlob = new Blob([new Uint8Array(1024)], { type: 'application/pdf' });
}

// Set up FileReader mock for Node.js context (FileReader is used in tools/app-shell/src/.../documentEmailSend.js)
if (typeof global.FileReader === 'undefined') {
  global.FileReader = class FileReader {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(buf => {
        const base64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || ''};base64,${base64}`;
        if (this.onload) this.onload();
      }).catch(err => {
        if (this.onerror) this.onerror(err);
      });
    }
  };
}

// Intercept fetch calls globally to collect metrics and apply timeouts transparently
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  const ctx = workerContext.getStore();
  let timeoutId;
  let signal = options?.signal;

  if (timeoutMs > 0) {
    const controller = new AbortController();
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(signal.reason));
    }
    timeoutId = setTimeout(() => {
      controller.abort(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    options = { ...options, signal: controller.signal };
  }

  if (ctx) {
    const urlStr = String(url);
    if (urlStr.includes('/preview-file')) {
      ctx.previewCacheAttempted = true;
    } else if (urlStr.includes('/email-contracts/')) {
      ctx.sendEmailAttempted = true;
    }
  }

  try {
    const res = await originalFetch(url, options);
    if (timeoutId) clearTimeout(timeoutId);

    if (ctx) {
      const urlStr = String(url);
      if (urlStr.includes('/preview-file')) {
        ctx.previewCacheStatus = res.status;
        ctx.previewCacheOk = res.ok;
      } else if (urlStr.includes('/email-contracts/')) {
        ctx.sendEmailStatus = res.status;
        const clonedRes = res.clone();
        try {
          ctx.sendEmailBody = await clonedRes.json();
        } catch {
          ctx.sendEmailBody = null;
        }
      }
    }
    return res;
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (ctx) {
      const urlStr = String(url);
      if (urlStr.includes('/preview-file')) {
        ctx.previewCacheError = err;
      } else if (urlStr.includes('/email-contracts/')) {
        ctx.sendEmailError = err;
      }
    }
    throw err;
  }
};

// Scenario execution
let results;
let documentIds = [];
if (scenario === 'concurrent-load') {
  if (documentIdsStr) {
    documentIds = documentIdsStr.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    const idCount = count || workers;
    for (let i = 1; i <= idCount; i++) {
      documentIds.push(`SYNTHETIC-DOC-${String(i).padStart(4, '0')}`);
    }
  }
}

if (resetSafety) {
  await resetEmailSafetyBeforeRun({
    params,
    scenario,
    token,
    windowName,
    documentId,
    documentIds,
  });
}

if (scenario === 'double-send') {
  results = await runDoubleSend({
    workers,
    documentId,
    windowName,
    baseUrl,
    token,
    pdfBlob,
    timeoutMs,
    workerContext,
  });
} else {
  results = await runConcurrentLoad({
    workers,
    documentIds,
    windowName,
    baseUrl,
    token,
    pdfBlob,
    delayMs,
    timeoutMs,
    workerContext,
  });
}

// Generate report and terminate with the appropriate exit code
const exitCode = generateReport({
  scenario,
  workers,
  results,
});

process.exit(exitCode);
