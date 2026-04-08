import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests for the useMenuLabel resolution logic.
 * Since useMenuLabel is a React hook, we test the underlying lookup logic directly.
 */

function resolveMenuLabel(dictionary, key) {
  return dictionary?.ui?.[key]?.label ??
    dictionary?.menus?.[key]?.label ??
    key;
}

const sampleDictionary = {
  menus: {
    Home: { label: 'Inicio' },
    Sales: { label: 'Ventas' },
  },
  ui: {
    Dashboard: { label: 'Panel' },
    Invoices: { label: 'Facturas' },
  },
};

describe('resolveMenuLabel', () => {
  it('resolves a menu group from menus section', () => {
    assert.equal(resolveMenuLabel(sampleDictionary, 'Home'), 'Inicio');
  });

  it('resolves a tab label from ui section', () => {
    assert.equal(resolveMenuLabel(sampleDictionary, 'Dashboard'), 'Panel');
  });

  it('prefers ui over menus when key exists in both', () => {
    const dict = {
      menus: { Test: { label: 'From Menus' } },
      ui: { Test: { label: 'From UI' } },
    };
    assert.equal(resolveMenuLabel(dict, 'Test'), 'From UI');
  });

  it('falls back to the raw key when not found in either section', () => {
    assert.equal(resolveMenuLabel(sampleDictionary, 'Unknown'), 'Unknown');
  });

  it('falls back to the raw key when dictionary is null', () => {
    assert.equal(resolveMenuLabel(null, 'Home'), 'Home');
  });

  it('falls back to the raw key when dictionary is undefined', () => {
    assert.equal(resolveMenuLabel(undefined, 'Sales'), 'Sales');
  });

  it('falls back to the raw key when dictionary has no menus or ui', () => {
    assert.equal(resolveMenuLabel({ fields: {} }, 'Home'), 'Home');
  });

  it('resolves all expected menu groups from es_ES sample', () => {
    const esMenus = {
      menus: {
        Home: { label: 'Inicio' },
        Sales: { label: 'Ventas' },
        Purchases: { label: 'Compras' },
        Finance: { label: 'Finanzas' },
        Inventory: { label: 'Inventario' },
        People: { label: 'Personas' },
        Projects: { label: 'Proyectos' },
        Settings: { label: 'Configuraci\u00f3n' },
      },
    };
    assert.equal(resolveMenuLabel(esMenus, 'Home'), 'Inicio');
    assert.equal(resolveMenuLabel(esMenus, 'Settings'), 'Configuraci\u00f3n');
    assert.equal(resolveMenuLabel(esMenus, 'Inventory'), 'Inventario');
  });
});
