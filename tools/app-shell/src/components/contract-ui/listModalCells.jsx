import { PillToggle } from '@/components/PillToggle';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';

/**
 * Cell-renderer registry for the generic `list-modal` grid.
 *
 * Each cell type is a pure-ish render function selected by `column.cellType`
 * (declared in `decisions.json → entities.*.fields.<f>.cellType` and emitted into
 * the contract column descriptors). The component is intentionally backend- and
 * window-agnostic: every renderer reads only from the row payload and the column
 * descriptor, so any list-modal window (match-rule, product-catalog, …) reuses
 * them by declaring the cellType — no window-specific code lives here.
 *
 * Mirrors the financial-accounts per-row cell pattern but keeps the registry
 * inside the shared contract-ui layer so it travels with `ListModalWindow`.
 *
 * Supported cellTypes:
 *  - priorityPill    : a bordered neutral pill with the numeric value
 *  - nameWithSubline : bold name + a muted sub-line sourced from another field
 *                      (`column.subField`, resolved via $_identifier when FK)
 *  - conditionChip   : a chip whose text is derived from a kind field + pattern
 *                      field — `<kindLabel>: "<pattern>"` (kind→label is i18n)
 *  - typePill        : a rounded-full pill showing an enum label (enumLabels),
 *                      optionally toned via `column.tones[value]`
 *  - percent         : numeric value rendered as `N%`
 *  - toggle          : an inline Switch wired to a PATCH callback
 *  - text (default)  : plain enum-label / identifier / raw value
 */

const PILL_BASE =
  'inline-flex items-center bg-[#F5F7F9] border border-[#D1D4DB] px-2 py-1 text-[#3F3F50]';

// Tailwind classes per declared tone. Falls back to the neutral pill styling.
const TONE_CLASSES = {
  neutral: '',
  blue: 'bg-[#F0FAFF] border-[#BFE9FF] text-[#0075AD]',
  green: 'bg-[#ECFDF3] border-[#ABEFC6] text-[#067647]',
  amber: 'bg-[#FFFAEB] border-[#FEDF89] text-[#B54708]',
  red: 'bg-[#FEF3F2] border-[#FECDCA] text-[#B42318]',
};

function rawValue(row, key) {
  return row?.[key];
}

function enumLabel(col, value, tMenu) {
  if (value == null || value === '') return '';
  const key = col.enumLabels?.[value] ?? value;
  return tMenu ? tMenu(key) : key;
}

function PriorityPill({ row, col }) {
  const value = rawValue(row, col.key);
  if (value == null || value === '') return <span className="text-[#828FA3]">&mdash;</span>;
  return (
    <span className={`${PILL_BASE} rounded-lg text-sm leading-5`}>{value}</span>
  );
}

function NameWithSubline({ row, col, ui }) {
  const name = rawValue(row, col.key);
  const resolved = col.subField ? resolveIdentifier(row, col.subField) : null;
  // Fall back to a fixed label when the sub-field is empty (e.g. an unset
  // financial-account scope reads as "Todas las cuentas").
  const fallback = col.subEmptyKey && ui ? (ui(col.subEmptyKey) ?? col.subEmptyKey) : null;
  const subline = resolved || fallback;
  return (
    <div className="flex flex-col">
      <span className="text-sm font-semibold leading-5 text-[#121217]">
        {name ?? '—'}
      </span>
      {subline ? (
        <span className="text-xs leading-4 text-[#6C6C89]">
          {col.subPrefix ?? '→ '}{subline}
        </span>
      ) : null}
    </div>
  );
}

function ConditionChip({ row, col, tMenu }) {
  // kindField holds the discriminator (C/S/R…), patternField the literal text.
  const kindValue = col.kindField ? rawValue(row, col.kindField) : null;
  const pattern = col.patternField ? rawValue(row, col.patternField) : rawValue(row, col.key);
  let kindLabel = null;
  if (kindValue != null && col.kindLabels?.[kindValue]) {
    const rawKindLabel = col.kindLabels[kindValue];
    kindLabel = tMenu ? tMenu(rawKindLabel) : rawKindLabel;
  }
  if (!pattern && !kindLabel) return <span className="text-[#828FA3]">&mdash;</span>;
  const text = kindLabel ? `${kindLabel}: "${pattern ?? ''}"` : String(pattern ?? '');
  // Figma "Información" badge: gray fill, rounded-lg, NO border, 12px/16px #3F3F50.
  return (
    <span className="inline-flex items-center max-w-full rounded-lg bg-[#F5F7F9] px-2 py-1 text-xs leading-4 text-[#3F3F50]">
      <span className="truncate">{text}</span>
    </span>
  );
}

function TypePill({ row, col, tMenu }) {
  const value = rawValue(row, col.key);
  const label = enumLabel(col, value, tMenu);
  if (!label) return <span className="text-[#828FA3]">&mdash;</span>;
  const tone = col.tones?.[value] ?? 'neutral';
  const toneClass = TONE_CLASSES[tone] ?? '';
  return (
    <span className={`${PILL_BASE} rounded-full text-xs leading-4 ${toneClass}`}>
      {label}
    </span>
  );
}

function PercentCell({ row, col }) {
  const value = rawValue(row, col.key);
  if (value == null || value === '') return <span className="text-[#121217]">0%</span>;
  return <span className="text-sm leading-5 text-[#121217]">{value}%</span>;
}

function ToggleCell({ row, col, onToggle, saving }) {
  const raw = rawValue(row, col.key);
  const checked = raw === true || raw === 'Y' || raw === 'true';
  return (
    <div
      className="flex items-center justify-center"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <PillToggle
        checked={checked}
        disabled={!!saving}
        onCheckedChange={(next) => onToggle?.(row, col, next)}
        aria-label={col.label ?? col.key}
        data-testid={`list-modal-toggle-${col.key}-${row?.id ?? ''}`}
      />
    </div>
  );
}

function BoldTextCell({ row, col }) {
  const value = rawValue(row, col.key);
  if (value == null || value === '') return <span className="text-[#828FA3]">&mdash;</span>;
  return <span className="text-sm font-semibold leading-5 text-[#121217]">{value}</span>;
}

function DefaultCell({ row, col, tMenu }) {
  let value;
  if ((col.type === 'enum' || col.type === 'status') && col.enumLabels) {
    value = enumLabel(col, rawValue(row, col.key), tMenu);
  } else if (col.type === 'selector' || col.type === 'foreignKey') {
    value = resolveIdentifier(row, col.key);
  } else {
    value = rawValue(row, col.key);
  }
  if (value == null || value === '') return <span className="text-[#828FA3]">&mdash;</span>;
  return <span className="text-sm leading-5 text-[#121217]">{value}</span>;
}

/**
 * Render a single grid cell for the list-modal table.
 * Selects a renderer by `col.cellType`, falling back to a plain value cell.
 */
export function ListModalCell({ row, col, tMenu, ui, onToggle, savingToggle }) {
  const toggleCellEl = (
    <ToggleCell
      row={row}
      col={col}
      onToggle={onToggle}
      saving={savingToggle}
      data-testid="ToggleCell__846bd2" />
  );
  switch (col.cellType) {
    case 'priorityPill':
      return <PriorityPill row={row} col={col} data-testid="PriorityPill__846bd2" />;
    case 'nameWithSubline':
      return <NameWithSubline row={row} col={col} ui={ui} data-testid="NameWithSubline__846bd2" />;
    case 'conditionChip':
      return <ConditionChip row={row} col={col} tMenu={tMenu} data-testid="ConditionChip__846bd2" />;
    case 'typePill':
      return <TypePill row={row} col={col} tMenu={tMenu} data-testid="TypePill__846bd2" />;
    case 'percent':
      return <PercentCell row={row} col={col} data-testid="PercentCell__846bd2" />;
    case 'boldText':
      return <BoldTextCell row={row} col={col} data-testid="BoldTextCell__846bd2" />;
    case 'toggle':
      return toggleCellEl;
    default:
      // `toggle: true` (legacy inlineToggle flag) without an explicit cellType.
      if (col.toggle) {
        return toggleCellEl;
      }
      return <DefaultCell row={row} col={col} tMenu={tMenu} data-testid="DefaultCell__846bd2" />;
  }
}

/**
 * Default horizontal cell alignment for a cellType. Numeric-ish cells right-align,
 * toggle/switch centers, everything else left-aligns.
 */
export function cellAlignClass(col) {
  if (col.cellType === 'toggle' || col.toggle) return 'text-center';
  if (col.cellType === 'percent') return 'text-left';
  return 'text-left';
}

export default ListModalCell;
