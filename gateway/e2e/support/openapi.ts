// @covers gateway/src/openapi/build-per-entity-paths.ts
// OpenAPI conformance for the e2e suite: the document is fetched once from the
// running gateway and every successful response body is validated against the
// schema its operation declares for that status.
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import { BASE_URL } from './env.ts';

const Ajv: any = (AjvModule as any).default ?? AjvModule;
const addFormats: any = (addFormatsModule as any).default ?? addFormatsModule;

const MEDIA_TYPES = ['application/vnd.api+json', 'application/json'];

let documentPromise: Promise<any> | undefined;
let ajv: any;
const validators = new Map<string, any>();

export function getOpenApiDocument(): Promise<any> {
  documentPromise ??= fetch(`${BASE_URL}/api/openapi.json`).then(async (res) => {
    if (!res.ok) throw new Error(`[public-api e2e] GET /api/openapi.json answered ${res.status}`);
    return res.json();
  });
  return documentPromise;
}

function templateToRegex(template: string): RegExp {
  const pattern = template
    .split('/')
    .map((segment) => (/^\{[^}]+\}$/.test(segment) ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${pattern}$`);
}

export function findOperation(document: any, method: string, path: string): { template: string; operation: any } | undefined {
  const pathname = path.split('?')[0];
  for (const [template, item] of Object.entries<any>(document.paths ?? {})) {
    const operation = item[method.toLowerCase()];
    if (operation && templateToRegex(template).test(pathname)) return { template, operation };
  }
  return undefined;
}

function getValidator(document: any, key: string, schema: unknown) {
  if (!ajv) {
    // Ajv 8 honors OpenAPI 3.0 `nullable` natively (the option nullable:true is rejected with a warning).
    // strict:false: the document also carries
    // annotation keywords (example, ...) Ajv's strict mode would reject.
    ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
    for (const format of ['int32', 'int64', 'float', 'double']) ajv.addFormat(format, true);
  }
  let validate = validators.get(key);
  if (!validate) {
    // components are carried along so a "#/components/..." $ref resolves inside the compiled schema.
    validate = ajv.compile({ ...(schema as object), components: document.components });
    validators.set(key, validate);
  }
  return validate;
}

/** Throws, naming the operation and the Ajv errors, when the body does not match the documented schema. */
export async function assertConformsToOpenApi(method: string, path: string, status: number, body: unknown): Promise<void> {
  const document = await getOpenApiDocument();
  const found = findOperation(document, method, path);
  const label = `${method.toUpperCase()} ${path} -> ${status}`;
  if (!found) throw new Error(`OpenAPI conformance: ${label} matches no documented path`);
  const response = found.operation.responses?.[String(status)];
  if (!response) throw new Error(`OpenAPI conformance: ${label} is not a documented response of ${found.template}`);
  const content = response.content ?? {};
  const mediaType = MEDIA_TYPES.find((type) => content[type]);
  if (!mediaType) {
    if (body === undefined) return; // 204-style response with no declared body
    throw new Error(`OpenAPI conformance: ${label} returned a body but ${found.template} declares none`);
  }
  const validate = getValidator(document, `${found.template}|${method.toLowerCase()}|${status}`, content[mediaType].schema);
  if (!validate(body)) {
    throw new Error(
      `OpenAPI conformance: ${label} (${found.template}) violates the documented schema:\n` +
        validate.errors.map((e: any) => `  ${e.instancePath || '/'} ${e.message}`).join('\n'),
    );
  }
}
