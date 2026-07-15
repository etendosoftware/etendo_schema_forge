import { useState } from 'react';
import { MoreVertical, ExternalLink, GitMerge, BookOpen, BookX } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { useAuth } from '@/auth/AuthContext.jsx';
import { getApiBase } from '@/hooks/useNeoResource';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip';

const POST_URL = (id) =>
  `${getApiBase()}/sws/neo/financial-account/transaction/${encodeURIComponent(id)}/action/post`;

const UNPOST_URL = (id) =>
  `${getApiBase()}/sws/neo/financial-account/transaction/${encodeURIComponent(id)}/action/unpost`;

/**
 * Shared POST-with-token request used by both the post and unpost actions.
 * Returns { success, message } so callers decide how to surface the result.
 */
async function callTransactionAction(url, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await res.json().catch(() => null);
  const nested = body?.response?.data?.[0];
  const message = nested?.message ?? body?.response?.message ?? body?.message;
  const success = res.ok && (nested?.success ?? body?.success ?? true);
  return { success, message };
}

/**
 * Per-row kebab menu for a movement row.
 * Only visible on row hover (parent row must have `group` class).
 *
 * @param {{ movement: object, onReload?: () => void }} props
 */
export function MovementRowKebab({ movement, onReload }) {
  const ui = useUI();
  const { token } = useAuth();
  const [posting, setPosting] = useState(false);
  const [unposting, setUnposting] = useState(false);

  const isPosted = movement.posted === 'Y';

  async function handlePost() {
    if (posting || isPosted) return;
    setPosting(true);
    try {
      const { success, message } = await callTransactionAction(POST_URL(movement.id), token);
      if (success) {
        toast.success(ui('documentPosted'));
        onReload?.();
      } else {
        toast.error(message || ui('financeAccountMovementsRowPostError'));
      }
    } catch {
      toast.error(ui('financeAccountMovementsRowPostError'));
    } finally {
      setPosting(false);
    }
  }

  async function handleUnpost() {
    if (unposting || !isPosted) return;
    setUnposting(true);
    try {
      const { success, message } = await callTransactionAction(UNPOST_URL(movement.id), token);
      if (success) {
        toast.success(ui('documentUnposted'));
        onReload?.();
      } else {
        toast.error(message || ui('financeAccountMovementsRowUnpostError'));
      }
    } catch {
      toast.error(ui('financeAccountMovementsRowUnpostError'));
    } finally {
      setUnposting(false);
    }
  }

  return (
    <TooltipProvider data-testid="TooltipProvider__64eff3">
      <DropdownMenu data-testid="DropdownMenu__64eff3">
        <DropdownMenuTrigger asChild data-testid="DropdownMenuTrigger__64eff3">
          <button
            type="button"
            aria-label={ui('financeAccountMovementsRowActions')}
            data-testid={`movement-row-menu-${movement.id}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#828FA3] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#E8EAEF]"
          >
            <MoreVertical className="h-5 w-5" data-testid="MoreVertical__64eff3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[220px]"
          data-testid="DropdownMenuContent__64eff3">
          {/* View detail — active */}
          <DropdownMenuItem
            onClick={() => toast(ui('financeAccountMovementsRowViewDetailToast'))}
            data-testid="DropdownMenuItem__64eff3">
            <ExternalLink className="h-5 w-5 text-[#828FA3]" data-testid="ExternalLink__64eff3" />
            <span className="text-sm font-normal leading-6 text-[#121217]">
              {ui('financeAccountMovementsRowViewDetail')}
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator data-testid="DropdownMenuSeparator__64eff3" />

          {/* Unreconcile — disabled with tooltip */}
          <Tooltip data-testid="Tooltip__64eff3">
            <TooltipTrigger asChild data-testid="TooltipTrigger__64eff3">
              <span>
                <DropdownMenuItem disabled data-testid="DropdownMenuItem__64eff3">
                  <GitMerge className="h-5 w-5 text-[#828FA3]" data-testid="GitMerge__64eff3" />
                  <span className="text-sm font-normal leading-6 text-[#121217]">
                    {ui('financeAccountMovementsRowUnreconcile')}
                  </span>
                </DropdownMenuItem>
              </span>
            </TooltipTrigger>
            <TooltipContent data-testid="TooltipContent__64eff3">{ui('financeAccountMovementsRowUnreconcileTooltip')}</TooltipContent>
          </Tooltip>

          {/* Post — enabled when not yet posted */}
          {!isPosted && (
            <DropdownMenuItem
              onClick={handlePost}
              disabled={posting}
              data-testid="DropdownMenuItem__64eff3">
              <BookOpen className="h-5 w-5 text-[#828FA3]" data-testid="BookOpen__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {posting ? ui('financeAccountMovementsRowPosting') : ui('financeAccountMovementsRowPost')}
              </span>
            </DropdownMenuItem>
          )}

          {/* Unpost — enabled when already posted. No reconciliation-state field is
              exposed on the row (see artifacts/financial-account/contract.json —
              `reconciliation` is a system field with no apiKey), so it cannot be
              gated on reconciliation status here. */}
          {isPosted && (
            <DropdownMenuItem
              onClick={handleUnpost}
              disabled={unposting}
              data-testid="DropdownMenuItem__64eff3">
              <BookX className="h-5 w-5 text-[#828FA3]" data-testid="BookX__64eff3" />
              <span className="text-sm font-normal leading-6 text-[#121217]">
                {unposting ? ui('financeAccountMovementsRowUnposting') : ui('financeAccountMovementsRowUnpost')}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}
