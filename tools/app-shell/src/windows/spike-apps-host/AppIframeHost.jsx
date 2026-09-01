import React, { useEffect, useState } from 'react';

import { useApiFetch } from '@/auth/useApiFetch.js';
function resolveAppTokenUrl(appId) {
  const envBase = import.meta.env.VITE_API_BASE;
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  const apiBase = envBase || (webIdx === -1 ? '' : path.substring(0, webIdx));
  return `${apiBase}/sws/apps/token?appId=${encodeURIComponent(appId)}`;
}

async function fetchAppToken(appId, etendoToken, apiFetch) {
  const res = await apiFetch(resolveAppTokenUrl(appId), {
    method: 'POST',
    baseUrl: '',
    token: etendoToken,
  });
  if (!res.ok) throw new Error(`token endpoint failed: ${res.status}`);
  const body = await res.json();
  return body.token;
}

export default function AppIframeHost({ appUrl, appId, token }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);
  const apiFetch = useApiFetch();

  useEffect(() => {
    if (!token) {
      setError('Missing Etendo session token');
      return;
    }
    (async () => {
      try {
        const appToken = await fetchAppToken(appId, token, apiFetch);
        const separator = appUrl.includes('?') ? '&' : '?';
        setSrc(`${appUrl}${separator}jwt=${encodeURIComponent(appToken)}`);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [appUrl, appId, token, apiFetch]);

  if (error) return <div className="p-8 text-destructive">App token error: {error}</div>;
  if (!src) return <div className="p-8 text-muted-foreground">Loading app…</div>;

  return (
    <iframe
      title={appId}
      src={src}
      sandbox="allow-scripts allow-same-origin allow-forms"
      className="w-full h-full border-0"
    />
  );
}
