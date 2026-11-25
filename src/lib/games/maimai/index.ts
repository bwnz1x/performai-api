import { AuthError, FetchError } from '@/lib/errors';
import { getFcImageUrl, getFsImageUrl, getJacketUrl } from '@/lib/games/maimai/assets';
import {
  MAIMAI_TWO_VERSION_NEW_THRESHOLD,
  MAIMAI_URLS,
  type MaimaiServer,
} from '@/lib/games/maimai/consts';
import { maimaiFetch } from '@/lib/games/maimai/http';
import {
  COLLECTION_PATHS,
  extractEquipForm,
  parseCollectionPage,
} from '@/lib/games/maimai/parser/collection';
import { parsePhotoAlbum } from '@/lib/games/maimai/parser/photos';
import { parsePlaylogDetail, parseRecentPlays } from '@/lib/games/maimai/parser/playlog';
import {
  parseActiveCollection,
  parseCircle,
  parseProfile,
} from '@/lib/games/maimai/parser/profile';
import { fetchAllScoreData, type ScoreData } from '@/lib/games/maimai/parser/scores';
import {
  calculateSongRating,
  computeRatingSongs,
  type RatedScore,
} from '@/lib/games/maimai/rating/calculator';
import type {
  MaimaiCollectionCategory,
  MaimaiCollectionResponse,
  MaimaiEquipResult,
  MaimaiPhoto,
  MaimaiPlayDetail,
  MaimaiProfileExtended,
  MaimaiRating,
  MaimaiRecentPlay,
} from '@/lib/games/maimai/schemas';
import { maimaiSessionManager } from '@/lib/games/maimai/session';
import { fetchOtogeDbSongs, findChart, type OtogeDbChart } from '@/lib/games/maimai/songs/otoge-db';

export async function getMaimaiProfile(
  server: MaimaiServer,
  cookie: string
): Promise<MaimaiProfileExtended> {
  const sessionCookie = await maimaiSessionManager.resolveSessionCookie(cookie);
  const baseUrl = MAIMAI_URLS[server];

  // Fetch sequentially (never Promise.all) to avoid SEGA maimai DX NET Error 200001
  const profileRes = await maimaiFetch(`${baseUrl}/playerData/`, sessionCookie);
  if (profileRes.status === 401 || profileRes.status === 403) {
    maimaiSessionManager.invalidateSession(cookie);
    throw new AuthError(`invalid or expired session cookie (HTTP ${profileRes.status})`);
  }
  if (!profileRes.ok) {
    throw new FetchError(`maimai returned ${profileRes.status}`, profileRes.status);
  }
  const profileHtml = await profileRes.text();
  const parsedProfile = parseProfile(profileHtml, server);

  // Cosmetic collection pages are fetched sequentially and degrade gracefully on transient errors
  let parsedNameplate: string | null = null;
  let parsedFrame: string | null = null;
  let parsedCircle: MaimaiProfileExtended['circle'] = null;

  const fetchOptionalHtml = async (url: string): Promise<string | null> => {
    try {
      const res = await maimaiFetch(url, sessionCookie);
      if (res.status === 401 || res.status === 403) {
        maimaiSessionManager.invalidateSession(cookie);
        throw new AuthError(`invalid or expired session cookie (HTTP ${res.status})`);
      }
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      if (err instanceof AuthError) throw err;
      console.warn(`[PROFILE_OPTIONAL_SKIP] ${url}:`, err instanceof Error ? err.message : err);
      return null;
    }
  };

  const nameplateHtml = await fetchOptionalHtml(`${baseUrl}/collection/nameplate/`);
  if (nameplateHtml) parsedNameplate = parseActiveCollection(nameplateHtml, server);

  const frameHtml = await fetchOptionalHtml(`${baseUrl}/collection/frame/`);
  if (frameHtml) parsedFrame = parseActiveCollection(frameHtml, server);

  const circleHtml = await fetchOptionalHtml(`${baseUrl}/circle/`);
  if (circleHtml) parsedCircle = parseCircle(circleHtml, server);

  return {
    ...parsedProfile,
    nameplate: parsedNameplate,
    frame: parsedFrame,
    circle: parsedCircle,
  };
}

function rateScore(score: ScoreData, chart: OtogeDbChart, currentVersion: number): RatedScore {
  return {
    ...score,
    internalLevel: chart.internalLevel,
    addedVersion: chart.addedVersion,
    rating: calculateSongRating(score.achievement, chart.internalLevel, currentVersion, score.fc),
    jacket: getJacketUrl(chart.imageUrl),
  };
}

function toRatingSong(score: RatedScore): MaimaiRating['newRatingSongs'][number] {
  return {
    name: score.songName,
    type: score.type,
    difficulty: score.difficulty,
    level: score.level,
    internalLevel: score.internalLevel,
    achievement: score.achievement / 10000,
    dxScore: score.dxScore,
    rating: score.rating,
    jacket: score.jacket,
    combo: {
      type: score.fc,
      image: getFcImageUrl(score.fc),
    },
    sync: {
      type: score.fs,
      image: getFsImageUrl(score.fs),
    },
  };
}

function estimateLevelFromLabel(level: string): number {
  const trimmed = level.trim();
  const isPlus = trimmed.endsWith('+');
  const base = Number.parseFloat(trimmed.replace('+', ''));
  if (!Number.isFinite(base)) return 0;
  return isPlus ? base + 0.6 : base;
}

export async function getMaimaiRating(
  _server: MaimaiServer,
  cookie: string,
  includeAll = false
): Promise<MaimaiRating> {
  const sessionCookie = await maimaiSessionManager.resolveSessionCookie(cookie);

  const [otogeDb, scores] = await Promise.all([
    fetchOtogeDbSongs(),
    fetchAllScoreData(sessionCookie),
  ]);

  const ratedScores: RatedScore[] = [];
  const unmatchedScores: RatedScore[] = [];
  for (const score of scores) {
    const chart = findChart(otogeDb, score);
    if (!chart) {
      unmatchedScores.push({
        ...score,
        internalLevel: estimateLevelFromLabel(score.level),
        addedVersion: 0,
        rating: 0,
        jacket: getJacketUrl(score.imageUrl),
      });
      continue;
    }
    ratedScores.push(rateScore(score, chart, otogeDb.currentVersion));
  }

  const { newRatingSongs, oldRatingSongs, rating } = computeRatingSongs(
    ratedScores,
    otogeDb.currentVersion
  );

  if (!includeAll) {
    return {
      rating,
      newRatingSongs: newRatingSongs.map(toRatingSong),
      oldRatingSongs: oldRatingSongs.map(toRatingSong),
    };
  }

  const versionThreshold =
    otogeDb.currentVersion >= MAIMAI_TWO_VERSION_NEW_THRESHOLD
      ? otogeDb.currentVersion - 1
      : otogeDb.currentVersion;

  const b50Set = new Set(
    [...newRatingSongs, ...oldRatingSongs].map((s) => `${s.songName}@${s.type}@${s.difficulty}`)
  );

  const allScores = [...ratedScores, ...unmatchedScores]
    .toSorted((a, b) =>
      b.rating !== a.rating ? b.rating - a.rating : b.achievement - a.achievement
    )
    .map((score) => ({
      ...toRatingSong(score),
      bucket: (score.addedVersion >= versionThreshold ? 'new' : 'old') as 'new' | 'old',
      isInBest50: b50Set.has(`${score.songName}@${score.type}@${score.difficulty}`),
    }));

  return {
    rating,
    newRatingSongs: newRatingSongs.map(toRatingSong),
    oldRatingSongs: oldRatingSongs.map(toRatingSong),
    allScores,
  };
}

export async function getMaimaiRecentPlays(
  server: MaimaiServer,
  cookie: string
): Promise<MaimaiRecentPlay[]> {
  const sessionCookie = await maimaiSessionManager.resolveSessionCookie(cookie);

  const baseUrl = MAIMAI_URLS[server];
  const res = await maimaiFetch(`${baseUrl}/record/`, sessionCookie);

  if (res.status === 401 || res.status === 403) {
    maimaiSessionManager.invalidateSession(cookie);
    throw new AuthError(`invalid or expired session cookie (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new FetchError(`maimai returned ${res.status}`, res.status);
  }

  const html = await res.text();
  return parseRecentPlays(html);
}

export async function getMaimaiPlayDetail(
  server: MaimaiServer,
  cookie: string,
  idx: string
): Promise<MaimaiPlayDetail> {
  const sessionCookie = await maimaiSessionManager.resolveSessionCookie(cookie);

  const baseUrl = MAIMAI_URLS[server];
  const res = await maimaiFetch(
    `${baseUrl}/record/playlogDetail/?idx=${encodeURIComponent(idx)}`,
    sessionCookie
  );

  if (res.status === 401 || res.status === 403) {
    maimaiSessionManager.invalidateSession(cookie);
    throw new AuthError(`invalid or expired session cookie (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new FetchError(`maimai returned ${res.status}`, res.status);
  }

  const html = await res.text();
  return parsePlaylogDetail(html, idx);
}

export async function getMaimaiPhotos(
  server: MaimaiServer,
  cookie: string
): Promise<MaimaiPhoto[]> {
  const sessionCookie = await maimaiSessionManager.resolveSessionCookie(cookie);
  const baseUrl = MAIMAI_URLS[server];
  const res = await maimaiFetch(`${baseUrl}/photo/`, sessionCookie);

  if (res.status === 401 || res.status === 403) {
    maimaiSessionManager.invalidateSession(cookie);
    throw new AuthError(`invalid or expired session cookie (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new FetchError(`maimai returned ${res.status}`, res.status);
  }

  const html = await res.text();
  return parsePhotoAlbum(html, server);
}

export async function fetchMaimaiPhotoImage(
  server: MaimaiServer,
  cookie: string,
  imageUrl: string
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const allowedOrigin = new URL(MAIMAI_URLS[server]).origin;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new FetchError('invalid photo image URL', 400);
  }
  if (parsedUrl.origin !== allowedOrigin) {
    throw new FetchError(`photo image URL must belong to ${allowedOrigin}`, 400);
  }

  const sessionCookie = await maimaiSessionManager.resolveSessionCookie(cookie);
  const res = await maimaiFetch(parsedUrl.toString(), sessionCookie, {
    headers: {
      Accept: 'image/*,*/*;q=0.8',
    },
  });

  if (res.status === 401 || res.status === 403) {
    maimaiSessionManager.invalidateSession(cookie);
    throw new AuthError(`invalid or expired session cookie (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new FetchError(`maimai returned ${res.status} while fetching photo`, res.status);
  }

  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}

export async function getMaimaiCollection(
  server: MaimaiServer,
  cookie: string,
  category: MaimaiCollectionCategory
): Promise<MaimaiCollectionResponse> {
  const sessionCookie = await maimaiSessionManager.resolveSessionCookie(cookie);
  const baseUrl = MAIMAI_URLS[server];
  const pageUrl = `${baseUrl}${COLLECTION_PATHS[category]}`;
  const res = await maimaiFetch(pageUrl, sessionCookie);

  if (res.status === 401 || res.status === 403) {
    maimaiSessionManager.invalidateSession(cookie);
    throw new AuthError(`invalid or expired session cookie (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new FetchError(`maimai returned ${res.status}`, res.status);
  }

  const html = await res.text();
  return parseCollectionPage(html, category, server);
}

export async function equipMaimaiCollection(
  server: MaimaiServer,
  cookie: string,
  category: MaimaiCollectionCategory,
  idx: string
): Promise<MaimaiEquipResult> {
  const sessionCookie = await maimaiSessionManager.resolveSessionCookie(cookie);
  const baseUrl = MAIMAI_URLS[server];
  const pageUrl = `${baseUrl}${COLLECTION_PATHS[category]}`;

  const getRes = await maimaiFetch(pageUrl, sessionCookie);
  if (getRes.status === 401 || getRes.status === 403) {
    maimaiSessionManager.invalidateSession(cookie);
    throw new AuthError(`invalid or expired session cookie (HTTP ${getRes.status})`);
  }
  if (!getRes.ok) {
    throw new FetchError(`maimai returned ${getRes.status}`, getRes.status);
  }

  const pageHtml = await getRes.text();
  const { actionUrl, body } = extractEquipForm(pageHtml, idx, pageUrl);

  const postRes = await maimaiFetch(actionUrl, sessionCookie, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: pageUrl,
    },
    body: body.toString(),
  });

  if (postRes.status === 401 || postRes.status === 403) {
    maimaiSessionManager.invalidateSession(cookie);
    throw new AuthError(`invalid or expired session cookie (HTTP ${postRes.status})`);
  }
  if (!postRes.ok) {
    throw new FetchError(
      `maimai returned ${postRes.status} while equipping cosmetic`,
      postRes.status
    );
  }

  const resultHtml = await postRes.text();
  const parsedAfter = parseCollectionPage(resultHtml, category, server);

  return {
    category,
    idx,
    equipped: parsedAfter.equipped,
  };
}

export * from '@/lib/games/maimai/assets';
export * from '@/lib/games/maimai/auth';
export * from '@/lib/games/maimai/consts';
export * from '@/lib/games/maimai/cookies';
export * from '@/lib/games/maimai/http';
export * from '@/lib/games/maimai/schemas';
