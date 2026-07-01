/**
 * Tests for upsertSpec in neo-writer.js.
 *
 * Uses a lightweight mock pg client that records INSERT/UPDATE params and can
 * simulate duplicate-name lookups, so the insert/update/duplicate branches are
 * exercised without a real database.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { upsertSpec } from '../src/neo-writer.js';

// ---------------------------------------------------------------------------
// Mock pg client
// ---------------------------------------------------------------------------

/**
 * Build a mock client for upsertSpec.
 * @param {object} opts
 * @param {Array<{etgo_sf_spec_id: string, name: string}>} [opts.existingSpecs]
 *   Rows returned by the duplicate-name SELECT, matched on name.
 */
function createMockClient({ existingSpecs = [] } = {}) {
  const inserts = [];
  const updates = [];
  const queryLog = [];

  return {
    inserts,
    updates,
    queryLog,
    query: async (sql, params) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      queryLog.push({ sql: s, params });

      if (s.startsWith('SELECT etgo_sf_spec_id FROM etgo_sf_spec WHERE name')) {
        const rows = existingSpecs
          .filter((sp) => sp.name === params[0])
          .map((sp) => ({ etgo_sf_spec_id: sp.etgo_sf_spec_id }));
        return { rows };
      }
      if (s.startsWith('UPDATE etgo_sf_spec')) {
        updates.push(params);
        return { rows: [] };
      }
      if (s.startsWith('INSERT INTO etgo_sf_spec')) {
        inserts.push(params);
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

// ---------------------------------------------------------------------------
// INSERT path
// ---------------------------------------------------------------------------

describe('upsertSpec (insert)', () => {
  it('inserts a new spec and returns { specId, created: true }', async () => {
    const client = createMockClient();

    const result = await upsertSpec(client, {
      name: 'purchase-order',
      moduleId: 'MOD001',
      windowId: 'WIN001',
    });

    assert.equal(result.created, true);
    assert.match(result.specId, /^[0-9A-F]{32}$/, 'specId is a 32-char uppercase hex UUID');
    assert.equal(client.inserts.length, 1);
    assert.equal(client.updates.length, 0);

    // INSERT params: [specId, name, specType, windowId, processId, moduleId, description, ...]
    const params = client.inserts[0];
    assert.equal(params[0], result.specId);
    assert.equal(params[1], 'purchase-order');
    assert.equal(params[2], 'W', 'default specType is W');
    assert.equal(params[3], 'WIN001');
    assert.equal(params[4], null, 'processId defaults to null');
    assert.equal(params[5], 'MOD001');
    assert.equal(params[6], null, 'description defaults to null');
  });

  it('carries processId and specType through for a process spec', async () => {
    const client = createMockClient();

    const result = await upsertSpec(client, {
      name: 'generate-invoices',
      moduleId: 'MOD001',
      specType: 'P',
      processId: 'PROC001',
      description: 'Generates invoices',
    });

    assert.equal(result.created, true);
    const params = client.inserts[0];
    assert.equal(params[2], 'P');
    assert.equal(params[3], null, 'windowId null for process spec');
    assert.equal(params[4], 'PROC001');
    assert.equal(params[6], 'Generates invoices');
  });

  it('applies audit overrides to the INSERT', async () => {
    const client = createMockClient();

    await upsertSpec(client, {
      name: 'tax',
      moduleId: 'MOD001',
      windowId: 'WIN001',
      audit: { clientId: 'CLI9', orgId: 'ORG9', userId: 'USR9' },
    });

    // INSERT params positions: 7=ad_client_id, 8=ad_org_id, 9=isactive,
    // 11=createdby, 13=updatedby
    const params = client.inserts[0];
    assert.equal(params[7], 'CLI9');
    assert.equal(params[8], 'ORG9');
    assert.equal(params[9], 'Y');
    assert.equal(params[11], 'USR9');
    assert.equal(params[13], 'USR9');
  });
});

// ---------------------------------------------------------------------------
// UPDATE path
// ---------------------------------------------------------------------------

describe('upsertSpec (update)', () => {
  it('updates when specId is provided and returns { specId, created: false }', async () => {
    // Existing row carries the same id we pass as specId, so the dup check
    // matches itself and must NOT throw.
    const client = createMockClient({
      existingSpecs: [{ etgo_sf_spec_id: 'SPEC123', name: 'purchase-order' }],
    });

    const result = await upsertSpec(client, {
      name: 'purchase-order',
      moduleId: 'MOD001',
      windowId: 'WIN001',
      specId: 'SPEC123',
    });

    assert.equal(result.created, false);
    assert.equal(result.specId, 'SPEC123');
    assert.equal(client.updates.length, 1);
    assert.equal(client.inserts.length, 0);

    // UPDATE params: [name, specType, windowId, processId, moduleId,
    //                 description, agentPrompt, updated, updatedby, existingId]
    const params = client.updates[0];
    assert.equal(params[0], 'purchase-order');
    assert.equal(params[9], 'SPEC123', 'WHERE id is the existing spec id');
  });

  it('updates when no other spec uses the name (dup check returns nothing)', async () => {
    const client = createMockClient({ existingSpecs: [] });

    const result = await upsertSpec(client, {
      name: 'renamed-spec',
      moduleId: 'MOD001',
      windowId: 'WIN001',
      specId: 'SPEC123',
    });

    assert.equal(result.created, false);
    assert.equal(result.specId, 'SPEC123');
    assert.equal(client.updates.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Duplicate-name guard
// ---------------------------------------------------------------------------

describe('upsertSpec (agentPrompt)', () => {
  it('persists agentPrompt as the last INSERT param', async () => {
    const client = createMockClient();

    await upsertSpec(client, {
      name: 'purchase-order',
      moduleId: 'MOD001',
      windowId: 'WIN001',
      agentPrompt: 'Always confirm before completing the order.',
    });

    // agent_prompt is appended as the final INSERT column (index 14) so the
    // existing positional assertions for columns 0-13 stay valid.
    assert.equal(client.inserts[0][14], 'Always confirm before completing the order.');
  });

  it('defaults agentPrompt to null when omitted (INSERT)', async () => {
    const client = createMockClient();

    await upsertSpec(client, { name: 'tax', moduleId: 'MOD001', windowId: 'WIN001' });

    assert.equal(client.inserts[0][14], null);
  });

  it('persists agentPrompt on UPDATE', async () => {
    const client = createMockClient({
      existingSpecs: [{ etgo_sf_spec_id: 'SPEC123', name: 'purchase-order' }],
    });

    await upsertSpec(client, {
      name: 'purchase-order',
      moduleId: 'MOD001',
      windowId: 'WIN001',
      specId: 'SPEC123',
      agentPrompt: 'Be careful.',
    });

    const params = client.updates[0];
    assert.equal(params[6], 'Be careful.', 'agent_prompt is the SET param after description');
    assert.equal(params[9], 'SPEC123', 'WHERE id remains the last param');
  });
});

describe('upsertSpec (duplicate name)', () => {
  it('throws when inserting a name that already exists', async () => {
    const client = createMockClient({
      existingSpecs: [{ etgo_sf_spec_id: 'OTHER001', name: 'purchase-order' }],
    });

    await assert.rejects(
      () => upsertSpec(client, { name: 'purchase-order', moduleId: 'MOD001', windowId: 'WIN001' }),
      /Spec with name 'purchase-order' already exists \(id: OTHER001\)/,
    );
    assert.equal(client.inserts.length, 0);
  });

  it('throws when the name is taken by a different spec during an update', async () => {
    // Updating SPEC123 but the name now collides with a DIFFERENT spec OTHER001.
    const client = createMockClient({
      existingSpecs: [{ etgo_sf_spec_id: 'OTHER001', name: 'taken-name' }],
    });

    await assert.rejects(
      () => upsertSpec(client, {
        name: 'taken-name',
        moduleId: 'MOD001',
        windowId: 'WIN001',
        specId: 'SPEC123',
      }),
      /already exists \(id: OTHER001\)/,
    );
    assert.equal(client.updates.length, 0);
  });
});
