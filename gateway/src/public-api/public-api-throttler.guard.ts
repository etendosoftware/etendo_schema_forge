import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { rateLimited } from './json-api-http.ts';

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

  protected async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const res = context.switchToHttp().getResponse();
    const retryAfter = Math.max(1, detail.timeToBlockExpire || detail.timeToExpire);
    res.header('X-RateLimit-Limit', String(detail.limit));
    res.header('X-RateLimit-Remaining', '0');
    res.header('X-RateLimit-Reset', String(retryAfter));
    res.header('Retry-After', String(retryAfter));
    throw rateLimited(retryAfter);
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
