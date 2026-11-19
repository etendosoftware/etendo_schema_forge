// @covers tools/app-shell/src/lib/observability/identityContext.js
import { vi, describe, it, expect } from 'vitest';

const setContextMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../observability.js', () => ({ setContext: (...args) => setContextMock(...args) }));

import { clearIdentityContext, resolveIdentityContext } from '../identityContext.js';

describe('identityContext', () => {
  it('resolves internal ids and leaves unknown ones undefined', () => {
    expect(resolveIdentityContext({ userId: 'U1', clientId: ' C1 ', accountId: '' }))
      .toEqual({ ad_user_id: 'U1', ad_client_id: 'C1', etgo_account_id: undefined });
    expect(resolveIdentityContext({ userId: { id: 'x' }, clientId: null }))
      .toEqual({ ad_user_id: undefined, ad_client_id: undefined, etgo_account_id: undefined });
  });

  it('clears the three ids from the common context', async () => {
    await clearIdentityContext();
    expect(setContextMock).toHaveBeenCalledWith({
      ad_user_id: undefined, ad_client_id: undefined, etgo_account_id: undefined,
    });
  });
});
