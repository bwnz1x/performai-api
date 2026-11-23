import { AuthError, RateLimitError } from '@/lib/errors';
import { refreshSession } from '@/lib/games/maimai/auth';
import { parseCookies } from '@/lib/games/maimai/cookies';
import { mergeCookies } from '@/lib/shared/cookies';

export interface SessionQueueOptions {
  minDelayMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  sessionCacheTtlMs?: number;
}

interface CachedSession {
  cookie: string;
  updatedAt: number;
}

const DEFAULT_MIN_DELAY_MS = Number(process.env.MAIMAI_REQUEST_DELAY_MS ?? 450);
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 2000;
const DEFAULT_SESSION_CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutes

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Derives a stable per-user queue/cache key from a maimai cookie string.
 * Prefers `clal` (long-lived token), falling back to `userId` or `_t`.
 */
export function getSessionKey(cookie: string): string {
  const parsed = parseCookies(cookie);
  const clal = parsed.get('clal');
  if (clal) return `clal:${clal}`;
  const userId = parsed.get('userId');
  if (userId) return `uid:${userId}`;
  const token = parsed.get('_t');
  if (token) return `t:${token}`;
  return 'default';
}

/**
 * Detects SEGA maimai DX NET error pages returned with HTTP 200 OK
 * (e.g. "ERROR CODE：200001" or generic error_fc_img / error page).
 */
export function detectMaimaiErrorCode(html: string): string | null {
  const codeMatch = html.match(/ERROR\s*CODE\s*[：:]\s*(\d{5,6})/i);
  if (codeMatch?.[1]) {
    return codeMatch[1];
  }
  if (html.includes('/maimai-mobile/img/error') && html.includes('200001')) {
    return '200001';
  }
  return null;
}

/**
 * Manages per-player request serialization, inter-request pacing,
 * and in-memory caching of refreshed `_t` session cookies so SEGA's
 * strict single-concurrency / rate-limit guard (Error 200001) isn't tripped.
 */
export class MaimaiSessionManager {
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly cachedSessions = new Map<string, CachedSession>();
  private readonly minDelayMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly sessionCacheTtlMs: number;

  constructor(options: SessionQueueOptions = {}) {
    this.minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.sessionCacheTtlMs = options.sessionCacheTtlMs ?? DEFAULT_SESSION_CACHE_TTL_MS;
  }

  /**
   * Resolves the best active session cookie for the incoming header.
   * - If a fresh cached session exists for the same `clal`, reuses its `_t`/`userId`.
   * - If `_t` is missing and `clal` is present, refreshes once via SEGA Aime Gateway
   *   (serialized per user) and caches the result.
   */
  async resolveSessionCookie(
    incomingCookie: string,
    refreshFn: (clalCookie: string) => Promise<string> = refreshSession
  ): Promise<string> {
    const key = getSessionKey(incomingCookie);
    const parsed = parseCookies(incomingCookie);
    const now = Date.now();

    const cached = this.cachedSessions.get(key);
    if (cached && now - cached.updatedAt < this.sessionCacheTtlMs) {
      // If caller sent clal-only (e.g. client clal retry) or an older `_t`, prefer our fresher cached session
      const cachedParsed = parseCookies(cached.cookie);
      if (cachedParsed.has('_t')) {
        return cached.cookie;
      }
    }

    if (!parsed.has('_t') && parsed.has('clal')) {
      return this.enqueue(key, async () => {
        const recheck = this.cachedSessions.get(key);
        if (recheck && Date.now() - recheck.updatedAt < this.sessionCacheTtlMs) {
          return recheck.cookie;
        }
        const refreshed = await refreshFn(incomingCookie);
        const clal = parsed.get('clal');
        const merged = clal
          ? mergeCookies(`clal=${clal}`, refreshed)
          : mergeCookies(incomingCookie, refreshed);
        this.cachedSessions.set(key, { cookie: merged, updatedAt: Date.now() });
        return merged;
      });
    }

    // Store caller's valid full cookie so subsequent calls can update it if rotated
    if (parsed.has('_t')) {
      this.cachedSessions.set(key, { cookie: incomingCookie, updatedAt: now });
    }
    return incomingCookie;
  }

  /** Updates cached session cookie when SEGA rotates `_t` / `AWSALBTG` cookies. */
  updateSessionCookie(originalCookie: string, updatedCookie: string): void {
    if (!updatedCookie) return;
    const key = getSessionKey(originalCookie);
    const existing = this.cachedSessions.get(key)?.cookie ?? originalCookie;
    const merged = mergeCookies(existing, updatedCookie);
    this.cachedSessions.set(key, { cookie: merged, updatedAt: Date.now() });
  }

  /** Invalidates cached `_t` for a user (e.g. on 401 AuthError). */
  invalidateSession(cookie: string): void {
    this.cachedSessions.delete(getSessionKey(cookie));
  }

  /**
   * Serializes a SEGA HTTP operation for a given session key, enforcing
   * minimum inter-request spacing and automatic backoff retry on Error 200001.
   */
  async runSerialized<T>(
    cookie: string,
    operation: (activeCookie: string) => Promise<T>,
    refreshFn: (clalCookie: string) => Promise<string> = refreshSession
  ): Promise<T> {
    const key = getSessionKey(cookie);
    return this.enqueue(key, async () => {
      let attempt = 0;
      let refreshedOnRetry = false;

      while (true) {
        await this.waitForPacing(key);
        const activeCookie = this.cachedSessions.get(key)?.cookie ?? cookie;

        try {
          const result = await operation(activeCookie);
          this.lastRequestAt.set(key, Date.now());
          return result;
        } catch (err) {
          this.lastRequestAt.set(key, Date.now());

          if (err instanceof AuthError) {
            this.cachedSessions.delete(key);
            throw err;
          }

          if (err instanceof RateLimitError && attempt < this.maxRetries) {
            attempt++;
            const backoffMs = this.retryBaseDelayMs * Math.pow(2, attempt - 1);
            console.warn(
              `[MAIMAI_200001_RETRY] attempt ${attempt}/${this.maxRetries}, waiting ${backoffMs}ms before retry`
            );
            await sleep(backoffMs);

            // If we have a `clal` token and haven't tried refreshing yet, refresh session once
            // because expired/stale `_t` or `userId` tokens on maimai DX NET redirect to /error (200001).
            const parsed = parseCookies(activeCookie);
            const clal = parsed.get('clal');
            if (!refreshedOnRetry && clal) {
              refreshedOnRetry = true;
              try {
                console.warn(`[MAIMAI_200001_RETRY] refreshing session via clal...`);
                const refreshed = await refreshFn(`clal=${clal}`);
                const merged = mergeCookies(`clal=${clal}`, refreshed);
                this.cachedSessions.set(key, { cookie: merged, updatedAt: Date.now() });
                await sleep(this.minDelayMs);
              } catch (refreshErr) {
                if (refreshErr instanceof AuthError) {
                  this.cachedSessions.delete(key);
                  throw refreshErr;
                }
                console.warn(
                  `[MAIMAI_200001_RETRY] clal refresh failed:`,
                  refreshErr instanceof Error ? refreshErr.message : refreshErr
                );
              }
            }
            continue;
          }

          throw err;
        }
      }
    });
  }

  private async waitForPacing(key: string): Promise<void> {
    const last = this.lastRequestAt.get(key) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < this.minDelayMs) {
      await sleep(this.minDelayMs - elapsed);
    }
  }

  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous
      .then(
        () => undefined,
        () => undefined
      )
      .then(task);
    const tracked = run
      .then(
        () => undefined,
        () => undefined
      )
      .finally(() => {
        if (this.queues.get(key) === tracked) {
          this.queues.delete(key);
        }
      });
    this.queues.set(key, tracked);
    return run;
  }
}

export const maimaiSessionManager = new MaimaiSessionManager();
