import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'CreateRejectReasonModal.jsx'), 'utf8');
// Comment-stripped view for the semantic-token assertions below: the style objects
// are documented in prose that names the very roles being asserted, so a raw-source
// match there could be satisfied (or a doesNotMatch defeated) by a comment.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

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

  // -----------------------------------------------------------------------
  // Neutral-grey token mapping (ETP-5378).
  //
  // This sub-modal was corrected alongside RejectQuotationModal, which opens it.
  // ETP-4554 had migrated both files off raw colour literals and mapped every
  // neutral grey onto the wrong semantic role — most visibly the disabled
  // primary fill, which became `--card`, the same role as its own label, so the
  // button rendered as an empty gap. These assertions exist so the corrected
  // mapping cannot be silently reverted; they encode the Figma frame, not the
  // ETP-4554 output.
  // -----------------------------------------------------------------------
  describe('semantic token mapping', () => {
    it('borders the name input with the control-border role', () => {
      assert.match(code, /inputStyle\s*=\s*\{[^}]*border:\s*'1px solid hsl\(var\(--border-control\)\)'/);
    });

    it('never uses the near-black foreground role as a structural border', () => {
      assert.doesNotMatch(code, /border(Top|Bottom|Left|Right)?:\s*'[\d.]+px solid hsl\(var\(--foreground\)\)'/);
    });

    it('outlines the card with the subtle-border role', () => {
      assert.match(code, /cardStyle\s*=\s*\{[^}]*border:\s*'0\.5px solid hsl\(var\(--border-subtle\)\)'/);
    });

    it('uses the muted-foreground role for the close control', () => {
      assert.match(code, /closeBtnStyle\s*=\s*\{[^}]*color:\s*'hsl\(var\(--muted-foreground\)\)'/);
    });

    it('backs the error box with the destructive status surface', () => {
      assert.match(code, /background:\s*'var\(--status-destructive-bg\)'/);
      assert.match(code, /color:\s*'hsl\(var\(--destructive\)\)'/);
    });

    it('uses semantic button roles with a 360 radius', () => {
      assert.match(code, /btnPrimary\s*=\s*\{[^}]*background:\s*'hsl\(var\(--foreground\)\)'[^}]*color:\s*'hsl\(var\(--card\)\)'/);
      assert.match(code, /btnSecondary\s*=\s*\{[^}]*border:\s*'1px solid hsl\(var\(--border-control\)\)'[^}]*background:\s*'hsl\(var\(--card\)\)'/);
      assert.match(code, /borderRadius:\s*360\b/);
    });

    it('fills the disabled primary button with the control-border role, not the card surface', () => {
      assert.match(code, /btnPrimaryDisabled\s*=\s*\{[^}]*background:\s*'hsl\(var\(--border-control\)\)'/);
      assert.doesNotMatch(code, /btnPrimaryDisabled\s*=\s*\{[^}]*background:\s*'hsl\(var\(--card\)\)'/);
    });
  });
});
