import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ReportViewerPage.jsx'), 'utf8');

// Sanity check: fail loudly if the source drifts away from this copy instead
// of silently testing stale logic.
describe('ReportViewerPage.jsx source sanity', () => {
  it('still declares buildReportFilename with the expected signature', () => {
    assert.match(src, /function buildReportFilename\(reportId, format, suffix = ''\)/);
  });

  it('still uses buildReportFilename at both download call sites', () => {
    const matches = src.match(/buildReportFilename\(/g) || [];
    // 1 declaration + 2 call sites (main export, detail/drill-down export)
    assert.equal(matches.length, 3);
  });
});

// Copied from ReportViewerPage.jsx — not exported, tested inline here.
// Update both if the source changes.
function buildReportFilename(reportId, format, suffix = '') {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${reportId}${suffix}-${dd}-${mm}-${yyyy}.${format}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

describe('buildReportFilename — inline logic (copied from ReportViewerPage.jsx)', () => {
  it('formats as "<id>-DD-MM-YYYY.<ext>" without a suffix', () => {
    const now = new Date();
    const expectedDate = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
    assert.equal(
      buildReportFilename('report-general-ledger', 'pdf'),
      `report-general-ledger-${expectedDate}.pdf`
    );
  });

  it('pads single-digit day and month to 2 digits', () => {
    // Freeze the clock to a date with single-digit day and month (5 Jan).
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(2026, 0, 5); // 5 Jan 2026 — local time, month is 0-indexed
        } else {
          super(...args);
        }
      }
    }
    global.Date = FixedDate;
    try {
      assert.equal(buildReportFilename('tax-report', 'csv'), 'tax-report-05-01-2026.csv');
    } finally {
      global.Date = RealDate;
    }
  });

  it('inserts the suffix before the date, with no double dash or stray characters', () => {
    const now = new Date();
    const expectedDate = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
    const filename = buildReportFilename('tax-report', 'pdf', '-detail');
    assert.equal(filename, `tax-report-detail-${expectedDate}.pdf`);
    assert.doesNotMatch(filename, /--/);
    assert.doesNotMatch(filename, /\s/);
  });

  it('defaults suffix to empty string and produces no leading dash before the id', () => {
    const filename = buildReportFilename('balance-sheet', 'xlsx');
    assert.ok(filename.startsWith('balance-sheet-'));
    assert.doesNotMatch(filename, /^-/);
  });
});
