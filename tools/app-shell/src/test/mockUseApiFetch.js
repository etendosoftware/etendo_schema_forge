export function createStableUseApiFetchMock() {
  const cache = new Map();

  return (base = '') => {
    if (!cache.has(base)) {
      cache.set(base, (path, options = {}) => globalThis.fetch(`${base}${path}`, options));
    }
    return cache.get(base);
  };
}
