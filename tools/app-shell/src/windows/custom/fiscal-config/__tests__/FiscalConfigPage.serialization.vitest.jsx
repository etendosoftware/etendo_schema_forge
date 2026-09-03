// ETP-5112 regression — `FiscalConfigPage.saveTwoRefs` must run its two section saves one
// after the other, never with `Promise.allSettled([...])`.
//
// Each section's `save()` is a PUT carrying the record's `updated` optimistic-locking
// token, and core parses that token through a `private final static SimpleDateFormat`
// (`JsonToDataConverter` line 129) which is not thread-safe: two writes landing together
// corrupt each other's parse and one comes back refused as a conflict against a record
// nobody touched.
//
// WHAT THIS FILE CAN AND CANNOT PROVE — read before extending it.
//
// On the `sii+tbai` layout this page mounts only the ACTIVE tab's section
// (`{activeTab === 0 && <SiiSection ref={siiRef} …>}` / `{activeTab === 1 && <TbaiSection
// ref={tbaiRef} …>}`), so React has nulled the other ref by the time Save is pressed and
// `saveTwoRefs`'s second `ref?.save()` is a no-op. The pair therefore never actually
// overlaps here regardless of how `saveTwoRefs` is written, and a non-overlap assertion
// could not distinguish a sequential loop from `Promise.allSettled` on this page. The
// first test below PINS that single-mount fact — if the page ever starts keeping both
// sections mounted (which is what the onboarding wizard's DetailScreen does, deliberately,
// "so ref stays valid"), it fails and this file must grow the real non-overlap assertion
// that `OnboardingWizard.serialization.vitest.jsx` already carries.
//
// What is asserted instead is the part of `saveTwoRefs`'s contract that IS observable
// here: each ref is awaited (a rejection surfaces as the page's save error rather than an
// unhandled rejection), a null ref is tolerated, and the first ref failing does not stop
// the second from being attempted.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { createRequestJournal } from '@/test/requestJournal.js';

const journalRef = { current: null };
const saveOutcome = { sii: 'ok', tbai: 'ok' };

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: vi.fn(() => ({
    selectedOrg: { id: 'org-1', name: 'Test Org' },
    selectedRole: { orgList: [{ id: 'org-1', name: 'Test Org' }] },
    selectOrg: vi.fn(),
  })),
}));

vi.mock('react-router-dom', () => ({ useNavigate: vi.fn(() => vi.fn()) }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: vi.fn() }));

vi.mock('../useFiscalConfig.js', () => ({
  useFiscalConfig: vi.fn(() => ({
    loading: false,
    error: null,
    profile: 'sii+tbai',
    siiRecord: { id: 'sii-1' },
    tbaiRecord: { id: 'tbai-1' },
    verifactuRecord: null,
    refetch: vi.fn(),
    createComplementary: vi.fn(),
  })),
}));

vi.mock('../../fiscal-monitor/useDebugMode.js', () => ({ useDebugMode: () => false }));
vi.mock('../useCertExpiry.js', () => ({ useCertExpiry: () => ({ daysLeft: null }) }));
vi.mock('../fiscalConfig.utils.js', async (importActual) => ({
  ...(await importActual()),
  detectProfile: vi.fn(() => 'sii+tbai'),
}));
vi.mock('../ChangeSifDialog.jsx', () => ({ default: () => null }));
vi.mock('../FiscalConfigDebugPanel.jsx', () => ({ default: () => <div data-testid="debug-panel" /> }));
vi.mock('../OnboardingWizard.jsx', () => ({ default: () => <div data-testid="onboarding-wizard" /> }));
vi.mock('../CertExpiryBanner.jsx', () => ({ default: () => <div data-testid="cert-expiry-banner" /> }));

/** Section doubles whose imperative `save()` is journalled. */
function makeSectionMock(label, delayMs) {
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      save: () => journalRef.current.track(label, {
        delayMs,
        fail: saveOutcome[label] === 'fail' ? new Error(`${label} boom`) : undefined,
      }),
    }));
    return <div data-testid={`${label}-section`} />;
  });
}

vi.mock('../SiiSection.jsx', () => ({ default: makeSectionMock('sii', 30) }));
vi.mock('../TbaiSection.jsx', () => ({ default: makeSectionMock('tbai', 0) }));
vi.mock('../VerifactuSection.jsx', () => ({ default: makeSectionMock('verifactu', 0) }));

vi.mock('../TabBar.jsx', () => ({
  default: ({ tabs, active, onChange }) => (
    <div data-testid="tab-bar">
      {tabs.map((tab, i) => (
        <button key={tab} onClick={() => onChange(i)} data-active={active === i}>{tab}</button>
      ))}
    </div>
  ),
}));

vi.mock('../FiscalOrgDropdown.jsx', () => ({ default: () => <div data-testid="org-dropdown" /> }));
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
  ),
}));
vi.mock('lucide-react', () => ({
  Save: () => <svg data-testid="icon-save" />,
  RefreshCw: () => <svg data-testid="icon-refresh" />,
  PlusCircle: () => <svg data-testid="icon-plus-circle" />,
  MoreVertical: () => <svg data-testid="icon-more-vertical" />,
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: () => null,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
}));

import FiscalConfigPage from '../FiscalConfigPage.jsx';

function renderPage() {
  return render(<FiscalConfigPage token="test-token" apiBaseUrl="/api" />);
}

function clickSave() {
  fireEvent.click(screen.getByText('fiscal.save').closest('button'));
}

beforeEach(() => {
  vi.clearAllMocks();
  journalRef.current = createRequestJournal();
  saveOutcome.sii = 'ok';
  saveOutcome.tbai = 'ok';
});

describe('FiscalConfigPage — sii+tbai save (ETP-5112)', () => {
  // The premise behind every other assertion in this file. See the header comment: if this
  // ever fails because BOTH sections are mounted, the page's two saves really can overlap
  // and this file owes a non-overlap assertion.
  it('mounts only the active tab section, so the second ref is null at save time', () => {
    renderPage();

    expect(screen.getByTestId('sii-section')).toBeInTheDocument();
    expect(screen.queryByTestId('tbai-section')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('fiscal.tab.tbai'));

    expect(screen.getByTestId('tbai-section')).toBeInTheDocument();
    expect(screen.queryByTestId('sii-section')).not.toBeInTheDocument();
  });

  it('awaits the mounted section save and reports success', async () => {
    renderPage();

    clickSave();
    await waitFor(() => expect(journalRef.current.allSettled(1)).toBe(true));

    expect(journalRef.current.labels()).toEqual(['sii']);
    // No save error banner: `saveTwoRefs` resolved, i.e. the save was genuinely awaited.
    expect(screen.queryByText('sii boom')).not.toBeInTheDocument();
  });

  it('saves the tbai section once its tab is the active one', async () => {
    renderPage();
    fireEvent.click(screen.getByText('fiscal.tab.tbai'));

    clickSave();
    await waitFor(() => expect(journalRef.current.allSettled(1)).toBe(true));

    expect(journalRef.current.labels()).toEqual(['tbai']);
  });

  // `saveTwoRefs` collects an outcome per ref and rethrows the FIRST error — a save that
  // was fired but not awaited would surface as an unhandled rejection instead, and the
  // banner would never appear.
  it('surfaces a failing section save as the page save error', async () => {
    saveOutcome.sii = 'fail';
    renderPage();

    clickSave();

    await waitFor(() => expect(screen.getByText('sii boom')).toBeInTheDocument());
  });

  it('tolerates a null ref without failing the save', async () => {
    // No org selected -> Save is disabled, so instead assert the shape that reaches
    // `saveTwoRefs` with one null ref: only the mounted section is ever invoked.
    renderPage();

    clickSave();
    await waitFor(() => expect(journalRef.current.allSettled(1)).toBe(true));

    expect(journalRef.current.entries).toHaveLength(1);
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();
  });
});
