import React from 'react';
import { renderHook } from '@testing-library/react';
import { LocaleProvider } from '../LocaleProvider.jsx';
import { WindowLabelsProvider } from '../WindowLabelsProvider.jsx';
import { useLabel } from '../useLabel.js';
import esES from '../../locales/es_ES.json';

/**
 * ETP-4300 Phase 2A — useLabel resolution with a mounted window slice.
 *
 * useLabel now reads `useWindowLabels()` and threads it into resolveLabel:
 *
 *   labelOverrides[locale][col] ?? windowSlice[col] ?? dictionary.fields[col].label ?? null
 *
 * These render `t = useLabel(...)` under a real LocaleProvider (so the monolith
 * dictionary is loaded from src/locales) plus a WindowLabelsProvider, then assert
 * `t(col)` against each tier. `C_X` is a fixture column that exists ONLY in the
 * slice; `DocumentNo` exists in the dictionary and is used for the fallthrough.
 */

const LOCALE = 'es_ES';

// Read the dictionary's DocumentNo label from the same source LocaleProvider
// loads, so the fallthrough assertion is not a hardcoded UI string.
const DICT_DOCUMENTNO = esES.fields.DocumentNo.label;

const SLICE = {
  es_ES: { C_X: 'Slice ES' },
  en_US: { C_X: 'Slice EN' },
};

function makeWrapper({ slice = undefined } = {}) {
  return function Wrapper({ children }) {
    const tree = slice === undefined
      ? children
      : <WindowLabelsProvider slice={slice}>{children}</WindowLabelsProvider>;
    return <LocaleProvider locale={LOCALE}>{tree}</LocaleProvider>;
  };
}

describe('useLabel with a window slice', () => {
  it('returns the slice value for a column present in the slice', () => {
    const { result } = renderHook(() => useLabel(), {
      wrapper: makeWrapper({ slice: SLICE }),
    });
    expect(result.current('C_X')).toBe('Slice ES');
  });

  it('falls through to the dictionary for a column only in the dictionary', () => {
    const { result } = renderHook(() => useLabel(), {
      wrapper: makeWrapper({ slice: SLICE }),
    });
    expect(result.current('DocumentNo')).toBe(DICT_DOCUMENTNO);
  });

  it('labelOverrides[locale][col] WINS over the slice value', () => {
    const overrides = { [LOCALE]: { C_X: 'Override ES' } };
    const { result } = renderHook(() => useLabel(overrides), {
      wrapper: makeWrapper({ slice: SLICE }),
    });
    expect(result.current('C_X')).toBe('Override ES');
  });

  it('returns null for a column in neither the slice nor the dictionary', () => {
    const { result } = renderHook(() => useLabel(), {
      wrapper: makeWrapper({ slice: SLICE }),
    });
    expect(result.current('ZZZ_DoesNotExist')).toBeNull();
  });
});

describe('useLabel without a WindowLabelsProvider (backward compat)', () => {
  it('resolves from the dictionary exactly as before when no slice is mounted', () => {
    const { result } = renderHook(() => useLabel(), {
      wrapper: makeWrapper(),
    });
    expect(result.current('DocumentNo')).toBe(DICT_DOCUMENTNO);
  });

  it('honors labelOverrides over the dictionary when no slice is mounted', () => {
    const overrides = { [LOCALE]: { DocumentNo: 'Override Doc' } };
    const { result } = renderHook(() => useLabel(overrides), {
      wrapper: makeWrapper(),
    });
    expect(result.current('DocumentNo')).toBe('Override Doc');
  });

  it('returns null for an unknown column when no slice is mounted', () => {
    const { result } = renderHook(() => useLabel(), {
      wrapper: makeWrapper(),
    });
    expect(result.current('ZZZ_DoesNotExist')).toBeNull();
  });
});
