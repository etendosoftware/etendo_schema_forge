import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveCurated } from '../src/resolve-curated.js';

// ETP-4269 — buildDraftMode extraParams passthrough.
// Exercises resolve-curated.js lines 535-536 (truthy branch) and the
// false branch (no extraParams key in the resolved draftMode).
describe('resolveCurated — draftMode.extraParams', () => {
  const schemaRaw = {
    window: { id: '700', name: 'Sales Order' },
    entities: [{
      name: 'cOrder',
      tableName: 'C_Order',
      tabId: '10',
      tabName: 'Header',
      fields: [{
        name: 'documentAction',
        columnName: 'DocAction',
        label: 'Document Action',
        type: 'button',
        visibility: 'editable',
      }],
    }],
  };

  function buildDecisions(draftMode) {
    return {
      version: 2,
      window: { name: 'Sales Order' },
      entities: {
        cOrder: {
          name: 'order',
          draftMode,
        },
      },
    };
  }

  it('copies an extraParams object into the resolved draftMode', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, buildDecisions({
      enabled: true,
      processField: 'documentAction',
      processValue: 'CO',
      extraParams: { action: 'CO' },
    }));

    assert.deepEqual(schema.entities[0].draftMode.extraParams, { action: 'CO' });
  });

  it('omits extraParams when the decision has none (false branch)', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, buildDecisions({
      enabled: true,
      processField: 'documentAction',
      processValue: 'CO',
    }));

    assert.equal('extraParams' in schema.entities[0].draftMode, false);
  });

  it('omits extraParams when the decision value is not an object', async () => {
    const { schema } = await resolveCurated(schemaRaw, { rules: [] }, buildDecisions({
      enabled: true,
      processField: 'documentAction',
      processValue: 'CO',
      extraParams: 'CO',
    }));

    assert.equal('extraParams' in schema.entities[0].draftMode, false);
  });
});
