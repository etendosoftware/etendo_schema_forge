/**
 * ETP-5190 — resolves the `window.import` contract block for a step's `importSpec`.
 *
 * Everything here is loaded on demand, and deliberately so. The contracts are also
 * dynamically imported by `useVectorSearchContracts`, so a static import would drag both of
 * them (and the two descriptor modules) into the entry chunk and defeat that code-split — Vite
 * says as much at build time. Nothing is needed until a user actually opens a bulk-load step.
 *
 * The loaders are memoized by spec: opening the same step twice must not re-import, and the
 * descriptors register themselves as a side effect, which should happen exactly once.
 */
const LOADERS = {
  product: async () => {
    // Side-effect imports: the descriptor and its FK resolvers register themselves with the
    // shared import registry. Without them the dialog opens with no descriptor and every row
    // fails at send time. Same modules the window's own `index.jsx` imports.
    await import('@/windows/custom/product/productFkResolvers.js');
    await import('@/windows/custom/product/productImportDescriptor.js');
    return import('@generated/product/contract.json');
  },
  contacts: async () => {
    await import('@/windows/custom/contacts/contactsFkResolvers.js');
    await import('@/windows/custom/contacts/contactsImportDescriptor.js');
    return import('@generated/contacts/contract.json');
  },
};

const cache = new Map();

/**
 * Reads the SAME `contract.json` block the generated list view inlines into its `import={...}`
 * prop, so the checklist can never drift from what the window itself offers: change the
 * window's `decisions.json` and both surfaces pick it up on the next `make regen`.
 *
 * @returns {Promise<object|null>} the import config, or `null` when the spec is unknown or
 *   that window declares no import.
 */
export function loadImportConfig(importSpec) {
  const loader = LOADERS[importSpec];
  if (!loader) return Promise.resolve(null);
  if (!cache.has(importSpec)) {
    cache.set(importSpec, loader().then((module) => {
      const config = (module.default ?? module)?.frontendContract?.window?.import;
      return config?.enabled ? config : null;
    }));
  }
  return cache.get(importSpec);
}

export default loadImportConfig;
