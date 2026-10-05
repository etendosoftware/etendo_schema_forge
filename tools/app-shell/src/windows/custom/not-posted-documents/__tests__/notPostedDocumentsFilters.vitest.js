// ETP-5591 — the Not Posted Documents filter state: defaults, URL form, backend query.
import {
  STATUS_DEFS,
  ERROR_TOKENS,
  ALL_ERRORS_TOKEN,
  hasAllErrors,
  applyStatusSelection,
  statusDefForKey,
  statusDefForToken,
  defaultFilters,
  isDefaultFilters,
  parseFilters,
  serializeFilters,
  buildRowsQuery,
} from '../notPostedDocumentsFilters';

const params = (query) => new URLSearchParams(query);

describe('status definitions', () => {
  it('lists the statuses in the design order, yellow → orange → red, with Coste no calculado', () => {
    expect(STATUS_DEFS.map((d) => [d.token, d.variant])).toEqual([
      ['N', 'yellow'], ['p', 'orange'], ['i', 'red'], ['NC', 'red'], ['E', 'red'],
    ]);
  });

  it('counts every failed-posting status as an error, but not "No contabilizado"', () => {
    expect(ERROR_TOKENS).toEqual(['p', 'i', 'NC', 'E']);
  });

  it('maps both E and C row keys to the single "Error" status', () => {
    expect(statusDefForKey('E').token).toBe('E');
    expect(statusDefForKey('C').token).toBe('E');
  });

  it('returns null for an unknown, empty or missing key', () => {
    expect(statusDefForKey('l')).toBeNull();
    expect(statusDefForKey(null)).toBeNull();
    expect(statusDefForKey('')).toBeNull();
    expect(statusDefForToken('C')).toBeNull();
  });
});

describe('"Todos los errores" shortcut', () => {
  it('is ticked only when every error status is selected', () => {
    expect(hasAllErrors(['p', 'i', 'NC', 'E'])).toBe(true);
    expect(hasAllErrors(['N', 'p', 'i', 'NC', 'E'])).toBe(true);
    expect(hasAllErrors(['p', 'i', 'E'])).toBe(false);
    expect(hasAllErrors([])).toBe(false);
  });

  it('ticking it adds every error status, keeping the others, in canonical order', () => {
    expect(applyStatusSelection(['N'], ['N', ALL_ERRORS_TOKEN])).toEqual(['N', 'p', 'i', 'NC', 'E']);
    expect(applyStatusSelection(['E'], ['E', ALL_ERRORS_TOKEN])).toEqual(['p', 'i', 'NC', 'E']);
  });

  it('unticking it removes every error status and keeps "No contabilizado"', () => {
    expect(applyStatusSelection(['N', 'p', 'i', 'NC', 'E'], ['N', 'p', 'i', 'NC', 'E'])).toEqual(['N']);
  });

  it('unticking one error status while all were selected drops just that one', () => {
    expect(applyStatusSelection(['p', 'i', 'NC', 'E'], [ALL_ERRORS_TOKEN, 'p', 'i', 'E'])).toEqual(['p', 'i', 'E']);
  });

  it('plain toggles never store the pseudo-option', () => {
    expect(applyStatusSelection([], ['NC'])).toEqual(['NC']);
    expect(applyStatusSelection(['NC'], [])).toEqual([]);
  });
});

describe('defaults', () => {
  it('opens with every type, every status and the last 12 months', () => {
    expect(defaultFilters()).toEqual({ document: null, statuses: [], date: { presetId: 'last12m' } });
    expect(isDefaultFilters(defaultFilters())).toBe(true);
  });

  it('is no longer default once any filter changes, including the date', () => {
    expect(isDefaultFilters({ ...defaultFilters(), document: 'SI' })).toBe(false);
    expect(isDefaultFilters({ ...defaultFilters(), statuses: ['N'] })).toBe(false);
    expect(isDefaultFilters({ ...defaultFilters(), date: { presetId: 'last30' } })).toBe(false);
    expect(isDefaultFilters({ ...defaultFilters(), date: null })).toBe(false);
  });
});

describe('parseFilters / serializeFilters', () => {
  it('reads the bare URL as the defaults and writes the defaults as a bare URL', () => {
    expect(parseFilters(params(''))).toEqual(defaultFilters());
    expect(serializeFilters(defaultFilters()).toString()).toBe('');
  });

  it('round-trips document, statuses and a preset', () => {
    const filters = { document: 'GS', statuses: ['N', 'E'], date: { presetId: 'last30' } };
    const query = serializeFilters(filters).toString();
    expect(query).toBe('document=GS&status=N%2CE&date=last30');
    expect(parseFilters(params(query))).toEqual(filters);
  });

  it('stores "any time" as date=all', () => {
    const query = serializeFilters({ ...defaultFilters(), date: null }).toString();
    expect(query).toBe('date=all');
    expect(parseFilters(params(query)).date).toBeNull();
  });

  it('round-trips a custom range as local calendar days', () => {
    const from = new Date(2026, 0, 5);
    const to = new Date(2026, 2, 31);
    const query = serializeFilters({ ...defaultFilters(), date: { from, to } }).toString();
    expect(query).toBe('date=2026-01-05_2026-03-31');
    const parsed = parseFilters(params(query)).date;
    expect(parsed.from.getFullYear()).toBe(2026);
    expect(parsed.from.getMonth()).toBe(0);
    expect(parsed.from.getDate()).toBe(5);
    expect(parsed.to.getDate()).toBe(31);
  });

  it('drops unknown status tokens and duplicates', () => {
    expect(parseFilters(params('status=N,X,N,C,p')).statuses).toEqual(['N', 'p']);
  });

  it('falls back to the default date for an unknown preset or a malformed range', () => {
    expect(parseFilters(params('date=forever')).date).toEqual({ presetId: 'last12m' });
    expect(parseFilters(params('date=2026-13-99_x')).date).toEqual({ presetId: 'last12m' });
  });
});

describe('buildRowsQuery', () => {
  afterEach(() => vi.useRealTimers());

  it('sends NC for Coste no calculado', () => {
    expect(params(buildRowsQuery({ document: null, statuses: ['NC'], date: null })).get('accountingStatus')).toBe('NC');
  });

  it('expands the Error status into both backend keys', () => {
    const query = buildRowsQuery({ document: null, statuses: ['N', 'E'], date: null });
    expect(params(query).get('accountingStatus')).toBe('N,E,C');
  });

  it('sends no status and no dates when nothing constrains them', () => {
    expect(buildRowsQuery({ document: null, statuses: [], date: null })).toBe('');
  });

  it('sends the document type code', () => {
    expect(params(buildRowsQuery({ ...defaultFilters(), document: 'MI' })).get('document')).toBe('MI');
  });

  it('turns the default last-12-months preset into local calendar day bounds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 23, 30));
    const query = params(buildRowsQuery(defaultFilters()));
    expect(query.get('dateFrom')).toBe('2025-10-02');
    expect(query.get('dateTo')).toBe('2026-10-02');
  });
});
