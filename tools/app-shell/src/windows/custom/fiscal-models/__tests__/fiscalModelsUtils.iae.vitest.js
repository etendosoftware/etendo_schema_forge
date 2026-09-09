// Vitest tests for two ETP-5187 additions to fiscalModelsUtils.js:
//   - deriveResultKind — single source of truth for the Modelo 303 "Resultado"
//     badge kind, shared by FmListPage.jsx and FmModel303Page.jsx.
//   - showIaeActivityReminder — the informational (non-blocking) IAE-activity
//     reminder toast, fired from FmCatalogPage's 303 activation toggle and
//     FmOverlays.jsx's NewDeclModal T4/12 period selection.
// Neither had dedicated coverage before this file — both were introduced in
// the same diff and are exercised only indirectly (if at all) by their callers.

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(() => 'toast-id-1'), dismiss: vi.fn() },
}));

import { deriveResultKind, showIaeActivityReminder } from '../fiscalModelsUtils.js';
import { toast } from 'sonner';

// ── deriveResultKind ─────────────────────────────────────────────────────────

describe('deriveResultKind', () => {
  it('returns "C" for a negative result (a compensar/devolver)', () => {
    expect(deriveResultKind({ result: -35479.08 })).toBe('C');
  });

  it('returns "I" for a positive result (a ingresar)', () => {
    expect(deriveResultKind({ result: 1309.98 })).toBe('I');
  });

  it('returns "zero" for an exact-zero result when the declaration has invoices', () => {
    expect(deriveResultKind({ result: 0 }, { hasInvoices: true })).toBe('zero');
  });

  it('returns "N" for an exact-zero result when the declaration has no invoices', () => {
    expect(deriveResultKind({ result: 0 }, { hasInvoices: false })).toBe('N');
  });

  it('defaults hasInvoices to false when opts is omitted entirely', () => {
    expect(deriveResultKind({ result: 0 })).toBe('N');
  });

  it('returns null when result is NaN', () => {
    expect(deriveResultKind({ result: NaN })).toBeNull();
  });

  it('returns null when result is undefined', () => {
    expect(deriveResultKind({ result: undefined })).toBeNull();
  });

  it('coerces a null result to Number(null)=0, i.e. "N" (not null) — Number.isFinite(0) is true', () => {
    // Documents actual behavior: unlike `undefined`/NaN, `null` is NOT filtered
    // out by the `!Number.isFinite` guard because `Number(null) === 0`.
    expect(deriveResultKind({ result: null })).toBe('N');
  });

  it('returns null when summary itself is null/undefined', () => {
    expect(deriveResultKind(null)).toBeNull();
    expect(deriveResultKind(undefined)).toBeNull();
  });

  it('returns null for a non-finite result (Infinity)', () => {
    expect(deriveResultKind({ result: Infinity })).toBeNull();
    expect(deriveResultKind({ result: -Infinity })).toBeNull();
  });

  it('coerces a numeric string result the same as a number', () => {
    expect(deriveResultKind({ result: '100' })).toBe('I');
    expect(deriveResultKind({ result: '-1' })).toBe('C');
  });

  it('a very small negative amount still counts as "C", not "zero"', () => {
    expect(deriveResultKind({ result: -0.01 }, { hasInvoices: true })).toBe('C');
  });
});

// ── showIaeActivityReminder ────────────────────────────────────────────────

describe('showIaeActivityReminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function echoT(key) {
    return key;
  }

  it('calls toast.warning exactly once', () => {
    showIaeActivityReminder(echoT, vi.fn());
    expect(toast.warning).toHaveBeenCalledTimes(1);
  });

  it('builds a single <span> message node containing the reminder sentence and a bold CTA button', () => {
    showIaeActivityReminder(echoT, vi.fn());
    const node = toast.warning.mock.calls[0][0];
    expect(node.type).toBe('span');
    const [sentenceChild, buttonChild] = node.props.children;
    expect(sentenceChild).toContain('fm.aeat.reminder.iaeActivity');
    expect(buttonChild.type).toBe('button');
    expect(buttonChild.props.children).toBe('fm.aeat.action.go_to_organization');
    expect(buttonChild.props.className).toContain('fm-link-btn');
  });

  it('falls back to the hardcoded Spanish sentence/CTA when t() returns undefined for both keys', () => {
    showIaeActivityReminder(() => undefined, vi.fn());
    const node = toast.warning.mock.calls[0][0];
    const [sentenceChild, buttonChild] = node.props.children;
    expect(sentenceChild).toContain('Recordá configurar la actividad del IAE');
    expect(buttonChild.props.children).toBe('Ir a Organización');
  });

  it('clicking the inline CTA navigates to /organization', () => {
    const navigate = vi.fn();
    showIaeActivityReminder(echoT, navigate);
    const node = toast.warning.mock.calls[0][0];
    const [, buttonChild] = node.props.children;
    buttonChild.props.onClick();
    expect(navigate).toHaveBeenCalledWith('/organization');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('clicking the inline CTA dismisses the toast by the id toast.warning returned', () => {
    showIaeActivityReminder(echoT, vi.fn());
    const node = toast.warning.mock.calls[0][0];
    const [, buttonChild] = node.props.children;
    buttonChild.props.onClick();
    expect(toast.dismiss).toHaveBeenCalledWith('toast-id-1');
  });

  it('each call produces its own independent toast (2 calls => 2 warnings)', () => {
    showIaeActivityReminder(echoT, vi.fn());
    showIaeActivityReminder(echoT, vi.fn());
    expect(toast.warning).toHaveBeenCalledTimes(2);
  });
});
