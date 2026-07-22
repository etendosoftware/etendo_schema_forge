import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PhysicalInventoryBottomPanel.jsx'), 'utf8');

// This repo's node:test runner cannot parse JSX (see the vitest.config.js
// comment on the same limitation), so PhysicalInventoryBottomPanel — the
// ETP-4528 Bug 1 wiring for "Generate lines automatically" — is verified via
// source-reading, matching the InventoryCreateListModal/InventoryMenuContent
// precedent in this directory.

describe('PhysicalInventoryBottomPanel — GenerateLinesModal wiring (ETP-4528 Bug 1)', () => {
  it('imports GenerateLinesModal', () => {
    assert.match(src, /import GenerateLinesModal from '\.\/GenerateLinesModal'/);
  });

  describe('lineMenuActions', () => {
    it('is a plain function (not a hook) exposed on the default export', () => {
      assert.match(src, /PhysicalInventoryBottomPanel\.lineMenuActions\s*=\s*function\s+lineMenuActions\(\{\s*importRef\s*\}\)/);
    });

    it('returns exactly one action: key "generate-lines", label "generateLinesAutomatically"', () => {
      const fnMatch = src.match(/PhysicalInventoryBottomPanel\.lineMenuActions[\s\S]*?return \[([\s\S]*?)\];\s*\n\};/);
      assert.ok(fnMatch, 'lineMenuActions body not found');
      const body = fnMatch[1];
      assert.match(body, /key:\s*['"]generate-lines['"]/);
      assert.match(body, /label:\s*['"]generateLinesAutomatically['"]/);
    });

    it('onClick delegates to importRef.current.openGenerateLinesModal via optional chaining', () => {
      assert.match(src, /onClick:\s*\(\)\s*=>\s*importRef\.current\?\.openGenerateLinesModal\?\.\(\),/);
    });
  });

  describe('detailExtraActions (GenerateLinesActions forwardRef host)', () => {
    it('is a forwardRef component assigned to detailExtraActions', () => {
      assert.match(src, /const GenerateLinesActions = forwardRef\(function GenerateLinesActions\(/);
      assert.match(src, /PhysicalInventoryBottomPanel\.detailExtraActions = GenerateLinesActions;/);
    });

    it('exposes openGenerateLinesModal via useImperativeHandle, dependent on onSave', () => {
      assert.match(src, /useImperativeHandle\(ref,\s*\(\)\s*=>\s*\(\{\s*\n\s*openGenerateLinesModal,\s*\n\s*\}\),\s*\[onSave\]\);/);
    });

    it('destructures recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, and onRefresh in its props', () => {
      assert.match(
        src,
        /const GenerateLinesActions = forwardRef\(function GenerateLinesActions\(\s*\n\s*\{\s*recordId,\s*token,\s*apiBaseUrl,\s*onSave,\s*forceOpen,\s*onForceOpenHandled,\s*onRefresh\s*\},\s*\n\s*ref,\s*\n\s*\)/,
      );
    });

    it('registers a forceOpen effect that reopens the modal and notifies onForceOpenHandled', () => {
      const compMatch = src.match(/const GenerateLinesActions = forwardRef\(function GenerateLinesActions\([\s\S]*?\}\);/);
      assert.ok(compMatch, 'GenerateLinesActions body not found');
      const body = compMatch[0];
      assert.match(
        body,
        /useEffect\(\(\)\s*=>\s*\{\s*\n\s*if\s*\(forceOpen\)\s*\{\s*\n\s*setShowGenerateModal\(true\);\s*\n\s*onForceOpenHandled\?\.\(\);\s*\n\s*\}\s*\n\s*\},\s*\[forceOpen,\s*onForceOpenHandled\]\);/,
      );
    });

    it('openGenerateLinesModal saves the header first via onSave and aborts if the save fails (ETP-4528 new-record fix)', () => {
      const fnMatch = src.match(/const openGenerateLinesModal = async \(\) => \{[\s\S]*?\n  \};/);
      assert.ok(fnMatch, 'openGenerateLinesModal body not found');
      const body = fnMatch[0];
      assert.match(body, /if\s*\(onSave\)\s*\{/);
      assert.match(body, /const ok = await onSave\('generateLines'\);/);
      assert.match(body, /if\s*\(!ok\)\s*return;/);
      assert.match(body, /setShowGenerateModal\(true\);\s*\n\s*\};/);
    });

    it('renders nothing until the modal is opened, then mounts GenerateLinesModal', () => {
      assert.match(src, /if\s*\(!showGenerateModal\)\s*return null;/);
      assert.match(src, /<GenerateLinesModal\s/);
    });

    it('forwards recordId, token, apiBaseUrl, and onRefresh to the modal, and closes via onClose', () => {
      const compMatch = src.match(/const GenerateLinesActions = forwardRef\(function GenerateLinesActions\([\s\S]*?\}\);/);
      assert.ok(compMatch, 'GenerateLinesActions body not found');
      const body = compMatch[0];
      assert.match(body, /recordId=\{recordId\}/);
      assert.match(body, /token=\{token\}/);
      assert.match(body, /apiBaseUrl=\{apiBaseUrl\}/);
      assert.match(body, /onRefresh=\{onRefresh\}/);
      assert.match(body, /onClose=\{\(\)\s*=>\s*setShowGenerateModal\(false\)\}/);
    });
  });

  describe('linesEmptyState secondary action', () => {
    it('is assigned to PhysicalInventoryBottomPanel.linesEmptyState', () => {
      assert.match(src, /PhysicalInventoryBottomPanel\.linesEmptyState = PhysicalInventoryLinesEmptyState;/);
    });

    it('renders a secondary button with data-testid="action-generate-lines-automatically"', () => {
      assert.match(src, /data-testid="action-generate-lines-automatically"/);
    });

    it('clicking the secondary action delegates to handleGenerateClick', () => {
      assert.match(src, /onClick=\{handleGenerateClick\}/);
      assert.match(src, /const \[showGenerateModal, setShowGenerateModal\] = useState\(false\);/);
    });

    it('PhysicalInventoryLinesEmptyState destructures data, onAddLine, canAddLine, recordId, token, apiBaseUrl, onSave, forceOpen, onForceOpenHandled, and onRefresh', () => {
      assert.match(
        src,
        /function PhysicalInventoryLinesEmptyState\(\{\s*data,\s*onAddLine,\s*canAddLine = true,\s*recordId,\s*token,\s*apiBaseUrl,\s*onSave,\s*forceOpen,\s*onForceOpenHandled,\s*onRefresh\s*\}\)/,
      );
    });

    it('registers a forceOpen effect that reopens the modal and notifies onForceOpenHandled', () => {
      const fnMatch = src.match(/function PhysicalInventoryLinesEmptyState\([\s\S]*?\n\}\n\nPhysicalInventoryBottomPanel\.linesEmptyState/);
      assert.ok(fnMatch, 'PhysicalInventoryLinesEmptyState body not found');
      const body = fnMatch[0];
      assert.match(
        body,
        /useEffect\(\(\)\s*=>\s*\{\s*\n\s*if\s*\(forceOpen\)\s*\{\s*\n\s*setShowGenerateModal\(true\);\s*\n\s*onForceOpenHandled\?\.\(\);\s*\n\s*\}\s*\n\s*\},\s*\[forceOpen,\s*onForceOpenHandled\]\);/,
      );
    });

    it('handleGenerateClick saves the header first via onSave and aborts if the save fails (ETP-4528 new-record fix)', () => {
      const fnMatch = src.match(/const handleGenerateClick = async \(\) => \{[\s\S]*?\n  \};/);
      assert.ok(fnMatch, 'handleGenerateClick body not found');
      const body = fnMatch[0];
      assert.match(body, /if\s*\(onSave\)\s*\{/);
      assert.match(body, /const ok = await onSave\('generateLines'\);/);
      assert.match(body, /if\s*\(!ok\)\s*return;/);
      assert.match(body, /setShowGenerateModal\(true\);\s*\n\s*\};/);
    });

    it('mounts GenerateLinesModal only while showGenerateModal is true, wired to close it', () => {
      assert.match(src, /\{showGenerateModal && \(\s*\n\s*<GenerateLinesModal/);
      assert.match(src, /onClose=\{\(\)\s*=>\s*setShowGenerateModal\(false\)\}/);
    });

    it('passes recordId as data?.id with a fallback to the recordId prop', () => {
      assert.match(src, /recordId=\{data\?\.id \|\| recordId\}/);
    });
  });
});
