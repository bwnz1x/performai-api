import { RateLimitError } from '@/lib/errors';
import { MAIMAI_URLS } from '@/lib/games/maimai/consts';
import { detectMaimaiErrorCode, maimaiSessionManager } from '@/lib/games/maimai/session';
import { followRedirects } from '@/lib/shared/http';

export type { FetchWithRedirectsOptions, RedirectResult } from '@/lib/shared/http';
export { followRedirects } from '@/lib/shared/http';

const REFERER = `${MAIMAI_URLS.intl}/home/`;

export async function maimaiFetch(
  url: string,
  cookie: string,
  init: RequestInit = {}
): Promise<Response> {
  return maimaiSessionManager.runSerialized(cookie, async (activeCookie) => {
    const result = await followRedirects(url, activeCookie, {
      ...init,
      checkAuthRedirect: true,
      headers: {
        Referer: REFERER,
        ...init.headers,
      },
    });

    if (result.cookie && result.cookie !== activeCookie) {
      maimaiSessionManager.updateSessionCookie(cookie, result.cookie);
    }

    // Some SEGA 200001 error pages are served with HTTP 200 instead of a 302 to /error
    if (result.response.ok) {
      const contentType = result.response.headers.get('content-type') ?? '';
      if (contentType.includes('text/html') || contentType === '') {
        const html = await result.response.text();
        const errorCode = detectMaimaiErrorCode(html);
        if (errorCode) {
          console.error(`[UPSTREAM_ERROR_HTML] ${url} -> ERROR CODE ${errorCode}`);
          throw new RateLimitError(
            `maimai DX NET returned ERROR CODE ${errorCode}. Please wait a moment and try again.`
          );
        }
        return new Response(html, {
          status: result.response.status,
          statusText: result.response.statusText,
          headers: result.response.headers,
        });
      }
    }

    return result.response;
  });
}
