/**
 * Tests for upsertField in neo-writer.js, focused on the agentPrompt column
 * and the partial-update contract (only explicitly provided columns are SET).
 *
 * Uses a lightweight mock pg client that records the SQL and params of the
 * UPDATE/INSERT it receives, so no real database is needed.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { upsertField } from '../src/neo-writer.js';

function createMockClient() {
  const updates = [];
  const inserts = [];
  return {
    updates,
    inserts,
    query: async (sql, params) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('UPDATE etgo_sf_field')) {
        updates.push({ sql: s, params });
      } else if (s.startsWith('INSERT INTO etgo_sf_field')) {
        inserts.push({ sql: s, params });
      }
      return { rows: [] };
    },
  };
}

describe('upsertField (agentPrompt)', () => {
  it('SETs agent_prompt on UPDATE when provided', async () => {
    const client = createMockClient();

    await upsertField(client, {
      entityId: 'ENT1',
      moduleId: 'MOD1',
      fieldId: 'FLD1',
      agentPrompt: 'Pick the warehouse closest to the customer.',
    });

    assert.equal(client.updates.length, 1);
    const { sql, params } = client.updates[0];
    assert.match(sql, /agent_prompt = \$\d+/);
    assert.ok(
      params.includes('Pick the warehouse closest to the customer.'),
      'prompt value is bound in the UPDATE params',
    );
  });

  it('omits agent_prompt from UPDATE when not provided (partial-update contract)', async () => {
    const client = createMockClient();

    await upsertField(client, {
      entityId: 'ENT1',
      moduleId: 'MOD1',
      fieldId: 'FLD1',
      isReadOnly: 'Y',
    });

    const { sql } = client.updates[0];
    assert.doesNotMatch(sql, /agent_prompt/);
  });

  it('persists agent_prompt as the last INSERT param', async () => {
    const client = createMockClient();

    await upsertField(client, {
      entityId: 'ENT1',
      moduleId: 'MOD1',
      agentPrompt: 'Hint for a new field.',
    });

    assert.equal(client.inserts.length, 1);
    const { sql, params } = client.inserts[0];
    assert.match(sql, /agent_prompt/);
    assert.equal(params[params.length - 1], 'Hint for a new field.');
  });

  it('defaults agent_prompt to null on INSERT when omitted', async () => {
    const client = createMockClient();

    await upsertField(client, { entityId: 'ENT1', moduleId: 'MOD1' });

    const { params } = client.inserts[0];
    assert.equal(params[params.length - 1], null);
  });
});
