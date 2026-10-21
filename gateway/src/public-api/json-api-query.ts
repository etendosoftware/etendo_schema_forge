import type { PublicApiEntity } from '@etendosoftware/api-gateway-core';
import { invalidQueryParameter, isRecord } from './json-api-http.ts';

// The query contract of a list read: JSON:API pagination (`page[number]`,
// `page[size]`), `sort` and `filter[<field>][<operator>]`. Everything is
// expressed in PUBLIC field names and public operators; this module translates
// them to NEO's `_startRow/_endRow`, `_sortBy` and one `criteria` JSON param.
// Nothing the client sends is forwarded as it came: names are looked up in the
// manifest, values are parsed against the field's data type, and anything that
// does not fit is a 400 naming the parameter (fail closed).

// The bracket syntax (`page[number]`, `filter[x][op]`) arrives here already nested because
// Express 4's default "extended" query parser (`qs`) builds objects from it; json-api-http.test.ts
// goes through that parser over real HTTP.
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
export const MAX_FILTERS = 20;
export const MAX_SORT_FIELDS = 5;
export const MAX_IN_VALUES = 100;
const MAX_TEXT_LENGTH = 255;
const MAX_START_ROW = 2_000_000_000;

export const FILTER_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

type QueryField = {
  direction?: string;
  internalPath: string;
  dataType?: { type?: string; format?: string };
  relationship?: { resource: string };
};

type FieldKind = 'relationship' | 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'date-time';

const OPERATORS_BY_KIND: Record<FieldKind, readonly FilterOperator[]> = {
  relationship: ['eq', 'ne', 'in'],
  string: ['eq', 'ne', 'contains', 'in'],
  integer: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'],
  boolean: ['eq', 'ne'],
  date: ['eq', 'gt', 'gte', 'lt', 'lte'],
  'date-time': ['eq', 'gt', 'gte', 'lt', 'lte'],
};

/** Operators a field accepts, or `[]` when it cannot be filtered (also used to document the OpenAPI parameters). */
export function filterOperatorsFor(field: QueryField): readonly FilterOperator[] {
  const kind = kindOf(field);
  return kind ? OPERATORS_BY_KIND[kind] : [];
}

export function isReadable(field: QueryField | undefined): field is QueryField {
  return Boolean(field) && ['out', 'inout'].includes(field?.direction ?? '');
}

export function kindOf(field: QueryField): FieldKind | undefined {
  if (field.relationship) return 'relationship';
  const type = field.dataType?.type ?? 'string';
  if (type === 'string') {
    if (field.dataType?.format === 'date') return 'date';
    if (field.dataType?.format === 'date-time') return 'date-time';
    return 'string';
  }
  if (type === 'integer' || type === 'number' || type === 'boolean') return type;
  return undefined;
}

/** One criterion in the format the Etendo grids send: `{ fieldName, operator, value }`. */
export interface NeoClause { fieldName: string; operator: string; value: string | number }

export interface ListQuery {
  pageNumber: number;
  pageSize: number;
  startRow: number;
  /** Inclusive, like NEO's `_endRow`. */
  endRow: number;
  sortBy?: string;
  criteria?: NeoClause[];
  /** The client's own `filter` and `sort` parameters, as `name=value` pairs kept for the pagination links. */
  linkParams: Array<[string, string]>;
}

/** Whether a field can be sorted by: filterable type, and not a relationship. */
export function isSortable(field: QueryField): boolean {
  const kind = kindOf(field);
  return isReadable(field) && Boolean(kind) && kind !== 'relationship';
}

const text = (value: unknown): value is string => typeof value === 'string';

function parsePositiveInteger(raw: unknown, parameter: string, max: number): number {
  if (!text(raw) || !/^\d+$/.test(raw)) throw invalidQueryParameter(parameter, `${parameter} must be a positive integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw invalidQueryParameter(parameter, `${parameter} must be a positive integer.`);
  if (value > max) throw invalidQueryParameter(parameter, `${parameter} must not be greater than ${max}.`);
  return value;
}

function parsePage(page: unknown): { number: number; size: number } {
  if (page === undefined) return { number: 1, size: DEFAULT_PAGE_SIZE };
  if (!isRecord(page)) throw invalidQueryParameter('page', 'Use page[number] and page[size].');
  for (const key of Object.keys(page)) {
    if (key !== 'number' && key !== 'size') throw invalidQueryParameter(`page[${key}]`, 'Unknown pagination parameter. Use page[number] and page[size].');
  }
  const size = page.size === undefined ? DEFAULT_PAGE_SIZE : parsePositiveInteger(page.size, 'page[size]', MAX_PAGE_SIZE);
  const number = page.number === undefined ? 1 : parsePositiveInteger(page.number, 'page[number]', MAX_START_ROW);
  if ((number - 1) * size > MAX_START_ROW) throw invalidQueryParameter('page[number]', 'page[number] is out of range.');
  return { number, size };
}

function fieldOf(entity: PublicApiEntity, name: string): QueryField | undefined {
  if (!Object.hasOwn(entity.fields, name)) return undefined;
  const field = entity.fields[name] as unknown as QueryField;
  return isReadable(field) ? field : undefined;
}

function parseSort(entity: PublicApiEntity, sort: unknown): string | undefined {
  if (sort === undefined) return undefined;
  if (!text(sort) || sort === '') throw invalidQueryParameter('sort', 'sort must be a comma-separated list of field names, optionally prefixed with "-" for descending.');
  const items = sort.split(',');
  if (items.length > MAX_SORT_FIELDS) throw invalidQueryParameter('sort', `Sort by at most ${MAX_SORT_FIELDS} fields.`);
  const seen = new Set<string>();
  const sortBy: string[] = [];
  for (const item of items) {
    const descending = item.startsWith('-');
    const name = descending ? item.slice(1) : item;
    const field = name ? fieldOf(entity, name) : undefined;
    // A relationship would sort by the foreign key id, which means nothing to a client.
    const kind = field ? kindOf(field) : undefined;
    if (!field || !kind || kind === 'relationship') throw invalidQueryParameter('sort', `Cannot sort by "${name}": unknown, not readable or not sortable field.`);
    if (seen.has(name)) throw invalidQueryParameter('sort', `Field "${name}" is listed twice in sort.`);
    seen.add(name);
    sortBy.push(`${descending ? '-' : ''}${field.internalPath}`);
  }
  // Rows tied on the sort key would otherwise swap between pages.
  const id = fieldOf(entity, 'id');
  if (id && !seen.has('id')) sortBy.push(id.internalPath);
  return sortBy.join(',');
}

function parseText(raw: string, parameter: string): string {
  if (raw === '') throw invalidQueryParameter(parameter, 'The filter value must not be empty.');
  if (raw.length > MAX_TEXT_LENGTH) throw invalidQueryParameter(parameter, `The filter value must not exceed ${MAX_TEXT_LENGTH} characters.`);
  return raw;
}

/** A calendar date `yyyy-MM-dd` that exists, as a UTC-based day number so no timezone is ever applied. */
function parseCalendarDay(raw: string, parameter: string): { value: string; shift(days: number): string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const fail = () => invalidQueryParameter(parameter, 'Use a calendar date as yyyy-MM-dd.');
  if (!match) throw fail();
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw fail();
  return {
    value: raw,
    shift: (days) => new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10),
  };
}

function parseScalar(kind: FieldKind, raw: string, parameter: string): string | number {
  switch (kind) {
    case 'integer': {
      const value = Number(raw);
      if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(value)) throw invalidQueryParameter(parameter, 'The filter value must be an integer.');
      return value;
    }
    case 'number': {
      const value = Number(raw);
      if (!/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(value)) throw invalidQueryParameter(parameter, 'The filter value must be a number.');
      return value;
    }
    case 'boolean':
      // The Etendo grids send Y/N; NEO maps it for Yes/No columns and char columns alike.
      if (raw !== 'true' && raw !== 'false') throw invalidQueryParameter(parameter, 'The filter value must be true or false.');
      return raw === 'true' ? 'Y' : 'N';
    default:
      return parseText(raw, parameter);
  }
}

const NEO_OPERATORS: Record<string, string> = {
  eq: 'equals', ne: 'notEqual', gt: 'greaterThan', gte: 'greaterOrEqual', lt: 'lessThan', lte: 'lessOrEqual',
};

function buildClauses(fieldName: string, kind: FieldKind, operator: FilterOperator, raw: string, parameter: string): NeoClause[] {
  if (kind === 'date' || kind === 'date-time') {
    // Day-level semantics like the Etendo grids: dates are compared as whole days (a date-time column included).
    const day = parseCalendarDay(raw, parameter);
    const range = (neoOperator: string, value: string): NeoClause[] => [{ fieldName, operator: neoOperator, value }];
    switch (operator) {
      case 'eq': return [...range('greaterOrEqual', day.value), ...range('lessOrEqual', day.value)];
      case 'gt': return range('greaterOrEqual', day.shift(1));
      case 'gte': return range('greaterOrEqual', day.value);
      case 'lt': return range('lessOrEqual', day.shift(-1));
      default: return range('lessOrEqual', day.value);
    }
  }
  if (operator === 'contains') return [{ fieldName, operator: 'iContains', value: parseText(raw, parameter) }];
  if (operator === 'in') {
    const parts = raw.split(',');
    if (parts.length > MAX_IN_VALUES) throw invalidQueryParameter(parameter, `Use at most ${MAX_IN_VALUES} values in a list.`);
    const values = parts.map((part) => {
      if (part === '') throw invalidQueryParameter(parameter, 'The value list must not contain empty items.');
      return parseScalar(kind, part, parameter);
    });
    return [{ fieldName, operator: 'inSet', value: values.join(',') }];
  }
  return [{ fieldName, operator: NEO_OPERATORS[operator], value: parseScalar(kind, raw, parameter) }];
}

function parseFilters(entity: PublicApiEntity, filter: unknown): { clauses: NeoClause[]; linkParams: Array<[string, string]> } {
  const clauses: NeoClause[] = [];
  const linkParams: Array<[string, string]> = [];
  if (filter === undefined) return { clauses, linkParams };
  if (!isRecord(filter)) throw invalidQueryParameter('filter', 'Use filter[<field>]=<value> or filter[<field>][<operator>]=<value>.');
  let count = 0;
  for (const [name, spec] of Object.entries(filter)) {
    const field = fieldOf(entity, name);
    const kind = field ? kindOf(field) : undefined;
    if (!field || !kind) throw invalidQueryParameter(`filter[${name}]`, `Cannot filter by "${name}": unknown or not filterable field.`);
    const operators: Array<[FilterOperator, unknown, string]> = text(spec)
      ? [['eq', spec, `filter[${name}]`]]
      : isRecord(spec)
        ? Object.entries(spec).map(([operator, value]): [FilterOperator, unknown, string] => [operator as FilterOperator, value, `filter[${name}][${operator}]`])
        : [];
    if (!operators.length) throw invalidQueryParameter(`filter[${name}]`, 'Use a single value or one operator per parameter: filter[<field>][<operator>]=<value>.');
    for (const [operator, value, parameter] of operators) {
      if (!FILTER_OPERATORS.includes(operator)) {
        throw invalidQueryParameter(parameter, `Unknown operator "${operator}". Use ${FILTER_OPERATORS.join(', ')}.`);
      }
      if (!OPERATORS_BY_KIND[kind].includes(operator)) {
        throw invalidQueryParameter(parameter, `Operator "${operator}" is not supported on "${name}". Use ${OPERATORS_BY_KIND[kind].join(', ')}.`);
      }
      if (!text(value)) throw invalidQueryParameter(parameter, 'Send one value per filter parameter; use the "in" operator with a comma-separated list for several.');
      if (++count > MAX_FILTERS) throw invalidQueryParameter('filter', `Use at most ${MAX_FILTERS} filters per request.`);
      clauses.push(...buildClauses(field.internalPath, kind, operator, value, parameter));
      linkParams.push([parameter, value]);
    }
  }
  return { clauses, linkParams };
}

/** Validates the raw (already parsed) query of a list request and translates it to NEO's list parameters. */
export function parseListQuery(entity: PublicApiEntity, query: Record<string, unknown> | undefined): ListQuery {
  const raw = query ?? {};
  for (const key of Object.keys(raw)) {
    if (!['page', 'sort', 'filter'].includes(key)) {
      throw invalidQueryParameter(key, `Unknown query parameter "${key}". Supported: page[number], page[size], sort, filter[<field>].`);
    }
  }
  const page = parsePage(raw.page);
  const sortBy = parseSort(entity, raw.sort);
  const { clauses, linkParams } = parseFilters(entity, raw.filter);
  if (text(raw.sort)) linkParams.push(['sort', raw.sort]);
  const startRow = (page.number - 1) * page.size;
  return {
    pageNumber: page.number,
    pageSize: page.size,
    startRow,
    endRow: startRow + page.size - 1,
    ...(sortBy ? { sortBy } : {}),
    ...(clauses.length ? { criteria: clauses } : {}),
    linkParams,
  };
}

/** The query string NEO receives for a list read (no leading `?`), values percent-encoded. */
export function neoListParams(query: ListQuery): string[] {
  const params = [`_startRow=${query.startRow}`, `_endRow=${query.endRow}`];
  if (query.sortBy) params.push(`_sortBy=${encodeURIComponent(query.sortBy)}`);
  if (query.criteria) params.push(`criteria=${encodeURIComponent(JSON.stringify(query.criteria))}`);
  return params;
}

const encodeValue = (value: string) => encodeURIComponent(value).replace(/%2C/g, ',');

function pageUrl(basePath: string, query: ListQuery, number: number): string {
  const parts = [
    ...query.linkParams.map(([name, value]) => `${name}=${encodeValue(value)}`),
    `page[number]=${number}`,
    `page[size]=${query.pageSize}`,
  ];
  return `${basePath}?${parts.join('&')}`;
}

/**
 * `meta.page` and `links` of a collection. `total` is the exact record count;
 * when NEO did not give one we can trust, `meta.page.total` and `links.last`
 * are omitted and `next` is offered only while the page came back full.
 */
export function pagination(basePath: string, query: ListQuery, returned: number, total: number | undefined) {
  const lastPage = total === undefined ? undefined : Math.max(1, Math.ceil(total / query.pageSize));
  const prev = query.pageNumber > 1 ? Math.min(query.pageNumber - 1, lastPage ?? query.pageNumber - 1) : undefined;
  const hasNext = lastPage === undefined ? returned >= query.pageSize : query.pageNumber < lastPage;
  return {
    meta: { page: { number: query.pageNumber, size: query.pageSize, ...(total === undefined ? {} : { total }) } },
    links: {
      self: pageUrl(basePath, query, query.pageNumber),
      first: pageUrl(basePath, query, 1),
      prev: prev === undefined ? null : pageUrl(basePath, query, prev),
      next: hasNext ? pageUrl(basePath, query, query.pageNumber + 1) : null,
      ...(lastPage === undefined ? {} : { last: pageUrl(basePath, query, lastPage) }),
    },
  };
}
