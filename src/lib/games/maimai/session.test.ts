import { describe, expect, it } from 'bun:test';

import { AuthError, RateLimitError } from '@/lib/errors';
import {
  detectMaimaiErrorCode,
  getSessionKey,
  MaimaiSessionManager,
} from '@/lib/games/maimai/session';

describe('MaimaiSessionManager', () => {
  it('derives stable session key preferring clal', () => {
    expect(getSessionKey('_t=abc; clal=xyz; userId=1')).toBe('clal:xyz');
    expect(getSessionKey('_t=abc; userId=42')).toBe('uid:42');
    expect(getSessionKey('_t=onlytoken')).toBe('t:onlytoken');
  });

  it('detects 200001 error code in HTML responses', () => {
    expect(detectMaimaiErrorCode('<div>ERROR CODE：200001</div>')).toBe('200001');
    expect(detectMaimaiErrorCode('<div>ERROR CODE: 200001</div>')).toBe('200001');
    expect(detectMaimaiErrorCode('<div>Normal profile page</div>')).toBeNull();
  });

  it('serializes concurrent requests for the same session so they never overlap', async () => {
    const manager = new MaimaiSessionManager({ minDelayMs: 25, maxRetries: 0 });
    const cookie = 'clal=userA; _t=tok1';
    let inFlight = 0;
    let maxConcurrent = 0;
    const order: number[] = [];

    const makeTask = (id: number) =>
      manager.runSerialized(cookie, async () => {
        inFlight++;
        maxConcurrent = Math.max(maxConcurrent, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        order.push(id);
        inFlight--;
        return id;
      });

    const results = await Promise.all([makeTask(1), makeTask(2), makeTask(3)]);
    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(maxConcurrent).toBe(1);
  });

  it('caches refreshed session cookies across consecutive calls', async () => {
    const manager = new MaimaiSessionManager({ minDelayMs: 0 });
    let refreshCount = 0;
    const mockRefresh = async () => {
      refreshCount++;
      return '_t=fresh_token; userId=999';
    };

    const first = await manager.resolveSessionCookie('clal=abc', mockRefresh);
    const second = await manager.resolveSessionCookie('clal=abc', mockRefresh);

    expect(refreshCount).toBe(1);
    expect(first).toContain('_t=fresh_token');
    expect(second).toBe(first);
  });

  it('retries automatically with backoff on transient RateLimitError (200001)', async () => {
    const manager = new MaimaiSessionManager({
      minDelayMs: 5,
      maxRetries: 2,
      retryBaseDelayMs: 15,
    });
    const cookie = 'clal=retryUser; _t=oldtok';
    let attempts = 0;
    let refreshed = false;

    const result = await manager.runSerialized(
      cookie,
      async (activeCookie) => {
        attempts++;
        if (attempts === 1) {
          throw new RateLimitError('200001');
        }
        return activeCookie;
      },
      async () => {
        refreshed = true;
        return '_t=newtok; userId=777; AWSALBTG=abc';
      }
    );

    expect(attempts).toBe(2);
    expect(refreshed).toBe(true);
    expect(result).toContain('clal=retryUser');
    expect(result).toContain('_t=newtok');
    expect(result).toContain('userId=777');
    expect(result).toContain('AWSALBTG=abc');
  });

  it('propagates AuthError immediately when clal refresh fails during 200001 retry', async () => {
    const manager = new MaimaiSessionManager({
      minDelayMs: 5,
      maxRetries: 2,
      retryBaseDelayMs: 10,
    });
    const cookie = 'clal=expiredClal; _t=oldtok';

    await expect(
      manager.runSerialized(
        cookie,
        async () => {
          throw new RateLimitError('200001');
        },
        async () => {
          throw new AuthError('invalid or expired clal token');
        }
      )
    ).rejects.toThrow(AuthError);
  });

  it('does not leave unhandled rejections when a serialized task fails', async () => {
    const manager = new MaimaiSessionManager({
      minDelayMs: 0,
      maxRetries: 0,
    });

    await expect(
      manager.runSerialized('clal=failUser; _t=tok', async () => {
        throw new RateLimitError('200001');
      })
    ).rejects.toThrow(RateLimitError);

    // Subsequent tasks on the same session key still run cleanly
    const next = await manager.runSerialized('clal=failUser; _t=tok', async () => 'recovered');
    expect(next).toBe('recovered');
  });
});
