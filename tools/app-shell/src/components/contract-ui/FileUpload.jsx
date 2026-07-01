import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Upload, X, File, AlertCircle } from 'lucide-react';

/**
 * Format bytes into a human-readable string (e.g. "1.2 MB").
 */
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Check whether a File matches the accept string (comma-separated MIME types or extensions).
 * Examples: "image/*,.pdf", ".csv,application/json"
 */
function matchesAccept(file, accept) {
  if (!accept) return true;
  const tokens = accept.split(',').map((t) => t.trim().toLowerCase());
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  return tokens.some((token) => {
    if (token.startsWith('.')) {
      return fileName.endsWith(token);
    }
    if (token.endsWith('/*')) {
      const group = token.slice(0, -2);
      return fileType.startsWith(group + '/');
    }
    return fileType === token;
  });
}

/**
 * FileUpload -- a drag-and-drop file upload area.
 *
 * @param {Object}   props
 * @param {Function} props.onUpload  Called with an array of valid File objects
 * @param {string}   props.accept    Comma-separated accepted types (e.g. "image/*,.pdf")
 * @param {boolean}  props.multiple  Allow multiple files (default true)
 * @param {number}   props.maxSize   Maximum file size in MB (default 10)
 * @param {string}   props.label     Custom label for the drop zone
 * @param {React.ReactNode} props.children Optional custom content inside the drop zone
 */
export function FileUpload({
  onUpload,
  accept,
  multiple = true,
  maxSize = 10,
  label = 'Drop files here or click to upload',
  children,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState([]);
  const inputRef = useRef(null);

  const maxBytes = maxSize * 1024 * 1024;

  /**
   * Validate and process a FileList, updating state and calling onUpload.
   */
  const processFiles = useCallback(
    (fileList) => {
      const incoming = Array.from(fileList);
      const valid = [];
      const newErrors = [];

      for (const file of incoming) {
        if (!matchesAccept(file, accept)) {
          newErrors.push(`"${file.name}" is not an accepted file type.`);
          continue;
        }
        if (file.size > maxBytes) {
          newErrors.push(`"${file.name}" exceeds the ${maxSize} MB limit.`);
          continue;
        }
        valid.push(file);
      }

      setErrors(newErrors);

      if (valid.length > 0) {
        const next = multiple ? [...files, ...valid] : valid.slice(0, 1);
        setFiles(next);
        onUpload?.(next);
      }
    },
    [accept, maxBytes, maxSize, multiple, files, onUpload],
  );

  const removeFile = useCallback(
    (index) => {
      const next = files.filter((_, i) => i !== index);
      setFiles(next);
      onUpload?.(next);
      setErrors([]);
    },
    [files, onUpload],
  );

  // --- Drag handlers ---
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer?.files?.length) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleInputChange = useCallback(
    (e) => {
      if (e.target.files?.length) {
        processFiles(e.target.files);
      }
      // Reset input so the same file can be re-selected
      e.target.value = '';
    },
    [processFiles],
  );

  const handleZoneClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  }, []);

  const hasErrors = errors.length > 0;

  return (
    <div className="w-full space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={handleZoneClick}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer',
          'transition-all duration-200 ease-in-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          dragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-accent/30',
          hasErrors && 'border-destructive/50',
        )}
      >
        {children ?? (
          <>
            <Upload
              className={cn(
                'h-8 w-8',
                dragOver ? 'text-primary' : 'text-muted-foreground',
              )}
              data-testid="Upload__ac379a" />
            <p className="text-sm text-muted-foreground text-center">
              {label}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {accept ? `Accepted: ${accept}` : 'All file types'}
              {' | '}Max {maxSize} MB
            </p>
          </>
        )}

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          onChange={handleInputChange}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
      {/* Error messages */}
      {hasErrors && (
        <div className="space-y-1">
          {errors.map((err, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-sm text-destructive"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" data-testid="AlertCircle__ac379a" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}
      {/* File previews */}
      {files.length > 0 && (
        <ul className="space-y-2" aria-label="Selected files">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm bg-muted/30"
            >
              <File
                className="h-4 w-4 shrink-0 text-muted-foreground"
                data-testid="File__ac379a" />
              <span className="truncate flex-1 font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatSize(file.size)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
                aria-label={`Remove ${file.name}`}
                data-testid="Button__ac379a">
                <X className="h-3.5 w-3.5" data-testid="X__ac379a" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
