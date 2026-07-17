import React, { useEffect, useState } from 'react';

function resolveAppTokenUrl(appId) {
  const envBase = import.meta.env.VITE_API_BASE;
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');
  const apiBase = envBase || (webIdx === -1 ? '' : path.substring(0, webIdx));
  return `${apiBase}/sws/apps/token?appId=${encodeURIComponent(appId)}`;
}

async function fetchAppToken(appId, etendoToken) {
  const res = await fetch(resolveAppTokenUrl(appId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${etendoToken}`,
    },
  });
  if (!res.ok) throw new Error(`token endpoint failed: ${res.status}`);
  const body = await res.json();
  return body.token;
}

export default function AppIframeHost({ appUrl, appId, token }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError('Missing Etendo session token');
      return;
    }
    (async () => {
      try {
        const appToken = await fetchAppToken(appId, token);
        const separator = appUrl.includes('?') ? '&' : '?';
        setSrc(`${appUrl}${separator}jwt=${encodeURIComponent(appToken)}`);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [appUrl, appId, token]);

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
