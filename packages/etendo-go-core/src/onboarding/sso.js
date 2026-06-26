const GOOGLE_PROVIDER = 'google';
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let googleScriptPromise = null;

export function getConfiguredSsoProviders(env = import.meta.env) {
  const googleClientId = String(env?.VITE_GOOGLE_CLIENT_ID || '').trim();
  return googleClientId ? [{ id: GOOGLE_PROVIDER, clientId: googleClientId }] : [];
}

export function readCookie(name, documentRef = document) {
  const encodedName = `${encodeURIComponent(name)}=`;
  return String(documentRef?.cookie || '')
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(encodedName))
    ?.slice(encodedName.length) || '';
}

export function buildGoogleSsoPayload(response) {
  const credential = String(response?.credential || '').trim();
  if (!credential) {
    const error = new Error('Missing Google sign-in response');
    error.code = 'onboardingSsoFailed';
    throw error;
  }
  return {
    credential,
  };
}

export function loadGoogleIdentityScript(documentRef = document, windowRef = window) {
  if (windowRef?.google?.accounts?.id) {
    return Promise.resolve(windowRef.google);
  }
  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const script = documentRef.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!windowRef?.google?.accounts?.id) {
        googleScriptPromise = null;
        reject(new Error('Google Identity Services could not be loaded'));
        return;
      }
      resolve(windowRef.google);
    };
    script.onerror = () => {
      googleScriptPromise = null;
      reject(new Error('Google Identity Services could not be loaded'));
    };
    documentRef.head.appendChild(script);
  });
  return googleScriptPromise;
}

export async function renderSsoProviderButton(provider, container, handlers, runtime = {}) {
  if (!provider || provider.id !== GOOGLE_PROVIDER || !container) {
    return;
  }
  const documentRef = runtime.documentRef || document;
  const windowRef = runtime.windowRef || window;
  const google = await loadGoogleIdentityScript(documentRef, windowRef);
  // Only opt into FedCM when the browser actually supports it. Browsers that
  // disable FedCM (e.g. Brave) do not expose `IdentityCredential`; forcing
  // `use_fedcm_for_button: true` there makes GSI reject with
  // "FedCM is not supported" instead of falling back to the popup flow.
  const fedcmSupported = typeof windowRef !== 'undefined'
    && typeof windowRef.IdentityCredential !== 'undefined';
  google.accounts.id.initialize({
    client_id: provider.clientId,
    callback: (response) => {
      try {
        handlers?.onCredential?.(provider.id, buildGoogleSsoPayload(response));
      } catch (error) {
        handlers?.onError?.(error);
      }
    },
    use_fedcm_for_button: fedcmSupported,
  });
  container.replaceChildren();
  google.accounts.id.renderButton(container, {
    theme: 'outline',
    size: 'large',
    type: 'standard',
    width: Math.min(container.clientWidth || 360, 400),
  });
}
