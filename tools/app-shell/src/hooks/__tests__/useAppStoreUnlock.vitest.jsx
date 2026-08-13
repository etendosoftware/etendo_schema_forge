import { renderHook, act } from '@testing-library/react';
import {
  useAppStoreUnlock,
  unlockAppStore,
  lockAppStore,
  isAppStoreUnlocked,
  attachKeySequenceWatcher,
} from '../useAppStoreUnlock';

describe('useAppStoreUnlock', () => {
  beforeEach(() => {
    localStorage.clear();
    lockAppStore(); // reset to locked
  });

  describe('unlockAppStore / lockAppStore', () => {
    it('unlockAppStore sets the store to unlocked', () => {
      unlockAppStore();
      expect(isAppStoreUnlocked()).toBe(true);
      expect(localStorage.getItem('etendo.appStoreUnlocked')).toBe('1');
    });

    it('lockAppStore removes the flag', () => {
      unlockAppStore();
      lockAppStore();
      expect(isAppStoreUnlocked()).toBe(false);
      expect(localStorage.getItem('etendo.appStoreUnlocked')).toBeNull();
    });
  });

  describe('useAppStoreUnlock hook', () => {
    it('returns false by default', () => {
      const { result } = renderHook(() => useAppStoreUnlock());
      expect(result.current).toBe(false);
    });

    it('reacts to unlockAppStore', () => {
      const { result } = renderHook(() => useAppStoreUnlock());
      act(() => {
        unlockAppStore();
      });
      expect(result.current).toBe(true);
    });

    it('reacts to lockAppStore after unlock', () => {
      const { result } = renderHook(() => useAppStoreUnlock());
      act(() => { unlockAppStore(); });
      act(() => { lockAppStore(); });
      expect(result.current).toBe(false);
    });
  });

  describe('attachKeySequenceWatcher', () => {
    it('returns a dispose function', () => {
      const dispose = attachKeySequenceWatcher();
      expect(typeof dispose).toBe('function');
      dispose();
    });

    it('unlocks on typing "playstoreon"', () => {
      const onUnlock = vi.fn();
      const dispose = attachKeySequenceWatcher({ onUnlock });

      for (const ch of 'playstoreon') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }

      expect(isAppStoreUnlocked()).toBe(true);
      expect(onUnlock).toHaveBeenCalledTimes(1);
      dispose();
    });

    it('locks on typing "playstoreoff" when unlocked', () => {
      unlockAppStore();
      const onLock = vi.fn();
      const dispose = attachKeySequenceWatcher({ onLock });

      for (const ch of 'playstoreoff') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }

      expect(isAppStoreUnlocked()).toBe(false);
      expect(onLock).toHaveBeenCalledTimes(1);
      dispose();
    });

    it('ignores keystrokes in INPUT elements', () => {
      const dispose = attachKeySequenceWatcher();
      const input = document.createElement('input');
      document.body.appendChild(input);

      for (const ch of 'playstoreon') {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }

      expect(isAppStoreUnlocked()).toBe(false);
      document.body.removeChild(input);
      dispose();
    });

    it('ignores non-single-character keys', () => {
      const dispose = attachKeySequenceWatcher();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(isAppStoreUnlocked()).toBe(false);
      dispose();
    });

    it('resets buffer after 3 second timeout between keystrokes', () => {
      vi.useFakeTimers();
      const dispose = attachKeySequenceWatcher();

      // Type first part of the phrase
      for (const ch of 'playstore') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }

      // Advance time past the 3s reset threshold
      vi.advanceTimersByTime(3100);

      // Now type 'on' — should NOT unlock because buffer was reset
      for (const ch of 'on') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      expect(isAppStoreUnlocked()).toBe(false);

      vi.useRealTimers();
      dispose();
    });

    it('handles multiple unlock/lock cycles', () => {
      const onUnlock = vi.fn();
      const onLock = vi.fn();
      const dispose = attachKeySequenceWatcher({ onUnlock, onLock });

      // First unlock
      for (const ch of 'playstoreon') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      expect(isAppStoreUnlocked()).toBe(true);
      expect(onUnlock).toHaveBeenCalledTimes(1);

      // First lock
      for (const ch of 'playstoreoff') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      expect(isAppStoreUnlocked()).toBe(false);
      expect(onLock).toHaveBeenCalledTimes(1);

      // Second unlock
      for (const ch of 'playstoreon') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      expect(isAppStoreUnlocked()).toBe(true);
      expect(onUnlock).toHaveBeenCalledTimes(2);

      // Second lock
      for (const ch of 'playstoreoff') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      expect(isAppStoreUnlocked()).toBe(false);
      expect(onLock).toHaveBeenCalledTimes(2);

      dispose();
    });

    it('dispose removes the keydown listener', () => {
      const onUnlock = vi.fn();
      const dispose = attachKeySequenceWatcher({ onUnlock });
      dispose();

      // Typing after dispose should have no effect
      for (const ch of 'playstoreon') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      expect(isAppStoreUnlocked()).toBe(false);
      expect(onUnlock).not.toHaveBeenCalled();
    });

    it('does not re-unlock when already unlocked', () => {
      const onUnlock = vi.fn();
      unlockAppStore(); // Pre-unlock
      const dispose = attachKeySequenceWatcher({ onUnlock });

      for (const ch of 'playstoreon') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      // Already unlocked, so callback should not fire
      expect(onUnlock).not.toHaveBeenCalled();
      expect(isAppStoreUnlocked()).toBe(true);
      dispose();
    });

    it('does not re-lock when already locked', () => {
      const onLock = vi.fn();
      const dispose = attachKeySequenceWatcher({ onLock });

      // Type lock phrase while already locked
      for (const ch of 'playstoreoff') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      expect(onLock).not.toHaveBeenCalled();
      expect(isAppStoreUnlocked()).toBe(false);
      dispose();
    });

    it('ignores TEXTAREA elements', () => {
      const dispose = attachKeySequenceWatcher();
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);

      for (const ch of 'playstoreon') {
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      expect(isAppStoreUnlocked()).toBe(false);

      document.body.removeChild(textarea);
      dispose();
    });

    it('ignores contentEditable elements when isContentEditable is true', () => {
      const dispose = attachKeySequenceWatcher();
      const div = document.createElement('div');
      div.contentEditable = 'true';
      // jsdom may not fully support isContentEditable; override it
      Object.defineProperty(div, 'isContentEditable', { value: true });
      document.body.appendChild(div);

      for (const ch of 'playstoreon') {
        div.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      }
      expect(isAppStoreUnlocked()).toBe(false);

      document.body.removeChild(div);
      dispose();
    });

    it('handles no callbacks provided', () => {
      const dispose = attachKeySequenceWatcher(); // no onUnlock/onLock
      for (const ch of 'playstoreon') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
      }
      expect(isAppStoreUnlocked()).toBe(true);
      dispose();
    });
  });
});
