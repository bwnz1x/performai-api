import { load } from 'cheerio';

import {
  DIFFICULTIES,
  type Difficulty,
  MAIMAI_URLS,
  type MaimaiServer,
} from '@/lib/games/maimai/consts';
import type { MaimaiPhoto } from '@/lib/games/maimai/schemas';

const DIFF_CLASS_REGEX = /music_(\w+)_score_back/i;
const DATE_REGEX = /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/;

function resolveUrl(src: string | undefined, server: MaimaiServer): string | null {
  if (!src) return null;
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const base = MAIMAI_URLS[server];
  if (trimmed.startsWith('/')) {
    return `${new URL(base).origin}${trimmed}`;
  }
  return new URL(trimmed, `${base}/photo/`).toString();
}

function parseDifficultyFromClass(className: string | undefined): Difficulty | null {
  if (!className) return null;
  const match = className.match(DIFF_CLASS_REGEX);
  const raw = match?.[1]?.toLowerCase();
  if (!raw) return null;
  if ((DIFFICULTIES as readonly string[]).includes(raw)) {
    return raw as Difficulty;
  }
  return null;
}

function sanitizeFileSegment(input: string): string {
  return input
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+|[_-]+$/g, '')
    .slice(0, 80);
}

function buildSuggestedFileName(
  songName: string,
  difficulty: Difficulty | null,
  playedAt: string | null
): string {
  const datePart = playedAt
    ? playedAt.replace(/\//g, '-').replace(/\s+/g, '_').replace(/:/g, '')
    : 'maimai_photo';
  const songPart = sanitizeFileSegment(songName) || 'photo';
  const diffPart = difficulty ? `_${difficulty.toUpperCase()}` : '';
  return `${datePart}_${songPart}${diffPart}.jpg`;
}

function stablePhotoId(imageUrl: string, playedAt: string | null, index: number): string {
  const lastSegment = imageUrl.split('/').pop()?.split('?')[0] ?? '';
  const stem = lastSegment.replace(/\.[^.]+$/, '');
  if (stem && stem.length >= 6) {
    return stem;
  }
  const dateCompact = (playedAt ?? '').replace(/\D+/g, '');
  return `photo_${dateCompact || index}_${index}`;
}

export function parsePhotoAlbum(html: string, server: MaimaiServer): MaimaiPhoto[] {
  const $ = load(html);
  const photos: MaimaiPhoto[] = [];
  const seenUrls = new Set<string>();

  $('.black_block').each((index, el) => {
    const blackBlock = $(el);
    const row = blackBlock.parent();
    if (row.length === 0) return;

    const img =
      row.find('img.w_430').first().length > 0
        ? row.find('img.w_430').first()
        : row.find('img[src*="photo"], img[src*="Photo"], img').first();
    const imageUrl = resolveUrl(img.attr('src'), server);
    if (!imageUrl || seenUrls.has(imageUrl)) return;
    seenUrls.add(imageUrl);

    const songName = blackBlock.text().replace(/\s+/g, ' ').trim() || 'Unknown Song';
    const infoText = row.find('.block_info').first().text().trim();
    const dateMatch = infoText.match(DATE_REGEX);
    const playedAt = dateMatch
      ? `${dateMatch[1]}/${dateMatch[2]!.padStart(2, '0')}/${dateMatch[3]!.padStart(2, '0')} ${dateMatch[4]!.padStart(2, '0')}:${dateMatch[5]}`
      : null;

    const difficulty = parseDifficultyFromClass(row.attr('class'));

    photos.push({
      id: stablePhotoId(imageUrl, playedAt, index),
      songName,
      difficulty,
      playedAt,
      imageUrl,
      suggestedFileName: buildSuggestedFileName(songName, difficulty, playedAt),
    });
  });

  return photos;
}
