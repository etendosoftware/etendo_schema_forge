// @covers gateway/src/public-api/public-api.controller.ts
// Configuration of the end-to-end suite. Environment only; nothing is hard-coded.
// Importing this module throws (so every e2e file fails fast with a clear message)
// when the configuration is unusable or the target is not a local gateway.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `[public-api e2e] ${name} is not set. Required: PUBLIC_API_BASE_URL (e.g. http://localhost:4399) ` +
        'and PUBLIC_API_KEY (<clientId>:<clientSecret>, a key with public-api:read, public-api:write and ' +
        'public-api:process: the order flows complete an order). ' +
        'Optional: PUBLIC_API_KEY_READONLY (enables the 403 test), PUBLIC_API_E2E_ALLOW_REMOTE=1.',
    );
  }
  return value;
}

function resolveBaseUrl(): string {
  const raw = required('PUBLIC_API_BASE_URL').replace(/\/+$/, '');
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error(`[public-api e2e] PUBLIC_API_BASE_URL is not a valid URL: ${raw}`);
  }
  if (!LOCAL_HOSTS.has(host) && process.env.PUBLIC_API_E2E_ALLOW_REMOTE !== '1') {
    throw new Error(
      `[public-api e2e] Refusing to run against "${host}": the suite creates and deletes records. ` +
        'Only localhost / 127.0.0.1 are allowed unless PUBLIC_API_E2E_ALLOW_REMOTE=1 is set.',
    );
  }
  return raw;
}

export const BASE_URL = resolveBaseUrl();
export const MAIN_KEY = required('PUBLIC_API_KEY');
export const READONLY_KEY = process.env.PUBLIC_API_KEY_READONLY?.trim() || undefined;

// One unique prefix per process (each e2e file runs in its own process), put in
// searchKey / name of every record the run creates so leftovers are recognisable.
export const RUN_PREFIX = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
