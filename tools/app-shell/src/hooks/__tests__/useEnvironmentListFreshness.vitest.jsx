// @covers tools/app-shell/src/hooks/useEnvironmentListFreshness.js
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENVIRONMENT_LIST_INTERVAL_MS,
  ENVIRONMENT_LIST_MIN_SPACING_MS,
  useEnvironmentListFreshness,
} from '../useEnvironmentListFreshness.js';
import { ENVIRONMENT_LIST_REFRESH_EVENT } from '../useEnvironmentSwitch.js';
import { QUOTA_REFUSED_EVENT } from '../../lib/planQuotas.js';

/**
 * ETP-5051 — the app-level triggers that keep `GET /sws/go/environments` (and with it the quota
 * banner) fresh. The hook does not read anything itself: every trigger dispatches the shared
 * `ENVIRONMENT_LIST_REFRESH_EVENT`, which `useEnvironmentSwitch` answers with one forced read.
 * So what is observable is the number of refresh events, counted here by a window listener.
 *
 * Fake timers drive both the interval and `Date.now()` (the spacing clock), and the document's
 * visibility is a getter the test flips.
 */

let visibility;
let refreshes;
const countRefresh = () => { refreshes += 1; };

function setVisibility(state) {
  visibility = state;
}

function focus() {
  window.dispatchEvent(new Event('focus'));
}

function becomeVisible() {
  setVisibility('visible');
  document.dispatchEvent(new Event('visibilitychange'));
}

function becomeHidden() {
  setVisibility('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
}

function quotaRefused() {
  window.dispatchEvent(new Event(QUOTA_REFUSED_EVENT));
}

/** A refresh fired by someone else (an upgrade, provisioning): counted apart from the hook's. */
function externalRefresh() {
  window.dispatchEvent(new Event(ENVIRONMENT_LIST_REFRESH_EVENT));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T10:00:00Z'));
  refreshes = 0;
  setVisibility('visible');
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  window.addEventListener(ENVIRONMENT_LIST_REFRESH_EVENT, countRefresh);
});

afterEach(() => {
  window.removeEventListener(ENVIRONMENT_LIST_REFRESH_EVENT, countRefresh);
  delete document.visibilityState;
  vi.useRealTimers();
});

describe('useEnvironmentListFreshness', () => {
  it('exposes the 30 s spacing and the 5-minute interval', () => {
    expect(ENVIRONMENT_LIST_MIN_SPACING_MS).toBe(30_000);
    expect(ENVIRONMENT_LIST_INTERVAL_MS).toBe(5 * 60_000);
  });

  describe('focus and visibility', () => {
    // The page load already read the list: a focus that arrives with the mount must not repeat it.
    it('does not refresh on a focus right after mount', () => {
      renderHook(() => useEnvironmentListFreshness());
      focus();
      becomeVisible();
      expect(refreshes).toBe(0);
    });

    it('refreshes once on a focus 30 s after mount', () => {
      renderHook(() => useEnvironmentListFreshness());
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS);
      focus();
      expect(refreshes).toBe(1);
    });

    it('refreshes once when the tab becomes visible again after 30 s', () => {
      renderHook(() => useEnvironmentListFreshness());
      becomeHidden();
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS);
      expect(refreshes).toBe(0);
      becomeVisible();
      expect(refreshes).toBe(1);
    });

    // A tab switch fires both `focus` and `visibilitychange`: one refresh, not two.
    it('counts a tab switch (visibilitychange then focus) as one refresh', () => {
      renderHook(() => useEnvironmentListFreshness());
      becomeHidden();
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS);
      becomeVisible();
      focus();
      expect(refreshes).toBe(1);
    });

    it('does not refresh when the tab is hidden', () => {
      renderHook(() => useEnvironmentListFreshness());
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS);
      becomeHidden();
      focus();
      expect(refreshes).toBe(0);
    });

    it('spaces repeated focus events at least 30 s apart', () => {
      renderHook(() => useEnvironmentListFreshness());
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS);
      focus();
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS - 1);
      focus();
      focus();
      expect(refreshes).toBe(1);

      vi.advanceTimersByTime(1);
      focus();
      expect(refreshes).toBe(2);
    });

    // Anyone's refresh (an upgrade, provisioning) has just re-read the list.
    it('restarts the spacing clock on a refresh fired by someone else', () => {
      renderHook(() => useEnvironmentListFreshness());
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS + 10_000);
      externalRefresh();
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS - 1);
      focus();
      expect(refreshes - 1).toBe(0);

      vi.advanceTimersByTime(1);
      focus();
      expect(refreshes - 1).toBe(1);
    });
  });

  describe('the 5-minute interval', () => {
    it('refreshes every 5 minutes while the tab is visible', () => {
      renderHook(() => useEnvironmentListFreshness());
      vi.advanceTimersByTime(ENVIRONMENT_LIST_INTERVAL_MS - 1);
      expect(refreshes).toBe(0);
      vi.advanceTimersByTime(1);
      expect(refreshes).toBe(1);
      vi.advanceTimersByTime(ENVIRONMENT_LIST_INTERVAL_MS);
      expect(refreshes).toBe(2);
    });

    it('does not fire while the tab is hidden, and resumes once it is visible', () => {
      renderHook(() => useEnvironmentListFreshness());
      setVisibility('hidden');
      vi.advanceTimersByTime(2 * ENVIRONMENT_LIST_INTERVAL_MS);
      expect(refreshes).toBe(0);

      setVisibility('visible');
      vi.advanceTimersByTime(ENVIRONMENT_LIST_INTERVAL_MS);
      expect(refreshes).toBe(1);
    });
  });

  describe('a quota refusal', () => {
    // The banner must turn red right after the refusal, so this trigger ignores the spacing.
    it('refreshes at once, even right after mount and right after another refresh', () => {
      renderHook(() => useEnvironmentListFreshness());
      quotaRefused();
      expect(refreshes).toBe(1);
      quotaRefused();
      expect(refreshes).toBe(2);
    });

    it('restarts the spacing clock like any other refresh', () => {
      renderHook(() => useEnvironmentListFreshness());
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS);
      quotaRefused();
      focus();
      expect(refreshes).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('fires nothing after unmount', () => {
      const { unmount } = renderHook(() => useEnvironmentListFreshness());
      unmount();

      vi.advanceTimersByTime(2 * ENVIRONMENT_LIST_INTERVAL_MS);
      focus();
      becomeVisible();
      quotaRefused();
      expect(refreshes).toBe(0);
    });

    it('does nothing at all when disabled', () => {
      renderHook(() => useEnvironmentListFreshness({ enabled: false }));

      vi.advanceTimersByTime(2 * ENVIRONMENT_LIST_INTERVAL_MS);
      focus();
      becomeHidden();
      becomeVisible();
      quotaRefused();
      expect(refreshes).toBe(0);
    });

    it('starts listening when it becomes enabled, with the spacing clock starting then', () => {
      const { rerender } = renderHook(({ enabled }) => useEnvironmentListFreshness({ enabled }), {
        initialProps: { enabled: false },
      });
      vi.advanceTimersByTime(ENVIRONMENT_LIST_MIN_SPACING_MS);
      rerender({ enabled: true });
      focus();
      expect(refreshes).toBe(0);

      quotaRefused();
      expect(refreshes).toBe(1);
    });

    it('stops listening when it becomes disabled', () => {
      const { rerender } = renderHook(({ enabled }) => useEnvironmentListFreshness({ enabled }), {
        initialProps: { enabled: true },
      });
      rerender({ enabled: false });
      quotaRefused();
      vi.advanceTimersByTime(ENVIRONMENT_LIST_INTERVAL_MS);
      expect(refreshes).toBe(0);
    });
  });
});
