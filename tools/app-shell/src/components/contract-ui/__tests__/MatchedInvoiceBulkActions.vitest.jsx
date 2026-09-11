import { render } from '@testing-library/react';

// ETP-5075 — behavioural tests for the matched-purchase-invoices bulk post/unpost wrapper.
//
// The component lives under `artifacts/**`, which `vitest.config.js`'s
// `include: ['src/**/*.vitest.{js,jsx}']` never discovers — so the TEST lives here in
// `src/**` and reaches the component through the `@generated` alias (→ `../../artifacts`,
// declared in both vite.config.js and vitest.config.js). That keeps this a real behavioural
// test instead of the source-reading regex pattern the older artifact tests had to settle
// for.
//
// `vi.mock` factories are hoisted above every import, so the prop-capture object they
// reference must be declared through `vi.hoisted` — a plain `const` throws a TDZ
// ReferenceError (same gotcha documented in BulkDocumentAction.vitest.jsx).
const { captured } = vi.hoisted(() => ({ captured: { props: null } }));

vi.mock('@/components/contract-ui/BulkDocumentAction', () => ({
  default: (props) => {
    captured.props = props;
    return null;
  },
}));

vi.mock('@/i18n', () => ({
  // Returns the key itself so assertions read as the i18n key, not a translation that
  // would silently drift with the locale files.
  useUI: () => (key) => key,
}));

const MOD = '@generated/matched-purchase-invoices/custom/MatchedInvoiceBulkActions.jsx';
const { default: MatchedInvoiceBulkActions, buildPostActions } = await import(MOD);

// The real states `M_MatchInv.Posted` holds in this database — it is NOT a boolean.
// Only 'Y' means posted; every other code is an intermediate/error state and the record
// is genuinely still unposted, so it must stay postable.
const UNPOSTED_STATES = ['T', 'E', 'D', 'p', 'i'];

const row = (posted, id = 'r1') => ({ id, posted });

describe('buildPostActions — which actions the dropdown offers', () => {
  it('offers only post when every selected row is unposted', () => {
    expect(buildPostActions([row('p'), row('E', 'r2')]))
      .toEqual([{ value: 'post', labelKey: 'post' }]);
  });

  it('offers only unpost when every selected row is posted', () => {
    expect(buildPostActions([row('Y'), row('Y', 'r2')]))
      .toEqual([{ value: 'unpost', labelKey: 'unpost' }]);
  });

  it('offers BOTH for a mixed selection, post first', () => {
    expect(buildPostActions([row('Y'), row('p', 'r2')])).toEqual([
      { value: 'post', labelKey: 'post' },
      { value: 'unpost', labelKey: 'unpost' },
    ]);
  });

  it.each(UNPOSTED_STATES)('treats posted=%s as NOT posted (offers post)', (state) => {
    expect(buildPostActions([row(state)])).toEqual([{ value: 'post', labelKey: 'post' }]);
  });

  it('treats a real boolean true as posted', () => {
    expect(buildPostActions([row(true)])).toEqual([{ value: 'unpost', labelKey: 'unpost' }]);
  });

  it('returns no actions for an empty selection, so the toolbar button stays hidden', () => {
    expect(buildPostActions([])).toEqual([]);
  });
});

describe('MatchedInvoiceBulkActions — props handed to the shared BulkDocumentAction', () => {
  beforeEach(() => {
    captured.props = null;
    render(<MatchedInvoiceBulkActions selectedRows={[]} />);
  });

  it('targets the matchedInvoice entity in neoAction mode with the Confirmar label', () => {
    // actionMode is the load-bearing one: it retargets each per-row call to
    // POST …/matchedInvoice/{id}/action/{post|unpost} instead of the DocAction endpoint,
    // which this window has no field for.
    expect(captured.props.entity).toBe('matchedInvoice');
    expect(captured.props.actionMode).toBe('neoAction');
    expect(captured.props.labelKey).toBe('confirmBulk');
    expect(captured.props.buildActions).toBe(buildPostActions);
  });

  describe('rowFilter — pre-blocks the rows the chosen action cannot touch', () => {
    it('blocks an already-posted row when posting', () => {
      expect(captured.props.rowFilter(row('Y'), 'post')).toBe('bulkRowAlreadyPosted');
    });

    it('blocks a not-posted row when unposting', () => {
      expect(captured.props.rowFilter(row('p'), 'unpost')).toBe('bulkRowNotPosted');
    });

    it('allows an unposted row when posting', () => {
      expect(captured.props.rowFilter(row('p'), 'post')).toBe(true);
    });

    it('allows a posted row when unposting', () => {
      expect(captured.props.rowFilter(row('Y'), 'unpost')).toBe(true);
    });

    it.each(UNPOSTED_STATES)('allows posting a row in state %s', (state) => {
      expect(captured.props.rowFilter(row(state), 'post')).toBe(true);
    });
  });
});
