import assert from 'node:assert/strict';
import test from 'node:test';
import {
  environmentPlanLabelKey,
  isProductiveEnvironment,
  sortEnvironments,
} from '../environmentPresentation.js';

test('recognizes productive and demo environment plans', () => {
  assert.equal(isProductiveEnvironment({ plan: 'productive' }), true);
  assert.equal(isProductiveEnvironment({ plan: 'free' }), false);
  assert.equal(environmentPlanLabelKey({ plan: 'productive' }), 'environmentProductive');
  assert.equal(environmentPlanLabelKey({ plan: 'free' }), 'environmentDemo');
});

test('sorts productive environments before demos and keeps names deterministic', () => {
  const sorted = sortEnvironments([
    { clientId: 'demo-b', clientName: 'Beta Demo', plan: 'free' },
    { clientId: 'prod-z', clientName: 'Zulu Productive', plan: 'productive' },
    { clientId: 'prod-a', clientName: 'Acme Productive', plan: 'productive' },
  ]);

  assert.deepEqual(sorted.map(({ clientId }) => clientId), ['prod-a', 'prod-z', 'demo-b']);
});
