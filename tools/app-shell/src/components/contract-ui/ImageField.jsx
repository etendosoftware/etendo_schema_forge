import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, ImageIcon, Loader2, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { TrashIcon } from '@/components/ui/custom-icons';
import { useUI } from '@/i18n';

// Upload constraints (shared across stretch and non-stretch modes)
const IMAGE_MAX_SIZE_MB = 30;
const IMAGE_MAX_WIDTH = 7680;
const IMAGE_MAX_HEIGHT = 4320;
const IMAGE_ALLOWED_TYPES = ['image/png', 'image/jpeg']; // jpg shares the jpeg MIME type

/** Read an image file's intrinsic pixel dimensions. Resolves null if it can't be decoded. */
function readImageDimensions(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Validate an image file against type, size, and dimension limits. Returns an error string or null. */
async function validateImageFile(file, ui) {
  if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
    return ui('imageInvalidType');
  }
  if (file.size > IMAGE_MAX_SIZE_MB * 1024 * 1024) {
    return ui('imageTooLarge', { max: IMAGE_MAX_SIZE_MB });
  }
  const dims = await readImageDimensions(file);
  if (dims && (dims.width > IMAGE_MAX_WIDTH || dims.height > IMAGE_MAX_HEIGHT)) {
    return ui('imageTooLargeDimensions', { w: IMAGE_MAX_WIDTH, h: IMAGE_MAX_HEIGHT });
  }
  return null;
}

/**
 * ImageField — shows a product image and allows upload.
 *
 * Display: fetches binary via GET /sws/neo/image/{imageId} with JWT auth.
 * Upload: sends base64 via POST /sws/neo/image, gets imageId back.
 *
 * Props:
 *  - imageId: current AD_Image_ID value (string UUID or empty)
 *  - onChange: (newImageId) => void — called after a successful upload
 *  - token: JWT token for authenticated requests
 *  - apiBaseUrl: base URL like "/sws/neo" or "/etendo/sws/neo"
 *  - readOnly: boolean
 *  - fieldKey: string (for data-testid)
 *  - stretch: boolean — fill the available height (via an absolutely positioned
 *    preview, so the image never expands the grid row) instead of a fixed 176px box
 */
export function ImageField({ imageId, onChange, token, apiBaseUrl, readOnly = false, fieldKey = 'image', stretch = false, label = null }) {
  const ui = useUI();
  const [blobUrl, setBlobUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  useEscapeKey(lightboxOpen, closeLightbox);

  const imageBase = apiBaseUrl
    ? apiBaseUrl.replace(/\/sws\/neo.*/, '/sws/neo') + '/image'
    : '/sws/neo/image';

  // Load image blob when imageId changes
  useEffect(() => {
    if (!imageId || !token) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    fetch(`${imageBase}/${imageId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.blob() : null)
      .then(blob => {
        if (!cancelled && blob) {
          setBlobUrl(prev => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [imageId, token, imageBase]);

  // Cleanup blob URL on unmount
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, []);

  const uploadFile = async (file) => {
    if (!file) return;
    const validationError = await validateImageFile(file, ui);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(imageBase, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream', data: base64 }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Upload failed (${res.status})`);
      const { imageId: newId } = await res.json();
      if (!newId) throw new Error('No imageId returned from server');
      onChange?.(newId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    // Reset input so the same file can be re-selected
    e.target.value = '';
    uploadFile(file);
  };

  const openFilePicker = () => inputRef.current?.click();

  // Drag & drop handlers (mirrors UploadDropzone). Active only in the empty state.
  const handleDragEnter = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!readOnly && !uploading) setIsDragging(true);
  };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDragLeave = (e) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    if (readOnly || uploading) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) uploadFile(file);
  };

  const handlePreviewClick = () => {
    if (blobUrl) {
      setLightboxOpen(true);
      return;
    }
    if (!readOnly) openFilePicker();
  };

  return (
    <>
      <div data-testid={`field-${fieldKey}`} className={stretch ? 'h-full' : ''}>
        {stretch ? (
          <div className="h-full flex flex-col bg-white border border-[#E8EAEF] rounded-xl p-1">
            {/* Label */}
            {label && (
              <div className="px-3 h-8 flex items-center flex-shrink-0">
                <span className="text-sm font-medium text-[#121217] leading-6">{label}</span>
              </div>
            )}

            {blobUrl ? (
              <>
                {/* Image area — grows to fill available height */}
                <div className="flex-1 min-h-[180px] px-3">
                  <div
                    className="group relative w-full h-full rounded-lg overflow-hidden bg-white cursor-zoom-in"
                    onClick={handlePreviewClick}
                  >
                    <img src={blobUrl} alt="Product" className="absolute inset-0 w-full h-full object-contain rounded-lg" />
                    {/* Hover overlay — rgba(18,18,23,0.05) per Figma */}
                    <div className="absolute inset-0 bg-[rgba(18,18,23,0.05)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-lg" />
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onChange?.(''); }}
                        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] rounded-full opacity-0 group-hover:opacity-100 hover:bg-[#F5F7F9] transition-all"
                        aria-label="Remove image"
                      >
                        <TrashIcon className="w-4 h-4 text-[#828FA3]" data-testid="TrashIcon__266d2c" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Upload section — fixed height at bottom */}
                {!readOnly && (
                  <div className="flex-shrink-0 flex items-center px-3 h-[72px]">
                    <button
                      type="button"
                      onClick={openFilePicker}
                      disabled={uploading}
                      className="h-12 w-12 border border-dashed border-[#D1D4DB] rounded-lg flex items-center justify-center hover:border-[#828FA3] hover:bg-[#F5F7F9] transition-colors disabled:opacity-50"
                      aria-label={ui('uploadImage')}
                    >
                      <Upload className="h-5 w-5 text-[#828FA3]" data-testid="Upload__266d2c" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Empty state — full-area dashed dropzone with upload affordance */
              (<div className="flex-1 min-h-[180px] px-3 pb-3 flex flex-col">
                <div
                  className={`flex-1 flex flex-col items-center justify-center gap-2 px-5 py-5 border border-dashed rounded-lg transition-colors
                    ${!readOnly ? 'cursor-pointer' : ''}
                    ${isDragging ? 'border-[#828FA3] bg-[#F5F7F9]' : 'border-[#D1D4DB]'}`}
                  onClick={() => { if (!readOnly && !uploading) openFilePicker(); }}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {uploading ? (
                    <Loader2
                      className="h-7 w-7 animate-spin text-muted-foreground"
                      data-testid="Loader2__266d2c" />
                  ) : (
                    <>
                      <span
                        className="w-8 h-8 flex items-center justify-center bg-white border border-[#D1D4DB] shadow-[0px_1px_2px_rgba(18,18,23,0.05)] rounded-lg"
                        aria-hidden="true"
                      >
                        <Upload className="h-5 w-5 text-[#828FA3]" data-testid="Upload__266d2c" />
                      </span>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-sm font-normal text-[#121217] text-center">{ui('imageDropTitle')}</span>
                        <span className="text-xs font-normal text-[#6C6C89] text-center">
                          {ui('imageDropSubtitle', { max: IMAGE_MAX_SIZE_MB, w: IMAGE_MAX_WIDTH, h: IMAGE_MAX_HEIGHT })}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>)
            )}
          </div>
        ) : (
          <div className={buildPreviewClass(stretch, readOnly, blobUrl)} onClick={handlePreviewClick}>
            <ImagePreview
              blobUrl={blobUrl}
              imageId={imageId}
              uploading={uploading}
              readOnly={readOnly}
              ui={ui}
              onRemove={() => onChange?.('')}
              onUpload={openFilePicker}
              data-testid="ImagePreview__266d2c" />
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          tabIndex={-1}
          style={{ visibility: 'hidden', position: 'absolute', width: 0, height: 0 }}
        />

      </div>
      {lightboxOpen && blobUrl && <ImageLightbox
        blobUrl={blobUrl}
        onClose={closeLightbox}
        data-testid="ImageLightbox__266d2c" />}
    </>
  );
}

/** Close the active overlay when the Escape key is pressed. */
function useEscapeKey(active, onEscape) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => { if (e.key === 'Escape') onEscape(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}

/** Build the className for the preview box, including stretch and cursor affordances. */
function buildPreviewClass(stretch, readOnly, blobUrl) {
  return [
    `${stretch ? 'absolute inset-0' : 'relative w-full h-44'} rounded-2xl border border-gray-200/70 bg-gray-50/50 flex flex-col items-center justify-center overflow-hidden group`,
    !readOnly && !blobUrl ? 'cursor-pointer hover:border-gray-400 transition-colors' : '',
    blobUrl ? 'cursor-zoom-in' : '',
  ].join(' ');
}

/** Inner content of the preview box: either the image with hover actions, or the empty placeholder. */
function ImagePreview({ blobUrl, imageId, uploading, readOnly, ui, onRemove, onUpload }) {
  if (blobUrl) {
    return (
      <>
        <img src={blobUrl} alt="Product" className="max-w-full max-h-full object-contain" />
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none flex items-center justify-center">
          <ZoomIn
            className="h-7 w-7 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow"
            data-testid="ZoomIn__266d2c" />
        </div>
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" data-testid="X__266d2c" />
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={(e) => { e.stopPropagation(); onUpload(); }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/50 text-white text-xs font-medium hover:bg-black/70 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
            >
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" data-testid="Loader2__266d2c" /> : <Upload className="h-3 w-3" data-testid="Upload__266d2c" />}
              {ui('uploadImage')}
            </button>
          </>
        )}
      </>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground px-3 text-center">
      {uploading
        ? <Loader2 className="h-7 w-7 animate-spin" data-testid="Loader2__266d2c" />
        : <ImageIcon className="h-7 w-7" data-testid="ImageIcon__266d2c" />
      }
      <span className="text-xs">{imageId ? 'Loading…' : ui('noImage')}</span>
      {!readOnly && !uploading && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 group-hover:text-gray-700 mt-1">
          <Upload className="h-3.5 w-3.5" data-testid="Upload__266d2c" />
          {ui('uploadImage')}
        </span>
      )}
    </div>
  );
}

/** Full-screen image preview rendered in document.body via portal to escape any stacking context. */
function ImageLightbox({ blobUrl, onClose }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/20 text-white flex items-center justify-center hover:bg-white/30 transition-colors"
        aria-label="Close"
      >
        <X className="h-5 w-5" data-testid="X__266d2c" />
      </button>
      <img
        src={blobUrl}
        alt="Product"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
