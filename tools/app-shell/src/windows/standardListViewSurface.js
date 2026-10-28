function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Contract checks for audited entry points that forward gridView to the standard DataTable. */
export function isStandardListViewSurface(sourceEligible, contract, expectedHeaderTable = null, expectedLayout = 'default') {
  const window = contract?.window;
  if (!sourceEligible || !isRecord(window)) return false;
  if (window.customComponents != null && !isRecord(window.customComponents)) return false;
  return (window.customComponents?.headerTable ?? null) === expectedHeaderTable
    && (window.layoutType ?? 'default') === expectedLayout;
}
