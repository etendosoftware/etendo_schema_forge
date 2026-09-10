// ETP-5112 regression — the onboarding wizard's SII+TBAI detail step must save the two
// sections one after the other, never with `Promise.allSettled([...])`.
//
// Each section's `save()` is a PUT carrying the record's `updated` optimistic-locking
// token, and core parses that token through a `private final static SimpleDateFormat`
// (`JsonToDataConverter` line 129) which is not thread-safe: two writes landing together
// corrupt each other's parse and one is refused as a conflict against a record nobody
// touched.
//
// Unlike `FiscalConfigPage`, the wizard's DetailScreen keeps BOTH sections mounted for
// SII+TBAI (the inactive one is only hidden with a CSS class, "so ref stays valid"), so
// both refs are live at save time and the two writes really do go out together — which is
// what makes this call site reachable, and what makes this test able to observe it.
//
// The assertion is NON-OVERLAP, not arrival order: `allSettled([a, b])` evaluates in order
// too. See `@/test/requestJournal.js`.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { createRequestJournal } from '@/test/requestJournal.js';

// Handed to the section mocks, which are hoisted above this file's body — hence a mutable
// holder rather than a value captured at module scope.
const journalRef = { current: null };
const saveOutcome = { sii: 'ok', tbai: 'ok' };

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));

// The POST that creates each config record must come back with a record in the NEO
// envelope: `createRecords` stores what it returns, and the detail screen only mounts a
// section when its `createdRecords.<system>` is truthy.
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: vi.fn(() => vi.fn((url) => Promise.resolve({
    ok: true,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({
      response: { data: [{ id: url.includes('tbai') ? 'tbai-rec-1' : 'sii-rec-1' }] },
    }),
  }))),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({
    selectedOrg: { id: 'org-1', name: 'Test Organization' },
    selectedRole: { orgList: [{ id: 'org-1', name: 'Test Organization' }] },
    selectOrg: vi.fn(),
  })),
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  fetchById: vi.fn(() => Promise.resolve(null)),
  neoBase: (url) => url?.replace(/\/[^/]+$/, '') ?? '',
}));

// `resolveSystem` decides which detail screen is shown; force the combined system, which is
// the only one that saves two records. `buildOnboardingPayloads` must return BOTH payloads
// so `createdRecords.sii` and `.tbai` exist and both sections mount.
vi.mock('../fiscalConfig.utils.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildOnboardingPayloads: vi.fn(() => ({ sii: {}, tbai: {} })),
  getFiscalRecordId: vi.fn(() => null),
  getAllowedSystemsForTerritory: vi.fn(() => ['SII', 'TBAI', 'VERIFACTU']),
  getCertificateContext: vi.fn(() => null),
  resolveSystem: vi.fn(() => 'SII+TBAI'),
}));

/**
 * Section doubles whose imperative `save()` is journalled. The SII save is held open long
 * enough that a concurrent implementation starts the TBAI save inside its window.
 */
function makeSectionMock(label, delayMs) {
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      save: () => journalRef.current.track(label, {
        delayMs,
        fail: saveOutcome[label] === 'fail' ? new Error(`${label} save failed`) : undefined,
      }),
    }));
    return <div data-testid={`${label}-section`} />;
  });
}

vi.mock('../SiiSection.jsx', () => ({ default: makeSectionMock('sii', 30) }));
vi.mock('../TbaiSection.jsx', () => ({ default: makeSectionMock('tbai', 0) }));
vi.mock('../CertModal.jsx', () => ({ default: () => <div data-testid="cert-modal" /> }));
vi.mock('../CertSection.jsx', () => ({ default: () => <div data-testid="cert-section" /> }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import OnboardingWizard from '../OnboardingWizard.jsx';

/**
 * Walks the wizard to the SII+TBAI detail screen: pick a territory, continue, confirm.
 * `createRecords` then creates both records and lands on the detail step, where both the
 * SII and the TBAI section are mounted at once.
 */
async function renderAtDetailScreen(props = {}) {
  const merged = {
    apiBaseUrl: '/api/fiscal-config',
    onComplete: vi.fn(),
    onGoHome: vi.fn(),
    ...props,
  };
  const utils = render(<OnboardingWizard {...merged} />);
  fireEvent.click(screen.getByText('fiscal.territory.navarra'));
  fireEvent.click(screen.getByText('fiscal.onboarding.continue'));
  fireEvent.click(screen.getByText('fiscal.onboarding.confirm.btn'));
  await waitFor(() => expect(screen.getByText('fiscal.save')).toBeInTheDocument());
  // Both sections mounted — without this the "two saves" premise would be vacuous and the
  // non-overlap assertion below would pass on a batch of one.
  await waitFor(() => {
    expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    expect(screen.getByTestId('tbai-section')).toBeInTheDocument();
  });
  return { ...utils, props: merged };
}

/** Saves and waits until both section saves have SETTLED, not merely been started. */
async function clickSaveDetail(journal, expected = 2) {
  fireEvent.click(screen.getByText('fiscal.save'));
  await waitFor(() => expect(journal.allSettled(expected)).toBe(true));
}

beforeEach(() => {
  vi.clearAllMocks();
  journalRef.current = createRequestJournal();
  saveOutcome.sii = 'ok';
  saveOutcome.tbai = 'ok';
});

describe('OnboardingWizard — SII+TBAI detail save serialization (ETP-5112)', () => {
  it('never has the TBAI save in flight while the SII save is open', async () => {
    await renderAtDetailScreen();
    const journal = journalRef.current;

    await clickSaveDetail(journal);

    expect(journal.labels()).toEqual(['sii', 'tbai']);
    // `Promise.allSettled([siiRef.current?.save(), tbaiRef.current?.save()])` yields -2
    // here: the TBAI save stamps its start tick at 2 while the SII save settles at 4.
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('reaches the applied screen once both saves succeeded', async () => {
    await renderAtDetailScreen();

    await clickSaveDetail(journalRef.current);

    await waitFor(() => expect(screen.getByText('fiscal.onboarding.goHome')).toBeInTheDocument());
  });

  // Semantics the serialization must preserve: the previous `allSettled` attempted both
  // regardless, so a plain sequential `await` (which would skip the second on the first
  // failure) is NOT an acceptable replacement.
  it('still runs the TBAI save after the SII save threw', async () => {
    saveOutcome.sii = 'fail';
    await renderAtDetailScreen();
    const journal = journalRef.current;

    await clickSaveDetail(journal);

    expect(journal.labels()).toEqual(['sii', 'tbai']);
    expect(journal.minOverlapGap()).toBeGreaterThan(0);
  });

  it('does not advance to the applied screen when one save failed', async () => {
    saveOutcome.tbai = 'fail';
    await renderAtDetailScreen();

    await clickSaveDetail(journalRef.current);

    expect(screen.queryByText('fiscal.onboarding.goHome')).not.toBeInTheDocument();
    expect(screen.getByText('fiscal.save')).toBeInTheDocument();
  });
});
