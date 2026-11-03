// @covers tools/app-shell/src/windows/custom/fiscal-config/useFormDirty.js
// The section-level unsaved-changes signal behind the Fiscal Configuration "Guardar" (ETP-5831).
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useFormDirty } from '../useFormDirty.js';

describe('useFormDirty', () => {
  it('is clean for the form it was seeded with', () => {
    const onDirtyChange = vi.fn();
    const { result } = renderHook(() => useFormDirty({ a: 1 }, onDirtyChange));
    expect(result.current).toBe(false);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('turns dirty on a change and clean again when the change is undone', () => {
    const onDirtyChange = vi.fn();
    const { result, rerender } = renderHook(({ form }) => useFormDirty(form, onDirtyChange), { initialProps: { form: { a: 1 } } });
    rerender({ form: { a: 2 } });
    expect(result.current).toBe(true);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    rerender({ form: { a: 1 } });
    expect(result.current).toBe(false);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('reports clean on unmount (its unsaved values go with it)', () => {
    const onDirtyChange = vi.fn();
    const { rerender, unmount } = renderHook(({ form }) => useFormDirty(form, onDirtyChange), { initialProps: { form: { a: 1 } } });
    rerender({ form: { a: 2 } });
    unmount();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('works without a callback', () => {
    const { result } = renderHook(() => useFormDirty({ a: 1 }));
    expect(result.current).toBe(false);
  });
});
