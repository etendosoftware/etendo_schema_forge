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
} from '@/test/realApiFetch.js';
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
