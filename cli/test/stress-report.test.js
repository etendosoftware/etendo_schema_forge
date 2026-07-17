import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeResults } from './stress/report.js';

describe('Email stress summary', () => {
  it('fails double-send when the expected dedup count is missing', () => {
    const summary = summarizeResults({
      scenario: 'double-send',
      workers: 3,
      results: [
        {
          success: true,
          latency: 10,
          ctx: {
            previewCacheAttempted: true,
            previewCacheOk: true,
            previewCacheStatus: 200,
            sendEmailAttempted: true,
            sendEmailStatus: 200,
            sendEmailBody: { accepted: true },
          },
        },
        {
          success: true,
          latency: 11,
          ctx: {
            previewCacheAttempted: true,
            previewCacheOk: true,
            previewCacheStatus: 200,
          },
        },
        {
          success: true,
          latency: 12,
          ctx: {
            previewCacheAttempted: true,
            previewCacheOk: true,
            previewCacheStatus: 200,
          },
        },
      ],
    });

    assert.equal(summary.accepted, 1);
    assert.equal(summary.deduplicated, 0);
    assert.equal(summary.isPass, false);
    assert.match(summary.resultMsg, /N-1 deduplicated/);
  });

  it('accepts successful non-200 preview-cache statuses', () => {
    const summary = summarizeResults({
      scenario: 'double-send',
      workers: 2,
      results: [
        {
          success: true,
          latency: 10,
          ctx: {
            previewCacheAttempted: true,
            previewCacheOk: true,
            previewCacheStatus: 201,
            sendEmailAttempted: true,
            sendEmailStatus: 200,
            sendEmailBody: { accepted: true },
          },
        },
        {
          success: true,
          latency: 11,
          ctx: {
            previewCacheAttempted: true,
            previewCacheOk: true,
            previewCacheStatus: 204,
            sendEmailAttempted: true,
            sendEmailStatus: 200,
            sendEmailBody: { deduplicated: true },
          },
        },
      ],
    });

    assert.equal(summary.pdfCacheFails, 0);
    assert.equal(summary.isPass, true);
  });
});
