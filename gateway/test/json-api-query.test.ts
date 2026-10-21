// @covers gateway/src/public-api/json-api-query.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import type { PublicApiEntity } from '@etendosoftware/api-gateway-core';
import { filterOperatorsFor, neoListParams, pagination, parseListQuery } from '../src/public-api/json-api-query.ts';

const field = (internalPath: string, dataType: Record<string, string> | undefined, extra: Record<string, unknown> = {}) =>
  ({ publicApi: true, direction: 'inout', internalPath, type: 'passthrough', handlerId: null, ...(dataType ? { dataType } : {}), ...extra });

const entity = {
  publicApi: true,
  specName: 'contacts',
  operations: ['GET', 'LIST'],
  fields: {
    id: field('id', { type: 'string' }, { direction: 'out' }),
    name: field('name', { type: 'string' }),
    credit: field('creditLimit', { type: 'number', format: 'double' }),
    units: field('units', { type: 'integer' }),
    active: field('isActive', { type: 'boolean' }),
    since: field('startDate', { type: 'string', format: 'date' }),
    updated: field('updated', { type: 'string', format: 'date-time' }, { direction: 'out' }),
    category: field('productCategory', { type: 'string' }, { relationship: { resource: 'product-category', cardinality: 'one', foreignKey: 'category' } }),
    secret: field('secretCode', { type: 'string' }, { direction: 'in' }),
    blob: field('blob', { type: 'object' }),
  },
} as unknown as PublicApiEntity;

function refusal(query: Record<string, unknown>): { parameter: string; detail: string } {
  try {
    parseListQuery(entity, query);
  } catch (error) {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), 400);
    const body = (error.getResponse() as { errors: Array<Record<string, any>> }).errors[0];
    assert.equal(body.status, '400');
    assert.equal(body.code, 'invalid_query_parameter');
    assert.equal(body.title, 'Bad Request');
    return { parameter: body.source.parameter, detail: body.detail };
  }
  return assert.fail(`expected a 400 for ${JSON.stringify(query)}`);
}

test('an empty query reads the first page of 50 with no sort and no criteria', () => {
  const query = parseListQuery(entity, {});
  assert.deepEqual(
    { n: query.pageNumber, size: query.pageSize, start: query.startRow, end: query.endRow, sort: query.sortBy, criteria: query.criteria },
    { n: 1, size: 50, start: 0, end: 49, sort: undefined, criteria: undefined },
  );
  assert.deepEqual(neoListParams(query), ['_startRow=0', '_endRow=49']);
});

test('page[number] and page[size] map to the inclusive NEO row window', () => {
  const query = parseListQuery(entity, { page: { number: '3', size: '25' } });
  assert.deepEqual([query.startRow, query.endRow], [50, 74]);
  assert.deepEqual(parseListQuery(entity, { page: { size: '100' } }).endRow, 99);
});

test('every public operator becomes the NEO operator the Etendo grids use', () => {
  const cases: Array<[Record<string, unknown>, unknown]> = [
    [{ name: 'Acme' }, [{ fieldName: 'name', operator: 'equals', value: 'Acme' }]],
    [{ name: { eq: 'Acme' } }, [{ fieldName: 'name', operator: 'equals', value: 'Acme' }]],
    [{ name: { ne: 'Acme' } }, [{ fieldName: 'name', operator: 'notEqual', value: 'Acme' }]],
    [{ name: { contains: 'cm' } }, [{ fieldName: 'name', operator: 'iContains', value: 'cm' }]],
    [{ name: { in: 'a,b,c' } }, [{ fieldName: 'name', operator: 'inSet', value: 'a,b,c' }]],
    [{ credit: { gt: '10.5' } }, [{ fieldName: 'creditLimit', operator: 'greaterThan', value: 10.5 }]],
    [{ credit: { gte: '10' } }, [{ fieldName: 'creditLimit', operator: 'greaterOrEqual', value: 10 }]],
    [{ credit: { lt: '-3' } }, [{ fieldName: 'creditLimit', operator: 'lessThan', value: -3 }]],
    [{ credit: { lte: '0' } }, [{ fieldName: 'creditLimit', operator: 'lessOrEqual', value: 0 }]],
    [{ units: { in: '1,2' } }, [{ fieldName: 'units', operator: 'inSet', value: '1,2' }]],
    [{ units: '7' }, [{ fieldName: 'units', operator: 'equals', value: 7 }]],
    [{ category: 'cat-1' }, [{ fieldName: 'productCategory', operator: 'equals', value: 'cat-1' }]],
    [{ category: { in: 'c1,c2' } }, [{ fieldName: 'productCategory', operator: 'inSet', value: 'c1,c2' }]],
    [{ active: 'true' }, [{ fieldName: 'isActive', operator: 'equals', value: 'Y' }]],
    [{ active: { ne: 'false' } }, [{ fieldName: 'isActive', operator: 'notEqual', value: 'N' }]],
    [{ id: 'abc' }, [{ fieldName: 'id', operator: 'equals', value: 'abc' }]],
  ];
  for (const [filter, expected] of cases) {
    assert.deepEqual(parseListQuery(entity, { filter }).criteria, expected, JSON.stringify(filter));
  }
});

test('several filters are ANDed in one criteria array, and a range on one field keeps both bounds', () => {
  const query = parseListQuery(entity, { filter: { name: { contains: 'a' }, credit: { gte: '1', lte: '9' } } });
  assert.equal(query.criteria?.length, 3);
});

test('dates are whole calendar days with no timezone shift, on date and date-time fields alike', () => {
  const day = (filter: Record<string, unknown>) => parseListQuery(entity, { filter }).criteria?.map((c) => `${c.operator}:${c.value}`);
  assert.deepEqual(day({ since: '2026-03-01' }), ['greaterOrEqual:2026-03-01', 'lessOrEqual:2026-03-01']);
  assert.deepEqual(day({ since: { gt: '2026-02-28' } }), ['greaterOrEqual:2026-03-01']);
  assert.deepEqual(day({ since: { gte: '2026-02-28' } }), ['greaterOrEqual:2026-02-28']);
  assert.deepEqual(day({ since: { lt: '2026-03-01' } }), ['lessOrEqual:2026-02-28']);
  assert.deepEqual(day({ since: { lte: '2026-03-01' } }), ['lessOrEqual:2026-03-01']);
  // Month, year and leap-day boundaries.
  assert.deepEqual(day({ since: { gt: '2025-12-31' } }), ['greaterOrEqual:2026-01-01']);
  assert.deepEqual(day({ since: { lt: '2024-03-01' } }), ['lessOrEqual:2024-02-29']);
  assert.deepEqual(day({ updated: { gte: '2026-10-21' } }), ['greaterOrEqual:2026-10-21']);
});

test('the first row of a window is never reached by a wrong page size or number', () => {
  assert.equal(refusal({ page: { size: '0' } }).parameter, 'page[size]');
  assert.equal(refusal({ page: { size: '101' } }).parameter, 'page[size]');
  assert.equal(refusal({ page: { size: '-1' } }).parameter, 'page[size]');
  assert.equal(refusal({ page: { size: '1.5' } }).parameter, 'page[size]');
  assert.equal(refusal({ page: { size: 'abc' } }).parameter, 'page[size]');
  assert.equal(refusal({ page: { number: '0' } }).parameter, 'page[number]');
  assert.equal(refusal({ page: { number: '-2' } }).parameter, 'page[number]');
  assert.equal(refusal({ page: { number: '99999999999999999999' } }).parameter, 'page[number]');
  assert.equal(refusal({ page: { number: '2000000000', size: '100' } }).parameter, 'page[number]');
  assert.equal(refusal({ page: { number: ['1', '2'] } }).parameter, 'page[number]');
  assert.equal(refusal({ page: { offset: '5' } }).parameter, 'page[offset]');
  assert.equal(refusal({ page: '3' }).parameter, 'page');
});

test('sort maps public names to NEO property names, keeps direction and ties break on id', () => {
  assert.equal(parseListQuery(entity, { sort: 'name' }).sortBy, 'name,id');
  assert.equal(parseListQuery(entity, { sort: '-credit,name' }).sortBy, '-creditLimit,name,id');
  assert.equal(parseListQuery(entity, { sort: '-id' }).sortBy, '-id');
  assert.equal(parseListQuery(entity, {}).sortBy, undefined);
});

test('sort refuses unknown, write-only, duplicated, empty and too many fields', () => {
  for (const sort of ['nope', 'secret', 'name,name', 'name,-name', '', 'name,', ',name', '-', 'internalPath', 'productCategory', 'blob', 'category', 'a,b,c,d,e,f']) {
    assert.equal(refusal({ sort }).parameter, 'sort', JSON.stringify(sort));
  }
  assert.equal(refusal({ sort: ['name', 'id'] }).parameter, 'sort');
  assert.equal(refusal({ sort: { by: 'name' } }).parameter, 'sort');
});

test('filters refuse unknown, write-only, internal-name and non-filterable fields', () => {
  assert.equal(refusal({ filter: { nope: 'x' } }).parameter, 'filter[nope]');
  assert.equal(refusal({ filter: { secret: 'x' } }).parameter, 'filter[secret]');
  // The internal NEO property name is not a public field.
  assert.equal(refusal({ filter: { creditLimit: '1' } }).parameter, 'filter[creditLimit]');
  assert.equal(refusal({ filter: { blob: 'x' } }).parameter, 'filter[blob]');
  assert.equal(refusal({ filter: { __proto__x: 'x' } }).parameter, 'filter[__proto__x]');
  assert.equal(refusal({ filter: { constructor: 'x' } }).parameter, 'filter[constructor]');
  assert.equal(refusal({ filter: 'name' }).parameter, 'filter');
});

test('filters refuse unknown operators and operators a type does not support', () => {
  assert.equal(refusal({ filter: { name: { like: 'x' } } }).parameter, 'filter[name][like]');
  assert.equal(refusal({ filter: { name: { equals: 'x' } } }).parameter, 'filter[name][equals]');
  assert.equal(refusal({ filter: { name: { gt: 'x' } } }).parameter, 'filter[name][gt]');
  assert.equal(refusal({ filter: { credit: { contains: '1' } } }).parameter, 'filter[credit][contains]');
  assert.equal(refusal({ filter: { units: { contains: '1' } } }).parameter, 'filter[units][contains]');
  assert.equal(refusal({ filter: { active: { gt: 'true' } } }).parameter, 'filter[active][gt]');
  assert.equal(refusal({ filter: { active: { in: 'true,false' } } }).parameter, 'filter[active][in]');
  assert.equal(refusal({ filter: { category: { contains: 'c' } } }).parameter, 'filter[category][contains]');
  assert.equal(refusal({ filter: { since: { ne: '2026-01-01' } } }).parameter, 'filter[since][ne]');
  assert.equal(refusal({ filter: { since: { in: '2026-01-01' } } }).parameter, 'filter[since][in]');
});

test('filters refuse values that do not fit the field type', () => {
  const bad: Array<[Record<string, unknown>, string]> = [
    [{ credit: 'abc' }, 'filter[credit]'],
    [{ credit: '1e3' }, 'filter[credit]'],
    [{ credit: '1,5' }, 'filter[credit]'],
    [{ credit: 'NaN' }, 'filter[credit]'],
    [{ credit: 'Infinity' }, 'filter[credit]'],
    [{ units: '1.5' }, 'filter[units]'],
    [{ units: '99999999999999999999' }, 'filter[units]'],
    [{ units: { in: '1,x' } }, 'filter[units][in]'],
    [{ active: 'yes' }, 'filter[active]'],
    [{ active: 'Y' }, 'filter[active]'],
    [{ since: '2026-02-30' }, 'filter[since]'],
    [{ since: '2026-13-01' }, 'filter[since]'],
    [{ since: '01/02/2026' }, 'filter[since]'],
    [{ since: '2026-03-01T10:00:00Z' }, 'filter[since]'],
    [{ updated: { gte: '2026-03-01T10:00:00+02:00' } }, 'filter[updated][gte]'],
    [{ name: '' }, 'filter[name]'],
    [{ name: 'x'.repeat(256) }, 'filter[name]'],
    [{ name: { in: 'a,,b' } }, 'filter[name][in]'],
    [{ name: { in: '' } }, 'filter[name][in]'],
    [{ name: { in: Array.from({ length: 101 }, (_, i) => `v${i}`).join(',') } }, 'filter[name][in]'],
    [{ name: ['a', 'b'] }, 'filter[name]'],
    [{ name: { eq: ['a', 'b'] } }, 'filter[name][eq]'],
    [{ name: { eq: { x: 'y' } } }, 'filter[name][eq]'],
    [{ name: {} }, 'filter[name]'],
  ];
  for (const [filter, parameter] of bad) {
    assert.equal(refusal({ filter }).parameter, parameter, JSON.stringify(filter));
  }
});

test('at most 20 filters per request', () => {
  const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 'x']));
  const wide = { ...entity, fields: { ...entity.fields, ...Object.fromEntries(Object.keys(twenty).map((k) => [k, field(k, { type: 'string' })])) } } as PublicApiEntity;
  assert.equal(parseListQuery(wide, { filter: twenty }).criteria?.length, 20);
  try {
    parseListQuery(wide, { filter: { ...twenty, name: 'one more' } });
    assert.fail('expected a 400');
  } catch (error) {
    assert.equal((error as HttpException).getStatus(), 400);
    assert.equal(((error as HttpException).getResponse() as any).errors[0].source.parameter, 'filter');
  }
  // Operators on one field count one filter each.
  assert.equal(refusal({ filter: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [i < 5 ? 'credit' : 'units', {}])) }).parameter, 'filter[credit]');
});

test('unknown query parameters are refused, whatever they look like', () => {
  assert.equal(refusal({ foo: '1' }).parameter, 'foo');
  assert.equal(refusal({ criteria: '[]' }).parameter, 'criteria');
  assert.equal(refusal({ _startRow: '0' }).parameter, '_startRow');
  assert.equal(refusal({ _sortBy: 'name' }).parameter, '_sortBy');
  assert.equal(refusal({ parentId: 'x' }).parameter, 'parentId');
  assert.equal(refusal({ include: 'lines' }).parameter, 'include');
  assert.equal(refusal({ 'fields[contacts]': 'name' }).parameter, 'fields[contacts]');
});

test('a client value never reaches NEO as operator, property name or extra criteria', () => {
  const query = parseListQuery(entity, { filter: { name: '"},{"fieldName":"secretCode","operator":"equals","value":"x' } });
  assert.equal(query.criteria?.length, 1);
  assert.equal(query.criteria?.[0].fieldName, 'name');
  const params = neoListParams(query);
  assert.equal(params.filter((p) => p.startsWith('criteria=')).length, 1);
  assert.deepEqual(JSON.parse(decodeURIComponent(params[2].slice('criteria='.length))), query.criteria);
});

test('filterOperatorsFor lists what a type accepts and nothing for a non-filterable field', () => {
  assert.deepEqual(filterOperatorsFor(entity.fields.name as any), ['eq', 'ne', 'contains', 'in']);
  assert.deepEqual(filterOperatorsFor(entity.fields.active as any), ['eq', 'ne']);
  assert.deepEqual(filterOperatorsFor(entity.fields.blob as any), []);
});

test('pagination: first, middle and last page with exact total', () => {
  const query = (number: number) => parseListQuery(entity, { filter: { name: { contains: 'a b' } }, sort: '-name,id', page: { number: String(number), size: '10' } });
  const base = '/api/v1/contacts';
  const link = (n: number) => `${base}?filter[name][contains]=a%20b&sort=-name,id&page[number]=${n}&page[size]=10`;

  const first = pagination(base, query(1), 10, 25);
  assert.deepEqual(first.meta, { page: { number: 1, size: 10, total: 25 } });
  assert.deepEqual(first.links, { self: link(1), first: link(1), prev: null, next: link(2), last: link(3) });

  const middle = pagination(base, query(2), 10, 25);
  assert.deepEqual(middle.links, { self: link(2), first: link(1), prev: link(1), next: link(3), last: link(3) });

  const last = pagination(base, query(3), 5, 25);
  assert.deepEqual(last.links, { self: link(3), first: link(1), prev: link(2), next: null, last: link(3) });
});

test('pagination: exact multiples, empty results and pages past the end', () => {
  const query = (number: number) => parseListQuery(entity, { page: { number: String(number), size: '10' } });
  const link = (n: number) => `/api/v1/c?page[number]=${n}&page[size]=10`;
  assert.equal(pagination('/api/v1/c', query(2), 10, 20).links.next, null);
  assert.equal(pagination('/api/v1/c', query(2), 10, 20).links.last, link(2));
  const empty = pagination('/api/v1/c', query(1), 0, 0);
  assert.deepEqual(empty.meta.page, { number: 1, size: 10, total: 0 });
  assert.deepEqual([empty.links.next, empty.links.last, empty.links.prev], [null, link(1), null]);
  // Page 9 of a 25-record set: prev points at the last real page.
  const beyond = pagination('/api/v1/c', query(9), 0, 25);
  assert.deepEqual([beyond.links.prev, beyond.links.next, beyond.links.last], [link(3), null, link(3)]);
});

test('pagination without an exact total omits total and last, and offers next only after a full page', () => {
  const query = parseListQuery(entity, { page: { number: '2', size: '10' } });
  const full = pagination('/api/v1/c', query, 10, undefined);
  assert.deepEqual(full.meta.page, { number: 2, size: 10 });
  assert.equal('last' in full.links, false);
  assert.equal(full.links.next, '/api/v1/c?page[number]=3&page[size]=10');
  assert.equal(pagination('/api/v1/c', query, 4, undefined).links.next, null);
});
