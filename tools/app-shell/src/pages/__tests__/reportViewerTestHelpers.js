import { screen, waitFor } from '@testing-library/react';

/**
 * Asserts that, while a required (non-hidden) param is empty, EVERY action
 * that can trigger a report render is disabled — the sidebar's own "Generate
 * Report" button AND the four top-bar actions (PDF / Excel / CSV / Print).
 *
 * Before ETP-4900 only the sidebar button was gated by `hasAllRequiredFilled`;
 * the top-bar PDF button still called `renderReport()` unconditionally (only
 * gated by `loading`), which made it the last reachable path to trigger
 * `validateRequired()` and surface the red "required" error text. ETP-4900
 * closed that gap: PDF/Excel/CSV/Print now share the exact same
 * `hasAllRequiredFilled` gate as the sidebar button, so there is no longer any
 * UI entry point that can reach `validateRequired()` while a required param is
 * empty — `validateRequired()` remains only as a defensive net against a
 * direct/backend call. The user-visible invariant to test is therefore that
 * ALL of these actions are disabled (and none of them fires a `/render`
 * fetch), not that an error message appears.
 */
export function assertAllActionsDisabledWhileRequiredEmpty() {
  expect(screen.getByText('runReport')).toBeDisabled();
  expect(screen.getByText('PDF')).toBeDisabled();
  expect(screen.getByText('Excel')).toBeDisabled();
  expect(screen.getByText('CSV')).toBeDisabled();
  expect(screen.getByText('print')).toBeDisabled();
}

/**
 * Waits for the four top-bar actions and the sidebar submit to become
 * re-enabled once the missing required param is filled in.
 */
export async function waitForAllActionsEnabled() {
  await waitFor(() => {
    expect(screen.getByText('runReport')).not.toBeDisabled();
    expect(screen.getByText('PDF')).not.toBeDisabled();
    expect(screen.getByText('Excel')).not.toBeDisabled();
    expect(screen.getByText('CSV')).not.toBeDisabled();
    expect(screen.getByText('print')).not.toBeDisabled();
  });
}
