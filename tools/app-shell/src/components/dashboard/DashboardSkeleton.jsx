export function DashboardSkeleton() {
  return (
    <div className="dashboard-scroll p-2 bg-card rounded-tl-2xl flex-1 overflow-y-auto animate-pulse space-y-4">
      {/* Greeting */}
      <div className="flex items-center justify-between" style={{ height: '48px' }}>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-muted rounded-full shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3 w-32 bg-muted rounded" />
            <div className="h-5 w-56 bg-muted rounded" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-28 bg-muted rounded-md" />
          <div className="h-8 w-44 bg-muted rounded-md" />
        </div>
      </div>

      {/* Row 1: pending tasks | quick actions | top clients — 234px */}
      <div className="flex flex-row gap-4" style={{ height: '234px' }}>
        {/* PendingTasksRail — flex 672 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0" style={{ flex: '672 1 0' }}>
          <div className="h-12 bg-muted/50 border-b px-3 flex items-center shrink-0">
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
          <div className="flex-1 p-3 flex gap-3 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex-1 rounded-xl border bg-card p-3 flex flex-col gap-2 min-w-0">
                <div className="h-3 w-16 bg-muted rounded" />
                <div className="h-8 w-10 bg-muted rounded" />
                <div className="h-5 w-20 bg-muted rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* QuickActionsList — flex 213 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0" style={{ flex: '213 1 0' }}>
          <div className="h-12 bg-muted/50 border-b px-3 flex items-center shrink-0">
            <div className="h-3 w-28 bg-muted rounded" />
          </div>
          <div className="flex-1 py-2 px-2 flex flex-col gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 bg-muted/40 rounded-lg" />
            ))}
          </div>
        </div>

        {/* TopClientsList — flex 435 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0" style={{ flex: '435 1 0' }}>
          <div className="h-12 bg-muted/50 border-b px-3 flex items-center shrink-0">
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
          <div className="flex-1 py-2 flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 px-2 flex items-center justify-between gap-2">
                <div className="h-3 flex-1 bg-muted rounded" />
                <div className="h-5 w-20 bg-muted rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: financial summary | recent sales | collections — 234px */}
      <div className="flex flex-row gap-4" style={{ height: '234px' }}>
        {/* FinancialSummaryCard — flex 672 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0" style={{ flex: '672 1 0' }}>
          <div className="h-12 bg-muted/50 border-b px-3 flex items-center shrink-0">
            <div className="h-3 w-32 bg-muted rounded" />
          </div>
          <div className="flex-1 p-4 flex flex-col gap-3">
            <div className="h-3 w-52 bg-muted rounded" />
            <div className="flex gap-6">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex-1 flex flex-col gap-2">
                  <div className="h-3 w-12 bg-muted rounded" />
                  <div className="h-7 w-20 bg-muted rounded" />
                  <div className="h-5 w-24 bg-muted rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RecentSalesList — flex 443 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0" style={{ flex: '443 1 0' }}>
          <div className="h-12 bg-muted/50 border-b px-3 flex items-center shrink-0">
            <div className="h-3 w-28 bg-muted rounded" />
          </div>
          <div className="flex-1 py-2 flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 px-2 flex items-center gap-2">
                <div className="h-3 flex-1 bg-muted rounded" />
                <div className="h-5 w-14 bg-muted rounded-full shrink-0" />
                <div className="h-5 w-14 bg-muted rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* CollectionsPaymentsCard — flex 213 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0" style={{ flex: '213 1 0' }}>
          <div className="h-12 bg-muted/50 border-b px-3 flex items-center shrink-0">
            <div className="h-3 w-24 bg-muted rounded" />
          </div>
          <div className="flex-1 p-3 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-16 bg-muted rounded" />
                <div className="h-5 w-6 bg-muted rounded" />
              </div>
              <div className="h-7 w-28 bg-muted rounded-lg" />
            </div>
            <div className="h-px bg-muted" />
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="h-3 w-14 bg-muted rounded" />
                <div className="h-5 w-6 bg-muted rounded" />
              </div>
              <div className="h-7 w-24 bg-muted rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: financial trend | best products — 328px */}
      <div className="flex flex-row gap-4" style={{ height: '328px' }}>
        {/* FinancialTrendChart — flex 901 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0" style={{ flex: '901 1 0' }}>
          <div className="h-12 bg-muted/50 border-b px-3 flex items-center shrink-0">
            <div className="h-3 w-36 bg-muted rounded" />
          </div>
          <div className="flex-1 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between shrink-0" style={{ height: '40px' }}>
              <div className="h-3 w-40 bg-muted rounded" />
              <div className="h-10 w-24 bg-muted rounded-xl" />
            </div>
            <div className="flex-1 bg-muted/40 rounded-lg" />
          </div>
        </div>

        {/* BestProductsList — flex 443 */}
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col min-w-0" style={{ flex: '443 1 0' }}>
          <div className="h-12 bg-muted/50 border-b px-3 flex items-center shrink-0">
            <div className="h-3 w-36 bg-muted rounded" />
          </div>
          <div className="px-3 py-2 flex justify-end border-b shrink-0">
            <div className="h-10 w-44 bg-muted rounded-xl" />
          </div>
          <div className="flex-1 py-2 flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 px-2 flex items-center gap-2">
                <div className="h-3 flex-1 bg-muted rounded" />
                <div className="h-5 w-12 bg-muted rounded-full shrink-0" />
                <div className="h-5 w-10 bg-muted rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
