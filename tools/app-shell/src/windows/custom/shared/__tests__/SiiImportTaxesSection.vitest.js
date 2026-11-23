// @covers tools/app-shell/src/windows/custom/shared/SiiImportTaxesSection.jsx
import { describe, it, expect } from 'vitest';
import { selectImportTaxOptions } from '../SiiImportTaxesSection.jsx';

describe('selectImportTaxOptions — the import-tax picker offers import taxes only', () => {
  it('keeps import and compensatory taxes (accent/case-insensitive) and drops the rest, in order', () => {
    const options = [
      { id: 'a', name: 'IVA 21%' },
      { id: 'b', name: 'Importaciones 21%' },
      { id: 'c', name: 'Compras IGIC IMPORTACIÓN 7%' },
      { id: 'd', name: 'Importaciones 21%=0%' },
      { id: 'e', name: 'IVA 10%' },
    ];
    expect(selectImportTaxOptions(options).map(o => o.id)).toEqual(['b', 'c', 'd']);
  });

  it('tolerates a missing catalog and skips entries without an id', () => {
    expect(selectImportTaxOptions(undefined)).toEqual([]);
    expect(selectImportTaxOptions([{ name: 'Importaciones 21%' }])).toEqual([]);
  });
});
