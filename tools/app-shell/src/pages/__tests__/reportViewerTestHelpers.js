import { screen, waitFor } from '@testing-library/react';

/**
 * Triggers the "required" validation error via the top-bar PDF button and waits
 * for the error text to appear.
 *
 * The sidebar's own "Generate Report" button is disabled while a required
 * param is empty (ETP-5013, hasAllRequiredFilled), so it can no longer be used
 * to trigger validateRequired() directly. The top-bar PDF button still calls
 * validateRequired() unconditionally (only gated by `loading`), so it remains
 * a reachable path to the same error state — used here to assert both facts:
 * the sidebar button is disabled, and the required error still surfaces.
 */
export async function assertGenerateDisabledThenPdfTriggersRequired(user) {
  expect(screen.getByText('runReport')).toBeDisabled();
  await user.click(screen.getByText('PDF'));
  await waitFor(() => expect(screen.getByText('required')).toBeInTheDocument());
}
