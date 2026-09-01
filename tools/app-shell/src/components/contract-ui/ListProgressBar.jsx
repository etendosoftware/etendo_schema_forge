/**
 * Indeterminate top progress bar — the thin sliding line shown while a list refreshes over data
 * it already has on screen.
 *
 * Extracted from `ListView`'s inline JSX so the hand-rolled tables (the financial-account detail
 * tabs, which never go through ListView) can show the SAME affordance rather than refreshing
 * silently. It is the visible half of the "smooth refresh" pair: the rows stay mounted and dim,
 * and this says why.
 *
 * Render it under the same condition everywhere — `loading && rows.length > 0`. On the true
 * initial fetch the skeleton is the indicator, so the bar would be redundant.
 */
export function ListProgressBar({ testId = 'list-progress-bar' }) {
  return (
    <>
      <div role="progressbar" className="h-0.5 w-full overflow-hidden bg-primary/10" data-testid={testId}>
        <div
          className="h-full w-1/3 bg-primary"
          style={{ animation: 'sf-list-progress 1.1s ease-in-out infinite' }}
        />
      </div>
      <style>{'@keyframes sf-list-progress { 0% { transform: translateX(-100%) } 100% { transform: translateX(400%) } }'}</style>
    </>
  );
}
