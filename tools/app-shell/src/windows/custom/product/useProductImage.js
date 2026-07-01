import { useState, useEffect } from 'react';

export function useProductImage(imageId, token, apiBaseUrl) {
  const [imgSrc, setImgSrc] = useState(null);
  const neoBaseUrl = (apiBaseUrl || '').replace(/\/[^/]+$/, '');

  useEffect(() => {
    if (!imageId) return;
    let objectUrl;
    fetch(`${neoBaseUrl}/image/${imageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setImgSrc(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, token, neoBaseUrl]);

  return imgSrc;
}
