function getPercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((sorted.length * p) / 100) - 1)
  );
  return sorted[index];
}

export function summarizeResults({ scenario, workers, results }) {
  // Extract latencies for successful/attempted operations
  const latencies = results.map(r => r.latency).filter(l => typeof l === 'number');
  const minLatency = latencies.length ? Math.min(...latencies) : 0;
  const maxLatency = latencies.length ? Math.max(...latencies) : 0;
  const p50 = getPercentile(latencies, 50);
  const p95 = getPercentile(latencies, 95);

  if (scenario === 'double-send') {
    let sentCount = 0;
    let accepted = 0;
    let deduplicated = 0;
    let throttled = 0;
    let errors = 0;
    let pdfCacheFails = 0;

    for (const r of results) {
      const ctx = r.ctx;

      // 1. PDF Cache Failure detection
      const previewStatusFailed = ctx.previewCacheAttempted
        && ctx.previewCacheOk === undefined
        && ctx.previewCacheStatus
        && (ctx.previewCacheStatus < 200 || ctx.previewCacheStatus >= 300);
      if (ctx.previewCacheError
        || (ctx.previewCacheAttempted && ctx.previewCacheOk === false)
        || previewStatusFailed) {
        pdfCacheFails++;
      }

      // 2. Sent Count detection (reached email contract send endpoint)
      if (ctx.sendEmailAttempted) {
        sentCount++;
      }

      const status = ctx.sendEmailStatus;
      const body = ctx.sendEmailBody;

      if (status === 200) {
        // Look for typical Etendo Go deduplication markers in response body
        const isDedup = 
          body?.deduplicated === true || 
          body?.deduplicate === true || 
          body?.dedup === true || 
          body?.isDuplicate === true || 
          body?.status === 'DUPLICATE' ||
          body?.response?.data?.deduplicated === true || 
          body?.response?.data?.status === 'DUPLICATE' ||
          body?.data?.status === 'DUPLICATE' ||
          body?.data?.deduplicated === true;

        if (isDedup) {
          deduplicated++;
        } else {
          accepted++;
        }
      } else if (status === 429) {
        throttled++;
      } else if (ctx.sendEmailAttempted) {
        // Non-200, non-429 response or send errors are counted as errors
        errors++;
      }
    }

    // In case any worker failed to even attempt preview-cache (unhandled exceptions)
    const unhandledFails = results.filter(r => !r.success && !r.ctx.previewCacheAttempted).length;
    pdfCacheFails += unhandledFails;

    const acceptedPct = Math.round((accepted / workers) * 100) || 0;
    const dedupPct = Math.round((deduplicated / workers) * 100) || 0;

    const isPass = accepted === 1
      && deduplicated === workers - 1
      && sentCount === workers
      && errors === 0
      && pdfCacheFails === 0
      && throttled === 0;

    const resultMsg = isPass 
      ? 'PASS — idempotency dedup working correctly'
      : `FAIL — expected exactly 1 accepted, N-1 deduplicated, 0 errors, 0 PDF cache fails. Got: ${accepted} accepted, ${deduplicated} deduplicated, ${errors} errors, ${pdfCacheFails} PDF cache failures`;

    return {
      scenario,
      workers,
      sentCount,
      accepted,
      acceptedPct,
      deduplicated,
      dedupPct,
      throttled,
      errors,
      pdfCacheFails,
      minLatency,
      p50,
      p95,
      maxLatency,
      isPass,
      resultMsg,
    };
  } else if (scenario === 'concurrent-load') {
    let totalRequests = workers;
    let accepted = 0;
    let throttled = 0;
    let errors = 0;
    let firstThrottleAt = null;

    // Sort results by workerIndex to determine the first throttled worker order
    const sortedResults = [...results].sort((a, b) => a.workerIndex - b.workerIndex);

    for (const r of sortedResults) {
      const ctx = r.ctx;
      const status = ctx.sendEmailStatus;

      if (status === 200) {
        accepted++;
      } else if (status === 429) {
        throttled++;
        if (firstThrottleAt === null) {
          firstThrottleAt = r.workerIndex;
        }
      } else {
        errors++;
      }
    }

    const acceptedPct = Math.round((accepted / workers) * 100) || 0;
    const throttlePct = Math.round((throttled / workers) * 100) || 0;
    const isPass = errors === 0;
    const resultMsg = isPass
      ? 'PASS — concurrent load test finished successfully'
      : `FAIL — unexpected errors occurred during concurrent load test (${errors} errors)`;

    return {
      scenario,
      workers,
      totalRequests,
      accepted,
      acceptedPct,
      throttled,
      throttlePct,
      errors,
      firstThrottleAt,
      minLatency,
      p50,
      p95,
      maxLatency,
      isPass,
      resultMsg,
    };
  }

  throw new Error(`Unsupported stress scenario: ${scenario}`);
}

export function generateReport({ scenario, workers, results }) {
  const summary = summarizeResults({ scenario, workers, results });

  if (scenario === 'double-send') {
    const {
      sentCount,
      accepted,
      acceptedPct,
      deduplicated,
      dedupPct,
      throttled,
      errors,
      pdfCacheFails,
      minLatency,
      p50,
      p95,
      maxLatency,
      isPass,
      resultMsg,
    } = summary;

    console.log(`\nEmail Stress Test — double-send (${workers} workers)`);
    console.log('────────────────────────────────────────────');
    console.log(`  Sent count:    ${sentCount}`);
    console.log(`  Accepted:      ${accepted}   (${acceptedPct}%)`);
    console.log(`  Deduplicated:  ${deduplicated}  (${dedupPct}%)`);
    console.log(`  Throttled:     ${throttled}`);
    console.log(`  Errors:        ${errors}`);
    console.log(`  PDF cache fails: ${pdfCacheFails}`);
    console.log('');
    console.log(`  Latency (ms):  min=${minLatency}  p50=${p50}  p95=${p95}  max=${maxLatency}`);
    console.log('');
    console.log(`  Result: ${resultMsg}`);
    console.log('────────────────────────────────────────────\n');

    return isPass ? 0 : 1;

  } else if (scenario === 'concurrent-load') {
    const {
      totalRequests,
      accepted,
      acceptedPct,
      throttled,
      throttlePct,
      errors,
      firstThrottleAt,
      minLatency,
      p50,
      p95,
      maxLatency,
      isPass,
      resultMsg,
    } = summary;

    console.log(`\nEmail Stress Test — concurrent-load (${workers} workers)`);
    console.log('────────────────────────────────────────────');
    console.log(`  Total Requests: ${totalRequests}`);
    console.log(`  Accepted:       ${accepted}  (${acceptedPct}%)`);
    console.log(`  Throttled:      ${throttled}  (${throttlePct}%)`);
    console.log(`  Errors:         ${errors}`);
    console.log('');
    console.log(`  First Throttle At: ${firstThrottleAt !== null ? `Worker index ${firstThrottleAt}` : 'None'}`);
    console.log(`  Throttle Rate:     ${throttlePct}%`);
    console.log('');
    console.log(`  Latency (ms):  min=${minLatency}  p50=${p50}  p95=${p95}  max=${maxLatency}`);
    console.log('');
    console.log(`  Result: ${resultMsg}`);
    console.log('────────────────────────────────────────────\n');

    return isPass ? 0 : 1;
  }
}
