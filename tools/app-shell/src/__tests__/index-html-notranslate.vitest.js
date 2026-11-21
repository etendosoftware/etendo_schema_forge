import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ETP-6404 — browser machine translation rewraps React-managed text nodes and causes
// NotFoundError on insertBefore; the app has its own i18n, so translation is disabled.
describe('index.html disables browser translation', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

  it('marks the document translate="no"', () => {
    expect(html).toMatch(/<html[^>]*translate="no"/);
  });

  it('declares the notranslate meta', () => {
    expect(html).toMatch(/name="google"\s+content="notranslate"/);
  });
});
