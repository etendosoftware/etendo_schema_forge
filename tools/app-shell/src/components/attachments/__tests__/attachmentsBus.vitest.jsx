/**
 * ETP-4855 — the Attachments tab and the OCR side panel each own their copy of
 * a record's attachment list and are mounted at the same time in form view, so a
 * write through one used to leave the other stale until a full navigation away
 * and back. These are the rules that stop that happening.
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  ATTACHMENTS_CHANGED_EVENT,
  newAttachmentsSource,
  notifyAttachmentsChanged,
  useAttachmentsChanged,
} from '../attachmentsBus';

const RECORD = { tableName: 'C_Invoice', recordId: 'inv-1' };

describe('newAttachmentsSource', () => {
  it('hands out distinct identities', () => {
    expect(newAttachmentsSource()).not.toBe(newAttachmentsSource());
  });
});

describe('useAttachmentsChanged', () => {
  it('reloads when another view changes the same record', () => {
    const onChange = vi.fn();
    renderHook(() => useAttachmentsChanged({ ...RECORD, source: 'me' }, onChange));

    notifyAttachmentsChanged({ ...RECORD, source: 'someone-else' });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores the events it emitted itself', () => {
    const onChange = vi.fn();
    renderHook(() => useAttachmentsChanged({ ...RECORD, source: 'me' }, onChange));

    notifyAttachmentsChanged({ ...RECORD, source: 'me' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores another record of the same table', () => {
    const onChange = vi.fn();
    renderHook(() => useAttachmentsChanged({ ...RECORD, source: 'me' }, onChange));

    notifyAttachmentsChanged({ tableName: 'C_Invoice', recordId: 'inv-2', source: 'other' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('ignores the same id in another table', () => {
    const onChange = vi.fn();
    renderHook(() => useAttachmentsChanged({ ...RECORD, source: 'me' }, onChange));

    notifyAttachmentsChanged({ tableName: 'C_Order', recordId: 'inv-1', source: 'other' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('compares record ids as strings', () => {
    const onChange = vi.fn();
    renderHook(() => useAttachmentsChanged({ tableName: 'C_Invoice', recordId: '42' }, onChange));

    notifyAttachmentsChanged({ tableName: 'C_Invoice', recordId: 42, source: 'other' });

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe without a record', () => {
    const onChange = vi.fn();
    renderHook(() => useAttachmentsChanged({ tableName: 'C_Invoice', recordId: null }, onChange));

    notifyAttachmentsChanged({ tableName: 'C_Invoice', recordId: null, source: 'other' });
    notifyAttachmentsChanged({ ...RECORD, source: 'other' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() => useAttachmentsChanged({ ...RECORD }, onChange));
    unmount();

    notifyAttachmentsChanged({ ...RECORD, source: 'other' });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('picks up a new callback without resubscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }) => useAttachmentsChanged({ ...RECORD }, cb),
      { initialProps: { cb: first } },
    );

    rerender({ cb: second });
    notifyAttachmentsChanged({ ...RECORD, source: 'other' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('notifyAttachmentsChanged', () => {
  it('does not emit without a record — an unaddressed event would reload every view', () => {
    const listener = vi.fn();
    window.addEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    try {
      notifyAttachmentsChanged({ tableName: 'C_Invoice', recordId: null });
      notifyAttachmentsChanged({ tableName: null, recordId: 'inv-1' });
      notifyAttachmentsChanged();
      expect(listener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(ATTACHMENTS_CHANGED_EVENT, listener);
    }
  });
});
