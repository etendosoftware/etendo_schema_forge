import React from 'react';
import { render, renderHook } from '@testing-library/react';
import { LocaleProvider } from '../LocaleProvider.jsx';
import { WindowLabelsProvider, useWindowLabels } from '../WindowLabelsProvider.jsx';

/**
 * ETP-4300 Phase 2A — WindowLabelsProvider / useWindowLabels.
 *
 * `useWindowLabels()` returns the ACTIVE-locale label map (`slice[locale]`) of
 * the mounted window slice, or null. The active locale comes from
 * `useLocaleSwitch()` (LocaleProvider), so every test wraps the hook in BOTH a
 * LocaleProvider (to set the locale) and a WindowLabelsProvider (to supply the
 * slice). Mounting the provider is purely additive: absent it, the hook is null.
 *
 * Labels are fixtures (`C_X`), never hardcoded UI strings.
 */

const SLICE = {
  en_US: { C_X: 'EN' },
  es_ES: { C_X: 'ES' },
};

function makeWrapper(locale, slice) {
  return function Wrapper({ children }) {
    return (
      <LocaleProvider locale={locale}>
        <WindowLabelsProvider slice={slice}>{children}</WindowLabelsProvider>
      </LocaleProvider>
    );
  };
}

describe('useWindowLabels', () => {
  it('returns null when no WindowLabelsProvider is mounted', () => {
    // Only a LocaleProvider — the slice context defaults to null.
    const wrapper = ({ children }) => (
      <LocaleProvider locale="es_ES">{children}</LocaleProvider>
    );
    const { result } = renderHook(() => useWindowLabels(), { wrapper });
    expect(result.current).toBeNull();
  });

  it('returns the active-locale map for es_ES', () => {
    const { result } = renderHook(() => useWindowLabels(), {
      wrapper: makeWrapper('es_ES', SLICE),
    });
    expect(result.current).toEqual({ C_X: 'ES' });
  });

  it('returns the active-locale map for en_US', () => {
    const { result } = renderHook(() => useWindowLabels(), {
      wrapper: makeWrapper('en_US', SLICE),
    });
    expect(result.current).toEqual({ C_X: 'EN' });
  });

  it('reflects a locale switch within the same tree by re-selecting the map', () => {
    // Switch the locale prop on a single mounted tree and capture every value
    // the hook produces — the active-locale selection must follow the switch.
    const captured = [];
    function Probe() {
      captured.push(useWindowLabels());
      return null;
    }
    function Harness({ locale }) {
      return (
        <LocaleProvider locale={locale}>
          <WindowLabelsProvider slice={SLICE}>
            <Probe />
          </WindowLabelsProvider>
        </LocaleProvider>
      );
    }
    const { rerender } = render(<Harness locale="es_ES" />);
    rerender(<Harness locale="en_US" />);

    expect(captured[0]).toEqual({ C_X: 'ES' });
    expect(captured[captured.length - 1]).toEqual({ C_X: 'EN' });
  });

  it('returns null when slice is null even with a provider mounted', () => {
    const { result } = renderHook(() => useWindowLabels(), {
      wrapper: makeWrapper('es_ES', null),
    });
    expect(result.current).toBeNull();
  });

  it('returns null when the slice lacks the active locale', () => {
    // Slice only has en_US, active locale is es_ES → no map for the locale.
    const { result } = renderHook(() => useWindowLabels(), {
      wrapper: makeWrapper('es_ES', { en_US: { C_X: 'EN' } }),
    });
    expect(result.current).toBeNull();
  });

  it('returns a stable reference across re-renders when slice and locale do not change', () => {
    const { result, rerender } = renderHook(() => useWindowLabels(), {
      wrapper: makeWrapper('es_ES', SLICE),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
