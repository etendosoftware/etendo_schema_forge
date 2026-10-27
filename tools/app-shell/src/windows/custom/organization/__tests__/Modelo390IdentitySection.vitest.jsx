const gridBoundary = await vi.hoisted(async () => (await import('@/test/gridViewTestDoubles.jsx')).createGridBoundary());
vi.mock('@/lib/flags', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridFlagsMock(() => gridBoundary.enabled));
vi.mock('@/hooks/useGridView.js', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridViewHookMock(gridBoundary));
vi.mock('@/components/contract-ui/GridViewControls.jsx', async () => (await import('@/test/gridViewTestDoubles.jsx')).gridViewControlsMock());
import { resetGridBoundary } from '@/test/gridViewTestDoubles.jsx';

beforeEach(() => resetGridBoundary(gridBoundary));

// @covers tools/app-shell/src/windows/custom/organization/Modelo390IdentitySection.jsx
// @covers tools/app-shell/src/windows/custom/organization/RepresentantesLegalesSection.jsx
// @covers tools/app-shell/src/windows/custom/organization/representanteLegal.js
//
// The "Representante legal / Modelo 390" section of the Organization window. What must hold:
// "Persona física" switches between the natural-person fields (page form) and the legal
// representatives grid; the grid marks the first 3 rows by line as the ones the Modelo 390
// sends; the add/edit form validates required fields inline before any request is made.

import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { createStableUseApiFetchMock } from '@/test/mockUseApiFetch.js';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: createStableUseApiFetchMock(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// DateField's own typing/calendar behaviour is covered by its core suite; here a plain input
// that emits the `yyyy-MM-dd` value DateField's onChange contract promises is enough.
vi.mock('@/components/ui/date-field', () => ({
  DateField: ({ value, onChange, 'data-testid': testId }) => (
    <input data-testid={testId} value={value ?? ''} onChange={e => onChange(e.target.value)} />
  ),
}));

import Modelo390IdentitySection from '../Modelo390IdentitySection.jsx';
import {
  getAeat390IdentityErrors, buildAeat390InfoPayload, buildRepresentativePayload, activeRepresentatives,
} from '../representanteLegal.js';

const API_BASE_URL = '/sws/neo/organization';
const ORG_ID = 'org-1';

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body });
}

function mockFetch(rows, { postResponse } = {}) {
  globalThis.fetch = vi.fn((url, opts = {}) => {
    if (!opts.method || opts.method === 'GET') return jsonResponse({ response: { data: rows } });
    if (opts.method === 'POST') return postResponse ?? jsonResponse({ response: { data: [{ id: 'new' }] } });
    return jsonResponse({ response: { data: [{}] } });
  });
}

function Harness({ initial = {} }) {
  const [form, setForm] = useState({ aeat390Isperson: false, ...initial });
  return (
    <Modelo390IdentitySection
      form={form}
      fieldErrors={{}}
      onFieldChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
      apiBaseUrl={API_BASE_URL}
      orgId={ORG_ID} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Modelo390IdentitySection — Persona física toggle', () => {
  it('shows the representatives grid (with the 3-row hint) when the org is not a natural person', async () => {
    mockFetch([]);
    render(<Harness />);

    expect(await screen.findByTestId('RepresentantesLegalesSection__root')).toBeInTheDocument();
    expect(screen.getByTestId('RepresentantesLegalesSection__limitHint')).toHaveTextContent('orgRepLimitHint:{"limit":3}');
    expect(screen.queryByTestId('Modelo390IdentitySection__personFields')).not.toBeInTheDocument();
  });

  it('switches to the natural-person fields when toggled on, and back to the grid when toggled off', async () => {
    mockFetch([]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__root');

    fireEvent.click(screen.getByTestId('Modelo390IdentitySection__isPerson'));

    const person = screen.getByTestId('Modelo390IdentitySection__personFields');
    for (const field of ['aeat390Firstname', 'aeat390Surname1', 'aeat390Surname2', 'aeat390RepNif', 'aeat390RepName']) {
      expect(within(person).getByTestId(`Modelo390IdentitySection__${field}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('RepresentantesLegalesSection__root')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('Modelo390IdentitySection__isPerson'));
    expect(await screen.findByTestId('RepresentantesLegalesSection__root')).toBeInTheDocument();
  });

  it('caps the natural-person inputs at the AD column lengths', () => {
    mockFetch([]);
    render(<Harness initial={{ aeat390Isperson: true }} />);
    expect(screen.getByTestId('Modelo390IdentitySection__aeat390RepNif')).toHaveAttribute('maxLength', '20');
    expect(screen.getByTestId('Modelo390IdentitySection__aeat390RepName')).toHaveAttribute('maxLength', '60');
  });
});

describe('RepresentantesLegalesSection — grid', () => {
  it('lists rows by line and marks only the first 3 as sent in the Modelo 390', async () => {
    mockFetch([
      { id: 'r40', lineNo: 40, taxID: 'D', firstName: 'Dora' },
      { id: 'r10', lineNo: 10, taxID: 'A', firstName: 'Ana', lastname1: 'García', lastname2: 'López', powerDate: '2026-01-15' },
      { id: 'r30', lineNo: 30, taxID: 'C', firstName: 'Carla' },
      { id: 'r20', lineNo: 20, taxID: 'B', firstName: 'Bea' },
    ]);
    render(<Harness />);

    await screen.findByTestId('RepresentantesLegalesSection__row-r10');
    const rowIds = screen.getAllByTestId(/^RepresentantesLegalesSection__row-/).map(el => el.dataset.testid);
    expect(rowIds).toEqual([
      'RepresentantesLegalesSection__row-r10',
      'RepresentantesLegalesSection__row-r20',
      'RepresentantesLegalesSection__row-r30',
      'RepresentantesLegalesSection__row-r40',
    ]);
    for (const id of ['r10', 'r20', 'r30']) {
      expect(within(screen.getByTestId(`RepresentantesLegalesSection__row-${id}`))
        .getByTestId('RepresentantesLegalesSection__included')).toBeInTheDocument();
    }
    expect(within(screen.getByTestId('RepresentantesLegalesSection__row-r40'))
      .queryByTestId('RepresentantesLegalesSection__included')).not.toBeInTheDocument();

    const first = screen.getByTestId('RepresentantesLegalesSection__row-r10');
    expect(first).toHaveTextContent('Ana García López');
    // Date-only value rendered on its own calendar day (no timezone shift).
    expect(first).toHaveTextContent('15/01/2026');
  });

  it('shows the empty state when there are no representatives', async () => {
    mockFetch([]);
    render(<Harness />);
    expect(await screen.findByTestId('RepresentantesLegalesSection__empty')).toBeInTheDocument();
  });

  it('flags the 390 blocker (PAR012) when a legal entity has no active representative', async () => {
    mockFetch([{ id: 'r10', lineNo: 10, taxID: 'A', active: false }]);
    render(<Harness />);
    expect(await screen.findByTestId('RepresentantesLegalesSection__noActiveHint')).toHaveTextContent('orgRepLegalEntityHint');
    // The grid stays editable: adding a representative is how the blocker is resolved.
    expect(within(screen.getByTestId('RepresentantesLegalesSection__root')).getByTestId('action-add-line')).toBeInTheDocument();
  });

  it('flags the 390 blocker when no representative the 390 reads carries a NIF', async () => {
    mockFetch([{ id: 'r10', lineNo: 10, taxID: '  ' }]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__row-r10');
    expect(screen.getByTestId('RepresentantesLegalesSection__noActiveHint')).toBeInTheDocument();
  });

  it('does not warn once there is an active representative', async () => {
    mockFetch([{ id: 'r10', lineNo: 10, taxID: 'A' }]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__row-r10');
    expect(screen.queryByTestId('RepresentantesLegalesSection__noActiveHint')).not.toBeInTheDocument();
  });

  it('places the 390 marker on the first 3 ACTIVE rows by line (an inactive row gets none)', async () => {
    mockFetch([
      { id: 'r10', lineNo: 10, taxID: 'A' },
      { id: 'r20', lineNo: 20, taxID: 'B', active: 'N' },
      { id: 'r30', lineNo: 30, taxID: 'C' },
      { id: 'r40', lineNo: 40, taxID: 'D' },
    ]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__row-r10');
    const marked = (id) => within(screen.getByTestId(`RepresentantesLegalesSection__row-${id}`))
      .queryByTestId('RepresentantesLegalesSection__included');
    expect(marked('r10')).toBeInTheDocument();
    expect(marked('r20')).not.toBeInTheDocument();
    expect(marked('r30')).toBeInTheDocument();
    expect(marked('r40')).toBeInTheDocument();
  });

  it('blocks a new representative with missing required fields, inline, without calling the backend', async () => {
    mockFetch([]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__empty');

    fireEvent.click(within(screen.getByTestId('RepresentantesLegalesSection__root')).getByTestId('action-add-line'));
    fireEvent.change(screen.getByTestId('RepresentantesLegalesSection__input-firstName'), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__save'));

    for (const field of ['taxID', 'lastname1', 'powerDate', 'notaryName']) {
      expect(screen.getByTestId(`RepresentantesLegalesSection__error-${field}`)).toHaveTextContent('fieldRequired');
    }
    expect(screen.queryByTestId('RepresentantesLegalesSection__error-firstName')).not.toBeInTheDocument();
    expect(screen.queryByTestId('RepresentantesLegalesSection__error-lastname2')).not.toBeInTheDocument();
    expect(globalThis.fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
  });

  it('rejects a malformed NIF inline', async () => {
    mockFetch([]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__empty');

    fireEvent.click(within(screen.getByTestId('RepresentantesLegalesSection__root')).getByTestId('action-add-line'));
    fireEvent.change(screen.getByTestId('RepresentantesLegalesSection__input-taxID'), { target: { value: 'NOTANIF' } });
    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__save'));

    expect(screen.getByTestId('RepresentantesLegalesSection__error-taxID')).toHaveTextContent(/taxIdInvalid/);
  });

  it('creates a valid representative without lineNo and with a yyyy-MM-dd power date, then reloads', async () => {
    mockFetch([]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__empty');

    fireEvent.click(within(screen.getByTestId('RepresentantesLegalesSection__root')).getByTestId('action-add-line'));
    const set = (field, value) => fireEvent.change(
      screen.getByTestId(`RepresentantesLegalesSection__input-${field}`), { target: { value } });
    set('taxID', '12345678Z');
    set('firstName', 'Ana');
    set('lastname1', 'García');
    set('powerDate', '2026-01-15');
    set('notaryName', 'Notaría Pérez');
    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__save'));

    await waitFor(() => expect(screen.queryByTestId('RepresentantesLegalesSection__form')).not.toBeInTheDocument());
    const post = globalThis.fetch.mock.calls.find(([, o]) => o?.method === 'POST');
    const body = JSON.parse(post[1].body);
    expect(body).not.toHaveProperty('lineNo');
    expect(body).toMatchObject({ taxID: '12345678Z', powerDate: '2026-01-15', parentId: ORG_ID, lastname2: null });
  });

  it('stores the representative NIF normalized, the same value the validator accepted', async () => {
    mockFetch([]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__empty');

    fireEvent.click(within(screen.getByTestId('RepresentantesLegalesSection__root')).getByTestId('action-add-line'));
    const set = (field, value) => fireEvent.change(
      screen.getByTestId(`RepresentantesLegalesSection__input-${field}`), { target: { value } });
    set('taxID', '12.345.678-z');
    set('firstName', 'Ana');
    set('lastname1', 'García');
    set('powerDate', '2026-01-15');
    set('notaryName', 'N');
    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__save'));

    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(true));
    const post = globalThis.fetch.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(post[1].body).taxID).toBe('12345678Z');
    const gets = globalThis.fetch.mock.calls.filter(([, o]) => !o?.method || o.method === 'GET');
    expect(gets.length).toBeGreaterThanOrEqual(2);
  });

  it('edits a row with a PATCH seeded from its current values', async () => {
    mockFetch([{ id: 'r10', lineNo: 10, taxID: '12345678Z', firstName: 'Ana', lastname1: 'García', powerDate: '2026-01-15T00:00:00', notaryName: 'N' }]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__row-r10');

    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__edit'));
    expect(screen.getByTestId('RepresentantesLegalesSection__input-powerDate')).toHaveValue('2026-01-15');
    fireEvent.change(screen.getByTestId('RepresentantesLegalesSection__input-notaryName'), { target: { value: 'Notaría Nueva' } });
    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__save'));

    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(true));
    const [url, opts] = globalThis.fetch.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(url).toMatch(/\/representanteLegal\/r10$/);
    expect(JSON.parse(opts.body)).toMatchObject({ notaryName: 'Notaría Nueva', powerDate: '2026-01-15' });
  });

  it('toasts the backend error when a save fails and keeps the form open', async () => {
    mockFetch([], { postResponse: jsonResponse({ response: { error: { message: 'Duplicado' } } }, false, 400) });
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__empty');

    fireEvent.click(within(screen.getByTestId('RepresentantesLegalesSection__root')).getByTestId('action-add-line'));
    const set = (field, value) => fireEvent.change(
      screen.getByTestId(`RepresentantesLegalesSection__input-${field}`), { target: { value } });
    set('taxID', '12345678Z');
    set('firstName', 'Ana');
    set('lastname1', 'García');
    set('powerDate', '2026-01-15');
    set('notaryName', 'N');
    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__save'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('orgRepSaveError:{"error":"Duplicado"}'));
    expect(screen.getByTestId('RepresentantesLegalesSection__form')).toBeInTheDocument();
  });

  it('deletes a row', async () => {
    mockFetch([{ id: 'r10', lineNo: 10, taxID: 'A' }]);
    render(<Harness />);
    await screen.findByTestId('RepresentantesLegalesSection__row-r10');

    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__delete'));

    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(true));
    const [url] = globalThis.fetch.mock.calls.find(([, o]) => o?.method === 'DELETE');
    expect(url).toMatch(/\/representanteLegal\/r10$/);
  });
});

describe('representanteLegal — Modelo 390 identity rules (classic AD_OrgInfo checks)', () => {
  const person = (extra) => ({ aeat390Isperson: true, aeat390Firstname: 'Ana', aeat390Surname1: 'García', ...extra });

  it('checks nothing while Persona física is off', () => {
    expect(getAeat390IdentityErrors({ aeat390Isperson: false, aeat390RepNif: 'X' })).toEqual({});
  });

  it('requires Nombre and Primer apellido (blank and whitespace count as missing)', () => {
    expect(getAeat390IdentityErrors({ aeat390Isperson: true, aeat390Firstname: '  ' }))
      .toEqual({ aeat390Firstname: 'fieldRequired', aeat390Surname1: 'fieldRequired' });
    expect(getAeat390IdentityErrors(person())).toEqual({});
  });

  it('requires the representative NIF and name together', () => {
    expect(getAeat390IdentityErrors(person({ aeat390RepNif: '12345678Z' })))
      .toEqual({ aeat390RepName: 'org390RepPairRequired' });
    expect(getAeat390IdentityErrors(person({ aeat390RepName: 'Juan' })))
      .toEqual({ aeat390RepNif: 'org390RepPairRequired' });
    expect(getAeat390IdentityErrors(person({ aeat390RepNif: '12345678Z', aeat390RepName: 'Juan' }))).toEqual({});
  });

  it('reports a malformed representative NIF by its format key', () => {
    expect(getAeat390IdentityErrors(person({ aeat390RepNif: '12345678A', aeat390RepName: 'Juan' })).aeat390RepNif)
      .toMatch(/^taxIdInvalid/);
  });

  it('builds the information payload with blanks as null and the NIF normalized', () => {
    expect(buildAeat390InfoPayload({
      aeat390Isperson: true, aeat390Firstname: ' Ana ', aeat390Surname1: 'García', aeat390Surname2: '',
      aeat390RepNif: ' 12.345.678-z ', aeat390RepName: '   ',
    })).toEqual({
      aeat390Isperson: true, aeat390Firstname: 'Ana', aeat390Surname1: 'García', aeat390Surname2: null,
      aeat390RepNif: '12345678Z', aeat390RepName: null,
    });
  });

  it('normalizes the legal representative TAXID and keeps only active rows', () => {
    expect(buildRepresentativePayload({ taxID: 'x-1234567-l' }).taxID).toBe('X1234567L');
    expect(activeRepresentatives([{ id: 1 }, { id: 2, active: false }, { id: 3, active: 'N' }, { id: 4, active: 'Y' }])
      .map(r => r.id)).toEqual([1, 4]);
  });
});

describe('RepresentantesLegalesSection personal columns', () => {
  it('keeps line/390 markers and edit/delete actions fixed when data columns move or hide', async () => {
    gridBoundary.enabled = true;
    gridBoundary.active = true;
    gridBoundary.keys = ['notaryName', 'firstName'];
    gridBoundary.widths = { firstName: 260 };
    mockFetch([{ id: 'r10', lineNo: 10, taxID: '12345678Z', firstName: 'Ana', lastname1: 'Garcia', powerDate: '2026-01-15', notaryName: 'Notary 1' }]);
    render(<Harness />);
    const row = await screen.findByTestId('RepresentantesLegalesSection__row-r10');
    expect(row.children).toHaveLength(4);
    expect(within(row.children[0]).getByTestId('RepresentantesLegalesSection__included')).toBeInTheDocument();
    expect(row.children[1]).toHaveTextContent('Notary 1');
    expect(row.children[2]).toHaveTextContent('Ana Garcia');
    expect(within(row.children[3]).getByTestId('RepresentantesLegalesSection__edit')).toBeInTheDocument();
    expect(within(row.children[3]).getByTestId('RepresentantesLegalesSection__delete')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(4);
    expect(headers[2]).toHaveStyle({ width: '260px' });
    fireEvent.click(within(row).getByTestId('RepresentantesLegalesSection__edit'));
    expect(screen.getByTestId('RepresentantesLegalesSection__input-taxID')).toHaveValue('12345678Z');
    expect(screen.getByTestId('RepresentantesLegalesSection__input-firstName')).toHaveValue('Ana');
    fireEvent.change(screen.getByTestId('RepresentantesLegalesSection__input-firstName'), { target: { value: 'Eva' } });
    fireEvent.click(screen.getByTestId('RepresentantesLegalesSection__save'));
    await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options.method === 'PATCH'
      && JSON.parse(options.body).firstName === 'Eva')).toBe(true));
    expect(gridBoundary.last).toMatchObject({ spec: 'organization', entity: 'representanteLegal', enabled: true });
  });

  it('uses the original complete grid while personal preferences have not loaded', async () => {
    gridBoundary.enabled = true;
    gridBoundary.keys = ['firstName'];
    mockFetch([]);
    render(<Harness />);
    const empty = await screen.findByTestId('RepresentantesLegalesSection__empty');
    expect(screen.getAllByRole('columnheader')).toHaveLength(6);
    expect(empty).toHaveAttribute('colspan', '6');
  });
});
