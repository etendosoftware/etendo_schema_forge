// ETP-5073 / DOC-08 — the "another row" half of the repro: switching to another line while one is
// being edited used to call setSelectedLine straight away, discarding the edit with no prompt.

import { describe, it, expect, vi } from 'vitest';
import { buildLineRowClickHandler } from '../detailViewHelpers.jsx';

const DetailForm = () => null;

describe('buildLineRowClickHandler — unsaved line edits', () => {
  it('routes the switch through the guard instead of performing it', () => {
    const setSelectedLine = vi.fn();
    const guard = vi.fn();
    const onRowClick = buildLineRowClickHandler(DetailForm, 'sidebar', setSelectedLine, guard);
    onRowClick({ id: 'LINE-2' });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(setSelectedLine).not.toHaveBeenCalled();
  });

  it('performs the switch when the guard allows it', () => {
    const setSelectedLine = vi.fn();
    // A guard that runs its callback immediately is what a clean line-edit state produces.
    const onRowClick = buildLineRowClickHandler(
      DetailForm, 'sidebar', setSelectedLine, (openLine) => openLine(),
    );
    onRowClick({ id: 'LINE-2' });
    expect(setSelectedLine).toHaveBeenCalledTimes(1);
    expect(setSelectedLine.mock.calls[0][0]).toMatchObject({ id: 'LINE-2' });
  });

  it('never performs the switch when the guard drops the callback (user cancelled)', () => {
    const setSelectedLine = vi.fn();
    const onRowClick = buildLineRowClickHandler(DetailForm, 'sidebar', setSelectedLine, () => {});
    onRowClick({ id: 'LINE-2' });
    expect(setSelectedLine).not.toHaveBeenCalled();
  });

  it('performs it later when the guard defers (user answered the prompt)', () => {
    const setSelectedLine = vi.fn();
    let held;
    const onRowClick = buildLineRowClickHandler(
      DetailForm, 'sidebar', setSelectedLine, (openLine) => { held = openLine; },
    );
    onRowClick({ id: 'LINE-2' });
    expect(setSelectedLine).not.toHaveBeenCalled();
    held();
    expect(setSelectedLine).toHaveBeenCalledTimes(1);
  });

  it('still works with no guard, so existing callers are unchanged', () => {
    const setSelectedLine = vi.fn();
    const onRowClick = buildLineRowClickHandler(DetailForm, 'sidebar', setSelectedLine);
    onRowClick({ id: 'LINE-2' });
    expect(setSelectedLine).toHaveBeenCalledTimes(1);
  });

  it('is undefined for an inline-editable grid, which edits in place and has no sidebar', () => {
    expect(buildLineRowClickHandler(DetailForm, 'inlineEditable', vi.fn(), vi.fn()))
      .toBeUndefined();
  });

  it('is undefined without a DetailForm to open', () => {
    expect(buildLineRowClickHandler(null, 'sidebar', vi.fn(), vi.fn())).toBeUndefined();
  });
});
