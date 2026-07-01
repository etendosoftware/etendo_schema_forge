import { Plus, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu.jsx';
import { GROUP_STYLE, DIVIDER_STYLE, ICON_COLOR, TEXT_COLOR } from './add-line-button-tokens.js';

const PRIMARY_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '5px 8px',
  background: '#FFFFFF',
  border: 'none',
  borderRadius: '7px 0 0 7px',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '20px',
  color: TEXT_COLOR,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'background-color 0.15s ease',
};

const CHEVRON_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '5px 8px',
  background: '#FFFFFF',
  border: 'none',
  borderRadius: '0 7px 7px 0',
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
};

const DISABLED_OVERLAY = { opacity: 0.5, cursor: 'not-allowed' };

const hoverIn = (disabled) => (e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#F9FAFB'; };
const hoverOut = (disabled) => (e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#FFFFFF'; };

/**
 * Split button matching the Figma "Añadir línea" design (ETP-3835).
 *
 * Binary on whether there are ADDITIONAL actions (the primary "add line" button
 * is ALWAYS present):
 *   - 0 actions (or `hideChevron`): only the primary button, fully rounded —
 *     no divider, no chevron, no dropdown.
 *   - 1+ actions: split button — primary (left-rounded) + divider + chevron
 *     opening a dropdown listing ALL actions (a single action shows a one-item
 *     dropdown).
 *
 * Props:
 *   onClick      — main button click (primary "add line" action)
 *   label        — button text
 *   disabled     — disables the primary (and chevron) button
 *   menuActions  — optional array of { key, label, icon?, onClick, disabled?, destructive? }.
 *                  Labels are expected to be already-resolved strings (the
 *                  callers in DetailView resolve them via ui()).
 *   hideChevron  — force the 0-action layout regardless of menuActions
 *                  (used by contacts and financial-account).
 */
export function AddLineButton({ onClick, label, disabled = false, menuActions, hideChevron = false }) {
  const actions = Array.isArray(menuActions) ? menuActions : [];
  // hideChevron forces the simple single-button layout regardless of actions.
  const hasMenu = !hideChevron && actions.length > 0;

  const primaryButton = (radius) => (
    <button
      type="button"
      data-testid="action-add-line"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={hoverIn(disabled)}
      onMouseLeave={hoverOut(disabled)}
      style={{ ...PRIMARY_STYLE, borderRadius: radius, ...(disabled ? DISABLED_OVERLAY : null) }}
    >
      <Plus size={20} color={ICON_COLOR} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );

  // 0 actions: only the primary button, fully rounded.
  if (!hasMenu) {
    return <span style={GROUP_STYLE}>{primaryButton(7)}</span>;
  }

  // 1+ actions: split button with a chevron dropdown listing every action.
  const chevronButton = (
    <button
      type="button"
      data-testid="action-add-line-more"
      disabled={disabled}
      onMouseEnter={hoverIn(disabled)}
      onMouseLeave={hoverOut(disabled)}
      style={{ ...CHEVRON_STYLE, ...(disabled ? DISABLED_OVERLAY : null) }}
      aria-label="More actions"
    >
      <ChevronDown size={20} color={ICON_COLOR} strokeWidth={2} />
    </button>
  );

  return (
    <span style={GROUP_STYLE}>
      {primaryButton('7px 0 0 7px')}
      <span style={DIVIDER_STYLE} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{chevronButton}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="min-w-[200px]">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.key ?? action.label}
              onSelect={action.onClick}
              disabled={action.disabled}
              className={action.destructive ? 'text-destructive focus:text-destructive' : undefined}
            >
              {action.icon ? <span className="mr-2 inline-flex">{action.icon}</span> : null}
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
