import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerRequest } from '@nestjs/throttler';
import { rateLimited } from './json-api-http.ts';

/** Name of the single throttler configured in ThrottlerModule.forRoot (the library default). */
export const THROTTLER_NAME = 'default';

/**
 * Rate limit per API key. It must run AFTER `PublicApiKeyGuard`: the tracker is
 * the key id of an `Authorization: Bearer <apiKeyId>:<secret>` header that guard
 * already validated, so a client cannot spend another key's quota by sending
 * its id (an invalid key never reaches this guard).
 *
 * Every response that passes the guard carries `X-RateLimit-Limit`,
 * `X-RateLimit-Remaining` and `X-RateLimit-Reset` (seconds until the window
 * resets); a refusal is a 429 JSON:API error with `Retry-After` (seconds).
 */
@Injectable()
export class PublicApiThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const header = String(req.headers?.authorization ?? '');
    const credential = header.match(/^Bearer\s+(.+)$/)?.[1]?.trim() ?? '';
    return `key:${credential.split(':')[0]}`;
  }

  /**
   * One bucket per key for every route. The library's default key also hashes the
   * controller class and handler name, which would give each handler its own quota.
   */
  protected generateKey(_context: ExecutionContext, tracker: string, throttlerName: string): string {
    return `${throttlerName}:${tracker}`;
  }

  /**
   * The library counts hits in a sliding window (each hit expires `ttl` after it was made;
   * `blockDuration` is 0 so a refused key is never held longer than that). Its own
   * `X-RateLimit-Reset` marks a fixed window that can end before the last counted hit
   * expires, so it is replaced by the exact time until every counted hit has expired.
   */
  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const allowed = await super.handleRequest({ ...props, blockDuration: 0 });
    const { req, res } = this.getRequestResponse(props.context);
    const tracker = await props.getTracker(req, props.context);
    const key = props.generateKey(props.context, tracker, props.throttler.name ?? THROTTLER_NAME);
    const restore = this.secondsUntilRestored(key, props.throttler.name ?? THROTTLER_NAME);
    if (restore !== undefined) res.header('X-RateLimit-Reset', String(restore));
    return allowed;
  }

  protected async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const res = context.switchToHttp().getResponse();
    // Retry-After: until the oldest counted request expires, i.e. the next request is accepted.
    const retryAfter = Math.max(1, detail.timeToBlockExpire || detail.timeToExpire);
    const restore = this.secondsUntilRestored(detail.key, THROTTLER_NAME) ?? retryAfter;
    res.header('X-RateLimit-Limit', String(detail.limit));
    res.header('X-RateLimit-Remaining', '0');
    res.header('X-RateLimit-Reset', String(Math.max(restore, retryAfter)));
    res.header('Retry-After', String(retryAfter));
    throw rateLimited(retryAfter);
  }

  /**
   * Seconds until all hits counted for the key have expired (undefined if unavailable).
   * Reads ThrottlerStorageService's private `hitExpirations` (layout checked against @nestjs/throttler 6.7.1);
   * gateway/test/json-api-http.test.ts fails if that layout changes, so an upgrade cannot silently degrade Reset.
   */
  private secondsUntilRestored(key: string, throttlerName: string): number | undefined {
    const hits = (this.storageService as unknown as { hitExpirations?: Map<string, Map<string, number[]>> }).hitExpirations
      ?.get(key)?.get(throttlerName);
    if (!hits) return undefined;
    const latest = Math.max(0, ...hits);
    return Math.max(0, Math.ceil((latest - Date.now()) / 1000));
  }
}

/** Limit and window of the per-key rate limit; `PUBLIC_API_RATE_LIMIT` (requests) and `PUBLIC_API_RATE_WINDOW_SECONDS`. */
export function rateLimitConfig(env: NodeJS.ProcessEnv = process.env): { limit: number; ttl: number } {
  const positive = (raw: string | undefined, fallback: number) => {
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  return { limit: positive(env.PUBLIC_API_RATE_LIMIT, 100), ttl: positive(env.PUBLIC_API_RATE_WINDOW_SECONDS, 60) * 1000 };
}
