const VECTOR_TARGET = /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/;

/**
 * Resolves opted-in window contracts into a stable, deduplicated target list.
 * Missing vectorSearch is the default: the window does not participate.
 */
export function resolveVectorSearchTargetKeys(contracts = []) {
  const targets = contracts
    .map(entry => entry?.contract?.default ?? entry?.contract ?? entry?.default ?? entry)
    .map(contract => contract?.frontendContract?.window?.vectorSearch?.target)
    .filter(target => typeof target === 'string' && VECTOR_TARGET.test(target));
  return [...new Set(targets)];
}

/**
 * Resolves contract-declared targets to their owning window specs. The route and result type
 * label are supplied by the generated-contract loader, never inferred from a vector target.
 */
export function resolveVectorSearchTargets(contracts = []) {
  const targets = new Map();
  contracts.forEach((entry) => {
    const contract = entry?.contract?.default ?? entry?.contract ?? entry?.default ?? entry;
    const target = contract?.frontendContract?.window?.vectorSearch?.target;
    const specName = entry?.specName;
    const label = contract?.frontendContract?.window?.name;
    if (typeof target === 'string' && VECTOR_TARGET.test(target) &&
      typeof specName === 'string' && specName.length > 0 && !targets.has(target)) {
      targets.set(target, {
        target,
        specName,
        label: typeof label === 'string' && label.length > 0 ? label : specName,
      });
    }
  });
  return [...targets.values()];
}

/**
 * Finds the target declared by the current window route. Record routes retain the same first
 * segment as their list route, so this works for both /<spec> and /<spec>/<recordId>.
 */
export function resolveVectorSearchTargetForPath(pathname, targets = []) {
  const specName = pathname.split('/').filter(Boolean)[0];
  return targets.find((target) => target.specName === specName) ?? null;
}

/**
 * Resolves contract-declared navigation suggestions. Suggestions are deliberately declared by
 * windows because only the owning window can define the query parameters it understands.
 */
export function resolveWindowSearchSuggestions(contracts = []) {
  return contracts.flatMap((entry) => {
    const contract = entry?.contract?.default ?? entry?.contract ?? entry?.default ?? entry;
    const specName = entry?.specName;
    const suggestions = contract?.frontendContract?.window?.searchSuggestions;
    if (typeof specName !== 'string' || !Array.isArray(suggestions)) return [];
    return suggestions
      .filter((suggestion) => (
        typeof suggestion?.label === 'string' &&
        typeof suggestion?.path === 'string' &&
        suggestion.path.startsWith(`/${specName}`)
      ))
      .map((suggestion) => ({ ...suggestion, specName }));
  });
}
