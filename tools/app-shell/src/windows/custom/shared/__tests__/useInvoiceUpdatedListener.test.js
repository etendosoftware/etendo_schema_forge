import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useInvoiceUpdatedListener.js'), 'utf8');

describe('useInvoiceUpdatedListener', () => {
  it('calls onRefresh?.() in the event handler (not window.location.reload)', () => {
    assert.match(src, /onRefresh\?\.\(\)/, 'expected onRefresh?.() call in event handler');
    assert.doesNotMatch(src, /window\.location\.reload\(\)/, 'expected no window.location.reload()');
  });
});
