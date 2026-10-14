// @covers artifacts/physical-inventory/generated/web/physical-inventory/InventoryLineTable.jsx
/**
 * ETP-5562 — System Count (bookQuantity) and Difference (etgoQtydiff) are backend-readOnly
 * fields; the lines grid must never turn them into editable inputs. `isCellEditable()` in
 * InlineLinesPanel only blocks columns flagged `readOnly: true`, so the generated column
 * list has to carry the flag (it comes from `gridReadOnly` in decisions.json).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ARTIFACT_DIR = resolve(__dirname, '../../../../../../../artifacts/physical-inventory');

describe('physical-inventory lines grid read-only columns (ETP-5562)', () => {
  const table = readFileSync(resolve(ARTIFACT_DIR, 'generated/web/physical-inventory/InventoryLineTable.jsx'), 'utf8');
  const decisions = JSON.parse(readFileSync(resolve(ARTIFACT_DIR, 'decisions.json'), 'utf8'));

  it.each(['bookQuantity', 'etgoQtydiff'])('%s is declared gridReadOnly in decisions.json', (key) => {
    expect(decisions.entities.lines.fields[key].gridReadOnly).toBe(true);
  });

  it.each(['bookQuantity', 'etgoQtydiff'])('%s column is generated with readOnly: true', (key) => {
    const line = table.split('\n').find((l) => l.includes(`key: '${key}'`));
    expect(line).toMatch(/readOnly: true/);
  });

  it('keeps User Count editable', () => {
    const line = table.split('\n').find((l) => l.includes("key: 'quantityCount'"));
    expect(line).not.toMatch(/readOnly: true/);
  });
});
