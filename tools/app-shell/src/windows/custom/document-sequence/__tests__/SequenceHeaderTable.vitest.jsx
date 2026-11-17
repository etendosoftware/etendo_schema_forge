// @covers artifacts/document-sequence/custom/SequenceHeaderTable.jsx
//
// "Secuencias de documentos" sorts its Name column by the label the user reads, not by the internal
// AD_Sequence.Name the server orders by (QA CP-18: "Pedido de compra, Presupuesto de venta, Pedido
// de venta" for an ascending sort). The labels come from the real locale files, so a renamed
// translation changes the expected order here too.
vi.mock('@/i18n', async () => {
  const esES = (await import('@/locales/es_ES.json')).default;
  return {
    useMenuLabel: () => (key) => esES.genericLabels?.[key] ?? key,
    useLocaleSwitch: () => ({ locale: 'es_ES', setLocale: null }),
  };
});

const captured = vi.hoisted(() => ({ props: null }));
vi.mock('@generated/document-sequence/generated/web/document-sequence/SequenceTable', () => ({
  default: (props) => {
    captured.props = props;
    return null;
  },
}));

import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import esES from '@/locales/es_ES.json';
import enUS from '@/locales/en_US.json';
import SequenceHeaderTable, {
  sortByDisplayedName,
} from '@generated/document-sequence/custom/SequenceHeaderTable.jsx';

/** The seven rows in the order the server returns them for `_sortBy=name asc`. */
const SERVER_ORDER = [
  'AP Invoice',
  'AR Invoice',
  'Factura Rectificativa (Compras)',
  'Factura Rectificativa (Ventas)',
  'Purchase Order',
  'Quotation',
  'Standard Order',
].map((name, i) => ({ id: `S${i}`, name }));

const ES_ASC = [
  'AP Invoice', // Factura de compra
  'Factura Rectificativa (Compras)', // Factura de compra rectificativa
  'AR Invoice', // Factura de venta
  'Factura Rectificativa (Ventas)', // Factura de venta rectificativa
  'Purchase Order', // Pedido de compra
  'Standard Order', // Pedido de venta
  'Quotation', // Presupuesto de venta
];
const EN_ASC = [
  'Factura Rectificativa (Compras)', // Corrective Purchase Invoice
  'Factura Rectificativa (Ventas)', // Corrective Sales Invoice
  'AP Invoice', // Purchase Invoice
  'Purchase Order', // Purchase Order
  'AR Invoice', // Sales Invoice
  'Standard Order', // Sales Order
  'Quotation', // Sales Quotation
];

const translator = (dict) => (key) => dict.genericLabels?.[key] ?? key;
const names = (rows) => rows.map((row) => row.name);

describe('sortByDisplayedName', () => {
  it.each([
    ['es_ES', 'asc', esES, 'es-ES', ES_ASC],
    ['es_ES', 'desc', esES, 'es-ES', [...ES_ASC].reverse()],
    ['en_US', 'asc', enUS, 'en-US', EN_ASC],
  ])('orders the Name column by the %s label, %s', (_loc, direction, dict, locale, expected) => {
    const sorted = sortByDisplayedName(SERVER_ORDER, {
      sortColumn: 'name', sortDirection: direction, tMenu: translator(dict), locale,
    });
    expect(names(sorted)).toEqual(expected);
  });

  it('leaves the server order alone when the list is sorted by another column', () => {
    const rows = sortByDisplayedName(SERVER_ORDER, {
      sortColumn: 'prefix', sortDirection: 'asc', tMenu: translator(esES), locale: 'es-ES',
    });
    expect(rows).toBe(SERVER_ORDER);
  });
});

describe('SequenceHeaderTable', () => {
  it('hands the generated table the rows in displayed-name order, with every other prop intact', () => {
    render(
      <SequenceHeaderTable data={SERVER_ORDER} sortColumn="name" sortDirection="asc" entity="sequence" />,
    );
    expect(names(captured.props.data)).toEqual(ES_ASC);
    expect(captured.props.entity).toBe('sequence');
    expect(captured.props.sortColumn).toBe('name');
  });
});
