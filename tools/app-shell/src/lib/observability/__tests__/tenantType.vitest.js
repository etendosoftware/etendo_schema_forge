// @covers tools/app-shell/src/lib/observability/tenantType.js
/**
 * ETP-6072 — `resolveTenantType` maps the current environment's lifecycle type to `tenant_type`.
 * It reads `environmentType`, never `plan`, and answers `undefined` whenever it cannot know.
 */
import { resolveTenantType, TENANT_TYPE_VALUES } from '../tenantType.js';

const demo = { clientId: 'C-DEMO', environmentType: 'DEMO', plan: 'free' };
const productive = { clientId: 'C-PROD', environmentType: 'PRODUCTIVE', plan: 'productive' };

describe('resolveTenantType', () => {
  it('resolves the row of the current client', () => {
    expect(resolveTenantType([demo, productive], 'C-DEMO')).toBe('demo');
    expect(resolveTenantType([demo, productive], 'C-PROD')).toBe('productive');
  });

  it('keeps a canceled productive environment productive, though its plan reads free', () => {
    const canceled = { clientId: 'C-CANCELED', environmentType: 'PRODUCTIVE', plan: 'free' };
    expect(resolveTenantType([canceled], 'C-CANCELED')).toBe('productive');
  });

  it('accepts the type in any casing and with surrounding spaces', () => {
    expect(resolveTenantType([{ clientId: 'C1', environmentType: ' productive ' }], 'C1')).toBe('productive');
  });

  it.each([
    ['the list has not loaded', undefined, 'C-DEMO'],
    ['the list is empty', [], 'C-DEMO'],
    ['the client is unknown', [demo, productive], undefined],
    ['no row matches the client', [demo, productive], 'C-OTHER'],
    ['the row reports no type', [{ clientId: 'C1', plan: 'productive' }], 'C1'],
    ['the row reports an unknown type', [{ clientId: 'C1', environmentType: 'SANDBOX' }], 'C1'],
  ])('is undefined when %s', (_label, environments, clientId) => {
    expect(resolveTenantType(environments, clientId)).toBeUndefined();
  });

  it('only ever answers a value the payload policy allows', () => {
    expect([...TENANT_TYPE_VALUES].sort()).toEqual(['demo', 'productive']);
  });
});
