// @covers gateway/src/openapi/build-per-entity-paths.ts
// @covers gateway/src/main.ts
// Lints the OpenAPI document the gateway serves at /api/openapi.json, built from the
// real public-api/base.v1.json. The deploy workflow gates only on the gateway unit
// tests, so a structurally broken document must fail here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPerEntityOpenApiPaths } from '../../src/openapi/build-per-entity-paths.ts';

const MANIFEST_URL = new URL('../../../public-api/base.v1.json', import.meta.url);
const schema = JSON.parse(readFileSync(MANIFEST_URL, 'utf-8'));

// Mirrors bootstrap() in src/main.ts: SwaggerModule supplies openapi/info/components,
// buildPerEntityOpenApiPaths supplies paths. The bearerAuth scheme is the one main.ts declares.
const document: any = {
  openapi: '3.0.0',
  info: { title: 'Etendo Public API', version: 'v1' },
  paths: buildPerEntityOpenApiPaths(schema),
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'clientId:clientSecret' } } },
};

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function operations(): Array<{ path: string; method: string; op: any; item: any }> {
  const out: Array<{ path: string; method: string; op: any; item: any }> = [];
  for (const [path, item] of Object.entries<any>(document.paths)) {
    for (const [method, op] of Object.entries<any>(item)) {
      if (HTTP_METHODS.has(method)) out.push({ path, method, op, item });
    }
  }
  return out;
}

function resolvePointer(pointer: string): unknown {
  assert.ok(pointer.startsWith('#/'), `only local $ref are supported, got ${pointer}`);
  let node: any = document;
  for (const raw of pointer.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    assert.ok(node !== null && typeof node === 'object' && key in node, `$ref ${pointer} does not resolve (missing "${key}")`);
    node = node[key];
  }
  return node;
}

function collectRefs(node: unknown, where: string, out: Array<{ where: string; ref: string }>) {
  if (Array.isArray(node)) node.forEach((child, i) => collectRefs(child, `${where}/${i}`, out));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') out.push({ where, ref: value });
      else collectRefs(value, `${where}/${key}`, out);
    }
  }
}

test('the document is OpenAPI 3.x with info and a non-empty paths object', () => {
  assert.match(document.openapi, /^3\.\d+\.\d+$/);
  assert.ok(document.info?.title && document.info?.version, 'info.title and info.version are required');
  assert.ok(Object.keys(document.paths).length > 0, 'paths must not be empty');
  assert.ok(operations().length > 0, 'at least one operation is expected');
});

test('every $ref resolves inside the document', () => {
  const refs: Array<{ where: string; ref: string }> = [];
  collectRefs(document, '#', refs);
  for (const { where, ref } of refs) {
    assert.doesNotThrow(() => resolvePointer(ref), `${where}: ${ref}`);
  }
});

test('every security requirement names a scheme declared in components.securitySchemes', () => {
  const declared = new Set(Object.keys(document.components?.securitySchemes ?? {}));
  for (const { path, method, op } of operations()) {
    assert.ok(Array.isArray(op.security) && op.security.length > 0, `${method.toUpperCase()} ${path} has no security requirement`);
    for (const requirement of op.security) {
      for (const name of Object.keys(requirement)) {
        assert.ok(declared.has(name), `${method.toUpperCase()} ${path} requires undeclared scheme "${name}"`);
      }
    }
  }
});

test('every operation has a unique operationId and at least one response', () => {
  const seen = new Map<string, string>();
  for (const { path, method, op } of operations()) {
    const label = `${method.toUpperCase()} ${path}`;
    assert.ok(typeof op.operationId === 'string' && op.operationId.length > 0, `${label} has no operationId`);
    assert.ok(!seen.has(op.operationId), `operationId "${op.operationId}" is used by ${seen.get(op.operationId)} and ${label}`);
    seen.set(op.operationId, label);
    assert.ok(op.responses && Object.keys(op.responses).length > 0, `${label} declares no response`);
  }
});

test('every path template parameter is declared as a required path parameter, and no undeclared path parameter is left over', () => {
  for (const { path, method, op, item } of operations()) {
    const label = `${method.toUpperCase()} ${path}`;
    const templated = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const declared = [...(item.parameters ?? []), ...(op.parameters ?? [])].filter((p: any) => p.in === 'path');
    for (const name of templated) {
      const parameter = declared.find((p: any) => p.name === name);
      assert.ok(parameter, `${label} does not declare path parameter {${name}}`);
      assert.equal(parameter.required, true, `${label}: path parameter {${name}} must be required`);
    }
    for (const parameter of declared) {
      assert.ok(templated.includes(parameter.name), `${label} declares path parameter "${parameter.name}" that is not in the path`);
    }
  }
});
