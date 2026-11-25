import { describe, expect, it } from 'bun:test';

import { ParseError } from '@/lib/errors';
import { extractEquipForm, parseCollectionPage } from '@/lib/games/maimai/parser/collection';

const SAMPLE_NAMEPLATE_HTML = `
  <div class="town_block m_15 p_15 t_l">
    <div class="collection_name_block">PRiSM PLUS Plate</div>
    <img class="w_396 m_r_10" src="/maimai-mobile/img/Nameplate/plate_101.png" />
  </div>
  <div class="screw_block">PRiSM PLUS</div>
  <div class="see_through_block p_10 m_10">
    <div class="collection_name_block">PRiSM PLUS Plate</div>
    <div class="f_12">Obtained during PRiSM PLUS</div>
    <img class="w_396" src="/maimai-mobile/img/Nameplate/plate_101.png" />
    <form action="/maimai-mobile/collection/nameplate/change/" method="post">
      <input type="hidden" name="idx" value="101" />
      <input type="hidden" name="token" value="csrf_abc" />
    </form>
  </div>
  <div class="see_through_block p_10 m_10">
    <div class="collection_name_block">CiRCLE Plate</div>
    <img class="w_396" src="/maimai-mobile/img/Nameplate/plate_202.png" />
    <form action="/maimai-mobile/collection/nameplate/change/" method="post">
      <input type="hidden" name="idx" value="202" />
      <input type="hidden" name="token" value="csrf_xyz" />
    </form>
  </div>
`;

const SAMPLE_TROPHY_HTML = `
  <div class="town_block m_15 p_15 t_l">
    <div class="trophy_block trophy_Rainbow">
      <div class="trophy_inner_block">Legend of PRiSM</div>
    </div>
  </div>
  <div class="screw_block">Special</div>
  <div class="see_through_block p_10 m_10">
    <div class="trophy_block trophy_Rainbow">
      <div class="trophy_inner_block">Legend of PRiSM</div>
    </div>
    <form action="/maimai-mobile/collection/change/" method="post">
      <input type="hidden" name="idx" value="9001" />
      <input type="hidden" name="token" value="tok_1" />
    </form>
  </div>
  <div class="see_through_block p_10 m_10">
    <div class="trophy_block trophy_Gold">
      <div class="trophy_inner_block">SSS Master</div>
    </div>
    <form action="/maimai-mobile/collection/change/" method="post">
      <input type="hidden" name="idx" value="9002" />
      <input type="hidden" name="token" value="tok_2" />
    </form>
  </div>
`;

describe('parseCollectionPage', () => {
  it('parses nameplate items, groups, and equipped status', () => {
    const res = parseCollectionPage(SAMPLE_NAMEPLATE_HTML, 'nameplate', 'intl');
    expect(res.category).toBe('nameplate');
    expect(res.items).toHaveLength(2);
    expect(res.items[0]?.idx).toBe('101');
    expect(res.items[0]?.group).toBe('PRiSM PLUS');
    expect(res.items[0]?.isEquipped).toBe(true);
    expect(res.items[0]?.canEquip).toBe(true);
    expect(res.items[0]?.imageUrl).toBe(
      'https://maimaidx-eng.com/maimai-mobile/img/Nameplate/plate_101.png'
    );
    expect(res.items[1]?.idx).toBe('202');
    expect(res.items[1]?.isEquipped).toBe(false);
    expect(res.equipped?.idx).toBe('101');
  });

  it('parses trophy items and rarity types', () => {
    const res = parseCollectionPage(SAMPLE_TROPHY_HTML, 'trophy', 'intl');
    expect(res.items).toHaveLength(2);
    expect(res.items[0]?.trophyType).toBe('rainbow');
    expect(res.items[0]?.isEquipped).toBe(true);
    expect(res.items[1]?.trophyType).toBe('gold');
    expect(res.items[1]?.name).toBe('SSS Master');
  });

  it('parses arbitrary wrapper divs and button[name="idx"] forms', () => {
    const html = `
      <div class="screw_block">Events</div>
      <div class="custom_item_row p_10">
        <img class="w_80" src="/maimai-mobile/img/Icon/icon_55.png" />
        <div class="f_14">Event Salt</div>
        <form action="/maimai-mobile/collection/change/" method="post">
          <input type="hidden" name="token" value="tok_55" />
          <button type="submit" name="idx" value="55">Set</button>
        </form>
      </div>
    `;
    const res = parseCollectionPage(html, 'icon', 'intl');
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.idx).toBe('55');
    expect(res.items[0]?.name).toBe('Event Salt');
    expect(res.items[0]?.group).toBe('Events');
    expect(res.items[0]?.imageUrl).toBe(
      'https://maimaidx-eng.com/maimai-mobile/img/Icon/icon_55.png'
    );

    const extracted = extractEquipForm(
      html,
      '55',
      'https://maimaidx-eng.com/maimai-mobile/collection/'
    );
    expect(extracted.body.get('idx')).toBe('55');
    expect(extracted.body.get('token')).toBe('tok_55');
  });
});

describe('extractEquipForm', () => {
  it('extracts resolved action URL and hidden form inputs including CSRF token', () => {
    const extracted = extractEquipForm(
      SAMPLE_NAMEPLATE_HTML,
      '202',
      'https://maimaidx-eng.com/maimai-mobile/collection/nameplate/'
    );
    expect(extracted.actionUrl).toBe(
      'https://maimaidx-eng.com/maimai-mobile/collection/nameplate/change/'
    );
    expect(extracted.body.get('idx')).toBe('202');
    expect(extracted.body.get('token')).toBe('csrf_xyz');
  });

  it('throws ParseError when idx is not present', () => {
    expect(() =>
      extractEquipForm(
        SAMPLE_NAMEPLATE_HTML,
        '999',
        'https://maimaidx-eng.com/maimai-mobile/collection/nameplate/'
      )
    ).toThrow(ParseError);
  });
});
