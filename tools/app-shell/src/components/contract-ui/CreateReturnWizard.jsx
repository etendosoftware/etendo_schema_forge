import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUI } from '@/i18n';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { formatPlainDecimal } from '@/lib/formatCurrency.js';
import { MaskedAmountInput } from '@/components/forms/fields.jsx';
import { extractBackendMessageKeys, translateBackendError } from '@/lib/backendErrors.js';

// ETP-5729 (CP-12) — the createReturn refusals (com.etendoerp.go ReturnableQuantity, 422) that mean
// the quantities this dialog offered are no longer returnable: another return, a draft one
// included, took them since the dialog loaded. Retrying cannot succeed, so the dialog closes.
const STALE_RETURN_ERROR_CODES = new Set(['returnQuantityExceedsAvailable', 'nothingLeftToReturn']);

// Same shape as ImportLinesModal's classifyQtyDraft — a draft is valid when it
// parses to a finite magnitude in (0, maxQty]. Duplicated locally rather than
// imported: the two components have no other shared dependency, and this keeps
// each free to evolve its own validation independently.
function classifyQtyDraft(raw, maxQty) {
  if (raw === undefined || raw.trim() === '') return { valid: false, tooHigh: false };
  const parsed = Number(raw);
  const isNumeric = Number.isFinite(parsed);
  const magnitude = Math.abs(parsed);
  if (isNumeric && magnitude > 0 && magnitude <= maxQty) return { valid: true, tooHigh: false };
  return { valid: false, tooHigh: isNumeric && magnitude > maxQty };
}

function MiniCheck({ checked, onChange }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={onChange}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(); } }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        borderRadius: 3,
        border: checked ? 'none' : '1px solid hsl(var(--border-control))',
        backgroundColor: checked ? 'hsl(var(--primary))' : 'hsl(var(--card))',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background-color 150ms, border-color 150ms',
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="hsl(var(--primary-foreground))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

/**
 * Single-step "Create return" dialog shared by the sales (goods-shipment) and purchase
 * (goods-receipt) return flows.
 *
 * ETP-5729 (CP-15): there used to be a second, read-only confirmation step listing the
 * document to be created and, on the sales side, an amount per line priced from the linked
 * order. That price was resolved per PRODUCT, so an order with the same product on two lines
 * at different prices showed the wrong amount — and the step added nothing the action needs:
 * the request is built only from the lines, quantities and reason chosen here. The step was
 * removed; the button on this step creates the return directly. Prices only matter on the
 * credit note, which the backend prices per line.
 */
export default function CreateReturnWizard({
  open,
  onClose,
  sourceData,
  lines = [],
  base,
  headers,
  onSuccess,
  onError,
  titleKey,
  refLabelKey,
  createActionUrl,
}) {
  const ui = useUI();
  const apiFetch = useApiFetch(base);
  const [selected, setSelected] = useState(() => new Set());
  const [quantities, setQuantities] = useState({});
  const [qtyDrafts, setQtyDrafts] = useState({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset state every time the dialog opens
  useEffect(() => {
    if (open && lines.length > 0) {
      setSelected(new Set(lines.map((l) => l.id)));
      const q = {};
      for (const l of lines) q[l.id] = Math.abs(Number(l.movementQuantity) || 0);
      setQuantities(q);
      setQtyDrafts({});
      setReason('');
    }
  }, [open, lines]);

  const toggleLine = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(lines.map((l) => l.id)));
  }, [lines]);

  const deselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const selectedLines = lines.filter((l) => selected.has(l.id));

  const documentNo = sourceData?.documentNo || '';
  const bpName = sourceData?.['businessPartner$_identifier'] || sourceData?.businessPartner$_identifier || '';

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(createActionUrl(base, sourceData.id), {
        baseUrl: '',
        method: 'POST',
        headers,
        body: JSON.stringify({
          lines: selectedLines.map((l) => ({ lineId: l.id, returnQuantity: quantities[l.id] })),
          reason,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // `body?.error?.message` covers the standard `NeoResponse.error(int, String)` envelope
        // (`{"error":{"message","status"}}`) used by most NEO action handlers — same fallback
        // chain as useNeoAction.js (ETP-4706); without it the real backend message (e.g. "Cannot
        // return 5 of Agua: only 4 can still be returned ...", a 422 returnQuantityExceedsAvailable)
        // is silently dropped for the generic HTTP reason phrase.
        const rawMessage = body?.error?.message ?? body?.response?.error?.message
          ?? body?.response?.message ?? body?.message ?? `Request failed (${res.status})`;
        const error = new Error(translateBackendError(rawMessage, ui, {
          messageKeys: extractBackendMessageKeys(body),
        }));
        error.code = body?.error?.code;
        throw error;
      }
      onClose();
      if (onSuccess) onSuccess(body?.response?.data);
    } catch (err) {
      // A stale-quantity refusal closes the dialog instead of leaving the user in front of a
      // button that keeps failing; reopening it reloads the quantities still returnable. Any
      // other error keeps it open so the user can adjust and retry.
      if (STALE_RETURN_ERROR_CODES.has(err?.code)) onClose();
      if (onError) onError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const canProceed = selectedLines.length > 0 && selectedLines.every((l) => quantities[l.id] > 0);

  const cellStyle = { borderBottom: '0.5px solid hsl(var(--border) / 0.5)' };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      data-testid="Dialog__955eac">
      <DialogContent
        className="sm:max-w-[640px] p-0 gap-0 shadow-none bg-card"
        style={{ border: '0.5px solid hsl(var(--border))', boxShadow: 'none' }}
        data-testid="DialogContent__955eac">
        {/* Header */}
        <div className="px-6 pt-5 pb-4" style={{ backgroundColor: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border-subtle))', borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
          <DialogHeader data-testid="DialogHeader__955eac">
            <DialogTitle className="text-base font-semibold" data-testid="DialogTitle__955eac">{ui(titleKey)}</DialogTitle>
            <DialogDescription
              className="text-sm text-muted-foreground"
              data-testid="DialogDescription__955eac">
              {ui(refLabelKey)}{documentNo} &middot; {bpName}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Lines to return */}
        <div className="px-6 pb-4 border-b border-border">
          <div className="max-h-[280px] overflow-y-auto" style={{ marginTop: 16 }}>
            <table className="w-full" style={{ fontSize: 13, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 32 }} />
                <col style={{ width: '50%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'hsl(var(--muted-foreground))', letterSpacing: '0.05em' }}>
                  <th className="text-left px-1" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid hsl(var(--border-subtle))' }}>
                    <MiniCheck
                      checked={selected.size === lines.length && lines.length > 0}
                      onChange={() => { selected.size === lines.length ? deselectAll() : selectAll(); }}
                      data-testid="MiniCheck__955eac" />
                  </th>
                  <th className="text-left px-2" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid hsl(var(--border-subtle))' }}>{ui('product')}</th>
                  <th className="text-right px-2" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid hsl(var(--border-subtle))' }}>{ui('delivered')}</th>
                  <th className="text-right px-2" style={{ paddingTop: 6, paddingBottom: 6, borderBottom: '1px solid hsl(var(--border-subtle))' }}>{ui('returnQty')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const isSelected = selected.has(line.id);
                  const maxQty = Math.abs(Number(line.movementQuantity) || 0);
                  const currentQty = quantities[line.id] ?? maxQty;
                  const draft = qtyDrafts[line.id];
                  const draftInvalid = draft !== undefined && !classifyQtyDraft(draft, maxQty).valid;
                  return (
                    <tr key={line.id} className={isSelected ? '' : 'opacity-40'}>
                      <td className="px-1" style={{ ...cellStyle, paddingTop: 6, paddingBottom: 6 }}>
                        <MiniCheck
                          checked={isSelected}
                          onChange={() => toggleLine(line.id)}
                          data-testid="MiniCheck__955eac" />
                      </td>
                      <td className="px-2 text-foreground" style={{ ...cellStyle, paddingTop: 6, paddingBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {line['product$_identifier'] || line.product$_identifier || '—'}
                      </td>
                      <td className="px-2 text-right tabular-nums text-muted-foreground" style={{ ...cellStyle, paddingTop: 6, paddingBottom: 6 }}>
                        {formatPlainDecimal(maxQty)}
                      </td>
                      <td style={{ ...cellStyle, paddingTop: 6, paddingBottom: 6, textAlign: 'right', paddingLeft: 8, paddingRight: 8 }}>
                        <span
                          onClick={(e) => e.stopPropagation()}
                          style={{ display: 'inline-block', width: 70, marginLeft: 'auto' }}>
                          <MaskedAmountInput
                            bare
                            grouping={false}
                            value={currentQty}
                            onChange={(raw) => setQtyDrafts((prev) => ({ ...prev, [line.id]: raw }))}
                            onCommit={(_parsed, raw) => {
                              const check = classifyQtyDraft(raw, maxQty);
                              if (check.valid) {
                                setQuantities((prev) => ({ ...prev, [line.id]: Math.abs(Number(raw)) }));
                              } else if (check.tooHigh) {
                                toast.error(ui('qtyMaxAllowed', { max: maxQty }));
                              } else {
                                toast.error(ui('qtyMustBePositive'));
                              }
                              setQtyDrafts((prev) => { const n = { ...prev }; delete n[line.id]; return n; });
                            }}
                            disabled={!isSelected}
                            className={`w-full border rounded tabular-nums bg-muted/20 focus:bg-card focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-30 disabled:bg-transparent text-[13px] py-1 px-1 border-[0.5px] ${draftInvalid ? 'border-destructive' : 'border-border'}`}
                            data-testid="CreateReturnWizard__qtyInput" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Reason field */}
          <div className="mt-4">
            <label className="block text-xs text-muted-foreground mb-1">{ui('reasonForReturn')}</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={ui('optional')}
              className="w-full text-sm border rounded px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground/50"
              style={{ borderWidth: '0.5px' }}
            />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter
          className="px-6 pt-5 pb-4"
          style={{ backgroundColor: 'hsl(var(--muted))', borderTop: '1px solid hsl(var(--border-subtle))' }}
          data-testid="DialogFooter__955eac">
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="Button__955eac">
            {ui('cancel')}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!canProceed || loading}
            data-testid="Button__955eac">
            {loading ? ui('creating') : ui('createReturn')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
