import { vi } from 'vitest';

/**
 * Shared named-export surface for `vi.mock('@/components/contract-ui/BulkDocumentAction', ...)`.
 *
 * WHY THIS EXISTS — a module mock must expose EVERY named export that the module
 * under test imports, not only the ones a given test exercises. A window that does
 *
 *   import BulkDocumentAction, { buildInOutActions, buildPostActions, postRowFilter,
 *                                buildUnpostActions, unpostRowFilter } from '...';
 *
 * fails to LOAD AT ALL when the mock factory omits one of them — Vitest throws
 * "No <export> is defined on the ... mock" and the entire spec file errors out, not
 * just the tests that touch the missing export. That is exactly what happened when
 * the bulk Descontabilizar pair (`buildUnpostActions` / `unpostRowFilter`, ETP-5302)
 * was added to the real module: every spec mocking BulkDocumentAction had to grow the
 * same two lines. Keeping the full surface here means the next export added to the
 * real module is a one-line change in ONE place instead of a copy-paste across specs.
 * `isRowPosted` / `isRowProcessed` (ETP-5414) went from module-private helpers to named
 * exports so the amortization row-kebab's "Contabilizar" entry could reuse the same
 * posted/processed predicates the bulk Descontabilizar pair already used, instead of a
 * third hand-written copy — mocked here as neutral `() => false` stubs, not builders.
 *
 * The `default` export is deliberately NOT provided: each spec needs its own stub
 * (one records props, another renders a `data-testid` probe), so unifying it would
 * couple unrelated suites. Spread this helper and add your own `default`:
 *
 *   vi.mock('@/components/contract-ui/BulkDocumentAction', async () => ({
 *     ...(await import('@/test/bulkDocumentActionMock.js')).bulkDocumentActionNamedExports(),
 *     default: (props) => { ... },
 *   }));
 *
 * The async factory form is required because `vi.mock` factories are hoisted above
 * the imports, so the helper has to be pulled in dynamically from inside the factory.
 *
 * Every builder returns an empty array so that a spec whose component actually calls
 * one (e.g. spreads the result into an actions list) does not blow up on `undefined`.
 *
 * @param {Record<string, unknown>} [overrides] Per-spec replacements, e.g. a builder
 *   that must return a fixed action list for the assertion under test.
 * @returns {Record<string, unknown>} The named exports of the BulkDocumentAction module.
 */
export function bulkDocumentActionNamedExports(overrides = {}) {
  return {
    buildInOutActions: vi.fn(() => []),
    isRowPosted: vi.fn(() => false),
    isRowProcessed: vi.fn(() => false),
    buildPostActions: vi.fn(() => []),
    postRowFilter: vi.fn(),
    buildUnpostActions: vi.fn(() => []),
    unpostRowFilter: vi.fn(),
    ...overrides,
  };
}
