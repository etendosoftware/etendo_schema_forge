import { describe, expect, it } from 'vitest';
import { createMemoryStorage, installMemoryLocalStorage } from '../localStorage.js';

describe('test localStorage setup', () => {
  it('provides browser-like storage operations', () => {
    const storage = createMemoryStorage();

    expect(storage.length).toBe(0);
    expect(storage.getItem('missing')).toBeNull();

    storage.setItem('number', 10);
    storage.setItem('boolean', false);

    expect(storage.length).toBe(2);
    expect(storage.getItem('number')).toBe('10');
    expect(storage.getItem('boolean')).toBe('false');
    expect(storage.key(0)).toBe('number');

    storage.removeItem('number');

    expect(storage.length).toBe(1);
    expect(storage.getItem('number')).toBeNull();

    storage.clear();

    expect(storage.length).toBe(0);
  });

  it('installs storage without reading an existing localStorage getter', () => {
    const target = {};
    let getterWasRead = false;

    Object.defineProperty(target, 'localStorage', {
      configurable: true,
      get() {
        getterWasRead = true;
        throw new Error('localStorage getter should not be read');
      },
    });

    installMemoryLocalStorage(target);

    expect(getterWasRead).toBe(false);
    expect(target.localStorage.getItem('missing')).toBeNull();
    target.localStorage.setItem('token', 'abc');
    expect(target.localStorage.getItem('token')).toBe('abc');
  });
});
