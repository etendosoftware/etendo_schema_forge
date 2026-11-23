// @covers artifacts/bp-location/decisions.json
// @covers artifacts/bp-location/contract.json
// @covers artifacts/bp-location/generated/web/bp-location/BpLocationForm.jsx
//
// Policy guardrail (ETP-5806): the structured SEPA street field is capped at
// STREET_NAME_MAX_LENGTH (60) in EVERY window that exposes it — not at the 70 of its AD column
// EM_OBSEPA_StrtNm.FieldLength, which resolve-curated carries into validation.maxLength by default.
//
// 60 is the width of C_Location.Address1, where the COMPOSED address line this street feeds
// actually lands (composeAddressLines / StructuredAddressComposer). A window that leaves the AD
// width in place lets a user type 61-70 chars and the backend silently cuts the composed line
// mid-word — the exact failure ETP-5806 exists to prevent, and the one bp-location shipped with.
//
// The test discovers windows by scanning every contract for the AD column, so a NEW window that
// exposes the field is covered without anyone remembering to register it here. The cap is imported
// from its single declaration, never re-typed.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STREET_NAME_MAX_LENGTH } from '@etendosoftware/app-shell-core/lib/locationAddress.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEPA_STREET_COLUMN = 'EM_OBSEPA_StrtNm';

/** Every `artifacts/<spec>/contract.json` present in the repo. */
function contractPaths() {
  return readdirSync(ROOT)
    .filter(name => statSync(join(ROOT, name)).isDirectory())
    .map(spec => ({ spec, path: join(ROOT, spec, 'contract.json') }))
    .filter(({ path }) => existsSync(path));
}

/** All field objects of every entity in a frontend contract, flattened. */
function contractFields(contract) {
  const entities = contract?.frontendContract?.entities ?? {};
  return Object.values(entities).flatMap(entity => entity?.fields ?? []);
}

describe('SEPA street field max length (ETP-5806)', () => {
  it('declares the cap once, at 60 (the C_Location.Address1 width)', () => {
    assert.equal(STREET_NAME_MAX_LENGTH, 60);
  });

  const windows = contractPaths()
    .map(({ spec, path }) => ({ spec, contract: JSON.parse(readFileSync(path, 'utf8')) }))
    .map(({ spec, contract }) => ({
      spec,
      field: contractFields(contract).find(f => f?.column === SEPA_STREET_COLUMN),
    }))
    .filter(({ field }) => field);

  it('is exposed by at least one window (the scan is not silently empty)', () => {
    assert.ok(
      windows.length > 0,
      `no contract exposes ${SEPA_STREET_COLUMN}; if the field was removed on purpose, remove this guardrail too`,
    );
  });

  for (const { spec, field } of windows) {
    it(`${spec}: contract caps the street at STREET_NAME_MAX_LENGTH, not the AD column width`, () => {
      assert.equal(
        field.validation?.maxLength,
        STREET_NAME_MAX_LENGTH,
        `artifacts/${spec}/decisions.json must declare "maxLength": ${STREET_NAME_MAX_LENGTH} on the ` +
          `${SEPA_STREET_COLUMN} field; without it resolve-curated carries the AD FieldLength (70) ` +
          'through and the composed Address1 is cut mid-word server-side',
      );
    });

    it(`${spec}: the generated form field carries the same cap`, () => {
      const generatedDir = join(ROOT, spec, 'generated', 'web', spec);
      if (!existsSync(generatedDir)) return;
      const sources = readdirSync(generatedDir)
        .filter(name => name.endsWith('.jsx'))
        .map(name => readFileSync(join(generatedDir, name), 'utf8'))
        .filter(source => source.includes(SEPA_STREET_COLUMN));
      for (const source of sources) {
        for (const line of source.split('\n').filter(l => l.includes(SEPA_STREET_COLUMN))) {
          const match = /maxLength:\s*(\d+)/.exec(line);
          if (!match) continue;
          assert.equal(
            Number(match[1]),
            STREET_NAME_MAX_LENGTH,
            `${spec}: regenerate the window — the emitted maxLength is stale:\n${line.trim()}`,
          );
        }
      }
    });
  }
});
