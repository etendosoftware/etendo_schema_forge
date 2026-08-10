import { renderHook, waitFor } from '@testing-library/react';
import { useLocaleDictionaries } from '../useLocaleDictionaries.js';

// Deferred promise helper: lets a test control exactly when a "loadCore()"
// import resolves, so we can assert on the state DURING the async gap —
// that's the window where ETP-4663's flash used to be visible.
function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

describe('useLocaleDictionaries', () => {
  it('resolves the initial locale and renders it once its dictionary loads', async () => {
    const loaders = {
      './locales/generated/core.es_ES.json': () => Promise.resolve({ default: { hello: 'Hola' } }),
    };
    const { result } = renderHook(() => useLocaleDictionaries('es_ES', loaders));

    // Both waitFors get a longer timeout: under a fully-loaded CPU (e.g. the full
    // pre-push suite running hundreds of files in parallel), renderedLocale and
    // dictionaries can update on separate ticks far enough apart that the default
    // 1000ms window isn't enough — this was observed flaking there while always
    // passing in isolation. Polling `dictionaries.es_ES` itself (not just asserting
    // it right after the first waitFor resolves) is the actual fix; the timeout bump
    // is what gives it room to matter under load.
    await waitFor(() => expect(result.current.renderedLocale).toBe('es_ES'), { timeout: 5000 });
    await waitFor(() => expect(result.current.dictionaries.es_ES).toEqual({ hello: 'Hola' }), { timeout: 5000 });
  });

  it('ETP-4663: keeps rendering the previous locale/dictionary while the new one is still loading (no flash)', async () => {
    const es = deferred();
    const en = deferred();
    const loaders = {
      './locales/generated/core.es_ES.json': () => es.promise,
      './locales/generated/core.en_US.json': () => en.promise,
    };

    const { result, rerender } = renderHook(
      ({ locale }) => useLocaleDictionaries(locale, loaders),
      { initialProps: { locale: 'es_ES' } },
    );

    es.resolve({ default: { hello: 'Hola' } });
    await waitFor(() => expect(result.current.renderedLocale).toBe('es_ES'));

    // Switch to en_US, but its dictionary has NOT resolved yet.
    rerender({ locale: 'en_US' });

    // The old regression: dictionaries got wiped to {} here, so `ui()` would
    // echo raw keys. The fix keeps the es_ES entry and renderedLocale until
    // en_US is actually ready.
    expect(result.current.renderedLocale).toBe('es_ES');
    expect(result.current.dictionaries.es_ES).toEqual({ hello: 'Hola' });

    en.resolve({ default: { hello: 'Hello' } });
    await waitFor(() => expect(result.current.renderedLocale).toBe('en_US'));
    expect(result.current.dictionaries.en_US).toEqual({ hello: 'Hello' });
    // Previous locale stays cached — switching back won't re-trigger a load.
    expect(result.current.dictionaries.es_ES).toEqual({ hello: 'Hola' });
  });

  it('does not re-fetch a locale whose dictionary is already cached', async () => {
    let callCount = 0;
    const loaders = {
      './locales/generated/core.es_ES.json': () => {
        callCount += 1;
        return Promise.resolve({ default: { hello: 'Hola' } });
      },
    };

    const { result, rerender } = renderHook(
      ({ locale }) => useLocaleDictionaries(locale, loaders),
      { initialProps: { locale: 'es_ES' } },
    );
    await waitFor(() => expect(result.current.renderedLocale).toBe('es_ES'));
    expect(callCount).toBe(1);

    rerender({ locale: 'en_US' });
    rerender({ locale: 'es_ES' });

    await waitFor(() => expect(result.current.renderedLocale).toBe('es_ES'));
    expect(callCount).toBe(1);
  });

  it('falls back to an empty dictionary and still advances renderedLocale when no loader exists for the locale', async () => {
    const { result } = renderHook(() => useLocaleDictionaries('fr_FR', {}));

    await waitFor(() => expect(result.current.renderedLocale).toBe('fr_FR'));
    expect(result.current.dictionaries.fr_FR).toEqual({});
  });

  it('ignores a stale locale load when the locale changes again before it resolves (race condition)', async () => {
    const en = deferred();
    const fr = deferred();
    const loaders = {
      './locales/generated/core.en_US.json': () => en.promise,
      './locales/generated/core.fr_FR.json': () => fr.promise,
    };

    const { result, rerender } = renderHook(
      ({ locale }) => useLocaleDictionaries(locale, loaders),
      { initialProps: { locale: 'en_US' } },
    );

    rerender({ locale: 'fr_FR' });
    fr.resolve({ default: { hello: 'Bonjour' } });
    await waitFor(() => expect(result.current.renderedLocale).toBe('fr_FR'));

    // The abandoned en_US load resolves late — it must not clobber fr_FR.
    en.resolve({ default: { hello: 'Hello' } });
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    expect(result.current.renderedLocale).toBe('fr_FR');
    expect(result.current.dictionaries.fr_FR).toEqual({ hello: 'Bonjour' });
  });
});
