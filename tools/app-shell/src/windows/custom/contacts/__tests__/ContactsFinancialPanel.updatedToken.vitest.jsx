// ETP-5112 regression (bug 1) — the contacts credit/tax panel must send the business
// partner's `updated` optimistic-locking token on its inline PATCH.
//
// This panel is the awkward one: it NEVER READS. It receives `data` through props from
// `useEntity` and then PATCHes `/businessPartner/{id}` directly, so there is no GET of its
// own for `auth/api.js` to harvest a token from. What arms it is the `null` bucket of the
// version cache — `useEntity` remembers the record it was handed WITHOUT any path context,
// and `getRecordVersion(id, 'businessPartner')` falls back to that bucket when no entry
// exists under the real entity name (`lib/recordVersions.js`, resolution step 2).
//
// So this test seeds the cache the way `useEntity` does (a bare `rememberRecordVersion`
// with no entity) and asserts the panel's write picks it up. Break the fallback and this
// fails; that is the point. The real `createApiFetch` is deliberately not stubbed — see
// `@/test/realApiFetch.js`.

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

vi.mock('lucide-react', () => ({
  Minus: () => <span data-testid="icon-minus" />,
  Plus: () => <span data-testid="icon-plus" />,
}));

vi.mock('../BillingPreferencesForm', () => ({ default: () => <div data-testid="billing-form" /> }));
vi.mock('../FiscalDefaultsSection', () => ({ default: () => <div data-testid="fiscal-defaults-section" /> }));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  neoResponse, bodyOf, writeCalls, resetRecordVersionsForTests, rememberRecordVersion,
  createRealUseApiFetchMock,
} from '@/test/realApiFetch.js';
import { getRecordVersion } from '@etendosoftware/app-shell-core/lib/recordVersions.js';
import ContactsFinancialPanel from '../ContactsFinancialPanel.jsx';

const BP_ID = 'bp-1';
const BP_TOKEN = 'BP-RECORD-TOKEN-0001';

const defaultProps = {
  data: { id: BP_ID, creditLimit: 5000, creditUsed: 1000, active: true },
  token: 'test-token',
  apiBaseUrl: '/sws/neo/contacts',
  catalogs: {},
  api: {},
  // The credit fields are read-only unless the form is in edit mode, and a read-only field
  // never persists.
  editing: true,
  onChange: vi.fn(),
};

/** Stands in for `useEntity`: remembers the record with NO path context (the null bucket). */
function seedUseEntityVersion(updated = BP_TOKEN) {
  rememberRecordVersion({ id: BP_ID, updated });
}

function creditLimitInput() {
  return screen.getAllByRole('spinbutton')[0];
}

beforeEach(() => {
  resetRecordVersionsForTests();
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([{ id: BP_ID, creditLimit: 7000 }])));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ContactsFinancialPanel — updated token (ETP-5112)', () => {
  it('sends the token useEntity remembered, through the null-bucket fallback', async () => {
    seedUseEntityVersion();
    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());

    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));

    const [call] = writeCalls(globalThis.fetch);
    expect(call[0]).toContain(`/businessPartner/${BP_ID}`);
    const body = bodyOf(call);
    expect(body.updated).toBe(BP_TOKEN);
    expect(body.creditLimit).toBe(7000);
  });

  // The whole reason the cache is keyed by (entity, id) and not by id alone: an id can name
  // two different rows. An entry remembered for another entity under the SAME id must not
  // be handed to this write when the null bucket is available.
  it('prefers the null bucket over an unrelated entity entry for the same id', async () => {
    rememberRecordVersion({ id: BP_ID, updated: 'OTHER-ENTITY-TOKEN' }, 'someOtherEntity');
    seedUseEntityVersion();
    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());

    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));

    expect(bodyOf(writeCalls(globalThis.fetch)[0]).updated).toBe(BP_TOKEN);
  });

  // Documents the loud-failure contract: with nothing remembered the write goes out WITHOUT
  // a token and the server answers 400 `missing_updated`. Deliberately not auto-retried —
  // re-reading and replaying would silently overwrite someone else's change.
  it('sends no token at all when the record was never remembered', async () => {
    render(<ContactsFinancialPanel {...defaultProps} />);

    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());

    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));

    expect(bodyOf(writeCalls(globalThis.fetch)[0])).not.toHaveProperty('updated');
  });
});

// Which token the SECOND consecutive write carries, established while diagnosing ETP-5255.
// The duplicate-PATCH bug was a 409 `stale_record`, so the token the follow-up write replays
// is the thing that decides whether a legitimate second edit is accepted. Kept because the
// answer is not obvious from either side alone: the panel never reads, so its only source of
// a fresh token is what `auth/api.js` harvests off the PATCH RESPONSE.
//
// Single-flight itself is covered by `ContactsFinancialPanel.singleFlight.vitest.jsx`; these
// cases are about token PROVENANCE across two saves the user genuinely made.
describe('ContactsFinancialPanel — token carried by a second consecutive save', () => {
  const READ_TOKEN = 'TOKEN-FROM-READ';
  const TOKEN_AFTER_FIRST_PATCH = 'TOKEN-AFTER-PATCH-1';

  async function editCreditLimitTo(value, expectedWrites) {
    fireEvent.change(creditLimitInput(), { target: { value: String(value) } });
    fireEvent.blur(creditLimitInput());
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(expectedWrites));
  }

  // The healthy path: the PATCH response echoes a fresh `updated`, the helper harvests it, and
  // the next write uses it. This is what makes two consecutive edits work at all.
  it('uses the token harvested from the previous PATCH response', async () => {
    rememberRecordVersion({ id: BP_ID, updated: READ_TOKEN });
    globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([{
      id: BP_ID, creditLimit: 7000, updated: TOKEN_AFTER_FIRST_PATCH,
    }])));

    render(<ContactsFinancialPanel {...defaultProps} />);
    await editCreditLimitTo(7000, 1);
    await editCreditLimitTo(8000, 2);

    const calls = writeCalls(globalThis.fetch);
    expect(bodyOf(calls[0]).updated).toBe(READ_TOKEN);
    expect(bodyOf(calls[1]).updated).toBe(TOKEN_AFTER_FIRST_PATCH);
  });

  // Characterization, NOT a contract: when the response omits `updated` there is nothing to
  // harvest, so the second write replays the token the first one consumed and the server
  // answers 409. Documented here so the dependency on the server echoing `updated` is visible
  // rather than folklore — if a response shape ever stops echoing it, this is the failure.
  it('replays the consumed token when the PATCH response omits `updated`', async () => {
    rememberRecordVersion({ id: BP_ID, updated: READ_TOKEN });
    globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([{ id: BP_ID, creditLimit: 7000 }])));

    render(<ContactsFinancialPanel {...defaultProps} />);
    await editCreditLimitTo(7000, 1);
    await editCreditLimitTo(8000, 2);

    expect(bodyOf(writeCalls(globalThis.fetch)[1]).updated).toBe(READ_TOKEN);
  });

  // Characterization of a KNOWN LIMITATION, not a desired behaviour: the contacts contract
  // maps several entity names onto the same C_BPartner row (businessPartner / customer /
  // vendorCreditor / employee / …). A write through one alias refreshes only that alias's
  // bucket, so every other bucket for the same id — including the one this panel writes
  // through — is left holding the token that write consumed, and the next save 409s.
  //
  // Out of ETP-5255's scope (that ticket was about the panel issuing two writes of its own).
  // If the version cache is ever taught to key by underlying table, this test SHOULD fail —
  // that is the signal to delete it, not to restore the behaviour.
  it('leaves this panel\'s bucket stale after a write through another alias of the same row', async () => {
    const useApiFetch = createRealUseApiFetchMock();
    const apiFetch = useApiFetch('/sws/neo/contacts');
    globalThis.fetch = vi.fn(() => Promise.resolve(neoResponse([{
      id: BP_ID, updated: TOKEN_AFTER_FIRST_PATCH,
    }])));

    // The row read through both aliases: same row, same token.
    rememberRecordVersion({ id: BP_ID, updated: READ_TOKEN }, 'businessPartner');
    rememberRecordVersion({ id: BP_ID, updated: READ_TOKEN }, 'customer');
    rememberRecordVersion({ id: BP_ID, updated: READ_TOKEN });

    // The user saves the Customer tab first.
    await apiFetch(`/customer/${BP_ID}`, { method: 'PATCH', body: JSON.stringify({ creditLimit: 1 }) });
    await waitFor(() => expect(getRecordVersion(BP_ID, 'customer')).toBe(TOKEN_AFTER_FIRST_PATCH));

    // Then edits the credit limit, which goes out through /businessPartner.
    render(<ContactsFinancialPanel {...defaultProps} />);
    fireEvent.change(creditLimitInput(), { target: { value: '7000' } });
    fireEvent.blur(creditLimitInput());
    await waitFor(() => expect(writeCalls(globalThis.fetch).length).toBeGreaterThanOrEqual(2));

    const bpCall = writeCalls(globalThis.fetch)
      .find(([url]) => String(url).includes('/businessPartner/'));
    expect(bodyOf(bpCall).updated).toBe(READ_TOKEN); // stale -> the server answers 409
  });
});
