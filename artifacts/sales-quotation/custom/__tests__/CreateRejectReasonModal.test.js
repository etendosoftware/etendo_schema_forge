import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'CreateRejectReasonModal.jsx'), 'utf8');

describe('CreateRejectReasonModal', () => {
  it('exports a default function component', () => {
    assert.match(src, /export default function CreateRejectReasonModal/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /from\s+['"]@\/i18n['"]/);
    assert.match(src, /useUI\(\)/);
  });

  describe('form behavior', () => {
    it('seeds the name input from the initialName prop', () => {
      assert.match(src, /useState\(\s*initialName/);
    });

    it('disables the submit button while name is blank', () => {
      assert.match(src, /trimmed\.length\s*>\s*0/);
      assert.match(src, /canSubmit/);
    });

    it('submits on Enter when canSubmit is true', () => {
      assert.match(src, /e\.key\s*===\s*['"]Enter['"]/);
      assert.match(src, /handleSubmit\(\)/);
    });
  });

  describe('create action', () => {
    it('POSTs to the createRejectReason action endpoint', () => {
      assert.match(
        src,
        /apiFetch\(\s*`\$\{apiBaseUrl\}\/quotation\/\$\{quotationId\}\/action\/createRejectReason`/,
      );
    });

    it('sends the trimmed name as { name }', () => {
      assert.match(src, /JSON\.stringify\(\s*\{\s*name:\s*trimmed/);
    });

    it('calls onCreated with the new id and name on success', () => {
      assert.match(src, /onCreated\?\.\(\s*\{\s*id\s*,\s*name:\s*newName/);
    });

    it('shows the rejectReasonCreateError prefix when the backend fails', () => {
      assert.match(src, /ui\(\s*['"]rejectReasonCreateError['"]\s*\)/);
    });
  });

  describe('i18n compliance', () => {
    it('does not hardcode English copy', () => {
      assert.doesNotMatch(src, /['"`](Create rejection reason|Name|Create reason)['"`]/);
    });

    it('renders the title via the createRejectReasonTitle key', () => {
      assert.match(src, /ui\(\s*['"]createRejectReasonTitle['"]\s*\)/);
    });
  });
});
