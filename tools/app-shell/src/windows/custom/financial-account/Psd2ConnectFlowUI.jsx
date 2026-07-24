import { useState } from 'react';
import { Loader2, Landmark } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUI } from '@/i18n';

/**
 * Renders the two native surfaces of the PSD2 connect flow driven by {@code usePsd2ConnectFlow}:
 * a non-dismissable "waiting for bank authentication" overlay while the Salt Edge popup is open,
 * and the bank-account selection modal shown when the connection returns more than one account.
 *
 * @param {{ flow: ReturnType<typeof import('@/hooks/usePsd2ConnectFlow').usePsd2ConnectFlow> }} props
 */
export function Psd2ConnectFlowUI({ flow }) {
  const ui = useUI();
  const { connecting, selection, confirmSelection, cancelSelection } = flow;

  return (
    <>
      <Dialog open={connecting} data-testid="Dialog__psd2flow">
        <DialogContent
          className="max-w-sm bg-card"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          data-testid="psd2-connecting-overlay"
        >
          <DialogHeader data-testid="DialogHeader__psd2flow">
            <DialogTitle className="flex items-center justify-center gap-2 text-center" data-testid="DialogTitle__psd2flow">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--status-info-fg)]" data-testid="Loader2__psd2flow" />
              {ui('financeAccountsPsd2Connecting')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">{ui('financeAccountsPsd2ConnectingHint')}</p>
        </DialogContent>
      </Dialog>
      <Psd2AccountSelectModal
        selection={selection}
        onConfirm={confirmSelection}
        onCancel={cancelSelection}
        data-testid="Psd2AccountSelectModal__5f0f32" />
    </>
  );
}

function Psd2AccountSelectModal({ selection, onConfirm, onCancel }) {
  const ui = useUI();
  const [selected, setSelected] = useState(null);

  const open = !!selection;
  const accounts = selection?.accounts ?? [];
  const providerName = selection?.providerName;
  const providerLogoUrl = selection?.providerLogoUrl;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => { if (!value) onCancel?.(); }}
      data-testid="Dialog__psd2select">
      <DialogContent className="bg-card" data-testid="psd2-account-select-modal">
        <DialogHeader data-testid="DialogHeader__psd2select">
          <DialogTitle className="flex items-center gap-2" data-testid="DialogTitle__psd2select">
            {providerLogoUrl ? (
              <img
                src={providerLogoUrl}
                alt=""
                className="h-6 w-6 rounded border border-[hsl(var(--border-subtle))] bg-card object-contain p-0.5"
              />
            ) : null}
            <span>
              {providerName
                ? ui('financeAccountsPsd2SelectTitleBank', { bank: providerName })
                : ui('financeAccountsPsd2SelectTitle')}
            </span>
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{ui('financeAccountsPsd2SelectHint')}</p>
        <div className="mt-2 flex flex-col gap-2">
          {accounts.map((acc) => {
            const isSelected = selected === acc.saltEdgeAccountId;
            return (
              <button
                type="button"
                key={acc.saltEdgeAccountId}
                onClick={() => setSelected(acc.saltEdgeAccountId)}
                data-testid={`psd2-account-option-${acc.saltEdgeAccountId}`}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-[var(--status-info-fg)] bg-[var(--status-info-bg)]'
                    : 'border-[hsl(var(--border-subtle))] hover:bg-[hsl(var(--muted))]'
                }`}
              >
                <Landmark
                  className="h-5 w-5 flex-none text-[hsl(var(--muted-foreground))]"
                  data-testid="Landmark__5f0f32" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[hsl(var(--foreground))]">
                    {acc.name || acc.iban || acc.saltEdgeAccountId}
                  </span>
                  <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {[acc.iban, acc.currency].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            data-testid="psd2-account-select-cancel"
            className="rounded-lg border border-[hsl(var(--border-subtle))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
          >
            {ui('cancel')}
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => onConfirm?.(selected)}
            data-testid="psd2-account-select-confirm"
            className="rounded-lg bg-[hsl(var(--foreground))] px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-[hsl(var(--accent-highlight))] hover:text-[hsl(var(--accent-highlight-foreground))] disabled:bg-[hsl(var(--border-control))] disabled:text-primary-foreground disabled:hover:bg-[hsl(var(--border-control))] disabled:hover:text-primary-foreground"
          >
            {ui('financeAccountsPsd2SelectConfirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
