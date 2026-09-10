import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statusLabel } from '../../tools/app-shell/src/lib/statusBadge.js';

// ETP-4913 (Problem 2) regression coverage.
//
// Both return-shipment windows showed "Registrado" instead of "Completado" as
// the final document status. The Application Dictionary is correct: they read
// M_InOut.DocStatus, whose reference (131 "All_Document Status") names CO
// "Completed" / "Completado". The defect was in the generated i18n key.
//
// `extract-labels.js` derives one enumLabels key per (COLUMN NAME, value code)
// — NOT per AD reference. For DocStatus/CO two rows compete: reference 131
// ("Completed", via M_InOut / C_Invoice) and reference
// FF80818130217A350130218D802B0011 ("Booked", via C_Order). The tie-break
// `ORDER BY rl.name COLLATE "C"` picks the alphabetically-first ENGLISH name,
// so "Booked" always won and the single global key `docStatusCo` was written to
// the locales as "Registrado" / "Booked".
//
// Every OTHER document window escapes this because it declares its own
// LIST_COLUMNS in windows/custom/<w>/index.jsx with no enumLabels at all, so
// statusLabel() falls through to `statuses.CO.label` ("Completado"). The two
// return windows render the GENERATED table, which does carry enumLabels.
//
// The fix redirects only CO to the canonical `statusComplete` key via
// decisions.json → enumValues (see docs/decisions-reference.md). Every other
// code keeps its existing `docStatus*` key, so exactly one label changes.
//
// Renaming the global `docStatusCo` value in the locales was rejected: it is
// reverted by the next `extract-labels` run (mergeLocaleFile spreads the
// extracted enum entries over genericLabels), and "Registrado" is the CORRECT
// label for the order/quotation windows that read C_Order.DocStatus.

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(HERE, '..');
const LOCALES = join(HERE, '..', '..', 'tools', 'app-shell', 'src', 'locales');

const RETURN_WINDOWS = ['return-material-receipt', 'return-to-vendor-shipment'];

const STATUS_FIELD = 'documentStatus';
const COMPLETED_CODE = 'CO';
const CANONICAL_COMPLETED_KEY = 'statusComplete';
// The poisoned column-scoped key the generator derives for DocStatus/CO.
const AD_COMPLETED_KEY = 'docStatusCo';

// The AD codes of reference 131, with the i18n key each one must keep. Only CO
// is redirected; the rest are the generator's own column-scoped keys, so the
// rendered labels stay byte-identical to what shipped before this fix.
const EXPECTED_ENUM_KEYS = {
  CL: 'docStatusCl',
  CO: CANONICAL_COMPLETED_KEY,
  DR: 'docStatusDr',
  NA: 'docStatusNa',
  WP: 'docStatusWp',
  RE: 'docStatusRe',
  TEMP: 'docStatusTemp',
  IP: 'docStatusIp',
  '??': 'docStatus',
  VO: 'docStatusVo',
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadLocale(locale) {
  return readJson(join(LOCALES, `${locale}.json`));
}

function decisionsStatusField(window) {
  const decisions = readJson(join(ARTIFACTS, window, 'decisions.json'));
  return decisions.entities.header.fields[STATUS_FIELD];
}

/**
 * The header entity is the one whose name does not end in "Line". Contract
 * entity names are per-window (returnMaterialReceipt / returnToVendorShipment),
 * so they cannot be hardcoded.
 */
function contractStatusField(window) {
  const contract = readJson(join(ARTIFACTS, window, 'contract.json'));
  const entities = contract.frontendContract.entities;
  const headerKey = Object.keys(entities).find((k) => !k.endsWith('Line'));
  return entities[headerKey].fields.find((f) => f.name === STATUS_FIELD);
}

/**
 * Rebuilds the `enumLabels` map the generated table column carries, from the
 * contract's enumValues. Mirrors resolveEnumLabelKey(): a `name` already shaped
 * like a camelCase i18n key is used verbatim, which is true of every entry
 * here, so this is a faithful stand-in for the emitted column descriptor.
 */
function enumLabelsFromContract(window) {
  const field = contractStatusField(window);
  return Object.fromEntries(field.enumValues.map((o) => [o.value, o.name]));
}

describe('ETP-4913 — return shipments declare Completed as their final status', () => {
  for (const window of RETURN_WINDOWS) {
    it(`${window}: decisions.json redirects only CO to the canonical key`, () => {
      const field = decisionsStatusField(window);
      assert.ok(
        Array.isArray(field.enumValues),
        `${window} must declare enumValues so the poisoned docStatusCo key is not used`,
      );
      const declared = Object.fromEntries(field.enumValues.map((o) => [o.value, o.name]));
      assert.deepEqual(declared, EXPECTED_ENUM_KEYS);
    });

    it(`${window}: the declared enumValues survive into contract.json`, () => {
      // Guards the resolve-curated.js precedence fix: `enumValues` is copied
      // from decisions AND from the raw AD schema, and the raw copy used to
      // overwrite the decision unconditionally.
      assert.deepEqual(enumLabelsFromContract(window), EXPECTED_ENUM_KEYS);
    });
  }
});

describe('ETP-4913 — the resolved status label', () => {
  const locales = { es_ES: 'Completado', en_US: 'Completed' };

  for (const window of RETURN_WINDOWS) {
    for (const [locale, expected] of Object.entries(locales)) {
      it(`${window} renders CO as "${expected}" in ${locale}`, () => {
        const label = statusLabel(
          COMPLETED_CODE,
          loadLocale(locale),
          null,
          enumLabelsFromContract(window),
        );
        assert.equal(label, expected);
      });
    }

    it(`${window} keeps every other status label unchanged`, () => {
      const dictionary = loadLocale('es_ES');
      const enumLabels = enumLabelsFromContract(window);
      for (const code of Object.keys(EXPECTED_ENUM_KEYS)) {
        if (code === COMPLETED_CODE) continue;
        const expected = dictionary.genericLabels[EXPECTED_ENUM_KEYS[code]];
        assert.equal(
          statusLabel(code, dictionary, null, enumLabels),
          expected,
          `${code} must still resolve through its own ${EXPECTED_ENUM_KEYS[code]} key`,
        );
      }
    });
  }

  it('documents the defect: the AD-derived key still resolves to "Registrado"', () => {
    // Pinning this makes the reason for the redirect explicit — and would fail
    // loudly if someone "fixed" the shared docStatusCo value instead, which
    // would silently break the order/quotation windows where Booked is right.
    const dictionary = loadLocale('es_ES');
    assert.equal(
      statusLabel(COMPLETED_CODE, dictionary, null, { [COMPLETED_CODE]: AD_COMPLETED_KEY }),
      'Registrado',
    );
    assert.equal(dictionary.statuses[COMPLETED_CODE].label, 'Completado');
  });
});
