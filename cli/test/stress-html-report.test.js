import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateLimitHtmlReport, getLimitStats, getVerdict } from './stress/html-report.js';

describe('Email stress HTML report', () => {
  const summaries = [
    {
      scenario: 'double-send',
      workers: 2,
      accepted: 1,
      deduplicated: 1,
      throttled: 0,
      errors: 0,
      pdfCacheFails: 0,
      p50: 120,
      p95: 150,
      maxLatency: 155,
    },
    {
      scenario: 'double-send',
      workers: 3,
      accepted: 1,
      deduplicated: 1,
      throttled: 0,
      errors: 1,
      pdfCacheFails: 1,
      p50: 220,
      p95: 250,
      maxLatency: 255,
    },
  ];

  it('computes last pass and first failure', () => {
    const stats = getLimitStats({ scenario: 'double-send', summaries });

    assert.equal(stats.lastPass.workers, 2);
    assert.equal(stats.firstFail.workers, 3);
    assert.deepEqual(getVerdict({ scenario: 'double-send', summary: summaries[0] }), {
      status: 'pass',
      label: 'dedup-ok',
    });
    assert.deepEqual(getVerdict({ scenario: 'double-send', summary: summaries[1] }), {
      status: 'fail',
      label: 'error',
    });
  });

  it('renders a redacted Jest-style HTML report', () => {
    const html = generateLimitHtmlReport({
      scenario: 'double-send',
      resetSafety: true,
      summaries,
      metadata: {
        generatedAt: '2026-06-29T16:00:00.000Z',
        title: 'Email Stress Limit Report',
        baseUrl: 'http://127.0.0.1:8080/etendo_sf2',
        windowName: 'sales-order',
        documentId: '6394CC7B913240CCB6A54FB9C22477AF',
        command: "node limits.js --token secret-token --token=equals-secret TOKEN='another-secret' DOC_ID=6394CC7B913240CCB6A54FB9C22477AF",
      },
    });

    assert.match(html, /Email Stress Limit Report/);
    assert.match(html, /Last Clean Pass/);
    assert.match(html, /<div class="metric">2<\/div>/);
    assert.match(html, /<div class="metric">3<\/div>/);
    assert.match(html, /dedup-ok/);
    assert.match(html, /<span class="badge fail">error<\/span>/);
    assert.match(html, /TOKEN=&lt;redacted&gt;/);
    assert.match(html, /--token &lt;redacted&gt;/);
    assert.match(html, /--token=&lt;redacted&gt;/);
    assert.doesNotMatch(html, /secret-token|equals-secret|another-secret/);
    assert.doesNotMatch(html, /6394CC7B913240CCB6A54FB9C22477AF/);
    assert.match(html, /\.\.\.B9C22477AF/);
  });
});
