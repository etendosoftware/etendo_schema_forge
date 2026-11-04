// @covers tools/app-shell/src/lib/observability/roleGroups.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ROLE_GROUP_VALUES, resolveRoleGroups } from '../observability/roleGroups.js';

describe('resolveRoleGroups', () => {
  it('maps each composed system template to its group, sorted', () => {
    assert.deepEqual(
      resolveRoleGroups({ id: 'R1', effectiveRoleNames: ['Sales', 'Inventory'] }),
      ['sales', 'warehouse']
    );
    assert.deepEqual(
      resolveRoleGroups({ id: 'R1', effectiveRoleNames: ['Finance', 'Purchasing'] }),
      ['finance', 'purchasing']
    );
  });

  it('classifies the tenant admin as admin whatever else the role carries', () => {
    assert.deepEqual(
      resolveRoleGroups({ id: 'R1', isClientAdmin: true, effectiveRoleNames: ['Inventory'] }),
      ['admin']
    );
  });

  it('falls back to other for a known role with no known template', () => {
    assert.deepEqual(resolveRoleGroups({ id: 'R1', effectiveRoleNames: [] }), ['other']);
    assert.deepEqual(resolveRoleGroups({ id: 'R1' }), ['other']);
    assert.deepEqual(resolveRoleGroups({ id: 'R1', effectiveRoleNames: ['Custom Template'] }), ['other']);
  });

  it('never classifies by the role name, which is free text per tenant', () => {
    assert.deepEqual(resolveRoleGroups({ id: 'R1', name: 'Inventory' }), ['other']);
  });

  it('drops unknown templates and duplicates next to known ones', () => {
    assert.deepEqual(
      resolveRoleGroups({ id: 'R1', effectiveRoleNames: ['Inventory', 'Custom', 'Inventory'] }),
      ['warehouse']
    );
  });

  it('returns undefined while the role is unknown', () => {
    assert.equal(resolveRoleGroups(undefined), undefined);
    assert.equal(resolveRoleGroups(null), undefined);
    assert.equal(resolveRoleGroups({ effectiveRoleNames: ['Inventory'] }), undefined);
  });

  it('only ever produces values of the closed set', () => {
    assert.deepEqual(
      [...ROLE_GROUP_VALUES].sort(),
      ['admin', 'finance', 'other', 'purchasing', 'sales', 'warehouse']
    );
  });
});
