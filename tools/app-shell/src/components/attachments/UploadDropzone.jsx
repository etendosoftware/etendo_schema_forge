import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { UploadIcon } from '@/components/ui/custom-icons';
import { buildAcceptAttribute, isFileTypeAllowed } from './attachmentPolicy';

/*
 * Figma component "Drag" (ETP-5526) — the zone's three visual states and where each colour
 * comes from:
 *
 *   default   border color/gray/200                 #D1D4DB   fill: none
 *   hover     border color/gray/400                 #828FA3   fill: color/black/50 #121217 @ 5%
 *   disabled  border color/border/input/disabled    #D1D4DB   fill: #F5F7F9
 *
 * #D1D4DB exists in the app exactly once, as `--field-disabled-border` (the design's
 * `color/border/input/disabled`); gray/200 resolves to the same colour, so both the default and
 * the disabled border read that token instead of repeating the literal — redefining the global
 * `--border` (#E1E7EF) to reach #D1D4DB would repaint every surface in the app. #F5F7F9 is
 * `--field-hover`, which `<Input>` / `<Select>` / `<DateField>` already reuse as their disabled
 * fill. gray/400 and the 5% black have no token; the codebase writes them as literals
 * (`text-[#828FA3]` across the core date/calendar chrome, `rgba(18,18,23,…)` in this file's own
 * button shadow), so they stay literals here rather than becoming new global tokens.
 *
 * The 1px dashed border keeps Tailwind's `border-dashed`: the design's 4px/4px pattern is not
 * expressible through `border-style`, and at 1px the UA's own dash pattern is indistinguishable
 * from it — reproducing it exactly would mean dropping the border for an SVG/gradient stroke,
 * which is machinery for a difference nobody can see.
 */
const BORDER_DEFAULT = 'border-[hsl(var(--field-disabled-border))]';
const STATE_HOVER = 'hover:border-[#828FA3] hover:bg-[rgba(18,18,23,0.05)]';
const STATE_DISABLED = 'border-[hsl(var(--field-disabled-border))] bg-[hsl(var(--field-hover))]';
/* Helper text: color/gray/500 (`--muted-foreground`, #6C6C89) in default AND hover — it must not
   react to hover — and color/gray/400 once the zone is disabled. */
const HELPER_TEXT_DISABLED = 'text-[#828FA3]';

/*
 * DELIBERATE DIVERGENCE FROM THE FIGMA COMPONENT (ETP-5526) — do not "fix" this back.
 *
 * The design paints the whole helper sentence, the "browse" control included, one flat
 * color/gray/500 (#6C6C89) with no underline and no link treatment at all. QA found that in
 * practice nobody sees the control: it is the only clickable thing in the sentence and it looks
 * exactly like the two static fragments around it. The product owner decided to override the
 * design here and make it read as a link.
 *
 * `text-primary` + a permanent underline is the app's existing inline-text-link convention
 * (ApiKeysPage, OAuth2ClientDialog, DocumentTotalsPanel, ReversedInvoicesPanel), so this reuses
 * the palette token rather than introducing a literal.
 *
 * Disabled: neither the accent colour nor the underline. The control falls back to the sentence's
 * gray/400 like the rest of the text, so a dead control never advertises itself as an active link
 * — and, as before, no `disabled:opacity-50`, which would single the button out of a sentence
 * that is already uniformly dimmed.
 */
const BROWSE_LINK = 'text-primary underline underline-offset-2';
const BROWSE_LINK_DISABLED = 'no-underline';

/**
 * Generic drag & drop area + "select a file" link to add files.
 *
 * The type check is a convenience, not the barrier: the backend enforces the same policy
 * on upload (extension + magic bytes + size, see `NeoAttachmentPolicy.java`), because a
 * caller that is not this component decides its own `Content-Type` (ETP-5038).
 *
 * Props:
 *   onFiles  - (file: File) => void. Called once per accepted file.
 *   config   - { maxSizeMB?: number, allowedMimeTypes?: string[],
 *                allowedExtensions?: string[], typesLabel?: string }
 *   disabled - boolean; suppresses interaction.
 */
export default function UploadDropzone({ onFiles, config = {}, disabled = false }) {
  const ui = useUI();
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const { maxSizeMB, allowedMimeTypes, allowedExtensions, typesLabel } = config;
  const maxBytes = typeof maxSizeMB === 'number' ? maxSizeMB * 1024 * 1024 : Infinity;

  const validateAndCall = useCallback((fileList) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    files.forEach((file) => {
      if (file.size > maxBytes) {
        toast.error(ui('attachmentsFileTooLarge', { max: maxSizeMB }));
        return;
      }
      if (!isFileTypeAllowed(file, { allowedMimeTypes, allowedExtensions })) {
        toast.error(ui('attachmentsInvalidType'));
        return;
      }
      onFiles?.(file);
    });
  }, [onFiles, maxBytes, maxSizeMB, allowedMimeTypes, allowedExtensions, ui]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  // onDragOver MUST preventDefault for the drop event to fire.
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    const dt = e.dataTransfer;
    if (dt?.files?.length) {
      validateAndCall(dt.files);
    }
  }, [disabled, validateAndCall]);

  const handleBrowseClick = useCallback(() => {
    if (disabled) return;
    fileInputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback((e) => {
    validateAndCall(e.target.files);
    // Reset so the same file can be re-selected.
    e.target.value = '';
  }, [validateAndCall]);

  /*
   * One state at a time, so `:hover` can never paint over the drag feedback (a pointer that is
   * dragging a file still sits inside the zone) and never fires on a disabled zone. The drag
   * colours are deliberately untouched: the Figma component specifies default / hover / disabled
   * only.
   */
  let zoneState;
  if (disabled) zoneState = STATE_DISABLED;
  else if (isDragging) zoneState = 'border-primary bg-muted/30';
  else zoneState = `${BORDER_DEFAULT} ${STATE_HOVER}`;

  return (
    <div
      data-testid="attachments-dropzone"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-5',
        // Figma: 200ms, ease-in, between default and hover.
        'transition-colors duration-200 ease-in',
        zoneState,
      )}
    >
      <button
        type="button"
        onClick={handleBrowseClick}
        disabled={disabled}
        className="flex items-center justify-center w-8 h-8 bg-card border border-border rounded-lg shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        <UploadIcon
          className="w-5 h-5 text-muted-foreground"
          data-testid="UploadIcon__d91a1b" />
      </button>
      <div className="flex flex-col items-center px-8">
        <span className="text-sm text-foreground">{ui('attachmentsDropHere')}</span>
        <p
          className={cn(
            'text-xs text-center',
            disabled ? HELPER_TEXT_DISABLED : 'text-muted-foreground',
          )}
        >
          {ui('attachmentsOr')}{' '}
          <button
            type="button"
            onClick={handleBrowseClick}
            disabled={disabled}
            /* Link treatment, and its deliberate absence when disabled — see BROWSE_LINK above:
               the Figma component shows flat grey here, this is an intentional product override. */
            className={disabled ? BROWSE_LINK_DISABLED : BROWSE_LINK}
          >
            {ui('attachmentsBrowse')}
          </button>
          {'. '}{ui('attachmentsAllowedFormats', { types: typesLabel ?? '' })}
        </p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        data-testid="attachments-file-input"
        accept={buildAcceptAttribute({ allowedMimeTypes, allowedExtensions })}
        onChange={handleInputChange}
        disabled={disabled}
      />
    </div>
  );
}
