import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ETP-5133 — `noTruncate` opts a lines-grid cell out of the default
// ellipsis/tooltip behavior so the value renders in full (see
// InlineLinesPanel's renderLineCell/ReadCell/LookupTrigger, tools/app-shell).
//
// `schema_forge_core`'s cli/test/no-truncate.test.js already proves the
// GENERIC pipeline plumbing (resolve-curated -> generate-contract ->
// generate-frontend) copies `noTruncate` through faithfully for an arbitrary
// synthetic field. This file checks the other half: that THIS repo's actual
// committed artifacts for the two windows the fix targets (purchase-invoice,
// sales-invoice) are correctly wired end-to-end —
//   decisions.json -> contract.json -> generated/web/<window>/LinesTable.jsx
// — with `product.noTruncate === true` and `description` left untouched (the
// regression-guard half: a decisions/pipeline bug that flips noTruncate onto
// every column, or drops it from product, would slip past the generic core
// test since that one only ever exercises a single synthetic field).
//
// No pre-existing generic artifact-level rule covers this (checked
// docs/pipeline-validator-reference.md's F1-F10 table — those are hash/
// registry checks, not field-content checks — and the per-window
// contract-integrity.test.js files, which are hand-written and window-scoped
// with no noTruncate assertions).

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(HERE, '..');

const WINDOWS = ['purchase-invoice', 'sales-invoice'];
const LINES_ENTITY = 'lines';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function decisionsProductField(window) {
  const decisions = readJson(join(ARTIFACTS, window, 'decisions.json'));
  return decisions.entities[LINES_ENTITY].fields.product;
}

function contractField(window, name) {
  const contract = readJson(join(ARTIFACTS, window, 'contract.json'));
  const fields = contract.frontendContract.entities[LINES_ENTITY].fields;
  return fields.find((f) => f.name === name);
}

function generatedLinesTableSrc(window) {
  return readFileSync(
    join(ARTIFACTS, window, 'generated', 'web', window, 'LinesTable.jsx'),
    'utf8',
  );
}

function generatedColumnLine(src, key) {
  return src.split('\n').find((line) => line.includes(`key: '${key}'`));
}

describe('ETP-5133 — noTruncate wired through the artifact pipeline for purchase/sales invoice lines', () => {
  for (const window of WINDOWS) {
    it(`${window}: decisions.json declares noTruncate:true on the product line field`, () => {
      const field = decisionsProductField(window);
      assert.ok(field, `${window} decisions.json must declare an override for entities.lines.fields.product`);
      assert.equal(field.noTruncate, true);
    });

    it(`${window}: contract.json carries noTruncate:true on the product column, absent on description`, () => {
      const product = contractField(window, 'product');
      assert.ok(product, `${window} contract.json must have a lines.product field`);
      assert.equal(product.noTruncate, true);

      const description = contractField(window, 'description');
      assert.ok(description, `${window} contract.json must have a lines.description field`);
      assert.equal(
        description.noTruncate,
        undefined,
        `${window}: description must not inherit noTruncate from a sibling column`,
      );
    });

    it(`${window}: generated LinesTable.jsx emits noTruncate: true on the product grid column only`, () => {
      const src = generatedLinesTableSrc(window);

      const productLine = generatedColumnLine(src, 'product');
      assert.ok(productLine, `${window} LinesTable.jsx must declare a 'product' grid column`);
      assert.match(productLine, /noTruncate: true/);

      const descriptionLine = generatedColumnLine(src, 'description');
      assert.ok(descriptionLine, `${window} LinesTable.jsx must declare a 'description' grid column`);
      assert.doesNotMatch(descriptionLine, /noTruncate/);
    });
  }
});
