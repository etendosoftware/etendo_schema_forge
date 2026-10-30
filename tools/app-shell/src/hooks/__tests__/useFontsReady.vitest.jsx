// @covers tools/app-shell/src/hooks/useFontsReady.js
/**
 * `useFontsReady` — the one-shot "the web font is in" flag the lines grid (no-truncate column
 * width, ETP-5133) and DataTable's list header floor re-measure text on. Canvas measurements taken
 * while Inter is still swapping in use the fallback face, so the flag must flip exactly when
 * `document.fonts.ready` resolves, and never touch state after its owner unmounted.
 */
import { renderHook, act } from '@testing-library/react';
import { useFontsReady } from '../useFontsReady.js';

const ORIGINAL_FONTS = Object.getOwnPropertyDescriptor(document, 'fonts');

function setFonts(value) {
  Object.defineProperty(document, 'fonts', { configurable: true, value });
}

/** A FontFaceSet stub still loading, plus the handle to resolve its `ready` promise. */
function loadingFonts() {
  let resolve;
  const ready = new Promise((r) => { resolve = r; });
  return { fonts: { status: 'loading', ready }, resolve, ready };
}

afterEach(() => {
  if (ORIGINAL_FONTS) Object.defineProperty(document, 'fonts', ORIGINAL_FONTS);
  else delete document.fonts;
  vi.restoreAllMocks();
});

describe('useFontsReady', () => {
  it('starts true when the FontFaceSet API is absent (jsdom, old browsers)', () => {
    setFonts(undefined);
    const { result } = renderHook(() => useFontsReady());
    expect(result.current).toBe(true);
  });

  it('starts true when the fonts are already loaded', () => {
    setFonts({ status: 'loaded', ready: new Promise(() => {}) });
    const { result } = renderHook(() => useFontsReady());
    expect(result.current).toBe(true);
  });

  it('starts false while the fonts are loading and flips true once document.fonts.ready resolves', async () => {
    const { fonts, resolve, ready } = loadingFonts();
    setFonts(fonts);
    const { result } = renderHook(() => useFontsReady());
    expect(result.current).toBe(false);

    await act(async () => { resolve(); await ready; });
    expect(result.current).toBe(true);
  });

  it('stays false when document.fonts.ready rejects (no unhandled rejection, no flip)', async () => {
    let reject;
    const ready = new Promise((_, r) => { reject = r; });
    setFonts({ status: 'loading', ready });
    const { result } = renderHook(() => useFontsReady());

    await act(async () => { reject(new Error('font failed')); await ready.catch(() => {}); });
    expect(result.current).toBe(false);
  });

  it('does not update state after unmount when ready resolves late', async () => {
    const { fonts, resolve, ready } = loadingFonts();
    setFonts(fonts);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renders = vi.fn();
    const { unmount } = renderHook(() => { const v = useFontsReady(); renders(v); return v; });
    expect(renders).toHaveBeenLastCalledWith(false);
    const rendersBefore = renders.mock.calls.length;

    unmount();
    await act(async () => { resolve(); await ready; });

    expect(renders).toHaveBeenCalledTimes(rendersBefore);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
