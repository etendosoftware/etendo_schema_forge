import { render } from '@testing-library/react';
import { OnboardingDashboardBackdrop } from '../OnboardingDashboardBackdrop.jsx';

// ETP-4446 — the onboarding loading background is a purely decorative replica of
// the product shell. It must never be perceived or reached by assistive tech or
// keyboard users, and it must stay visually still (no pulse) so it does not
// compete with the loader ring animation in front of it.
describe('OnboardingDashboardBackdrop (ETP-4446)', () => {
  it('renders and is tagged as the ETP-4446 backdrop', () => {
    const { getByTestId } = render(<OnboardingDashboardBackdrop />);
    expect(getByTestId('OnboardingDashboardBackdrop__ETP4446')).toBeInTheDocument();
  });

  it('is hidden from assistive tech and non-interactive', () => {
    const { getByTestId } = render(<OnboardingDashboardBackdrop />);
    const root = getByTestId('OnboardingDashboardBackdrop__ETP4446');
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(root.className).toContain('pointer-events-none');
  });

  it('exposes zero focusable elements (no keyboard reach into the backdrop)', () => {
    const { container } = render(<OnboardingDashboardBackdrop />);
    const focusable = container.querySelectorAll(
      'button, a, input, select, textarea, [tabindex], [contenteditable="true"]',
    );
    expect(focusable.length).toBe(0);
  });

  it('freezes the skeleton pulse so it reads as a still backdrop', () => {
    const { container } = render(<OnboardingDashboardBackdrop />);
    // The wrapper around DashboardSkeleton disables the pulse animation of any
    // nested .animate-pulse elements. The class is an arbitrary Tailwind variant
    // (`[&_.animate-pulse]:animate-none`), so match it by className substring
    // rather than a CSS selector (which would need brittle escaping).
    const frozen = [...container.querySelectorAll('*')].some((el) =>
      el.className?.toString().includes('[&_.animate-pulse]:animate-none'),
    );
    expect(frozen).toBe(true);
  });
});
