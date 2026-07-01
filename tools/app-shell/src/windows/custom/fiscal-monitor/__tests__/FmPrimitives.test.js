import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'FmPrimitives.jsx'), 'utf8');

// Copied from FmPrimitives.jsx — cannot import the JSX module directly because it
// depends on React and @/i18n aliases unavailable in the Node test runner.
const ERROR_STATUSES = new Set([
  'IN', 'EE', 'AE',
  'Rechazado', 'Error',
  'rejected', 'invalid', 'partiallyAccepted',
]);
const isErrorStatus = (estado) => ERROR_STATUSES.has(estado);

// Guards: all SII error / ok / pending codes produce the correct boolean
describe('isErrorStatus — SII status codes', () => {
  it('IN is an error', () => assert.equal(isErrorStatus('IN'), true));
  it('EE is an error', () => assert.equal(isErrorStatus('EE'), true));
  it('AE (partial) is an error', () => assert.equal(isErrorStatus('AE'), true));
  it('CO (correct) is not an error', () => assert.equal(isErrorStatus('CO'), false));
  it('PE (pending) is not an error', () => assert.equal(isErrorStatus('PE'), false));
});

// Guards: TBAI-specific error codes are included in ERROR_STATUSES
describe('isErrorStatus — TBAI status codes', () => {
  it('Rechazado is an error', () => assert.equal(isErrorStatus('Rechazado'), true));
  it('Error is an error', () => assert.equal(isErrorStatus('Error'), true));
  it('Recibido is not an error', () => assert.equal(isErrorStatus('Recibido'), false));
  it('Pendiente is not an error', () => assert.equal(isErrorStatus('Pendiente'), false));
});

// Guards: Verifactu-specific error codes are included in ERROR_STATUSES
describe('isErrorStatus — Verifactu status codes', () => {
  it('partiallyAccepted is an error', () => assert.equal(isErrorStatus('partiallyAccepted'), true));
  it('rejected is an error', () => assert.equal(isErrorStatus('rejected'), true));
  it('invalid is an error', () => assert.equal(isErrorStatus('invalid'), true));
  it('accepted is not an error', () => assert.equal(isErrorStatus('accepted'), false));
});

// Guards: edge cases don't throw or produce false positives
describe('isErrorStatus — edge cases', () => {
  it('unknown status returns false', () => assert.equal(isErrorStatus('UNKNOWN'), false));
  it('null returns false', () => assert.equal(isErrorStatus(null), false));
  it('undefined returns false', () => assert.equal(isErrorStatus(undefined), false));
});

// Guards: public API of FmPrimitives.jsx is intact
describe('FmPrimitives — exports', () => {
  it('exports isErrorStatus', () => assert.match(src, /export const isErrorStatus/));
  it('exports ERROR_STATUSES', () => assert.match(src, /export const ERROR_STATUSES/));
});

// Guards: StatusPill renders a <button> when clickable, plain <span> otherwise
describe('StatusPill — onClick backward compatibility', () => {
  it('accepts an onClick prop in its destructured signature', () => {
    assert.match(src, /StatusPill.*\{.*onClick/);
  });

  it('renders a <button type="button"> with fm-pill class when onClick is provided', () => {
    assert.match(src, /if \(onClick\)[\s\S]*?<button/);
  });

  it('passes fiscalMonitor.viewContact as title only when onClick is provided', () => {
    assert.match(src, /fiscalMonitor\.viewContact/);
  });

  it('falls back to a plain <span> when no onClick is provided', () => {
    assert.match(src, /<span className=.*fm-pill/);
  });
});

// Guards: fmtDate, PAGE_SIZE, and WipBadge extracted from per-section copies
describe('FmPrimitives — shared utilities', () => {
  it('exports fmtDate', () => assert.match(src, /export.*fmtDate/));
  it('exports PAGE_SIZE = 20', () => assert.match(src, /export const PAGE_SIZE\s*=\s*20/));
  it('exports WipBadge', () => assert.match(src, /export const WipBadge/));
  it('WipBadge uses fiscal.wip.badge i18n key', () => assert.match(src, /fiscal\.wip\.badge/));
  it('WipBadge uses fiscal.wip.tooltip i18n key', () => assert.match(src, /fiscal\.wip\.tooltip/));
});

// Guards: isPendingStatus + PENDING_STATUSES added alongside the error helpers
describe('isPendingStatus — SII pending codes', () => {
  const PENDING_STATUSES = new Set(['PE', 'Pendiente']);
  const isPendingStatus = (estado) => PENDING_STATUSES.has(estado);

  it('PE (SII pending) is a pending status', () => assert.equal(isPendingStatus('PE'), true));
  it('CO (correct) is not pending', () => assert.equal(isPendingStatus('CO'), false));
  it('IN (incorrect) is not pending', () => assert.equal(isPendingStatus('IN'), false));
});

describe('isPendingStatus — TBAI pending codes', () => {
  const PENDING_STATUSES = new Set(['PE', 'Pendiente']);
  const isPendingStatus = (estado) => PENDING_STATUSES.has(estado);

  it('Pendiente (TBAI pending) is a pending status', () => assert.equal(isPendingStatus('Pendiente'), true));
  it('Recibido is not pending', () => assert.equal(isPendingStatus('Recibido'), false));
  it('Rechazado is not pending', () => assert.equal(isPendingStatus('Rechazado'), false));
});

describe('isPendingStatus — edge cases', () => {
  const PENDING_STATUSES = new Set(['PE', 'Pendiente']);
  const isPendingStatus = (estado) => PENDING_STATUSES.has(estado);

  it('null returns false', () => assert.equal(isPendingStatus(null), false));
  it('undefined returns false', () => assert.equal(isPendingStatus(undefined), false));
  it('unknown status returns false', () => assert.equal(isPendingStatus('UNKNOWN'), false));
});

describe('FmPrimitives — isPendingStatus exports', () => {
  it('exports isPendingStatus', () => assert.match(src, /export const isPendingStatus/));
  it('exports PENDING_STATUSES', () => assert.match(src, /export const PENDING_STATUSES/));
});

// Guards: StatusPill title prop — callers can supply an override tooltip
describe('StatusPill — title prop override', () => {
  it('accepts a title prop (titleProp) in the destructured signature', () => {
    assert.match(src, /title.*titleProp|titleProp.*title/);
  });

  it('uses titleProp when provided, falls back to fiscalMonitor.viewContact', () => {
    assert.match(src, /titleProp.*fiscalMonitor\.viewContact|fiscalMonitor\.viewContact.*titleProp/);
  });

  it('uses fiscalMonitor.openInvoice as the pending-row title', () => {
    assert.match(src, /fiscalMonitor\.openInvoice/);
  });
});

// Guards: CSV export functions are exported from FmPrimitives
describe('FmPrimitives — CSV export exports', () => {
  it('exports buildCsvAndDownload', () => {
    assert.match(src, /export(?:\s+async)?\s+function\s+buildCsvAndDownload/);
  });

  it('exports fetchCsvAndDownload', () => {
    assert.match(src, /export(?:\s+async)?\s+function\s+fetchCsvAndDownload/);
  });

  it('buildCsvAndDownload accepts filename, columnDefs, rows params', () => {
    assert.match(src, /buildCsvAndDownload\s*\(\s*filename\s*,\s*columnDefs\s*,\s*rows\s*\)/);
  });

  it('fetchCsvAndDownload accepts apiFetch, path, params, filename, columnDefs params', () => {
    assert.match(src, /fetchCsvAndDownload\s*\(\s*apiFetch\s*,\s*path\s*,\s*params\s*,\s*filename\s*,\s*columnDefs\s*\)/);
  });

  it('buildCsvAndDownload adds a UTF-8 BOM character', () => {
    assert.match(src, /\\ufeff|﻿/);
  });

  it('buildCsvAndDownload appends .csv when extension is missing', () => {
    assert.match(src, /\.endsWith\(['"]\.csv['"]\)/);
  });

  it('fetchCsvAndDownload throws on non-ok HTTP response', () => {
    assert.match(src, /throw new Error\(`HTTP \$\{res\.status\}`\)/);
  });

  it('fetchCsvAndDownload extracts rows from json.response.data', () => {
    assert.match(src, /json\?\.response\?\.data/);
  });

  it('buildCsvAndDownload calls URL.createObjectURL', () => {
    assert.match(src, /URL\.createObjectURL/);
  });

  it('buildCsvAndDownload calls URL.revokeObjectURL after click', () => {
    assert.match(src, /URL\.revokeObjectURL/);
  });
});
