import { Plus } from 'lucide-react';
import { useUI, useLabel } from '@/i18n';
import SelectorInput from './SelectorInput';

/**
 * Shared "Dimensiones contables" expand-row UX (ETP-4529).
 *
 * Extracted from `AmortizationLinesTable.jsx` (`tools/app-shell/src/windows/custom/
 * amortization/`), where this pattern originated, so any lines table — hand-built
 * (Amortización itself, after this extraction) or generic (`InlineLinesPanel`'s
 * `dimensionsPanel` column type) — can reuse the exact same badge/summary/expand-grid
 * UX instead of re-implementing it per window.
 *
 * Three building blocks, composed by the caller:
 *  - `DimBadge`      — small "Label: Value" pill.
 *  - `DimSummary`    — per-row cell: up to 2 `DimBadge`s + "+N" overflow when any
 *                      candidate field has a value, OR a dashed "+ Add dimensions"
 *                      trigger when every candidate is empty (hidden entirely when
 *                      the doc is processed AND empty — editable docs still show the
 *                      trigger). Clicking it fires `onClick` (the caller owns the
 *                      expand/collapse state).
 *  - `DimensionGrid` — the expanded content: a 4-column grid of `SelectorInput`s, one
 *                      per visible dimension field, meant to render in a full-width
 *                      row/section directly below the data row when expanded.
 *
 * None of these decide WHICH fields are visible — callers resolve that via
 * `useAccountingDimensionFields` (or an equivalent evaluate-display call) and pass the
 * already-filtered `fields` array in.
 */

// Badge with "Label: Value" format, matching the UX spec
// (bg hsl(var(--muted)), radius 8px, padding 4px 8px, label hsl(var(--muted-foreground)), Inter 14px/20px).
export function DimBadge({ label, value }) {
  return (
    <span className="inline-flex items-center px-2 py-1 rounded-lg bg-[hsl(var(--muted))] text-sm leading-5 whitespace-nowrap max-w-full">
      <span className="text-[hsl(var(--muted-foreground))]">{label}:</span>
      <span className="ml-1 font-medium text-[hsl(var(--foreground))] truncate">{value}</span>
    </span>
  );
}

function getIdentifier(line, key) {
  return line[`${key}$_identifier`] ?? (typeof line[key] === 'string' ? line[key] : null) ?? null;
}

const MAX_BADGES = 2;

/**
 * @param line - the row record. Badge values are resolved via `getIdentifier`
 *   (prefers `${key}$_identifier`, falls back to a string field value).
 * @param onClick - fires when the summary (or the empty-state trigger) is clicked.
 *   The caller owns the expand/collapse state — this component is stateless.
 * @param processed - when true AND there are no filled dimensions, the empty-state
 *   "+ Add dimensions" trigger is hidden entirely (it would only reveal disabled
 *   fields). Editable/draft rows still show the affordance.
 * @param labelOverrides - forwarded to `useLabel` for AD label resolution of each
 *   filled dimension's column.
 * @param fields - the already-visibility-filtered candidate dimension fields.
 * @param emptyLabel - text for the empty-state trigger. Defaults to the generic
 *   `dimensionsPanelEmpty` i18n key; pass an explicit resolved string to override
 *   (e.g. a window-specific key) — see AmortizationLinesTable.jsx for an example
 *   that keeps its original `amortizationDimensionsEmpty` key this way.
 */
export function DimSummary({ line, onClick, processed, labelOverrides, fields, emptyLabel }) {
  const ui = useUI();
  const t = useLabel(labelOverrides);
  const org = line['organization$_identifier'];
  const filled = fields
    .map(f => ({ column: f.column, value: getIdentifier(line, f.key) }))
    .filter(d => d.value);

  // Organization always leads the badge list (per design), followed by filled dimensions.
  const badges = [];
  if (org) badges.push({ label: ui('organization'), value: org });
  filled.forEach(d => badges.push({ label: t(d.column), value: d.value }));

  if (badges.length === 0) {
    // Processed + no dimensions: the "+ Add dimensions" trigger would only reveal
    // disabled fields, so hide it entirely. Editable docs still show the affordance.
    if (processed) return null;
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-dashed border-[hsl(var(--border-control))] text-xs font-medium text-muted-foreground hover:text-foreground hover:border-[hsl(var(--text-disabled))] transition-colors"
      >
        <Plus className="h-3 w-3" data-testid="Plus__DimensionsPanel" />
        {emptyLabel ?? ui('dimensionsPanelEmpty')}
      </button>
    );
  }

  const shown = badges.slice(0, MAX_BADGES);
  const extra = badges.length - shown.length;

  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer max-w-full">
      {shown.map(b => <DimBadge
        key={b.label}
        label={b.label}
        value={b.value}
        data-testid="DimBadge__DimensionsPanel" />)}
      {extra > 0 && (
        <span className="px-2 py-1 rounded-lg bg-[hsl(var(--muted))] text-sm leading-5 font-medium text-[hsl(var(--muted-foreground))]">+{extra}</span>
      )}
    </button>
  );
}

/**
 * Renders the resolved dimension fields directly via `SelectorInput` so the caller
 * controls the placeholder (empty `resolvedLabel` → "Seleccionar..." / "Select...").
 *
 * @param entityName - the ETGO_SF_ENTITY name used to build each field's selector
 *   URL and resolve mock catalogs (`${apiBaseUrl}/${entityName}/selectors/${column}`).
 *   Defaults to 'lines' — the detail entity name every current caller (Amortización,
 *   InlineLinesPanel's `dimensionsPanel` column) happens to use.
 */
export function DimensionGrid({ fields, data, onChange, onFieldSave, apiBaseUrl, token, catalogs, readOnly, isCompleted, labelOverrides, entityName = 'lines' }) {
  const t = useLabel(labelOverrides);
  return (
    <div
      className={`[&_button[role=combobox]]:!bg-card [&_button[role=combobox]:hover]:!bg-[hsl(var(--muted))] [&_input]:!bg-card${isCompleted ? '' : ' [&_input:disabled]:!opacity-100'}`}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}
    >
      {fields.filter(f => !f.hidden).map(f => {
        const label = t(f.column) ?? f.label ?? f.key;
        const value = data?.[f.key] ?? '';
        const displayValue = data?.[`${f.key}$_identifier`] ?? '';
        const selectorUrl = apiBaseUrl ? `${apiBaseUrl}/${entityName}/selectors/${f.column}` : null;
        return (
          <div key={f.key} className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground block">{label}</label>
            {readOnly ? (
              <input
                className="flex h-8 w-full rounded-lg border border-[hsl(var(--border-control))] bg-card p-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                value={displayValue || value || ''}
                disabled
                readOnly
              />
            ) : (
              <SelectorInput
                entityName={entityName}
                field={f}
                value={value}
                displayValue={displayValue}
                onChange={(val, lbl) => {
                  onChange(f.key, val);
                  onChange(`${f.key}$_identifier`, lbl ?? '');
                  onFieldSave?.(f.key, val);
                }}
                catalogs={catalogs}
                resolvedLabel=""
                selectorUrl={selectorUrl}
                token={token}
                triggerClassName="w-full h-8 text-sm bg-card focus:ring-2 focus:ring-primary"
                data-testid="SelectorInput__DimensionsPanel" />
            )}
          </div>
        );
      })}
    </div>
  );
}
