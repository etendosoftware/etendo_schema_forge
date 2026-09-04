import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/i18n';
import { Button } from '@/components/ui/button';
import { sanitizeImageName } from '@/lib/imageUpload.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

const LOGO_MAX_SIZE_MB = 2;
const LOGO_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

function getInitials(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const initials = parts.length === 1
    ? parts[0].slice(0, 2)
    : parts[0][0] + parts[1][0];
  return initials.toUpperCase();
}

function validateLogoFile(file, ui) {
  if (!LOGO_ALLOWED_TYPES.includes(file.type)) return ui('imageInvalidType');
  if (file.size > LOGO_MAX_SIZE_MB * 1024 * 1024) return ui('imageTooLarge', { max: LOGO_MAX_SIZE_MB });
  return null;
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

/**
 * OrgLogoField — logo upload for the Organización identity section.
 *
 * Differs from the generic `ImageField` (contract-ui): allows SVG (in addition to
 * PNG/JPG), caps at 2MB (ticket ETP-4749), and falls back to the organization's
 * initials instead of a generic "no image" placeholder.
 *
 * Display: GET /sws/neo/image/{imageId} (same NEO image endpoint as ImageField).
 * Upload: POST /sws/neo/image with base64 body, returns { imageId }.
 */
export default function OrgLogoField({ imageId, orgName, token, apiBaseUrl, onChange, readOnly = false }) {
  const ui = useUI();
  const [blobUrl, setBlobUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const imageBase = apiBaseUrl
    ? apiBaseUrl.replace(/\/sws\/neo.*/, '/sws/neo') + '/image'
    : '/sws/neo/image';
  const apiFetch = useApiFetch(imageBase);

  useEffect(() => {
    if (!imageId) {
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    apiFetch(`/${imageId}`)
      .then(res => (res.ok ? res.blob() : null))
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
  }, [imageId, token, apiFetch]);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, []);

  const uploadFile = async (file) => {
    if (!file) return;
    const validationError = validateLogoFile(file, ui);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await apiFetch('', {
        method: 'POST',
        body: JSON.stringify({ name: sanitizeImageName(file.name), mimeType: file.type, data: base64 }),
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
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
    e.target.value = '';
    uploadFile(file);
  };

  const openFilePicker = () => inputRef.current?.click();
  const handleRemove = () => onChange?.('');

  let previewContent;
  if (uploading) {
    previewContent = <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" data-testid="Loader2__orglogo" />;
  } else if (blobUrl) {
    previewContent = <img src={blobUrl} alt={orgName || 'Logo'} className="h-full w-full object-contain" />;
  } else {
    previewContent = (
      <span className="text-lg font-semibold text-muted-foreground" data-testid="OrgLogoField__initials">
        {getInitials(orgName)}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-4" data-testid="OrgLogoField__root">
      <div
        className="h-[72px] w-[72px] shrink-0 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden"
        data-testid="OrgLogoField__preview">
        {previewContent}
      </div>
      {!readOnly && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openFilePicker}
              disabled={uploading}
              data-testid="OrgLogoField__upload">
              {ui('orgLogoUpload')}
            </Button>
            {blobUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={uploading}
                data-testid="OrgLogoField__remove">
                {ui('remove')}
              </Button>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{ui('orgLogoHint')}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml"
        onChange={handleFileChange}
        tabIndex={-1}
        style={{ visibility: 'hidden', position: 'absolute', width: 0, height: 0 }}
      />
    </div>
  );
}
