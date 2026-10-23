import {
  BadGatewayException,
  Catch,
  HttpException,
  Injectable,
  Logger,
  NotAcceptableException,
  UnsupportedMediaTypeException,
  type ArgumentsHost,
  type CallHandler,
  type CanActivate,
  type ExceptionFilter,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs';

// HTTP-level JSON:API behavior of the public API: media-type negotiation, the
// error document and the response Content-Type. It is registered on
// PublicApiController only (never globally), so the OpenAPI/Scalar routes and
// the health check keep their own types and shapes.

export const JSON_API_MEDIA_TYPE = 'application/vnd.api+json';
const JSON_MEDIA_TYPE = 'application/json';
// The only parameters JSON:API 1.1 allows on its media type.
const ALLOWED_JSON_API_PARAMETERS = new Set(['ext', 'profile']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

type JsonBodyParserHost = { useBodyParser(type: 'json', options: { type: string[] }): unknown };

/** Makes the JSON body parser read application/vnd.api+json like application/json (bootstrap and tests share it). */
export function configureJsonApiBodyParser(app: JsonBodyParserHost): void {
  app.useBodyParser('json', { type: [JSON_MEDIA_TYPE, JSON_API_MEDIA_TYPE] });
}

type MediaRange = { type: string; params: Record<string, string> };

function parseMediaRanges(header: string): MediaRange[] {
  return header.split(',').map((entry) => {
    const [rawType, ...rawParams] = entry.split(';');
    const params: Record<string, string> = {};
    for (const raw of rawParams) {
      const [name, ...value] = raw.split('=');
      if (name.trim()) params[name.trim().toLowerCase()] = value.join('=').trim().replace(/^"|"$/g, '');
    }
    return { type: rawType.trim().toLowerCase(), params };
  }).filter((range) => range.type);
}

function hasOnlyAllowedParameters(range: MediaRange, extra: string[] = []): boolean {
  return Object.keys(range.params).every((name) => ALLOWED_JSON_API_PARAMETERS.has(name) || extra.includes(name));
}

/**
 * Whether an Accept header can be answered. An absent header, `*\/*`,
 * `application/*` or `application/json` accept the JSON:API document; an
 * explicit `application/vnd.api+json` is acceptable unless every such entry
 * carries a media-type parameter the server does not support (JSON:API 1.1
 * content negotiation). A `q=0` entry is a refusal, not an offer.
 */
export function acceptsJsonApi(accept: string | undefined): boolean {
  if (!accept?.trim()) return true;
  const offered = parseMediaRanges(accept).filter((range) => Number(range.params.q ?? '1') > 0);
  if (offered.some((range) => ['*/*', 'application/*', JSON_MEDIA_TYPE].includes(range.type))) return true;
  return offered.some((range) => range.type === JSON_API_MEDIA_TYPE && hasOnlyAllowedParameters(range, ['q']));
}

/** Whether the request body media type is one the API reads (`undefined` header = no body type to judge). */
export function isSupportedContentType(contentType: string | undefined): boolean {
  if (!contentType?.trim()) return true;
  const [range] = parseMediaRanges(contentType);
  if (range.type === JSON_MEDIA_TYPE) return true;
  return range.type === JSON_API_MEDIA_TYPE && hasOnlyAllowedParameters(range);
}

@Injectable()
export class JsonApiNegotiationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method: string; headers: Record<string, string | undefined> }>();
    if (!acceptsJsonApi(request.headers.accept)) {
      throw new NotAcceptableException(`Responses are ${JSON_API_MEDIA_TYPE}. Send Accept: ${JSON_API_MEDIA_TYPE} or application/json.`);
    }
    if (BODY_METHODS.has(request.method.toUpperCase()) && !isSupportedContentType(request.headers['content-type'])) {
      throw new UnsupportedMediaTypeException(`Send the body as ${JSON_API_MEDIA_TYPE} (without media-type parameters) or application/json.`);
    }
    return true;
  }
}

type ResponseLike = {
  setHeader(name: string, value: string): unknown;
  getHeader?(name: string): unknown;
  writeHead?: (...args: unknown[]) => unknown;
};

const patched = new WeakSet<object>();

/**
 * Sets the JSON:API Content-Type. Express appends `; charset=utf-8` to the
 * type of a string body when it sends it, and JSON:API forbids media-type
 * parameters on the server's Content-Type, so the header is restored to the
 * bare media type right before the head is written.
 */
export function setJsonApiContentType(res: ResponseLike): void {
  res.setHeader('Content-Type', JSON_API_MEDIA_TYPE);
  if (patched.has(res) || !res.writeHead) return;
  patched.add(res);
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(this: ResponseLike, ...args: unknown[]) {
    if (String(this.getHeader?.('Content-Type') ?? '').toLowerCase().startsWith(JSON_API_MEDIA_TYPE)) {
      this.setHeader('Content-Type', JSON_API_MEDIA_TYPE);
    }
    return writeHead.apply(this, args);
  };
}

/** Marks successful bodies as JSON:API; an empty body (204) is left without a Content-Type. */
@Injectable()
export class JsonApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const res = context.switchToHttp().getResponse<ResponseLike>();
    return next.handle().pipe(map((body: unknown) => {
      if (body !== undefined && body !== null) setJsonApiContentType(res);
      return body;
    }));
  }
}

export interface JsonApiError {
  status: string;
  code?: string;
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  406: 'Not Acceptable',
  409: 'Conflict',
  412: 'Precondition Failed',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

function titleFor(status: number): string {
  return STATUS_TITLES[status] ?? (status >= 500 ? 'Server Error' : 'Error');
}

// Statuses of Etendo that mean something to an integrator and are forwarded as
// they are (503 is Etendo's transient "service_unavailable": retrying is right).
// Everything else (5xx, an unexpected 4xx) is the gateway's 502: the integrator
// can do nothing about it and must not see Etendo's internals.
const PASS_THROUGH_STATUSES = new Set([400, 401, 402, 403, 404, 409, 412, 422, 428, 429, 503]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | undefined =>
  (typeof value === 'string' && value.trim() ? value : undefined);

/**
 * Reads the two error shapes NeoServlet answers with: the nested
 * `{ error: { message, status } }` and the flat
 * `{ status, error: "<code>", message, detail, hint }` of the structured
 * refusals (stale record, missing `updated`, read-only field...).
 */
export function parseUpstreamError(body: unknown): { code?: string; message?: string; detail?: string; hint?: string; field?: string } {
  const root = isRecord(body) ? body : {};
  const nested = isRecord(root.error) ? root.error : undefined;
  const source = nested ?? root;
  return {
    code: text(root.error) ?? text(source.error) ?? text(source.code),
    message: text(source.message) ?? text(root.message),
    detail: text(source.detail) ?? text(root.detail),
    hint: text(source.hint) ?? text(root.hint),
    field: text(source.field) ?? text(root.field),
  };
}

const log = new Logger('PublicApi');

/** A 502 whose document carries no Etendo internals. */
export function badGateway(detail: string, meta?: Record<string, unknown>): BadGatewayException {
  return new BadGatewayException({
    errors: [{ status: '502', title: titleFor(502), detail, ...(meta ? { meta } : {}) } satisfies JsonApiError],
  });
}

/** Builds the gateway's exception for an unsuccessful NeoServlet answer. */
export function upstreamException(status: number, body: unknown): HttpException {
  const upstream = parseUpstreamError(body);
  if (!PASS_THROUGH_STATUSES.has(status)) {
    // The upstream text stays in the server log; the integrator gets no internals.
    log.warn(`NeoServlet answered ${status}: ${upstream.message ?? upstream.detail ?? 'no message'}`);
    // A hint means the write may already be committed: it is the only upstream text
    // forwarded, and the detail must not tell the integrator to blindly retry.
    if (upstream.hint) {
      return badGateway('Etendo could not complete the request. Check meta.hint before retrying.', { upstreamStatus: status, hint: upstream.hint });
    }
    return badGateway('Etendo could not complete the request. Retry later; contact support if it persists.', { upstreamStatus: status });
  }
  const meta: Record<string, unknown> = {};
  if (upstream.message && upstream.detail) meta.detail = upstream.detail;
  if (upstream.hint) meta.hint = upstream.hint;
  if (upstream.field) meta.field = upstream.field;
  const error: JsonApiError = {
    status: String(status),
    ...(upstream.code ? { code: upstream.code } : {}),
    title: titleFor(status),
    detail: upstream.message ?? upstream.detail ?? `Etendo refused the request with status ${status}.`,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
  return new HttpException({ errors: [error] }, status);
}

/** Maps any exception to a JSON:API error document and its HTTP status. */
export function toErrorDocument(exception: unknown): { status: number; errors: JsonApiError[] } {
  if (!(exception instanceof HttpException)) {
    log.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    return {
      status: 500,
      errors: [{ status: '500', title: titleFor(500), detail: 'Unexpected error.' }],
    };
  }
  const status = exception.getStatus();
  const response = exception.getResponse();
  if (isRecord(response) && Array.isArray(response.errors)) {
    return { status, errors: response.errors as JsonApiError[] };
  }
  const message = isRecord(response) ? response.message : response;
  const details = (Array.isArray(message) ? message : [message]).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  return {
    status,
    errors: (details.length ? details : [undefined]).map((detail) => ({
      status: String(status),
      title: titleFor(status),
      ...(detail ? { detail } : {}),
    })),
  };
}

@Catch()
export class JsonApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<ResponseLike & { status(code: number): { json(body: unknown): unknown } }>();
    const { status, errors } = toErrorDocument(exception);
    setJsonApiContentType(res);
    res.status(status).json({ errors });
  }
}
