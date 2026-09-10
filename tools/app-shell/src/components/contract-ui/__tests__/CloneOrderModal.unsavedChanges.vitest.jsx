// ETP-5073 — DOC-09 (the Clone control stayed enabled over a dirty form) and DOC-10 (cloning
// before saving was allowed and then failed). They are one defect seen twice: the control and
// its observed consequence.
//
// The gate lives in CloneOrderModal rather than in each window's topbar on purpose. Every
// window that offers cloning renders THIS component — sales-invoice, purchase-order,
// goods-shipment, goods-receipt, ReturnWindowShell and the grid's row action — and each one
// used to make its own enable/disable decision, which is exactly why Clone was reachable over
// unsaved changes. One gate here covers all of them, including windows added later.
//
// The registry (`@/lib/unsavedChanges.js`) is imported for real: it is the single source of
// truth the ticket's Solution Design asks for, already shared with the `beforeunload` guard and
// the locale switcher, and mocking it would test the mock instead of the wiring.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CloneOrderModal from '../CloneOrderModal.jsx';
import {
  setUnsavedChanges, resetUnsavedChangesForTests,
} from '@/lib/unsavedChanges.js';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => vi.fn() }));
vi.mock('@/lib/observability/health-events.js', () => ({ trackDocumentCreated: vi.fn() }));
vi.mock('@/i18n', () => ({
  // Echo the key back, so an assertion names the key rather than a translation that may change.
  useUI: () => (key) => key,
  useLocale: () => ({}),
}));

function renderModal() {
  return render(
    <CloneOrderModal
      recordId="INV-1"
      data={{ documentNo: 'INV-1' }}
      apiBaseUrl="/sws/neo/sales-invoice"
      onClose={vi.fn()}
    />,
  );
}

describe('CloneOrderModal — unsaved-changes gate (ETP-5073)', () => {
  beforeEach(() => resetUnsavedChangesForTests());
  afterEach(() => resetUnsavedChangesForTests());

  it('enables Clone when no form holds unsaved changes (no regression)', () => {
    // Acceptance criterion 4: a document with no pending changes clones as it does today.
    renderModal();
    expect(screen.getByTestId('action-clone-record')).not.toBeDisabled();
    expect(screen.queryByTestId('clone-blocked-unsaved')).toBeNull();
  });

  it('disables Clone while a form holds unsaved changes (DOC-09)', () => {
    setUnsavedChanges('detail-form', true);
    renderModal();
    expect(screen.getByTestId('action-clone-record')).toBeDisabled();
  });

  it('explains why, instead of silently disabling the button (DOC-10)', () => {
    // A disabled control with no reason reads as a bug. The banner replaces the generic info
    // one so the single actionable message is not buried underneath it.
    setUnsavedChanges('detail-form', true);
    renderModal();
    expect(screen.getByTestId('clone-blocked-unsaved')).toBeTruthy();
    expect(screen.getByText('cloneBlockedUnsavedChanges')).toBeTruthy();
    expect(screen.queryByText('cloneInfoBanner')).toBeNull();
  });

  it('shows the normal info banner when clean', () => {
    renderModal();
    expect(screen.getByText('cloneInfoBanner')).toBeTruthy();
    expect(screen.queryByText('cloneBlockedUnsavedChanges')).toBeNull();
  });

  it('is driven by the shared registry, so any dirty form blocks — not just the detail form', () => {
    // The registry is keyed per form instance (a record plus a modal can both be mounted), and
    // the gate asks "is ANYTHING dirty", which is what makes a line-sidebar edit block cloning
    // too.
    setUnsavedChanges('line-sidebar', true);
    renderModal();
    expect(screen.getByTestId('action-clone-record')).toBeDisabled();
  });

  it('does not block once the dirty form clears its entry', () => {
    setUnsavedChanges('detail-form', true);
    setUnsavedChanges('detail-form', false);
    renderModal();
    expect(screen.getByTestId('action-clone-record')).not.toBeDisabled();
  });
});
