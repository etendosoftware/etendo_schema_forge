import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { cn } from '@/lib/utils';
import { UploadIcon } from '@/components/ui/custom-icons';

/**
 * Check whether a file's MIME type matches a list of allowed MIME patterns.
 * Supports wildcard patterns like "image/*".
 *
 * @param {File} file - The file to check.
 * @param {string[]} allowedMimeTypes - The allowed MIME patterns. When falsy or
 *                                       empty, every MIME type is accepted.
 * @returns {boolean} True when the file matches at least one allowed pattern.
 */
function isMimeAllowed(file, allowedMimeTypes) {
  if (!allowedMimeTypes || allowedMimeTypes.length === 0) return true;
  const mime = (file.type || '').toLowerCase();
  return allowedMimeTypes.some((pattern) => {
    const p = pattern.toLowerCase();
    if (p.endsWith('/*')) {
      return mime.startsWith(p.slice(0, -1));
    }
    return mime === p;
  });
}

/**
 * Generic drag & drop area + "select a file" link to add files.
 *
 * Props:
 *   onFiles  - (file: File) => void. Called once per accepted file.
 *   config   - { maxSizeMB?: number, allowedMimeTypes?: string[], typesLabel?: string }
 *   disabled - boolean; suppresses interaction.
 */
export default function UploadDropzone({ onFiles, config = {}, disabled = false }) {
  const ui = useUI();
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const { maxSizeMB, allowedMimeTypes, typesLabel } = config;
  const maxBytes = typeof maxSizeMB === 'number' ? maxSizeMB * 1024 * 1024 : Infinity;

  const validateAndCall = useCallback((fileList) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    files.forEach((file) => {
      if (file.size > maxBytes) {
        toast.error(ui('attachmentsFileTooLarge', { max: maxSizeMB }));
        return;
      }
      if (!isMimeAllowed(file, allowedMimeTypes)) {
        toast.error(ui('attachmentsInvalidType'));
        return;
      }
      onFiles?.(file);
    });
  }, [onFiles, maxBytes, allowedMimeTypes, ui]);

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

  return (
    <div
      data-testid="attachments-dropzone"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-5 transition-colors',
        isDragging ? 'border-primary bg-muted/30' : 'border-border',
        disabled ? 'opacity-50' : '',
      )}
    >
      <button
        type="button"
        onClick={handleBrowseClick}
        disabled={disabled}
        className="flex items-center justify-center w-8 h-8 bg-white border border-border rounded-lg shadow-[0_1px_2px_rgba(18,18,23,0.05)] hover:bg-muted/50 transition-colors disabled:opacity-50"
      >
        <UploadIcon
          className="w-5 h-5 text-muted-foreground"
          data-testid="UploadIcon__d91a1b" />
      </button>
      <div className="flex flex-col items-center px-8">
        <span className="text-sm text-foreground">{ui('attachmentsDropHere')}</span>
        <p className="text-xs text-muted-foreground text-center">
          {ui('attachmentsOr')}{' '}
          <button
            type="button"
            onClick={handleBrowseClick}
            disabled={disabled}
            className="underline-offset-2 hover:underline disabled:opacity-50"
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
        accept={allowedMimeTypes?.join(',') ?? undefined}
        onChange={handleInputChange}
        disabled={disabled}
      />
    </div>
  );
}
