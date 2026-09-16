import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useConfirmWithCredit.js'), 'utf8');

describe('useConfirmWithCredit', () => {

  it('exports useConfirmWithCredit', () => {
    assert.match(src, /export function useConfirmWithCredit/);
  });

  // ETP-5333 — the modal used to close synchronously on click (in the caller,
  // ConfirmWithCreditButtonBase's inline onConfirm), before the request even
  // started. The fix moves `setShowModal(false)` into the SUCCESS branch here,
  // right before `setResult(...)` is set — so the modal stays mounted (and
  // shows its own `loading` state) for the whole request.
  describe('handleCreateReturnInvoice — modal closes only on success, right before setResult (ETP-5333)', () => {
    it('calls setShowModal(false) immediately before setResult inside the success path', () => {
      const successBlock = src.match(
        /const invData = \(await res\.json\(\)\)\?\.response\?\.data;\s*setShowModal\(false\);\s*setResult\(\{/,
      );
      assert.ok(successBlock, 'expected setShowModal(false) to run right before setResult({...}) on success');
    });

    it('does NOT close the modal inside the catch (error) branch — the modal must stay open on failure so the user can retry', () => {
      const catchBlock = src.match(/\} catch \(err\) \{[\s\S]*?\} finally \{/);
      assert.ok(catchBlock, 'expected a catch block');
      assert.doesNotMatch(catchBlock[0], /setShowModal\(false\)/);
      assert.match(catchBlock[0], /toast\.error\(/);
    });

    it('does NOT close the modal synchronously before the fetch call (no setShowModal(false) before the try/await)', () => {
      const beforeFetch = src.split('await apiFetch(')[0];
      // handleCreateReturnInvoice's own body only — isolate from the rest of the file
      const handlerStart = beforeFetch.lastIndexOf('const handleCreateReturnInvoice');
      const handlerPrefix = beforeFetch.slice(handlerStart);
      assert.doesNotMatch(handlerPrefix, /setShowModal\(false\)/);
    });

    it('guards re-entrant calls with the creatingInvoice flag before doing anything else', () => {
      assert.match(
        src,
        /const handleCreateReturnInvoice = useCallback\(async \(\) => \{\s*if \(creatingInvoice\) return;\s*setCreatingInvoice\(true\);/,
      );
    });

    it('includes setShowModal in the useCallback dependency array (ETP-5333)', () => {
      const cb = src.match(/const handleCreateReturnInvoice = useCallback\(async[\s\S]*?\}, \[([\s\S]*?)\]\);/);
      assert.ok(cb, 'expected the useCallback deps array');
      assert.match(cb[1], /setShowModal/);
    });

    it('always resets creatingInvoice in a finally block, regardless of success or failure', () => {
      assert.match(src, /\} finally \{\s*setCreatingInvoice\(false\);\s*\}/);
    });
  });

  describe('exposed API', () => {
    it('returns showModal and setShowModal', () => {
      assert.match(src, /showModal, setShowModal,/);
    });

    it('returns creatingInvoice (consumed as CreateInvoiceConfirmModal\'s loading prop by callers)', () => {
      assert.match(src, /creatingInvoice, result, setResult,/);
    });

    it('returns handleCreateReturnInvoice', () => {
      assert.match(src, /handleCreateReturnInvoice, buildInvoiceResultFromConfirm,/);
    });
  });
});
