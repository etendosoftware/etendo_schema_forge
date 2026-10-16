import React from 'react';
import { IconicTrashIcon } from '@/components/ui/custom-icons';

/**
 * ETP-5600 — the detail topbar's record-delete button, every window (Figma "Opciones md
 * Rounded Secondary Outline Destructive"). Lives outside DetailView.jsx because that file is
 * under a no-growth guardrail (.claude/hooks/check-detailview-growth.mjs).
 *
 * 40x40, radius md, 8px padding, 1px #FBB1C4 border on white; the 24px Iconic trash stays
 * #D50B3E (--status-destructive-fg) in every state. Hover: the light destructive tint
 * (--status-destructive-bg, #FEF0F4) plus a 1px/2px ink shadow at 5%, 200ms ease-in — no
 * solid red fill. Focus-visible: white fill, no drop shadow, and the two-ring halo (2px white
 * gap, 4px #F53D6B). The core Button has no outline-destructive variant, so the classes are
 * local; `[&_svg]:size-6` is not needed because this is a plain <button>.
 */
export const DETAIL_DELETE_BTN_CLS = [
  'h-10 w-10 p-2 flex items-center justify-center rounded-md border border-[#FBB1C4] bg-card',
  'text-[var(--status-destructive-fg)] transition-[background-color,box-shadow] duration-200 ease-in',
  'hover:bg-[var(--status-destructive-bg)] hover:shadow-[0_1px_2px_0_rgba(18,18,23,0.05)]',
  'focus-visible:outline-none focus-visible:bg-card focus-visible:shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_#F53D6B]',
].join(' ');

export function DetailDeleteButton({ onClick, title }) {
  return (
    <button type="button" onClick={onClick} className={DETAIL_DELETE_BTN_CLS} title={title} aria-label={title} data-testid="action-delete">
      <IconicTrashIcon className="h-6 w-6 shrink-0" data-testid="IconicTrashIcon__fa3275" />
    </button>
  );
}
