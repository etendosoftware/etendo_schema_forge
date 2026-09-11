/**
 * Revision-bump discipline for the shipped walkthroughs (ETP-5144).
 *
 * `revision` is AUTHOR-MANAGED on purpose (see `docs/walkthrough-flows.md` §11
 * and the §8 checklist item 12): only the author knows whether an edit changed
 * what the tour teaches, and deriving the counter from the step ids would
 * re-notify every user over a cosmetic rename.
 *
 * The cost of that choice is that forgetting to bump fails SILENTLY — the tour
 * changes, and nobody who already completed it is ever told. This file is the
 * alarm: it pins each flow's `revision` next to a snapshot of its step ids, so
 * adding, removing or reordering a step fails here until the revision is
 * bumped and the snapshot below is updated in the same commit.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FLOWS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'flows');

/**
 * The reviewed state of every shipped flow.
 *
 * TO UPDATE: bump `revision` in the flow's JSON when its steps change, then
 * mirror the new revision and step ids here. Never update the snapshot alone.
 */
const REVIEWED_FLOWS = Object.freeze({
  'create-contact': {
    revision: 1,
    steps: [
      'open-new', 'contact-type', 'legal-name', 'first-name', 'last-name',
      'category', 'tax-id', 'email', 'save', 'address-tab', 'address-add',
      'address-street', 'address-city', 'address-country', 'address-save',
    ],
  },
  'create-product': {
    revision: 1,
    steps: [
      'open-new', 'search-key', 'name', 'product-type', 'uom', 'category',
      'tax-category', 'save', 'price-tab', 'price-add', 'price-set',
    ],
  },
  'create-sales-order': {
    revision: 1,
    steps: [
      'open-new', 'partner', 'price-list', 'save-header', 'add-line',
      'line-product', 'line-quantity', 'save-lines', 'confirm-open',
      'confirm-submit', 'confirmed-ack',
    ],
  },
});

function readFlow(fileName) {
  return JSON.parse(readFileSync(join(FLOWS_DIR, fileName), 'utf8'));
}

const flowFiles = readdirSync(FLOWS_DIR).filter((name) => name.endsWith('.json')).sort();

/** Told to the developer on every failure in this file. */
const BUMP_HINT = 'the steps of this flow changed: bump `revision` in its JSON '
  + 'and mirror the new revision + step ids in REVIEWED_FLOWS (same commit). '
  + 'Without the bump, nobody who already completed the tour is ever re-notified.';

describe('walkthrough flow revisions', () => {
  it('has a reviewed snapshot for every shipped flow file', () => {
    assert.deepEqual(
      flowFiles.map((name) => name.replace(/\.json$/, '')),
      Object.keys(REVIEWED_FLOWS).sort(),
      'a flow file was added or removed — add it to REVIEWED_FLOWS with its revision, '
      + 'and list it in `flows/index.js` (the launcher order is the progression)',
    );
  });

  for (const [flowId, reviewed] of Object.entries(REVIEWED_FLOWS)) {
    describe(flowId, () => {
      const flow = readFlow(`${flowId}.json`);

      it('declares the file name as its id', () => {
        assert.equal(flow.id, flowId);
      });

      it(`still has the reviewed ${reviewed.steps.length} steps, in order`, () => {
        assert.deepEqual(flow.steps.map((step) => step.id), reviewed.steps, BUMP_HINT);
      });

      it(`is still at revision ${reviewed.revision}`, () => {
        // `revision` may be omitted, which the engine normalizes to 1.
        assert.equal(flow.revision ?? 1, reviewed.revision, BUMP_HINT);
      });

      it('has unique step ids', () => {
        const ids = flow.steps.map((step) => step.id);
        assert.equal(new Set(ids).size, ids.length, 'duplicate step id');
      });
    });
  }
});
