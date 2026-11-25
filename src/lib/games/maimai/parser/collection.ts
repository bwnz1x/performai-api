import { load } from 'cheerio';

import { ParseError } from '@/lib/errors';
import { MAIMAI_URLS, type MaimaiServer } from '@/lib/games/maimai/consts';
import type {
  MaimaiCollectionCategory,
  MaimaiCollectionItem,
  MaimaiCollectionResponse,
} from '@/lib/games/maimai/schemas';

export const COLLECTION_PATHS: Record<MaimaiCollectionCategory, string> = {
  icon: '/collection/',
  trophy: '/collection/trophy/',
  nameplate: '/collection/nameplate/',
  frame: '/collection/frame/',
  partner: '/collection/partner/',
};

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
  return new URL(trimmed, `${base}/collection/`).toString();
}

function parseTrophyType(className: string | undefined): MaimaiCollectionItem['trophyType'] {
  if (!className) return null;
  const lower = className.toLowerCase();
  if (lower.includes('trophy_rainbow')) return 'rainbow';
  if (lower.includes('trophy_gold')) return 'gold';
  if (lower.includes('trophy_silver')) return 'silver';
  if (lower.includes('trophy_bronze')) return 'bronze';
  if (lower.includes('trophy_normal')) return 'normal';
  return null;
}

function extractCollectionImage(
  $container: ReturnType<ReturnType<typeof load>>,
  category: MaimaiCollectionCategory,
  server: MaimaiServer
): string | null {
  if (category === 'trophy') return null;

  const preferredSelectors =
    category === 'nameplate' || category === 'frame'
      ? ['img.w_396', 'img.w_300', 'img[src*="nameplate"]', 'img[src*="frame"]', 'img']
      : category === 'partner'
        ? ['img[src*="partner"]', 'img.w_112', 'img.w_80', 'img']
        : ['img[src*="icon"]', 'img.w_112', 'img.w_80', 'img'];

  for (const selector of preferredSelectors) {
    const imgs = $container.find(selector);
    for (let i = 0; i < imgs.length; i++) {
      const src = imgs.eq(i).attr('src');
      if (!src) continue;
      // Skip UI button images
      if (
        src.includes('btn_') ||
        src.includes('line_') ||
        src.includes('icon_star') ||
        src.includes('favorite')
      ) {
        continue;
      }
      const resolved = resolveUrl(src, server);
      if (resolved) return resolved;
    }
  }
  return null;
}

function extractItemName(
  $container: ReturnType<ReturnType<typeof load>>,
  category: MaimaiCollectionCategory
): string {
  if (category === 'trophy') {
    const trophyText = $container
      .find('.trophy_inner_block, .trophy_block')
      .first()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    if (trophyText) return trophyText;
  }

  const candidates = [
    '.collection_name_block',
    '.f_14.break',
    '.f_14',
    '.f_13.break',
    '.f_13',
    '.p_5.f_14',
  ];
  for (const selector of candidates) {
    const text = $container.find(selector).first().text().replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

function extractDescription($container: ReturnType<ReturnType<typeof load>>): string | null {
  const candidates = ['.collection_info_block', '.f_12.break', '.f_12', '.f_11'];
  for (const selector of candidates) {
    const text = $container.find(selector).first().text().replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return null;
}

function parseEquippedBlock(
  $: ReturnType<typeof load>,
  category: MaimaiCollectionCategory,
  server: MaimaiServer
): MaimaiCollectionItem | null {
  const townBlock = $('.town_block').first();
  if (townBlock.length === 0) return null;

  const imageUrl = extractCollectionImage(townBlock, category, server);
  const trophyEl = townBlock.find('.trophy_block').first();
  const trophyType = category === 'trophy' ? parseTrophyType(trophyEl.attr('class')) : null;
  const name = extractItemName(townBlock, category) || (category === 'trophy' ? '' : 'Equipped');
  const description = extractDescription(townBlock);

  if (!imageUrl && !name) return null;

  return {
    idx: 'equipped',
    category,
    name,
    description,
    imageUrl,
    trophyType,
    group: null,
    isEquipped: true,
    canEquip: false,
  };
}

export function parseCollectionPage(
  html: string,
  category: MaimaiCollectionCategory,
  server: MaimaiServer
): MaimaiCollectionResponse {
  const $ = load(html);
  const equipped = parseEquippedBlock($, category, server);

  const items: MaimaiCollectionItem[] = [];
  const seenKeys = new Set<string>();
  let currentGroup: string | null = null;

  const equippableContainers = $(
    '.screw_block, .see_through_block, .collection_setting_block, .w_450.m_15'
  );

  equippableContainers.each((_, element) => {
    const el = $(element);
    if (el.hasClass('screw_block')) {
      const header = el.text().replace(/\s+/g, ' ').trim();
      if (header) currentGroup = header;
      return;
    }

    // Skip the top active equipped summary block if it matched a generic selector
    if (el.hasClass('town_block') || el.closest('.town_block').length > 0) {
      return;
    }

    const form = el.find('form').first();
    const idx = form.find('input[name="idx"]').attr('value')?.trim() ?? '';
    const imageUrl = extractCollectionImage(el, category, server);
    const trophyEl = el.find('.trophy_block').first();
    const trophyType = category === 'trophy' ? parseTrophyType(trophyEl.attr('class')) : null;
    const name = extractItemName(el, category);

    if (!idx && !imageUrl && !name) return;

    const dedupeKey = idx ? `idx:${idx}` : `${name}|${imageUrl ?? ''}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);

    const hasEquippedBadge =
      el.hasClass('collection_setting_block_equipped') ||
      el.find('img[src*="btn_set."], img[src*="equipped"], .equipped').length > 0 ||
      (equipped !== null &&
        ((imageUrl !== null && equipped.imageUrl === imageUrl) ||
          (category === 'trophy' && name.length > 0 && equipped.name === name)));

    const canEquip = idx.length > 0 && form.length > 0;
    const finalName = name || (idx ? `${category} #${idx}` : 'Unknown');
    const description = extractDescription(el);

    items.push({
      idx: idx || `item_${items.length}`,
      category,
      name: finalName,
      description: description === finalName ? null : description,
      imageUrl,
      trophyType,
      group: currentGroup,
      isEquipped: hasEquippedBadge,
      canEquip,
    });
  });

  // If the equipped item wasn't matched with an idx in the list, sync its idx if possible
  const matchedEquipped = items.find((i) => i.isEquipped) ?? equipped;

  return {
    category,
    equipped: matchedEquipped,
    items,
  };
}

export interface ExtractedEquipForm {
  actionUrl: string;
  body: URLSearchParams;
}

export function extractEquipForm(html: string, idx: string, pageUrl: string): ExtractedEquipForm {
  const $ = load(html);
  let targetForm: ReturnType<typeof $> | null = null;

  $('form').each((_, formEl) => {
    if (targetForm) return;
    const form = $(formEl);
    const idxInput = form.find('input[name="idx"]').first();
    if (idxInput.attr('value')?.trim() === idx) {
      targetForm = form;
    }
  });

  if (!targetForm) {
    throw new ParseError(`collection item idx '${idx}' not found or not equippable on page`);
  }

  const form = targetForm as ReturnType<typeof $>;
  const rawAction = form.attr('action')?.trim();
  const actionUrl = rawAction
    ? new URL(rawAction, pageUrl).toString()
    : new URL('change/', pageUrl).toString();

  const body = new URLSearchParams();
  form.find('input[name]').each((_, inputEl) => {
    const input = $(inputEl);
    const name = input.attr('name');
    if (!name) return;
    const type = (input.attr('type') ?? 'text').toLowerCase();
    if ((type === 'checkbox' || type === 'radio') && !input.is(':checked')) return;
    if (type === 'submit' || type === 'button' || type === 'image') return;
    body.append(name, input.attr('value') ?? '');
  });

  if (!body.has('idx')) {
    body.set('idx', idx);
  }

  return { actionUrl, body };
}
