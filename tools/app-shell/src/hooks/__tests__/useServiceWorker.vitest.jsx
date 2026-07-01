import { renderHook, act } from '@testing-library/react';
import { useServiceWorker } from '../useServiceWorker';

/**
 * Regression tests for ETP-4176: a service-worker controllerchange event used
 * to reload the page out from under a user who was mid-typing (e.g. on the
 * login/onboarding form), wiping their input and stealing focus. The hook now
 * has two guards:
 *   Guard 1 — ignore the first-install claim (no controller at mount).
 *   Guard 2 — defer the reload while the user is editing, then flush on focusout.
 */
describe('useServiceWorker', () => {
  let swListeners;
  let docListeners;
  let originalServiceWorker;
  let originalReload;
  let originalAddEventListener;
  let originalRemoveEventListener;
  let registrationUpdate;

  // Fire a captured serviceWorker event by type.
  function fireSwEvent(type) {
    (swListeners[type] || []).forEach((cb) => cb(new Event(type)));
  }

  // Fire a captured document event by type.
  function fireDocEvent(type) {
    (docListeners[type] || []).forEach((cb) => cb(new Event(type)));
  }

  beforeEach(() => {
    swListeners = {};
    docListeners = {};
    registrationUpdate = vi.fn();

    originalServiceWorker = Object.getOwnPropertyDescriptor(
      navigator,
      'serviceWorker',
    );

    // jsdom has no navigator.serviceWorker — define a controllable stub.
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      writable: true,
      value: {
        controller: { scriptURL: 'sw.js' }, // truthy by default (Guard 1 passes)
        addEventListener: (type, cb) => {
          (swListeners[type] = swListeners[type] || []).push(cb);
        },
        removeEventListener: (type, cb) => {
          swListeners[type] = (swListeners[type] || []).filter((l) => l !== cb);
        },
        getRegistration: () =>
          Promise.resolve({ update: registrationUpdate }),
      },
    });

    // Capture document listeners so we can assert cleanup, while still letting
    // real DOM events (focusout) fire through to the hook.
    originalAddEventListener = document.addEventListener;
    originalRemoveEventListener = document.removeEventListener;
    document.addEventListener = vi.fn((type, cb, opts) => {
      (docListeners[type] = docListeners[type] || []).push(cb);
      return originalAddEventListener.call(document, type, cb, opts);
    });
    document.removeEventListener = vi.fn((type, cb, opts) => {
      docListeners[type] = (docListeners[type] || []).filter((l) => l !== cb);
      return originalRemoveEventListener.call(document, type, cb, opts);
    });

    // window.location.reload is non-configurable in jsdom — replace location.
    originalReload = window.location;
    delete window.location;
    window.location = { ...originalReload, reload: vi.fn() };
  });

  afterEach(() => {
    document.addEventListener = originalAddEventListener;
    document.removeEventListener = originalRemoveEventListener;

    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      delete navigator.serviceWorker;
    }

    delete window.location;
    window.location = originalReload;

    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('Guard 1: ignores the first-install claim when no controller exists at mount', () => {
    navigator.serviceWorker.controller = null;

    const { unmount } = renderHook(() => useServiceWorker());

    act(() => {
      fireSwEvent('controllerchange');
    });

    expect(window.location.reload).not.toHaveBeenCalled();
    unmount();
  });

  it('Guard 2: defers the reload while the user is editing, preserving focus', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    const { unmount } = renderHook(() => useServiceWorker());

    act(() => {
      fireSwEvent('controllerchange');
    });

    // Reload must NOT fire while editing, and focus stays on the input.
    expect(window.location.reload).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    unmount();
  });

  it('Guard 2: flushes the deferred reload after the user blurs the field', () => {
    vi.useFakeTimers();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const { unmount } = renderHook(() => useServiceWorker());

    act(() => {
      fireSwEvent('controllerchange');
    });
    expect(window.location.reload).not.toHaveBeenCalled();

    // Move focus off the field, then fire focusout to flush the pending reload.
    act(() => {
      input.blur();
      document.body.focus();
      fireDocEvent('focusout');
    });

    // The flush happens inside a setTimeout(0).
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(window.location.reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('happy path: reloads once and notifies when an update arrives with nothing focused', () => {
    const onUpdateAvailable = vi.fn();

    const { unmount } = renderHook(() => useServiceWorker({ onUpdateAvailable }));

    act(() => {
      fireSwEvent('controllerchange');
    });

    expect(window.location.reload).toHaveBeenCalledTimes(1);
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('happy path: a non-editable focused element (button) does not defer the reload', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();

    const { unmount } = renderHook(() => useServiceWorker());

    act(() => {
      fireSwEvent('controllerchange');
    });

    expect(window.location.reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('idempotent: two controllerchange events reload only once (latch)', () => {
    const { unmount } = renderHook(() => useServiceWorker());

    act(() => {
      fireSwEvent('controllerchange');
      fireSwEvent('controllerchange');
    });

    expect(window.location.reload).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('Guard 2: defers the reload while focus is in a contentEditable region', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.setAttribute('tabindex', '0'); // make the div focusable in jsdom
    // jsdom does not reflect contentEditable into isContentEditable.
    Object.defineProperty(editable, 'isContentEditable', {
      configurable: true,
      get: () => true,
    });
    document.body.appendChild(editable);
    editable.focus();
    expect(document.activeElement).toBe(editable);

    const { unmount } = renderHook(() => useServiceWorker());

    act(() => {
      fireSwEvent('controllerchange');
    });

    expect(window.location.reload).not.toHaveBeenCalled();
    unmount();
  });

  it('focusout: a focusout with no pending reload is a no-op', () => {
    const { unmount } = renderHook(() => useServiceWorker());

    // No controllerchange happened, so pendingReload is false → early return.
    act(() => {
      fireDocEvent('focusout');
    });

    expect(window.location.reload).not.toHaveBeenCalled();
    unmount();
  });

  it('Guard 2: keeps deferring when focus is still in an editable field at flush time', () => {
    vi.useFakeTimers();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const { unmount } = renderHook(() => useServiceWorker());

    act(() => {
      fireSwEvent('controllerchange'); // sets pendingReload (user editing)
    });
    expect(window.location.reload).not.toHaveBeenCalled();

    // focusout fires but the user is STILL in an editable field → the deferred
    // flush re-checks on the next tick and keeps waiting (no reload).
    act(() => {
      fireDocEvent('focusout');
      vi.advanceTimersByTime(0);
    });

    expect(window.location.reload).not.toHaveBeenCalled();
    unmount();
  });

  it('isUserEditing: treats a null activeElement as not editing (reloads)', () => {
    const original = Object.getOwnPropertyDescriptor(document, 'activeElement');
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => null,
    });

    const { unmount } = renderHook(() => useServiceWorker());

    act(() => {
      fireSwEvent('controllerchange');
    });

    expect(window.location.reload).toHaveBeenCalledTimes(1);

    if (original) {
      Object.defineProperty(document, 'activeElement', original);
    } else {
      delete document.activeElement;
    }
    unmount();
  });

  it('checkForUpdate(): tolerates getRegistration resolving to no registration', async () => {
    navigator.serviceWorker.getRegistration = vi.fn(() =>
      Promise.resolve(undefined),
    );

    const { result, unmount } = renderHook(() => useServiceWorker());

    await act(async () => {
      result.current.checkForUpdate();
      await Promise.resolve();
    });

    expect(navigator.serviceWorker.getRegistration).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('clearCacheAndReload(): still reloads when there is no registration', async () => {
    const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches');
    Object.defineProperty(window, 'caches', {
      configurable: true,
      writable: true,
      value: {
        keys: () => Promise.resolve([]),
        delete: vi.fn(() => Promise.resolve()),
      },
    });
    navigator.serviceWorker.getRegistration = vi.fn(() =>
      Promise.resolve(undefined),
    );

    const { result, unmount } = renderHook(() => useServiceWorker());

    await act(async () => {
      result.current.clearCacheAndReload();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(window.location.reload).toHaveBeenCalledTimes(1);

    if (originalCaches) {
      Object.defineProperty(window, 'caches', originalCaches);
    } else {
      delete window.caches;
    }
    unmount();
  });

  it('no serviceWorker: effect returns early without throwing and still exposes the API', () => {
    // Remove the SW stub entirely so `'serviceWorker' in navigator` is false.
    delete navigator.serviceWorker;
    expect('serviceWorker' in navigator).toBe(false);

    let result;
    expect(() => {
      ({ result } = renderHook(() => useServiceWorker()));
    }).not.toThrow();

    // The effect bailed out, so no listeners were registered...
    expect(swListeners.controllerchange?.length || 0).toBe(0);
    expect(docListeners.visibilitychange?.length || 0).toBe(0);
    // ...but the hook still returns its public API.
    expect(typeof result.current.clearCacheAndReload).toBe('function');
    expect(typeof result.current.checkForUpdate).toBe('function');
  });

  it('checkForUpdate(): calls getRegistration().update on the resolved registration', async () => {
    const update = vi.fn();
    navigator.serviceWorker.getRegistration = vi.fn(() =>
      Promise.resolve({ update }),
    );

    const { result, unmount } = renderHook(() => useServiceWorker());

    await act(async () => {
      result.current.checkForUpdate();
      await Promise.resolve();
    });

    expect(navigator.serviceWorker.getRegistration).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('visibilitychange: polls update only when the document is visible', async () => {
    const update = vi.fn();
    navigator.serviceWorker.getRegistration = vi.fn(() =>
      Promise.resolve({ update }),
    );

    const originalVisibility = Object.getOwnPropertyDescriptor(
      document,
      'visibilityState',
    );
    const setVisibility = (state) =>
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
      });

    const { unmount } = renderHook(() => useServiceWorker());

    // Hidden → must NOT poll for updates.
    setVisibility('hidden');
    await act(async () => {
      fireDocEvent('visibilitychange');
      await Promise.resolve();
    });
    expect(update).not.toHaveBeenCalled();

    // Visible → polls getRegistration().update.
    setVisibility('visible');
    await act(async () => {
      fireDocEvent('visibilitychange');
      await Promise.resolve();
    });
    expect(navigator.serviceWorker.getRegistration).toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);

    if (originalVisibility) {
      Object.defineProperty(document, 'visibilityState', originalVisibility);
    } else {
      delete document.visibilityState;
    }
    unmount();
  });

  it('clearCacheAndReload(): clears caches, unregisters the SW, and reloads', async () => {
    const cacheDelete = vi.fn(() => Promise.resolve());
    const unregister = vi.fn(() => Promise.resolve());

    const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches');
    Object.defineProperty(window, 'caches', {
      configurable: true,
      writable: true,
      value: {
        keys: () => Promise.resolve(['a', 'b']),
        delete: cacheDelete,
      },
    });
    navigator.serviceWorker.getRegistration = vi.fn(() =>
      Promise.resolve({ unregister }),
    );

    const { result, unmount } = renderHook(() => useServiceWorker());

    await act(async () => {
      result.current.clearCacheAndReload();
      // Allow the chained awaits inside clearServiceWorkerStateAndReload to settle.
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(cacheDelete).toHaveBeenCalledWith('a');
    expect(cacheDelete).toHaveBeenCalledWith('b');
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(window.location.reload).toHaveBeenCalledTimes(1);

    if (originalCaches) {
      Object.defineProperty(window, 'caches', originalCaches);
    } else {
      delete window.caches;
    }
    unmount();
  });

  it("clearCacheAndReload(): reloads even when 'caches' is unavailable", async () => {
    const unregister = vi.fn(() => Promise.resolve());

    const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches');
    // Ensure 'caches' in window is false.
    delete window.caches;
    expect('caches' in window).toBe(false);

    navigator.serviceWorker.getRegistration = vi.fn(() =>
      Promise.resolve({ unregister }),
    );

    const { result, unmount } = renderHook(() => useServiceWorker());

    await act(async () => {
      result.current.clearCacheAndReload();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(unregister).toHaveBeenCalledTimes(1);
    expect(window.location.reload).toHaveBeenCalledTimes(1);

    if (originalCaches) {
      Object.defineProperty(window, 'caches', originalCaches);
    }
    unmount();
  });

  it('cleanup: unmount removes controllerchange, focusout, and visibilitychange listeners', () => {
    const { unmount } = renderHook(() => useServiceWorker());

    expect(swListeners.controllerchange?.length).toBe(1);
    expect(docListeners.focusout?.length).toBe(1);
    expect(docListeners.visibilitychange?.length).toBe(1);

    unmount();

    expect(swListeners.controllerchange?.length || 0).toBe(0);
    expect(docListeners.focusout?.length || 0).toBe(0);
    expect(docListeners.visibilitychange?.length || 0).toBe(0);
  });
});
