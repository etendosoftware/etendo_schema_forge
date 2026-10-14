// @covers tools/app-shell/src/windows/custom/organization/Modelo390IdentitySection.jsx
// @covers tools/app-shell/src/windows/custom/organization/RepresentantesLegalesSection.jsx
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
