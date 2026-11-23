import { status } from 'elysia';

import {
  getMaimaiPlayDetail,
  getMaimaiProfile,
  getMaimaiRating,
  getMaimaiRecentPlays,
} from '@/lib/games/maimai';
import { loginMaimaiIntl } from '@/lib/games/maimai/auth';
import type { MaimaiServer } from '@/lib/games/maimai/consts';

export const MaimaiService = {
  async login(server: string, segaId: string, password: string) {
    if (server !== 'intl') {
      return status(501, {
        error: {
          code: 'NOT_IMPLEMENTED',
          message: `server '${server}' not yet supported for maimai`,
        },
      });
    }

    const cookie = await loginMaimaiIntl(segaId, password);
    return { data: { cookie } };
  },

  async profile(server: string, cookie: string) {
    if (server !== 'intl') {
      return status(501, {
        error: {
          code: 'NOT_IMPLEMENTED',
          message: `server '${server}' not yet supported for maimai`,
        },
      });
    }

    const profile = await getMaimaiProfile(server as MaimaiServer, cookie);
    return { data: profile };
  },

  async rating(server: string, cookie: string, includeAll = false) {
    if (server !== 'intl') {
      return status(501, {
        error: {
          code: 'NOT_IMPLEMENTED',
          message: `server '${server}' not yet supported for maimai`,
        },
      });
    }

    const rating = await getMaimaiRating(server as MaimaiServer, cookie, includeAll);
    return { data: rating };
  },

  async recent(server: string, cookie: string) {
    if (server !== 'intl') {
      return status(501, {
        error: {
          code: 'NOT_IMPLEMENTED',
          message: `server '${server}' not yet supported for maimai`,
        },
      });
    }

    const plays = await getMaimaiRecentPlays(server as MaimaiServer, cookie);
    return { data: plays };
  },

  async recentDetail(server: string, cookie: string, idx: string) {
    if (server !== 'intl') {
      return status(501, {
        error: {
          code: 'NOT_IMPLEMENTED',
          message: `server '${server}' not yet supported for maimai`,
        },
      });
    }

    const detail = await getMaimaiPlayDetail(server as MaimaiServer, cookie, idx);
    return { data: detail };
  },
};
