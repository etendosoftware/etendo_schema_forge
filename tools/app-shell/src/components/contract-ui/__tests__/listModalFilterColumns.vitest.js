// @covers tools/app-shell/src/components/contract-ui/listModalFilterColumns.js
//
// The column list of the list-modal advanced filter ("Filtros" → "Filtro por condicionales").
// Boolean columns used to be dropped wholesale ("covered by the toolbar Active dropdown"), so a
// window WITHOUT such a dropdown — payment-term's "Siguiente día hábil" / "Por defecto" — could
// not filter by them at all.
import { describe, it, expect } from 'vitest';
import { buildFilterColumns } from '../listModalFilterColumns.js';

const ui = (key) => key;
const tMenu = (label) => label;
const tLabel = () => null;

const keys = (cols) => cols.map((c) => c.key);

describe('buildFilterColumns — boolean columns', () => {
  const columns = [
    { key: 'name', column: 'Name', type: 'string', label: 'Name' },
    { key: 'nextBusinessDay', column: 'IsNextBusinessDay', type: 'boolean', label: 'Next Business Day', badge: true,
      badgeLabels: { true: { es_ES: 'Sí' }, false: { es_ES: 'No' } } },
    { key: 'active', column: 'Isactive', type: 'boolean', toggle: true, cellType: 'toggle', label: 'Active' },
  ];
  const fields = [
    { key: 'default', column: 'IsDefault', type: 'checkbox', label: 'Default' },
  ];

  it('offers a boolean grid column and a checkbox-only modal field as boolean filters', () => {
    const cols = buildFilterColumns(columns, fields, ui, tMenu, tLabel);
    const nbd = cols.find((c) => c.key === 'nextBusinessDay');
    expect(nbd).toMatchObject({ type: 'boolean', column: 'IsNextBusinessDay' });
    expect(nbd.badgeLabels).toEqual(columns[1].badgeLabels);
    expect(cols.find((c) => c.key === 'default')).toMatchObject({ type: 'boolean' });
    expect(cols.find((c) => c.key === 'active')).toMatchObject({ type: 'boolean' });
  });

  it('keeps skipping a boolean that a toolbar dropdown filter already covers', () => {
    const toolbarFilters = [{ key: 'state', field: 'active' }];
    const cols = buildFilterColumns(columns, fields, ui, tMenu, tLabel, toolbarFilters);
    expect(keys(cols)).toEqual(['default', 'name', 'nextBusinessDay']);
  });

  it('matches a toolbar filter declared by key only', () => {
    const cols = buildFilterColumns(columns, fields, ui, tMenu, tLabel, [{ key: 'nextBusinessDay' }]);
    expect(keys(cols)).not.toContain('nextBusinessDay');
  });
});
