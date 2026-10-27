// @covers tools/app-shell/src/components/contract-ui/attachmentTable.js
import { describe, expect, it } from 'vitest';
import { attachmentTableOf } from '../attachmentTable.js';

const contract = (primaryEntity, entities) => ({
  backendContract: { window: { primaryEntity }, entities },
});

describe('attachmentTableOf', () => {
  it('takes the table of the primary entity, not of the first entity', () => {
    expect(attachmentTableOf(contract('quotation', {
      quotationLine: { tableName: 'C_OrderLine' },
      quotation: { tableName: 'C_Order' },
    }))).toBe('C_Order');
  });

  it('unwraps a module namespace (what a dynamic JSON import resolves to)', () => {
    expect(attachmentTableOf({ default: contract('header', { header: { tableName: 'C_Invoice' } }) }))
      .toBe('C_Invoice');
  });

  it('is null when the contract does not say which table to use', () => {
    expect(attachmentTableOf(null)).toBeNull();
    expect(attachmentTableOf({})).toBeNull();
    expect(attachmentTableOf(contract(undefined, { header: { tableName: 'C_Invoice' } }))).toBeNull();
    expect(attachmentTableOf(contract('header', { lines: { tableName: 'C_InvoiceLine' } }))).toBeNull();
    expect(attachmentTableOf(contract('header', { header: {} }))).toBeNull();
  });
});
