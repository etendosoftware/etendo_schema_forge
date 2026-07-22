import { fetchMenuTree, collectAllowedIds } from '../menuTree.js';

// ETP-4598 — role-filtered sidebar. menuTree.js has two responsibilities:
// fetchMenuTree() (talks to the SFListMenu webhook) and collectAllowedIds()
// (walks the returned tree into a flat id Set). Sentinel's QA pass flagged
// both as under-covered — this file exercises them directly.
describe('menuTree', () => {
  describe('collectAllowedIds', () => {
    it('collects ids from a deeply nested tree (3+ levels)', () => {
      const tree = [
        {
          windowId: 'L1',
          children: [
            {
              windowId: 'L2',
              children: [
                { windowId: 'L3' },
              ],
            },
          ],
        },
      ];

      const ids = collectAllowedIds(tree);

      expect(ids).toEqual(new Set(['L1', 'L2', 'L3']));
    });

    it('collects a node with only processId', () => {
      const ids = collectAllowedIds([{ processId: 'P1' }]);
      expect(ids.has('P1')).toBe(true);
    });

    it('collects a node with only obuiappProcessId', () => {
      const ids = collectAllowedIds([{ obuiappProcessId: 'OP1' }]);
      expect(ids.has('OP1')).toBe(true);
    });

    it('collects ALL id fields on a node that carries more than one (separate ifs, not a fallback chain)', () => {
      const ids = collectAllowedIds([{ windowId: 'W1', processId: 'P1' }]);
      expect(ids.has('W1')).toBe(true);
      expect(ids.has('P1')).toBe(true);
      expect(ids.size).toBe(2);
    });

    it('returns an empty Set without throwing for tree = undefined', () => {
      expect(collectAllowedIds(undefined)).toEqual(new Set());
    });

    it('returns an empty Set without throwing for tree = null', () => {
      expect(collectAllowedIds(null)).toEqual(new Set());
    });

    // Verified empirically (not assumed): the `for...of` loop reads
    // `node.windowId` directly with no per-node null guard, so a `null`/
    // `undefined` entry in the array throws a TypeError. Documented here as a
    // deliberate, visible assertion rather than silently swallowed.
    it('throws when the tree array contains a null entry (current behavior, not swallowed)', () => {
      expect(() => collectAllowedIds([null])).toThrow(TypeError);
      expect(() => collectAllowedIds([null])).toThrow(/windowId/);
    });

    it('throws when the tree array contains an undefined entry (current behavior, not swallowed)', () => {
      expect(() => collectAllowedIds([undefined])).toThrow(TypeError);
    });

    // Verified empirically: `children` is only checked for truthiness before
    // recursing (`if (node.children) collectAllowedIds(node.children, into)`),
    // with no Array.isArray guard. A plain object `children` is truthy but not
    // iterable, so the recursive call's `for...of (tree ?? [])` throws.
    it('throws when a node.children is a non-array, non-iterable object', () => {
      expect(() => collectAllowedIds([{ windowId: 'W1', children: {} }])).toThrow(TypeError);
      expect(() => collectAllowedIds([{ windowId: 'W1', children: {} }])).toThrow(/not iterable/);
    });

    // Verified empirically: a string IS iterable (iterates its characters), so
    // `children: 'abc'` does NOT throw — it just iterates 'a', 'b', 'c' as
    // string-primitive "nodes", none of which carry windowId/processId/
    // obuiappProcessId, so nothing further is collected from them.
    it('does not throw when node.children is a string — iterates characters and collects nothing extra from them', () => {
      const ids = collectAllowedIds([{ windowId: 'W1', children: 'abc' }]);
      expect(ids).toEqual(new Set(['W1']));
    });
  });

  describe('fetchMenuTree', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('parses data.result when it is itself a JSON string, returning the parsed inner object', async () => {
      const inner = { tree: [{ windowId: '108' }], count: 1 };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ result: JSON.stringify(inner) }),
      });

      const data = await fetchMenuTree();

      expect(data).toEqual(inner);
    });

    it('falls through to returning data as-is when data.result is a non-JSON string', async () => {
      const raw = { result: 'not-json-{{{', count: 0 };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(raw),
      });

      const data = await fetchMenuTree();

      expect(data).toEqual(raw);
    });

    it('returns data directly when the response has no result key', async () => {
      const raw = { tree: [{ windowId: '108' }], count: 1 };
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(raw),
      });

      const data = await fetchMenuTree();

      expect(data).toEqual(raw);
    });

    // A 200 with a non-JSON body — e.g. a SPA-fallback index.html served when
    // /webhooks/SFListMenu isn't actually backed by anything (no dev proxy, no
    // real backend, as in most E2E test environments) — must reject rather than
    // silently "succeed" with a raw string. Without this guard,
    // collectAllowedIds(rawString?.tree) resolves to an empty-but-valid Set,
    // which permanently hides every AD-backed menu item instead of failing
    // open the way a real HTTP error does.
    it('rejects when the 200 response body is not valid JSON (e.g. an HTML fallback page)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        text: async () => '<!doctype html><html><body>App</body></html>',
      });

      await expect(fetchMenuTree()).rejects.toThrow(/non-JSON/);
    });
  });
});
