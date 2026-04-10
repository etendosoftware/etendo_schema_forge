import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';

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
 */
export function ImageField({ imageId, onChange, token, apiBaseUrl, readOnly = false, fieldKey = 'image' }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

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

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';

    setError(null);
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(imageBase, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream', data: base64 }),
      });
      if (!res.ok) throw new Error(await res.text() || `Upload failed (${res.status})`);
      const { imageId: newId } = await res.json();
      if (!newId) throw new Error('No imageId returned from server');
      onChange?.(newId);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div data-testid={`field-${fieldKey}`} className="flex flex-col gap-2">
      {/* Image preview */}
      <div className="relative w-full h-44 rounded-2xl border border-gray-200/70 bg-gray-50/50 flex items-center justify-center overflow-hidden">
        {blobUrl ? (
          <img src={blobUrl} alt="Product" className="max-w-full max-h-full object-contain" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">{imageId ? 'Loading…' : 'No image'}</span>
          </div>
        )}
        {blobUrl && !readOnly && (
          <button
            type="button"
            onClick={() => onChange?.('')}
            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
            aria-label="Remove image"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Upload button */}
      {!readOnly && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
              'text-sm font-medium text-gray-500 cursor-pointer',
              'hover:text-gray-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload image'}
          </button>

          {/* Hidden file input — NOT aria-hidden so browser allows programmatic .click() */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            tabIndex={-1}
            style={{ visibility: 'hidden', position: 'absolute', width: 0, height: 0 }}
          />

        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
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
