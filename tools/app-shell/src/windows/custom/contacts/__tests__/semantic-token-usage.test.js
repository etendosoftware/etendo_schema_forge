import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const contactsDir = dirname(fileURLToPath(import.meta.url));
const sources = [
  'ContactsFinancialPanel.jsx',
  'ContactsPeriodButton.jsx',
  'ContactsTable.jsx',
].map((file) => readFileSync(join(contactsDir, '..', file), 'utf8'));

describe('Contacts semantic accessibility boundaries (ETP-4554)', () => {
  it('uses semantic control, structural, text, icon, and focus tokens', () => {
    const source = sources.join('\n');
    for (const token of ['border-border-control', 'border-border-structural', 'text-text-primary', 'text-icon-secondary', 'ring-focus-ring']) {
      assert.match(source, new RegExp(token));
    }
  });

  it('does not retain legacy neutral hex, sub-pixel, or opacity-disabled boundaries', () => {
    const source = sources.join('\n');
    assert.doesNotMatch(source, /#[0-9A-Fa-f]{3,8}/);
    assert.doesNotMatch(source, /0\.5px|disabled:opacity/);
  });
});
