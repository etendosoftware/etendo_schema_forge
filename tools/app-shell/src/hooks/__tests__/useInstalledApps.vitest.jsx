/**
 * Tests for the mock installed-apps store: installApp, uninstallApp,
 * isInstalled, and the useInstalledApps subscription hook.
 */

import { renderHook, act } from '@testing-library/react';
import {
  installApp,
  uninstallApp,
  isInstalled,
  useInstalledApps,
} from '../useInstalledApps.js';

const STORAGE_KEY = 'etendo.installedApps';

describe('installed-apps store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('isInstalled / readFromStorage', () => {
    it('returns false when nothing is stored', () => {
      expect(isInstalled('a')).toBe(false);
    });

    it('returns false when stored value is not valid JSON', () => {
      window.localStorage.setItem(STORAGE_KEY, '{not-json');
      expect(isInstalled('a')).toBe(false);
    });

    it('returns false when stored JSON is not an array', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 1 }));
      expect(isInstalled('a')).toBe(false);
    });

    it('returns true when the app id is present', () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['a']));
      expect(isInstalled('a')).toBe(true);
    });
  });

  describe('installApp', () => {
    it('ignores a falsy app id', () => {
      installApp('');
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('adds a new app id', () => {
      installApp('a');
      expect(isInstalled('a')).toBe(true);
    });

    it('is a no-op when the app is already installed', () => {
      installApp('a');
      installApp('a');
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(['a']);
    });
  });

  describe('uninstallApp', () => {
    it('ignores a falsy app id', () => {
      installApp('a');
      uninstallApp('');
      expect(isInstalled('a')).toBe(true);
    });

    it('is a no-op when the app is not installed', () => {
      installApp('a');
      uninstallApp('b');
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(['a']);
    });

    it('removes an installed app id', () => {
      installApp('a');
      installApp('b');
      uninstallApp('a');
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(['b']);
    });
  });

  describe('useInstalledApps', () => {
    it('returns the current snapshot', () => {
      installApp('a');
      const { result } = renderHook(() => useInstalledApps());
      expect(result.current).toContain('a');
    });

    it('re-renders when an app is installed (same-tab custom event)', () => {
      const { result } = renderHook(() => useInstalledApps());
      expect(result.current).not.toContain('z');
      act(() => {
        installApp('z');
      });
      expect(result.current).toContain('z');
    });

    it('re-renders when an app is uninstalled', () => {
      installApp('z');
      const { result } = renderHook(() => useInstalledApps());
      expect(result.current).toContain('z');
      act(() => {
        uninstallApp('z');
      });
      expect(result.current).not.toContain('z');
    });

    it('responds to cross-tab storage events', () => {
      const { result } = renderHook(() => useInstalledApps());
      act(() => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['cross']));
        window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
      });
      expect(result.current).toContain('cross');
    });

    it('keeps a stable snapshot reference when nothing changed', () => {
      // Sync the in-memory cache with localStorage via a real write first.
      installApp('stable');
      const { result } = renderHook(() => useInstalledApps());
      const first = result.current;
      act(() => {
        // Dispatch a change event without altering storage content.
        window.dispatchEvent(new Event('storage'));
      });
      expect(result.current).toBe(first);
    });

    it('removes its listeners on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useInstalledApps());
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith(
        'etendo:installed-apps-changed',
        expect.any(Function),
      );
      removeSpy.mockRestore();
    });
  });
});
