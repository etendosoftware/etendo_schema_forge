// @covers tools/app-shell/src/components/contract-ui/windowAttachmentTable.js
import { describe, expect, it } from 'vitest';
import { resolveAttachmentTable } from '../windowAttachmentTable.js';

// ETP-5588 — the attachment table comes from the window's generated contract, not a per-window
// map: the primary entity is not always named `header` (sales-quotation's is `quotation`), and a
// window with no contract has nothing to cache against.
describe('resolveAttachmentTable', () => {
  it('reads the primary entity table of the window contract', async () => {
    await expect(resolveAttachmentTable('sales-invoice')).resolves.toBe('C_Invoice');
    await expect(resolveAttachmentTable('sales-quotation')).resolves.toBe('C_Order');
    await expect(resolveAttachmentTable('goods-shipment')).resolves.toBe('M_InOut');
  });

  it('answers null for a window without a contract', async () => {
    await expect(resolveAttachmentTable('no-such-window')).resolves.toBeNull();
  });
});
