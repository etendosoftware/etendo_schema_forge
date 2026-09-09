import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../neoWebhookClient.js', () => ({
  NEO_BASE: 'https://neo.example',
  fetchNeoWebhookJson: vi.fn(),
}));

import { fetchNeoWebhookJson } from '../neoWebhookClient.js';
import { promoteUserToAdmin, demoteUserFromAdmin } from '../promoteUserRoleApi.js';

describe('promoteUserRoleApi', () => {
  beforeEach(() => {
    fetchNeoWebhookJson.mockReset();
  });

  it('promoteUserToAdmin calls the webhook with Mode=promote and returns the result', async () => {
    fetchNeoWebhookJson.mockResolvedValue({ success: true, userId: 'u1', roleId: 'r1' });
    const result = await promoteUserToAdmin('u1');
    expect(result).toEqual({ success: true, userId: 'u1', roleId: 'r1' });
    const [url] = fetchNeoWebhookJson.mock.calls[0];
    expect(url).toContain('UserId=u1');
    expect(url).toContain('Mode=promote');
  });

  it('demoteUserFromAdmin calls the webhook with Mode=demote', async () => {
    fetchNeoWebhookJson.mockResolvedValue({ success: true, userId: 'u1', roleId: 'r2' });
    await demoteUserFromAdmin('u1');
    const [url] = fetchNeoWebhookJson.mock.calls[0];
    expect(url).toContain('Mode=demote');
  });

  it('throws when the webhook returns success:false', async () => {
    fetchNeoWebhookJson.mockResolvedValue({ success: false, message: 'Not authorized' });
    await expect(promoteUserToAdmin('u1')).rejects.toThrow('Not authorized');
  });
});
