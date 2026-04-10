import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildMenuGroups, buildWindowMap, getAllWindowNames } from '../registry.js';

describe('buildMenuGroups', () => {
  it('returns groups from menu.json', () => {
    const groups = buildMenuGroups();
    assert.ok(Array.isArray(groups));
    assert.ok(groups.length >= 4);
    assert.equal(groups[0].group, 'Home');
    assert.ok(Array.isArray(groups[0].items));
    assert.ok(groups[0].icon);
  });

  it('each item has name and label', () => {
    const groups = buildMenuGroups();
    for (const group of groups) {
      for (const item of group.items) {
        assert.ok(item.name, `missing name in group ${group.group}`);
        assert.ok(item.label, `missing label in group ${group.group}`);
      }
    }
  });
});

describe('getAllWindowNames', () => {
  it('returns flat array of all window slugs', () => {
    const names = getAllWindowNames();
    assert.ok(names.includes('sales-order'));
    assert.ok(names.includes('business-partner'));
    assert.ok(names.includes('unit-of-measure'));
    assert.ok(names.length >= 11);
  });
});

describe('buildWindowMap', () => {
  it('creates a loader entry for every window in menu.json', () => {
    const map = buildWindowMap();
    const names = getAllWindowNames();
    for (const name of names) {
      assert.ok(map[name], `missing window map entry for ${name}`);
      assert.ok(map[name].loader, `missing loader for ${name}`);
      assert.ok(map[name].label, `missing label for ${name}`);
    }
  });
});
