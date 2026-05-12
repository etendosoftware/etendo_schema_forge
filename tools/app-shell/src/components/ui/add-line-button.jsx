import { Plus, ChevronDown } from 'lucide-react';
import { useUI } from '@/i18n';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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

/**
 * Split button matching the Figma "Añadir línea" design (ETP-3835).
 *
 * Props:
 *   onClick      — main button click (primary "add line" action)
 *   label        — button text
 *   disabled     — disables both buttons
 *   menuActions  — optional array of { key, label, icon?, onClick, disabled?, destructive? }
 *                  When provided, the chevron opens a dropdown with these items.
 *                  When omitted, the chevron falls back to triggering `onClick`.
 */
export function AddLineButton({ onClick, label, disabled = false, menuActions, hideChevron = false }) {
  const ui = useUI();
  const hasMenu = Array.isArray(menuActions) && menuActions.length > 0;

  const primaryStyle = hideChevron
    ? { ...PRIMARY_STYLE, borderRadius: 7 }
    : PRIMARY_STYLE;

  const primaryButton = (
    <button
      type="button"
      data-testid="action-add-line"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#F9FAFB'; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
      style={{ ...primaryStyle, ...(disabled ? DISABLED_OVERLAY : null) }}
    >
      <Plus size={20} color={ICON_COLOR} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );

  const chevronButton = (
    <button
      type="button"
      data-testid="action-add-line-more"
      disabled={disabled}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#F9FAFB'; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = '#FFFFFF'; }}
      style={{ ...CHEVRON_STYLE, ...(disabled ? DISABLED_OVERLAY : null) }}
      aria-label="More actions"
    >
      <ChevronDown size={20} color={ICON_COLOR} strokeWidth={2} />
    </button>
  );

  return (
    <span style={GROUP_STYLE}>
      {primaryButton}
      {!hideChevron && (
        <>
          <span style={DIVIDER_STYLE} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{chevronButton}</DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={4} className="min-w-[200px]">
              {hasMenu ? (
                menuActions.map((action) => (
                  <DropdownMenuItem
                    key={action.key ?? action.label}
                    onSelect={action.onClick}
                    disabled={action.disabled}
                    className={action.destructive ? 'text-destructive focus:text-destructive' : undefined}
                  >
                    {action.icon ? <span className="mr-2 inline-flex">{action.icon}</span> : null}
                    {action.label}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled className="text-xs italic text-muted-foreground">
                  {ui('noAdditionalActions')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </span>
  );
}
