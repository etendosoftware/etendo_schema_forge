#!/usr/bin/env node

import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { run as runDoubleSend } from './scenarios/double-send.js';
import { run as runConcurrentLoad } from './scenarios/concurrent-load.js';
import { summarizeResults } from './report.js';
import { resetEmailSafetyBeforeRun } from './safety-reset.js';
import { writeLimitHtmlReport } from './html-report.js';

const workerContext = new AsyncLocalStorage();

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

const scenario = params.scenario || process.env.STRESS_SCENARIO || 'double-send';
const workerSteps = parseWorkerSteps(params['worker-steps'] || process.env.STRESS_WORKER_STEPS || '1,2,5,10,20,50');
const documentId = params['document-id'] || process.env.STRESS_DOC_ID;
const documentIdsStr = params['document-ids'] || process.env.STRESS_DOC_IDS;
const windowName = params['window-name'] || process.env.STRESS_WINDOW || 'sales-order';
const baseUrl = params['base-url'] || process.env.ETENDO_BASE_URL || 'http://localhost:8080';
const token = params.token || process.env.ETENDO_TOKEN;
const delayMs = parseInt(params['delay-ms'] || process.env.STRESS_DELAY_MS || '0', 10);
const timeoutMs = parseInt(params['timeout-ms'] || process.env.STRESS_TIMEOUT_MS || '10000', 10);
const pdfBlobPath = params['pdf-blob'] || process.env.STRESS_PDF_BLOB;
const resetSafety = params['reset-safety'] === true || process.env.STRESS_RESET_SAFETY === '1';
const htmlReportPath = params['html-report'] || process.env.STRESS_HTML_REPORT;
const htmlReportTitle = params['html-report-title'] || process.env.STRESS_HTML_REPORT_TITLE;

if (scenario !== 'double-send' && scenario !== 'concurrent-load') {
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
  pdfBlob = new Blob([new Uint8Array(1024)], { type: 'application/pdf' });
}

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

const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  const ctx = workerContext.getStore();
  let timeoutId;

  if (timeoutMs > 0) {
    const controller = new AbortController();
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort(options.signal.reason));
    }
    timeoutId = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
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
        try {
          ctx.sendEmailBody = await res.clone().json();
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

const summaries = [];
let fatalError = null;

try {
  for (const workers of workerSteps) {
    const documentIds = resolveDocumentIds({ workers, documentIdsStr });
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

    const startedAt = Date.now();
    const results = scenario === 'double-send'
      ? await runDoubleSend({ workers, documentId, windowName, baseUrl, token, pdfBlob, timeoutMs, workerContext })
      : await runConcurrentLoad({ workers, documentIds, windowName, baseUrl, token, pdfBlob, delayMs, timeoutMs, workerContext });
    const summary = summarizeResults({ scenario, workers, results });
    summary.durationMs = Date.now() - startedAt;
    summaries.push(summary);
    printStepSummary(summary);
  }
} catch (err) {
  fatalError = err;
  console.error(`[${scenario}] aborted: ${err.message}`);
}

if (summaries.length > 0) {
  printLimitSummary({ scenario, workerSteps, summaries, resetSafety });
} else {
  console.error(`[${scenario}] no completed worker steps to summarize`);
}

if (htmlReportPath) {
  const writtenPath = writeLimitHtmlReport({
    path: htmlReportPath,
    scenario,
    summaries,
    resetSafety,
    metadata: {
      title: htmlReportTitle,
      baseUrl,
      windowName,
      documentId,
      documentIds: documentIdsStr,
      command: buildReportCommand(),
      fatalError: fatalError ? fatalError.message : null,
    },
  });
  console.log(`Email stress HTML report written to ${writtenPath}`);
}

const hasUnexpectedErrors = summaries.some(s => s.errors > 0 || s.pdfCacheFails > 0);
const hasDoubleSendViolation = scenario === 'double-send'
  && summaries.some(s => s.accepted !== 1 || s.deduplicated !== s.workers - 1 || s.throttled !== 0);

process.exit(fatalError || hasUnexpectedErrors || hasDoubleSendViolation ? 1 : 0);

function parseWorkerSteps(raw) {
  const steps = String(raw)
    .split(',')
    .map(value => parseInt(value.trim(), 10))
    .filter(value => Number.isInteger(value) && value > 0);
  if (steps.length === 0) {
    console.error('Error: --worker-steps must contain at least one positive integer');
    process.exit(1);
  }
  return Array.from(new Set(steps)).sort((a, b) => a - b);
}

function resolveDocumentIds({ workers, documentIdsStr }) {
  if (documentIdsStr) {
    return documentIdsStr.split(',').map(s => s.trim()).filter(Boolean);
  }
  const ids = [];
  for (let i = 1; i <= workers; i++) {
    ids.push(`SYNTHETIC-DOC-${String(i).padStart(4, '0')}`);
  }
  return ids;
}

function printStepSummary(summary) {
  const status = summary.isPass ? 'ok' : 'limit/fail';
  console.log(
    `[${summary.scenario}] workers=${summary.workers} status=${status}` +
    ` accepted=${summary.accepted}` +
    ` dedup=${summary.deduplicated ?? '-'}` +
    ` throttled=${summary.throttled}` +
    ` errors=${summary.errors}` +
    ` p95=${summary.p95}ms`
  );
}

function printLimitSummary({ scenario, summaries, resetSafety }) {
  console.log(`\nEmail Stress Limit Probe — ${scenario}`);
  console.log('────────────────────────────────────────────────────────────────────────────────────────────');
  console.log(`  reset-safety: ${resetSafety ? 'yes' : 'no'}`);
  console.log('');
  if (scenario === 'double-send') {
    console.log('  workers | accepted | dedup | throttled | errors | pdf_fail | p50_ms | p95_ms | max_ms | verdict');
    console.log('  --------+----------+-------+-----------+--------+----------+--------+--------+--------+---------');
    for (const s of summaries) {
      const verdict = s.accepted === 1 && s.deduplicated === s.workers - 1 && s.throttled === 0 && s.errors === 0 && s.pdfCacheFails === 0
        ? 'dedup-ok'
        : s.errors > 0 || s.pdfCacheFails > 0
          ? 'error'
          : 'dedup-broken';
      console.log(
        `  ${pad(s.workers, 7)} | ${pad(s.accepted, 8)} | ${pad(s.deduplicated, 5)} | ${pad(s.throttled, 9)} | ${pad(s.errors, 6)} | ${pad(s.pdfCacheFails, 8)} | ${pad(s.p50, 6)} | ${pad(s.p95, 6)} | ${pad(s.maxLatency, 6)} | ${verdict}`
      );
    }
  } else {
    console.log('  workers | accepted | throttled | throttle% | first_429 | errors | p50_ms | p95_ms | max_ms | verdict');
    console.log('  --------+----------+-----------+-----------+-----------+--------+--------+--------+--------+---------');
    for (const s of summaries) {
      const verdict = s.errors > 0 ? 'error' : s.throttled > 0 ? 'throttled' : 'accepted';
      console.log(
        `  ${pad(s.workers, 7)} | ${pad(s.accepted, 8)} | ${pad(s.throttled, 9)} | ${pad(s.throttlePct, 9)} | ${pad(s.firstThrottleAt ?? '-', 9)} | ${pad(s.errors, 6)} | ${pad(s.p50, 6)} | ${pad(s.p95, 6)} | ${pad(s.maxLatency, 6)} | ${verdict}`
      );
    }
  }
  console.log('────────────────────────────────────────────────────────────────────────────────────────────\n');
}

function pad(value, length) {
  return String(value).padStart(length, ' ');
}

function buildReportCommand() {
  const target = htmlReportPath ? 'email-stress-limits-report' : 'email-stress-limits';
  const parts = [
    'make',
    target,
    `SCENARIO=${shellValue(scenario)}`,
    `WINDOW_NAME=${shellValue(windowName)}`,
    `BASE_URL=${shellValue(baseUrl)}`,
    `WORKER_STEPS=${shellValue(workerSteps.join(','))}`,
    'TOKEN=<redacted>',
  ];

  if (scenario === 'double-send') {
    parts.push(`DOC_ID=${shellValue(maskIdentifier(documentId))}`);
  } else if (documentIdsStr) {
    parts.push(`DOC_IDS=${shellValue(maskIdentifierList(documentIdsStr))}`);
  }

  if (htmlReportPath) {
    parts.push(`EMAIL_STRESS_REPORT=${shellValue(htmlReportPath)}`);
  }

  if (resetSafety !== true) {
    parts.push(`RESET_SAFETY=${resetSafety ? '1' : '0'}`);
  }

  return parts.join(' ');
}

function shellValue(value) {
  const str = String(value ?? '');
  return /^[A-Za-z0-9_./:,-]+$/.test(str) ? str : `'${str.replaceAll("'", "'\\''")}'`;
}

function maskIdentifierList(value) {
  return String(value || '')
    .split(',')
    .map(item => maskIdentifier(item.trim()))
    .filter(Boolean)
    .join(',');
}

function maskIdentifier(value) {
  const str = String(value || '');
  if (str.length <= 10) return str;
  return `...${str.slice(-10)}`;
}
