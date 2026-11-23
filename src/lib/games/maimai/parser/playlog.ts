import { load } from 'cheerio';

import { ParseError } from '@/lib/errors';
import { getFcImageUrl, getFsImageUrl, getJacketUrl } from '@/lib/games/maimai/assets';
import type { Difficulty } from '@/lib/games/maimai/consts';
import { basenameFromUrl, normalizeName } from '@/lib/games/maimai/parser/name';
import type {
  JudgementCounts,
  MaimaiJudgements,
  MaimaiPlayDetail,
  MaimaiRecentPlay,
} from '@/lib/games/maimai/schemas';

function iconStem(src: string | undefined): string | null {
  if (!src) return null;
  const clean = src.split('?')[0] ?? src;
  const filename = clean.split('/').pop() ?? '';
  if (!filename || filename.includes('dummy')) return null;
  return filename.replace(/\.[^.]+$/, '').toLowerCase();
}

export function parsePlaylogFc(src: string | undefined): string | null {
  const stem = iconStem(src);
  if (!stem) return null;
  if (stem.includes('applus') || stem.endsWith('_app') || stem === 'app') return 'ap+';
  if (stem.endsWith('_ap') || stem === 'ap') return 'ap';
  if (stem.includes('fcplus') || stem.endsWith('_fcp') || stem === 'fcp') return 'fc+';
  if (stem.endsWith('_fc') || stem === 'fc') return 'fc';
  return null;
}

export function parsePlaylogFs(src: string | undefined): string | null {
  const stem = iconStem(src);
  if (!stem) return null;
  if (stem.includes('fsdplus') || stem.includes('fdxp') || stem.includes('fsdp')) {
    return 'fdx+';
  }
  if (stem.endsWith('_fsd') || stem.endsWith('_fdx') || stem === 'fsd' || stem === 'fdx') {
    return 'fdx';
  }
  if (stem.includes('fsplus') || stem.endsWith('_fsp') || stem === 'fsp') return 'fs+';
  if (stem.endsWith('_fs') || stem === 'fs') return 'fs';
  if (stem.endsWith('_sync') || stem === 'sync') return 'sync';
  return null;
}

export function parsePlaylogDifficulty(src: string | undefined): Difficulty | null {
  const stem = iconStem(src);
  if (!stem) return null;
  if (stem.includes('basic')) return 'basic';
  if (stem.includes('advanced')) return 'advanced';
  if (stem.includes('expert')) return 'expert';
  if (stem.includes('remaster')) return 'remaster';
  if (stem.includes('master')) return 'master';
  return null;
}

function parseChartTypeFromSrc(src: string | undefined): 'std' | 'dx' | null {
  if (!src) return null;
  if (src.includes('music_dx')) return 'dx';
  if (src.includes('music_standard')) return 'std';
  return null;
}

function resolveJacketUrl(src: string | undefined): string | null {
  if (!src) return null;
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }
  if (src.startsWith('/')) {
    return `https://maimaidx-eng.com${src}`;
  }
  return getJacketUrl(basenameFromUrl(src));
}

function extractSongName($el: ReturnType<ReturnType<typeof load>>): string {
  const nameEl = $el
    .find('.basic_block.m_5.m_t_17.m_r_60.p_5.p_l_10.f_13.break, .basic_block.m_5.p_5.f_13')
    .first();
  if (nameEl.length === 0) return '';

  const directText = nameEl
    .contents()
    .filter((_, node) => node.type === 'text')
    .map((_, node) => ('data' in node ? String(node.data) : ''))
    .get()
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (directText) return directText;
  return nameEl.text().replace(/\s+/g, ' ').trim();
}

function parseDxScorePair(text: string): { dxScore: number; maxDxScore: number | null } {
  const match = text.match(/([\d,]+)\s*\/\s*([\d,]+)/);
  if (!match) return { dxScore: 0, maxDxScore: null };
  const dxScore = Number((match[1] ?? '0').replace(/,/g, ''));
  const maxDxScore = Number((match[2] ?? '0').replace(/,/g, ''));
  return {
    dxScore: Number.isFinite(dxScore) ? dxScore : 0,
    maxDxScore: Number.isFinite(maxDxScore) ? maxDxScore : null,
  };
}

function parseSubTitleMeta($root: ReturnType<ReturnType<typeof load>>): {
  track: string | null;
  playedAt: string | null;
} {
  const spans = $root.find('.sub_title span');
  if (spans.length === 0) return { track: null, playedAt: null };
  let track: string | null = null;
  let playedAt: string | null = null;

  spans.each((_, el) => {
    const text = $root.find(el).length > 0 ? $root.find(el).text().trim() : '';
    const raw =
      (el.children ?? [])
        .map((c) => ('data' in c ? String(c.data) : ''))
        .join('')
        .trim() || text;
    if (/^\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}$/.test(raw)) {
      playedAt = raw;
    } else if (/^TRACK\s*\d+/i.test(raw)) {
      track = raw;
    }
  });

  if (!track && spans.length >= 1) {
    const first = spans.eq(0).text().trim();
    if (first && !/^\d{4}\//.test(first)) track = first;
  }
  if (!playedAt && spans.length >= 2) {
    const last = spans.last().text().trim();
    if (last) playedAt = last;
  }
  return { track, playedAt };
}

function extractComboAndSync($imgs: ReturnType<ReturnType<typeof load>>): {
  fc: string | null;
  fs: string | null;
} {
  let fc: string | null = null;
  let fs: string | null = null;
  $imgs.each((_, el) => {
    const src = el.attribs?.src;
    const parsedFc = parsePlaylogFc(src);
    if (parsedFc) fc = parsedFc;
    const parsedFs = parsePlaylogFs(src);
    if (parsedFs) fs = parsedFs;
  });
  return { fc, fs };
}

export function parseRecentPlays(html: string): MaimaiRecentPlay[] {
  const $ = load(html);
  const cards = $('.p_10.t_l.f_0.v_b');
  const plays: MaimaiRecentPlay[] = [];

  cards.each((index, element) => {
    const card = $(element);
    const diffSrc = card.find('img.playlog_diff').attr('src');
    const difficulty = parsePlaylogDifficulty(diffSrc);
    if (!difficulty) return; // Skip Utage or unrecognised

    const typeSrc = card.find('img.playlog_music_kind_icon, img.music_kind_icon').attr('src');
    const type = parseChartTypeFromSrc(typeSrc);
    if (!type) return;

    const name = extractSongName(card);
    if (!name) return;

    const achvText = card.find('.playlog_achievement_txt').first().text().trim();
    const achvMatch = achvText.match(/(\d+(?:\.\d+)?)%/);
    if (!achvMatch) return;
    const achievement = Number(achvMatch[1]);
    if (!Number.isFinite(achievement) || achievement > 101) return;

    const idx = card.find('input[name="idx"]').attr('value')?.trim() || String(index);
    const dxText = card
      .find('.playlog_score_block .white, .playlog_score_block')
      .first()
      .text()
      .trim();
    const { dxScore, maxDxScore } = parseDxScorePair(dxText);
    const { track, playedAt } = parseSubTitleMeta(card);
    const isNewRecord = card.find('img.playlog_achievement_newrecord').length > 0;
    const jacket = resolveJacketUrl(card.find('img.music_img').attr('src'));
    const { fc, fs } = extractComboAndSync(card.find('.playlog_result_innerblock img'));

    plays.push({
      idx,
      name,
      normalizedName: normalizeName(name),
      type,
      difficulty,
      achievement,
      dxScore,
      maxDxScore,
      track,
      playedAt,
      isNewRecord,
      jacket,
      combo: {
        type: fc,
        image: getFcImageUrl(fc),
      },
      sync: {
        type: fs,
        image: getFsImageUrl(fs),
      },
    });
  });

  return plays;
}

function parseJudgementRow(cells: string[]): JudgementCounts | null {
  const hasAnyNumber = cells.some((c) => /\d+/.test(c));
  if (!hasAnyNumber) return null;
  const nums = cells.map((c) => {
    const cleaned = c.replace(/,/g, '').trim();
    const parsed = Number.parseInt(cleaned, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });
  return {
    criticalPerfect: nums[0] ?? 0,
    perfect: nums[1] ?? 0,
    great: nums[2] ?? 0,
    good: nums[3] ?? 0,
    miss: nums[4] ?? 0,
  };
}

export function parsePlaylogDetail(html: string, idx: string): MaimaiPlayDetail {
  const $ = load(html);
  const notesTable = $('.playlog_notes_detail');
  if (notesTable.length === 0) {
    throw new ParseError('missing .playlog_notes_detail table in playlogDetail HTML');
  }

  const dataRows = notesTable
    .find('tr')
    .slice(1)
    .filter((_, tr) => $(tr).find('td').length >= 5);
  if (dataRows.length < 5) {
    throw new ParseError(
      `expected at least 5 note breakdown rows in .playlog_notes_detail, found ${dataRows.length}`
    );
  }

  const parsedRows: (JudgementCounts | null)[] = [];
  for (let i = 0; i < 5; i++) {
    const row = dataRows.eq(i);
    const cells: string[] = [];
    for (let j = 0; j < 5; j++) {
      cells.push(row.find('td').eq(j).text().trim());
    }
    parsedRows.push(parseJudgementRow(cells));
  }

  const notes = {
    tap: parsedRows[0] ?? null,
    hold: parsedRows[1] ?? null,
    slide: parsedRows[2] ?? null,
    touch: parsedRows[3] ?? null,
    break: parsedRows[4] ?? null,
  };

  const totals: JudgementCounts = {
    criticalPerfect: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
  };
  for (const row of parsedRows) {
    if (!row) continue;
    totals.criticalPerfect += row.criticalPerfect;
    totals.perfect += row.perfect;
    totals.great += row.great;
    totals.good += row.good;
    totals.miss += row.miss;
  }

  const judgements: MaimaiJudgements = { totals, notes };

  const diffSrc = $('img.playlog_diff').first().attr('src');
  const difficulty = parsePlaylogDifficulty(diffSrc);
  if (!difficulty) {
    throw new ParseError('unable to parse difficulty in playlogDetail HTML');
  }

  const typeSrc = $('img.playlog_music_kind_icon, img.music_kind_icon').first().attr('src');
  const type = parseChartTypeFromSrc(typeSrc);
  if (!type) {
    throw new ParseError('unable to parse chart type in playlogDetail HTML');
  }

  const name = extractSongName($.root());
  if (!name) {
    throw new ParseError('unable to parse song name in playlogDetail HTML');
  }

  const achvText = $('.playlog_achievement_txt').first().text().trim();
  const achvMatch = achvText.match(/(\d+(?:\.\d+)?)%/);
  if (!achvMatch) {
    throw new ParseError('unable to parse achievement in playlogDetail HTML');
  }
  const achievement = Number(achvMatch[1]);

  const dxScoreEl = $('.playlog_score_block')
    .filter((_, el) => $(el).closest('.col2').length === 0)
    .find('.white')
    .first();
  let dxScore: number | null = null;
  let maxDxScore: number | null = null;
  if (dxScoreEl.length > 0) {
    const dxMatch = dxScoreEl
      .text()
      .trim()
      .match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (dxMatch) {
      dxScore = Number((dxMatch[1] ?? '0').replace(/,/g, ''));
      maxDxScore = Number((dxMatch[2] ?? '0').replace(/,/g, ''));
    }
  }

  // Max combo is in .col2 .playlog_score_block .white or .f_r.f_14.white (separate from DX score)
  let maxCombo: number | null = null;
  let totalCombo: number | null = null;
  const comboEl = $('.col2 .playlog_score_block .white, .f_r.f_14.white').first();
  if (comboEl.length > 0) {
    const comboMatch = comboEl
      .text()
      .trim()
      .match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (comboMatch) {
      maxCombo = Number((comboMatch[1] ?? '0').replace(/,/g, ''));
      totalCombo = Number((comboMatch[2] ?? '0').replace(/,/g, ''));
    }
  }

  // Fast / Late counts
  let fast: number | null = null;
  let late: number | null = null;
  const flElems = $('.w_96.f_l.t_r');
  if (flElems.length >= 2) {
    const fVal = Number.parseInt(flElems.eq(0).text().replace(/,/g, '').trim(), 10);
    const lVal = Number.parseInt(flElems.eq(1).text().replace(/,/g, '').trim(), 10);
    if (Number.isFinite(fVal)) fast = fVal;
    if (Number.isFinite(lVal)) late = lVal;
  }

  const { playedAt } = parseSubTitleMeta($.root());
  const jacket = resolveJacketUrl($('img.music_img').first().attr('src'));
  const { fc, fs } = extractComboAndSync($('.playlog_result_innerblock img'));

  return {
    idx,
    name,
    normalizedName: normalizeName(name),
    type,
    difficulty,
    achievement,
    dxScore,
    maxDxScore,
    playedAt,
    jacket,
    combo: {
      type: fc,
      image: getFcImageUrl(fc),
    },
    sync: {
      type: fs,
      image: getFsImageUrl(fs),
    },
    maxCombo,
    totalCombo,
    fast,
    late,
    judgements,
  };
}
