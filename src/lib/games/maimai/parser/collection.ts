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

function isUiChromeImage(src: string): boolean {
  const lower = src.toLowerCase();
  return (
    lower.includes('btn_') ||
    lower.includes('line_') ||
    lower.includes('icon_star') ||
    lower.includes('favorite') ||
    lower.includes('tab_') ||
    lower.includes('title_') ||
    lower.includes('arrow') ||
    lower.includes('aime')
  );
}

function isSettingHeaderText(text: string): boolean {
  const normalized = text
    .replace(/[—―ー\-_\s]+/g, ' ')
    .trim()
    .toUpperCase();
  return (
    normalized.startsWith('SETTING ') ||
    normalized === 'SETTING' ||
    normalized.includes('AIME SERVICE WEBSITE')
  );
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
      if (!src || isUiChromeImage(src)) continue;
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
    if (trophyText && !isSettingHeaderText(trophyText)) return trophyText;
  }

  const candidates = [
    '.collection_name_block',
    '.f_15.break',
    '.f_15',
    '.f_14.break',
    '.f_14',
    '.f_13.break',
    '.f_13',
    '.p_5.f_14',
    '.f_b',
  ];
  for (const selector of candidates) {
    const els = $container.find(selector);
    for (let i = 0; i < els.length; i++) {
      const text = els.eq(i).text().replace(/\s+/g, ' ').trim();
      if (text && text.length <= 120 && !isSettingHeaderText(text)) {
        return text;
      }
    }
  }
  return '';
}

function extractDescription($container: ReturnType<ReturnType<typeof load>>): string | null {
  const candidates = ['.collection_info_block', '.f_12.break', '.f_12', '.f_11'];
  for (const selector of candidates) {
    const els = $container.find(selector);
    for (let i = 0; i < els.length; i++) {
      const text = els.eq(i).text().replace(/\s+/g, ' ').trim();
      if (text && text.length <= 240 && !isSettingHeaderText(text)) {
        return text;
      }
    }
  }
  return null;
}

function extractFormItemId(
  $: ReturnType<typeof load>,
  form: ReturnType<ReturnType<typeof load>>,
  category: MaimaiCollectionCategory
): { fieldName: string; value: string } | null {
  const action = (form.attr('action') ?? '').toLowerCase();
  // Skip genre filter / search / logout forms
  if (form.find('select[name="genre"]').length > 0 || action.includes('search')) {
    return null;
  }

  const preferredNames = ['idx', 'collection', category, 'id', 'item'];
  for (const name of preferredNames) {
    const el = form.find(`input[name="${name}"], button[name="${name}"]`).first();
    const val = el.attr('value')?.trim();
    if (val) return { fieldName: name, value: val };
  }

  // Fallback: any hidden input or submit button with a non-token name inside a change/set form
  if (action.includes('change') || action.includes('set') || action.includes('collection')) {
    const fields = form.find('input[type="hidden"][name], button[name]');
    for (let i = 0; i < fields.length; i++) {
      const el = fields.eq(i);
      const name = el.attr('name')?.trim() ?? '';
      const val = el.attr('value')?.trim() ?? '';
      if (!name || !val) continue;
      if (name === 'token' || name === 'genre' || name === '_token') continue;
      return { fieldName: name, value: val };
    }
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
  const name = extractItemName(townBlock, category) || `Equipped ${category}`;
  const description = extractDescription(townBlock);

  if (!imageUrl && !name) return null;

  return {
    idx: 'equipped',
    category,
    name,
    description: description === name ? null : description,
    imageUrl,
    trophyType,
    group: null,
    isEquipped: true,
    canEquip: false,
  };
}

function findCardContainerForForm(
  $: ReturnType<typeof load>,
  form: ReturnType<ReturnType<typeof load>>,
  category: MaimaiCollectionCategory,
  server: MaimaiServer
): ReturnType<ReturnType<typeof load>> {
  const hasContent = (el: ReturnType<ReturnType<typeof load>>) => {
    if (category === 'trophy') {
      return el.find('.trophy_block, .trophy_inner_block').length > 0;
    }
    return extractCollectionImage(el, category, server) !== null;
  };

  if (hasContent(form)) return form;

  let current = form.parent();
  for (let depth = 0; depth < 3 && current.length > 0; depth++) {
    if (current.find('form').length > 1) break;
    if (hasContent(current) || extractItemName(current, category).length > 0) {
      return current;
    }
    current = current.parent();
  }

  return form.parent().length > 0 && form.parent().find('form').length === 1 ? form.parent() : form;
}

function findPrecedingGroupHeader(
  $: ReturnType<typeof load>,
  node: ReturnType<ReturnType<typeof load>>
): string | null {
  let cursor = node;
  for (let depth = 0; depth < 4 && cursor.length > 0; depth++) {
    const prevScrew = cursor.prevAll('.screw_block').first();
    if (prevScrew.length > 0) {
      const text = prevScrew.text().replace(/\s+/g, ' ').trim();
      if (text) return text;
    }
    cursor = cursor.parent();
  }
  return null;
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

  // Anchor directly on every <form> carrying an equippable item ID
  $('form').each((_, formEl) => {
    const form = $(formEl);
    if (form.closest('.town_block').length > 0) return;

    const idInfo = extractFormItemId($, form, category);
    if (!idInfo) return;

    const idx = idInfo.value;
    const dedupeKey = `idx:${idx}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);

    const card = findCardContainerForForm($, form, category, server);
    const imageUrl = extractCollectionImage(card, category, server);
    const trophyEl = card.find('.trophy_block').first();
    const trophyType = category === 'trophy' ? parseTrophyType(trophyEl.attr('class')) : null;
    const name = extractItemName(card, category) || `${category} #${idx}`;
    const description = extractDescription(card);
    const group = findPrecedingGroupHeader($, card);

    const isEquipped =
      card.hasClass('collection_setting_block_equipped') ||
      card.find('img[src*="btn_set."], img[src*="equipped"], .equipped').length > 0 ||
      (equipped !== null &&
        ((imageUrl !== null && equipped.imageUrl === imageUrl) ||
          (category === 'trophy' && name.length > 0 && equipped.name === name)));

    items.push({
      idx,
      category,
      name,
      description: description === name ? null : description,
      imageUrl,
      trophyType,
      group,
      isEquipped,
      canEquip: true,
    });
  });

  // Always include the equipped header item if it wasn't matched in the equippable list
  if (equipped && !items.some((i) => i.isEquipped)) {
    items.unshift(equipped);
  }

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

export function extractEquipForm(
  html: string,
  idx: string,
  pageUrl: string,
  category: MaimaiCollectionCategory = 'icon'
): ExtractedEquipForm {
  const $ = load(html);
  let targetForm: ReturnType<typeof $> | null = null;
  let matchedFieldName = 'idx';

  $('form').each((_, formEl) => {
    if (targetForm) return;
    const form = $(formEl);
    const idInfo = extractFormItemId($, form, category);
    if (idInfo && idInfo.value === idx) {
      targetForm = form;
      matchedFieldName = idInfo.fieldName;
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

  if (!body.has(matchedFieldName)) {
    body.set(matchedFieldName, idx);
  }

  return { actionUrl, body };
}
