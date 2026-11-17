// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxUploadLog.js
// New file justification: the upload log is a new module; it needs jsdom's localStorage and storage events.
import {
  hashAccountId, uploadLogKey, pruneEntries, readUploadLog, appendUploadLog, removeFromUploadLog,
  clearUploadLog, subscribeUploadLog, UPLOAD_LOG_PREFIX, UPLOAD_LOG_TTL_MS, UPLOAD_LOG_MAX_ENTRIES,
} from '../invoiceInboxUploadLog.js';

const KEY = uploadLogKey('C1', 'account-123');
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('storage key', () => {
  it('is sf:invoice-inbox:uploads:<clientId>:<fnv1a32 hex of the account id>', () => {
    // FNV-1a 32-bit of "a" is e40c292c
    expect(hashAccountId('a')).toBe('e40c292c');
    expect(uploadLogKey('C1', 'a')).toBe(`${UPLOAD_LOG_PREFIX}:C1:e40c292c`);
    expect(UPLOAD_LOG_PREFIX).toBe('sf:invoice-inbox:uploads');
  });

  it('is null without a company or an account', () => {
    expect(uploadLogKey(undefined, 'a')).toBeNull();
    expect(uploadLogKey('C1', undefined)).toBeNull();
    expect(uploadLogKey('', '')).toBeNull();
  });

  it('is stable for the same account, differs between accounts and never contains the raw id', () => {
    expect(uploadLogKey('C1', 'account-123')).toBe(KEY);
    expect(uploadLogKey('C1', 'account-124')).not.toBe(KEY);
    expect(uploadLogKey('C2', 'account-123')).not.toBe(KEY);
    expect(KEY).not.toContain('account-123');
    expect(hashAccountId('x')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('append / read', () => {
  it('stores {"v":1,"entries":[{id,at}]} and reads it back oldest first', () => {
    appendUploadLog(KEY, 'd1', 1000);
    appendUploadLog(KEY, 'd2', 2000);
    expect(JSON.parse(localStorage.getItem(KEY))).toEqual({ v: 1, entries: [{ id: 'd1', at: 1000 }, { id: 'd2', at: 2000 }] });
    expect(readUploadLog(KEY, 3000).map((e) => e.id)).toEqual(['d1', 'd2']);
  });

  it('records an id once (re-appending refreshes its time, no duplicate)', () => {
    appendUploadLog(KEY, 'd1', 1000);
    appendUploadLog(KEY, 'd1', 5000);
    expect(readUploadLog(KEY, 6000)).toEqual([{ id: 'd1', at: 5000 }]);
  });

  it('is a no-op without a key or an id', () => {
    appendUploadLog(null, 'd1');
    appendUploadLog(KEY, '');
    appendUploadLog(KEY, undefined);
    expect(localStorage.length).toBe(0);
    expect(readUploadLog(null)).toEqual([]);
  });

  it('expires entries after 7 days', () => {
    expect(UPLOAD_LOG_TTL_MS).toBe(7 * DAY);
    const now = 10 * DAY;
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries: [{ id: 'old', at: now - 7 * DAY }, { id: 'fresh', at: now - 7 * DAY + 1 }] }));
    expect(readUploadLog(KEY, now).map((e) => e.id)).toEqual(['fresh']);
  });

  it('keeps only the newest 100 entries', () => {
    expect(UPLOAD_LOG_MAX_ENTRIES).toBe(100);
    for (let i = 0; i < 105; i += 1) appendUploadLog(KEY, `d${i}`, 1000 + i);
    const ids = readUploadLog(KEY, 2000).map((e) => e.id);
    expect(ids).toHaveLength(100);
    expect(ids[0]).toBe('d5');
    expect(ids.at(-1)).toBe('d104');
  });

  it('pruneEntries drops malformed entries', () => {
    expect(pruneEntries([{ id: 'a', at: 1 }, { id: '', at: 1 }, { at: 1 }, null, { id: 'b', at: NaN }], 2)).toEqual([{ id: 'a', at: 1 }]);
    expect(pruneEntries('nope')).toEqual([]);
  });

  it('broken JSON or a value without entries reads empty', () => {
    localStorage.setItem(KEY, '{not json');
    expect(readUploadLog(KEY)).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ v: 1 }));
    expect(readUploadLog(KEY)).toEqual([]);
  });
});

describe('remove / clear', () => {
  it('removeFromUploadLog drops only the given ids and deletes the key when empty', () => {
    appendUploadLog(KEY, 'd1'); appendUploadLog(KEY, 'd2');
    removeFromUploadLog(KEY, ['d1']);
    expect(readUploadLog(KEY).map((e) => e.id)).toEqual(['d2']);
    removeFromUploadLog(KEY, ['d2']);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('removeFromUploadLog ignores an empty list; clearUploadLog empties the key', () => {
    appendUploadLog(KEY, 'd1');
    removeFromUploadLog(KEY, []);
    expect(readUploadLog(KEY)).toHaveLength(1);
    clearUploadLog(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('storage that fails', () => {
  it('reads empty and does not throw when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readUploadLog(KEY)).toEqual([]);
  });

  it('does not throw when setItem throws (and still notifies)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const listener = vi.fn();
    const off = subscribeUploadLog(listener);
    expect(() => appendUploadLog(KEY, 'd1')).not.toThrow();
    expect(listener).toHaveBeenCalledWith(KEY);
    off();
  });
});

describe('subscribers', () => {
  it('are notified of writes from this tab with the changed key, until unsubscribed', () => {
    const listener = vi.fn();
    const off = subscribeUploadLog(listener);
    appendUploadLog(KEY, 'd1');
    expect(listener).toHaveBeenCalledWith(KEY);
    removeFromUploadLog(KEY, ['d1']);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    appendUploadLog(KEY, 'd2');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('a failing listener does not break the others', () => {
    const bad = vi.fn(() => { throw new Error('x'); });
    const good = vi.fn();
    const offs = [subscribeUploadLog(bad), subscribeUploadLog(good)];
    appendUploadLog(KEY, 'd1');
    expect(good).toHaveBeenCalled();
    offs.forEach((off) => off());
  });

  it('get the `storage` event of another tab, filtered by the log prefix', () => {
    const listener = vi.fn();
    const off = subscribeUploadLog(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(listener).toHaveBeenCalledWith(KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated:key' }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
