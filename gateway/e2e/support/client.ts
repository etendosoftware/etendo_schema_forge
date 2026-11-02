// @covers gateway/src/public-api/public-api.controller.ts
// HTTP client of the e2e suite: global fetch, Bearer key, JSON:API bodies,
// 429 back-off (the gateway limits each key to 100 requests / 60 s by default),
// OpenAPI conformance on every successful body, and cleanup of created records.
import assert from 'node:assert/strict';
import { MAIN_KEY, BASE_URL } from './env.ts';
import { assertConformsToOpenApi } from './openapi.ts';

export interface ApiResponse {
  method: string;
  path: string;
  status: number;
  headers: Headers;
  json: any;
  text: string;
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Defaults to the main key. `null` sends no Authorization header. */
  key?: string | null;
  /** Skip the OpenAPI body validation (used by the error-contract tests). */
  skipConformance?: boolean;
}

const API = '/api/v1';
const MAX_RATE_LIMIT_RETRIES = 5;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
  const key = options.key === undefined ? MAIN_KEY : options.key;
  const headers: Record<string, string> = { Accept: 'application/vnd.api+json', ...options.headers };
  if (key !== null) headers.Authorization ??= `Bearer ${key}`;
  if (options.body !== undefined) headers['Content-Type'] ??= 'application/vnd.api+json';
  const url = `${BASE_URL}${path.startsWith('/') ? path : `${API}/${path}`}`;
  const resolvedPath = url.slice(BASE_URL.length);

  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      await sleep(Math.max(1, Number(res.headers.get('Retry-After')) || 1) * 1000);
      continue;
    }
    const text = await res.text();
    let json: any;
    if (text) {
      try { json = JSON.parse(text); } catch { json = undefined; }
    }
    const response: ApiResponse = { method, path: resolvedPath, status: res.status, headers: res.headers, json, text };
    // Register before any assertion (conformance included) can throw: a record the
    // server created must be deleted even when the test that created it fails.
    if (method === 'POST' && res.status >= 200 && res.status < 300 && typeof json?.data?.id === 'string') {
      created.push(`${resolvedPath.split('?')[0].replace(/\/$/, '')}/${json.data.id}`);
    }
    if (res.status >= 200 && res.status < 300 && !options.skipConformance) {
      await assertConformsToOpenApi(method, resolvedPath, res.status, text ? json : undefined);
    }
    return response;
  }
}

export const describeResponse = (res: ApiResponse) => `${res.method} ${res.path} answered ${res.status}: ${res.text.slice(0, 600)}`;

export function expectStatus(res: ApiResponse, status: number, hint = ''): void {
  assert.equal(res.status, status, `${describeResponse(res)}${hint ? `\n  hint: ${hint}` : ''}`);
}

/** Asserts a JSON:API error document with the given status (and code when one is documented for the case). */
export function expectErrorDocument(res: ApiResponse, status: number, code?: string): any {
  expectStatus(res, status);
  assert.ok(Array.isArray(res.json?.errors) && res.json.errors.length > 0, `no errors[] in ${describeResponse(res)}`);
  const error = res.json.errors[0];
  assert.equal(error.status, String(status), `errors[0].status in ${describeResponse(res)}`);
  assert.equal(typeof error.title, 'string', 'errors[0].title');
  assert.equal(typeof error.detail, 'string', 'errors[0].detail');
  if (code !== undefined) assert.equal(error.code, code, `errors[0].code in ${describeResponse(res)}`);
  assert.match(res.headers.get('content-type') ?? '', /^application\/vnd\.api\+json/, 'error Content-Type');
  return error;
}

export function resource(type: string, attributes: Record<string, unknown>, relationships?: Record<string, [string, string]>, id?: string) {
  const data: Record<string, unknown> = { type, attributes };
  if (id) data.id = id;
  if (relationships) {
    data.relationships = Object.fromEntries(
      Object.entries(relationships).map(([field, [relatedType, relatedId]]) => [field, { data: { type: relatedType, id: relatedId } }]),
    );
  }
  return { data };
}

// --- cleanup -------------------------------------------------------------

/** Paths of every record a POST created, in creation order. Filled by api() itself. */
const created: string[] = [];

/** Creates a record (api() has already registered it for cleanup) and returns the resource object. */
export async function createRecord(collectionPath: string, body: unknown, hint = ''): Promise<{ id: string; path: string; res: ApiResponse; data: any }> {
  const res = await api('POST', collectionPath, { body });
  expectStatus(res, 201, hint);
  const id = res.json?.data?.id;
  assert.ok(id, `no data.id in ${describeResponse(res)}`);
  const path = `${collectionPath}/${id}`;
  return { id, path, res, data: res.json.data };
}

/** Deletes everything this process created, newest first (children before parents). Never throws. */
export async function cleanupCreated(): Promise<void> {
  const leftovers: string[] = [];
  for (const path of created.splice(0).reverse()) {
    try {
      const res = await api('DELETE', path, { skipConformance: true });
      if (res.status !== 204 && res.status !== 404) leftovers.push(`${path} (${res.status})`);
    } catch (error) {
      leftovers.push(`${path} (${(error as Error).message})`);
    }
  }
  if (leftovers.length) console.error(`[public-api e2e] could not delete: ${leftovers.join(', ')}`);
}

export const MISSING_ID = '00000000000000000000000000000000';
