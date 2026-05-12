import { useState, useEffect } from 'react';
import { useUI } from '@/i18n';
import { computeDocumentTotals } from '@/lib/documentTotals';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * DocumentTotalsPanel — generic totals block for document detail views.
 *
 * The discount column in the lines grid is always visible (static).
 *
 * "Subtotal without discount" + "Discount per product" rows appear automatically
 * when at least one line carries a non-zero discount — no user interaction needed.
 *
 * "+ Add total discount" button appears when no total discount is active. Clicking it
 * shows a checkbox (checked) + amount + input/type selector. Unchecking collapses the
 * section and restores the button.
 *
 * Props:
 *   lines                  — array of line row objects (hook.children)
 *   pendingLine            — optional: in-progress add-row values (live snapshot)
 *   editingLine            — optional: sidebar editing values (live snapshot)
 *   lineConfig             — { qtyField, priceField, discountField, grossField }
 *   formatAmount           — function(amount, currency?) → formatted string
 *   currency               — currency identifier string (e.g. 'USD', 'EUR')
 *   readOnly               — boolean — when true hides the "+ Add total discount" button
 *   totalDiscountPct       — number from header record (emEtgoTotalDiscount); restores panel on load
 *   onTotalDiscountChange  — callback(pct: number) — called when user changes or removes the discount
 */
export default function DocumentTotalsPanel({
  lines = [],
  pendingLine = null,
  editingLine = null,
  lineConfig,
  formatAmount,
  currency,
  readOnly = false,
  totalDiscountPct = 0,
  onTotalDiscountChange,
}) {
  const ui = useUI();
  const [totalDiscountOpen, setTotalDiscountOpen] = useState(totalDiscountPct > 0);
  const [inputPct, setInputPct] = useState(totalDiscountPct || 0);

  // Sync panel state when the loaded record changes (e.g., navigating between records).
  useEffect(() => {
    setTotalDiscountOpen(totalDiscountPct > 0);
    setInputPct(totalDiscountPct || 0);
  }, [totalDiscountPct]);

  // Auto-collapse only when lines are cleared AND there is no server-saved discount.
  // Without this guard the panel closes during async load (header arrives before lines),
  // leaving totalDiscountOpen=false while inputPct still holds the saved percentage.
  useEffect(() => {
    if (lines.length === 0 && pendingLine == null && totalDiscountPct <= 0) {
      setTotalDiscountOpen(false);
    }
  }, [lines.length, pendingLine, totalDiscountPct]);

  const { grossSubtotal, netSubtotal, grandTotal, discountAmt, taxAmt, totalDiscountAmt } =
    computeDocumentTotals(lines, pendingLine, editingLine, lineConfig, inputPct);

  const fmt = (val) => {
    if (val == null) return '';
    return typeof formatAmount === 'function' ? formatAmount(val, currency) : String(val);
  };

  const hasPerProductDiscount = discountAmt != null && discountAmt > 0;
  const canShowTotalDiscount = !readOnly && !!lineConfig?.discountField && (lines.length > 0 || pendingLine != null);

  const divider = (
    <div style={{ borderTopWidth: '0.5px', borderTopStyle: 'solid', borderTopColor: 'var(--border)' }} />
  );

  return (
    <div className="mt-1 flex flex-col items-end" data-inline-add-portal="true">
      <div className="w-full text-sm pr-12">

        <div>

          {/* Gross subtotal header — always visible. */}
          <div className="flex justify-between py-2 px-2">
            <span className="font-semibold">{ui('subtotalWithoutDiscount')}</span>
            <span className="tabular-nums font-semibold">{fmt(grossSubtotal)}</span>
          </div>

          {/* Per-product discount row — always visible. Renders 0 until a line
              carries a discount; updates live as user edits. */}
          <div className="flex justify-between py-2 px-2">
            <span className="text-muted-foreground">{ui('discountPerProduct')}</span>
            <span className="tabular-nums text-muted-foreground">{discountAmt > 0 ? `-${fmt(discountAmt)}` : fmt(0)}</span>
          </div>

          {/* "+ Añadir descuento total" button — sits BELOW the per-product
              discount row when the panel is collapsed. Uses the same vertical
              footprint as the expanded "Descuento total" row so toggling does
              not change the panel's total height. */}
          {canShowTotalDiscount && !totalDiscountOpen && (
            <div className="flex items-center py-2 px-2">
              <button
                type="button"
                onClick={() => setTotalDiscountOpen(true)}
                className="text-xs text-primary underline underline-offset-2 hover:opacity-70 transition-opacity cursor-pointer bg-transparent border-0 text-left p-0"
              >
                + {ui('addTotalDiscount')}
              </button>
            </div>
          )}

          {/* Total discount — read-only display for completed documents, interactive otherwise */}
          {totalDiscountOpen && (
            readOnly ? (
              <div className="flex justify-between items-center py-2 px-2">
                <span className="text-muted-foreground whitespace-nowrap">
                  {ui('totalDiscount')} ({inputPct}%)
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {totalDiscountAmt > 0 ? `-${fmt(totalDiscountAmt)}` : fmt(0)}
                </span>
              </div>
            ) : (
              // Single compact row — checkbox + label + % input + amount — so the
              // expanded panel keeps the same height as the collapsed "+ Añadir
              // descuento total" link area, no layout shift on toggle.
              <div className="flex items-center gap-2 py-2 px-2">
                <div className="flex items-center gap-1.5 select-none">
                  <Checkbox
                    checked
                    onChange={() => {
                      setTotalDiscountOpen(false);
                      setInputPct(0);
                      onTotalDiscountChange?.(0);
                    }}
                  />
                  <span className="whitespace-nowrap">{ui('totalDiscount')}</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={inputPct}
                  onChange={e => {
                    const raw = e.target.value.replace(/[^\d.]/g, '');
                    setInputPct(raw === '' ? 0 : Number(raw));
                  }}
                  onBlur={e => {
                    const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                    setInputPct(v);
                    onTotalDiscountChange?.(v);
                  }}
                  className="w-12 text-xs border border-border/60 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                  style={{ borderWidth: '0.5px' }}
                />
                <span className="text-xs text-muted-foreground">%</span>
                <span className="tabular-nums text-muted-foreground ml-auto whitespace-nowrap">
                  {totalDiscountAmt > 0 ? `-${fmt(totalDiscountAmt)}` : fmt(0)}
                </span>
              </div>
            )
          )}

          {/* Separator before net totals — discount rows (always visible) sit
              above, so the divider is always drawn here. */}
          {divider}

          {/* Net subtotal — deducts totalDiscountAmt when active (0 when no discount, so always safe) */}
          {netSubtotal != null && (
            <div className="flex justify-between py-2 px-2">
              <span className="text-muted-foreground">{ui('subtotal')}</span>
              <span className="tabular-nums">{fmt(totalDiscountAmt != null ? netSubtotal - totalDiscountAmt : netSubtotal)}</span>
            </div>
          )}

          {/* Tax */}
          {taxAmt != null && taxAmt !== 0 && (
            <>
              {divider}
              <div className="flex justify-between py-2 px-2">
                <span className="text-muted-foreground">{ui('tax')}</span>
                <span className="tabular-nums">{fmt(taxAmt)}</span>
              </div>
            </>
          )}

          {/* Total — bold */}
          {grandTotal != null && (
            <>
              {divider}
              <div className="flex justify-between py-2 px-2 font-semibold">
                <span>{ui('total')}</span>
                <span className="tabular-nums">{fmt(grandTotal)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
