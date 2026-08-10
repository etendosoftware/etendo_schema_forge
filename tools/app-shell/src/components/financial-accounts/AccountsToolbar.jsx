import { Search, Plus, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { AccountTypeFilter } from './AccountTypeFilter.jsx';

/**
 * Toolbar above the accounts table. Sizes match Figma `3012:25602`:
 *   - Wrapper: 56 px tall, padding 8 px, space-between.
 *   - Left group: type filter (181 px × 40 px).
 *   - Right group: search (232 px), matching rules (188 px), new account (153 px),
 *     each 40 px tall.
 */
export function AccountsToolbar({
  typeFilter,
  onTypeFilterChange,
  search,
  onSearchChange,
  onNewAccount,
  onMatchingRules,
}) {
  const ui = useUI();

  return (
    <div
      className="flex h-10 items-center justify-between gap-2.5"
      data-testid="cuentas-toolbar"
    >
      <div className="flex items-center gap-2">
        <AccountTypeFilter
          value={typeFilter}
          onChange={onTypeFilterChange}
          data-testid="AccountTypeFilter__c01b81" />
      </div>
      <div className="flex items-center gap-2">
        <div className="relative h-10 w-[232px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[hsl(var(--text-disabled))]"
            data-testid="Search__c01b81" />
          <Input
            type="search"
            value={search ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={ui('financeAccountsSearchPlaceholder')}
            className="h-10 rounded-lg border-[hsl(var(--border-control))] bg-card pl-10 text-sm font-medium leading-6 text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] placeholder:text-[hsl(var(--muted-foreground))]"
            data-testid="cuentas-search-input"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onMatchingRules}
          className="h-10 w-[188px] gap-1 rounded-lg border-[hsl(var(--border-control))] bg-card px-3 text-sm font-medium leading-6 text-[hsl(var(--foreground))] shadow-[0_1px_2px_hsl(var(--foreground) / 0.05)] hover:bg-[hsl(var(--muted))] [&_svg]:size-5"
          data-testid="cuentas-matching-rules-button"
        >
          <Filter className="text-[hsl(var(--text-disabled))]" data-testid="Filter__c01b81" />
          {ui('financeAccountsMatchingRules')}
        </Button>

        <Button
          type="button"
          onClick={onNewAccount}
          className="group h-10 w-[153px] gap-1 rounded-lg bg-[hsl(var(--foreground))] px-3 text-sm font-medium leading-6 text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] [&_svg]:size-5"
          data-testid="cuentas-new-account-button"
        >
          <Plus
            className="text-primary-foreground/90 group-hover:text-[hsl(var(--accent-highlight-foreground))]"
            data-testid="Plus__c01b81" />
          {ui('financeAccountsNewAccount')}
        </Button>
      </div>
    </div>
  );
}
