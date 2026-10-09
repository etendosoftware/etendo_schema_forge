/**
 * Rows per `/batch` request for an import: the global `import-batch-size` flag (ETP-5676) when it
 * holds a usable number, else the window's `window.import.limit.batchSize`, else 1.
 *
 * "Usable" means a finite number that is at least 1 once rounded down. Anything else — unset,
 * 0 (the flag's declared default), negative, NaN, a string — means "no override". The engine
 * clamps the final value to its own 1..50 range, so this does not.
 *
 * One flag, no per-window or per-entity variants: it is an operational lever (turn batching down
 * to 1, or try a different size, without a deploy), not a second place to configure a window.
 *
 * @param {unknown} flagValue the `import-batch-size` flag
 * @param {unknown} decisionsBatchSize `window.import.limit.batchSize` from decisions.json
 * @returns {number} an integer >= 1
 */
export function resolveImportBatchSize(flagValue, decisionsBatchSize) {
  return usableSize(flagValue) ?? usableSize(decisionsBatchSize) ?? 1;
}

function usableSize(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const size = Math.floor(value);
  return size >= 1 ? size : null;
}
