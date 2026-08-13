export function createMemoryStorage() {
  const storage = new Map();

  return {
    getItem(key) {
      return storage.get(String(key)) ?? null;
    },
    setItem(key, value) {
      storage.set(String(key), String(value));
    },
    removeItem(key) {
      storage.delete(String(key));
    },
    clear() {
      storage.clear();
    },
    key(index) {
      return Array.from(storage.keys())[index] ?? null;
    },
    get length() {
      return storage.size;
    },
  };
}

export function installMemoryLocalStorage(target = globalThis) {
  Object.defineProperty(target, 'localStorage', {
    configurable: true,
    writable: true,
    value: createMemoryStorage(),
  });
}
