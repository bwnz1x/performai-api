import { Elysia } from 'elysia';
import { z } from 'zod';

import {
  MaimaiCollectionResponse,
  MaimaiEquipResult,
  MaimaiPhoto,
  MaimaiPlayDetail,
  MaimaiProfileExtended,
  MaimaiRating,
  MaimaiRecentPlay,
} from '@/lib/games/maimai/schemas';
import {
  collectionParams,
  cookieHeaders,
  equipCollectionBody,
  loginBody,
  photoImageQuery,
  playDetailParams,
  serverParams,
} from '@/modules/maimai/model';
import { MaimaiService } from '@/modules/maimai/service';

const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const maimaiModule = new Elysia({
  prefix: '/v1/:server/maimai',
  name: 'maimai',
})
  .post(
    '/login',
    ({ params, body }) => MaimaiService.login(params.server, body.segaId, body.password),
    {
      params: serverParams,
      body: loginBody,
      response: {
        200: z.object({
          data: z.object({ cookie: z.string() }),
        }),
        422: ErrorResponse,
        500: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        tags: ['Maimai'],
        summary: 'Login to Maimai DX Intl',
        description:
          'Authenticates with SEGA ID and returns a cookie for accessing other endpoints.',
      },
    }
  )
  .get(
    '/profile',
    ({ params, headers }) => MaimaiService.profile(params.server, headers['x-maimai-cookie']),
    {
      params: serverParams,
      headers: cookieHeaders,
      response: {
        200: z.object({
          data: MaimaiProfileExtended,
        }),
        422: ErrorResponse,
        500: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        tags: ['Maimai'],
        summary: 'Get Player Profile',
        description: 'Fetches the player profile including rating, title, and stars.',
      },
    }
  )
  .get(
    '/rating',
    ({ params, headers, query }) =>
      MaimaiService.rating(
        params.server,
        headers['x-maimai-cookie'],
        query.includeAll === 'true' || query.includeAll === '1'
      ),
    {
      params: serverParams,
      headers: cookieHeaders,
      query: z.object({
        includeAll: z.string().optional(),
      }),
      response: {
        200: z.object({
          data: MaimaiRating,
        }),
        422: ErrorResponse,
        500: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        tags: ['Maimai'],
        summary: 'Get Player Rating',
        description:
          'Fetches the top 50 songs that make up the player rating. Pass ?includeAll=true to also return all rated scores.',
      },
    }
  )
  .get(
    '/recent',
    ({ params, headers }) => MaimaiService.recent(params.server, headers['x-maimai-cookie']),
    {
      params: serverParams,
      headers: cookieHeaders,
      response: {
        200: z.object({
          data: z.array(MaimaiRecentPlay),
        }),
        422: ErrorResponse,
        500: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        tags: ['Maimai'],
        summary: 'Get Recent Plays',
        description: 'Fetches the 50 most recent play records from maimai DX NET.',
      },
    }
  )
  .get(
    '/recent/:idx',
    ({ params, headers }) =>
      MaimaiService.recentDetail(params.server, headers['x-maimai-cookie'], params.idx),
    {
      params: playDetailParams,
      headers: cookieHeaders,
      response: {
        200: z.object({
          data: MaimaiPlayDetail,
        }),
        422: ErrorResponse,
        500: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        tags: ['Maimai'],
        summary: 'Get Recent Play Judgement Breakdown',
        description:
          'Fetches full judgement breakdown (totals + tap/hold/slide/touch/break) for a recent play.',
      },
    }
  )
  .get(
    '/photos',
    ({ params, headers }) => MaimaiService.photos(params.server, headers['x-maimai-cookie']),
    {
      params: serverParams,
      headers: cookieHeaders,
      response: {
        200: z.object({
          data: z.array(MaimaiPhoto),
        }),
        422: ErrorResponse,
        500: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        tags: ['Maimai'],
        summary: 'Get Photo Album',
        description: 'Fetches saved cabinet photos from maimai DX NET photoAlbum.',
      },
    }
  )
  .get(
    '/photos/image',
    ({ params, headers, query }) =>
      MaimaiService.photoImage(params.server, headers['x-maimai-cookie'], query.url),
    {
      params: serverParams,
      headers: cookieHeaders,
      query: photoImageQuery,
      detail: {
        tags: ['Maimai'],
        summary: 'Proxy Photo Album Image',
        description:
          'Streams an authenticated maimai DX NET photo image using the player session cookie.',
      },
    }
  )
  .get(
    '/collection/:category',
    ({ params, headers }) =>
      MaimaiService.collection(params.server, headers['x-maimai-cookie'], params.category),
    {
      params: collectionParams,
      headers: cookieHeaders,
      response: {
        200: z.object({
          data: MaimaiCollectionResponse,
        }),
        422: ErrorResponse,
        500: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        tags: ['Maimai'],
        summary: 'Get Cosmetic Collection',
        description:
          'Fetches unlocked icons, nameplates, frames, trophies (titles), or partners and the active equipped item.',
      },
    }
  )
  .post(
    '/collection/:category/equip',
    ({ params, headers, body }) =>
      MaimaiService.equipCollection(
        params.server,
        headers['x-maimai-cookie'],
        params.category,
        body.idx
      ),
    {
      params: collectionParams,
      headers: cookieHeaders,
      body: equipCollectionBody,
      response: {
        200: z.object({
          data: MaimaiEquipResult,
        }),
        422: ErrorResponse,
        500: ErrorResponse,
        501: ErrorResponse,
      },
      detail: {
        tags: ['Maimai'],
        summary: 'Equip Cosmetic Item',
        description:
          'Equips a cosmetic item by idx on maimai DX NET by extracting the page CSRF token and submitting the change form.',
      },
    }
  );
