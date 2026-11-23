import { describe, expect, it } from 'bun:test';

import { ParseError } from '@/lib/errors';
import {
  parsePlaylogDetail,
  parsePlaylogDifficulty,
  parsePlaylogFc,
  parsePlaylogFs,
  parseRecentPlays,
} from '@/lib/games/maimai/parser/playlog';

describe('playlog icon & difficulty helpers', () => {
  it('parses FC/AP flags and ignores dummy icons', () => {
    expect(parsePlaylogFc('/maimai-mobile/img/playlog/fc_dummy.png?ver=1.50')).toBeNull();
    expect(parsePlaylogFc('/maimai-mobile/img/playlog/fc.png')).toBe('fc');
    expect(parsePlaylogFc('/maimai-mobile/img/playlog/fcplus.png')).toBe('fc+');
    expect(parsePlaylogFc('/maimai-mobile/img/playlog/ap.png')).toBe('ap');
    expect(parsePlaylogFc('/maimai-mobile/img/playlog/applus.png')).toBe('ap+');
  });

  it('parses FS/FDX flags and ignores dummy icons', () => {
    expect(parsePlaylogFs('/maimai-mobile/img/playlog/fs_dummy.png?ver=1.50')).toBeNull();
    expect(parsePlaylogFs('/maimai-mobile/img/playlog/fs.png')).toBe('fs');
    expect(parsePlaylogFs('/maimai-mobile/img/playlog/fsplus.png')).toBe('fs+');
    expect(parsePlaylogFs('/maimai-mobile/img/playlog/fsd.png')).toBe('fdx');
    expect(parsePlaylogFs('/maimai-mobile/img/playlog/fsdplus.png')).toBe('fdx+');
    expect(parsePlaylogFs('/maimai-mobile/img/playlog/sync.png')).toBe('sync');
  });

  it('parses playlog difficulties and returns null for Utage', () => {
    expect(parsePlaylogDifficulty('/img/diff_basic.png')).toBe('basic');
    expect(parsePlaylogDifficulty('/img/diff_advanced.png')).toBe('advanced');
    expect(parsePlaylogDifficulty('/img/diff_expert.png')).toBe('expert');
    expect(parsePlaylogDifficulty('/img/diff_master.png')).toBe('master');
    expect(parsePlaylogDifficulty('/img/diff_remaster.png')).toBe('remaster');
    expect(parsePlaylogDifficulty('/img/diff_utage.png')).toBeNull();
  });
});

describe('parseRecentPlays', () => {
  it('parses DX and STD recent cards, handles commas and dummy icons, and skips Utage', () => {
    const html = `
      <div class="p_10 t_l f_0 v_b">
        <div class="sub_title t_c f_r f_11">
          <span class="f_b">TRACK 01</span>
          <span class="v_b">2026/11/20 14:25</span>
        </div>
        <img class="playlog_diff v_b" src="/maimai-mobile/img/diff_master.png" />
        <img class="playlog_music_kind_icon" src="/maimai-mobile/img/music_dx.png" />
        <div class="basic_block m_5 m_t_17 m_r_60 p_5 p_l_10 f_13 break">
          <span>ignored</span>
          KALEIDXSCOPE
        </div>
        <img class="music_img" src="https://maimaidx-eng.com/maimai-mobile/img/Music/sample_dx.png" />
        <div class="playlog_achievement_txt t_r">100.6215%</div>
        <img class="playlog_achievement_newrecord" src="/maimai-mobile/img/playlog/newrecord.png" />
        <div class="playlog_score_block"><span class="white">2,480 / 2,610</span></div>
        <div class="playlog_result_innerblock">
          <img src="/maimai-mobile/img/playlog/ap.png" />
          <img src="/maimai-mobile/img/playlog/fsd.png" />
        </div>
        <form><input type="hidden" name="idx" value="0" /></form>
      </div>
      <div class="p_10 t_l f_0 v_b">
        <div class="sub_title t_c f_r f_11">
          <span class="f_b">TRACK 02</span>
          <span class="v_b">2026/11/20 14:20</span>
        </div>
        <img class="playlog_diff v_b" src="/maimai-mobile/img/diff_remaster.png" />
        <img class="playlog_music_kind_icon" src="/maimai-mobile/img/music_standard.png" />
        <div class="basic_block m_5 p_5 f_13">PANDORA PARADOXXX</div>
        <img class="music_img" src="/maimai-mobile/img/Music/sample_std.png" />
        <div class="playlog_achievement_txt t_r">99.6120%</div>
        <div class="playlog_score_block"><span class="white">3,120 / 3,450</span></div>
        <div class="playlog_result_innerblock">
          <img src="/maimai-mobile/img/playlog/fc_dummy.png" />
          <img src="/maimai-mobile/img/playlog/fs_dummy.png" />
        </div>
        <form><input type="hidden" name="idx" value="1" /></form>
      </div>
      <div class="p_10 t_l f_0 v_b">
        <img class="playlog_diff v_b" src="/maimai-mobile/img/diff_utage.png" />
        <img class="playlog_music_kind_icon" src="/maimai-mobile/img/music_dx.png" />
        <div class="basic_block m_5 p_5 f_13">Utage Song</div>
        <div class="playlog_achievement_txt t_r">100.0000%</div>
        <form><input type="hidden" name="idx" value="2" /></form>
      </div>
    `;

    const plays = parseRecentPlays(html);
    expect(plays.length).toBe(2);

    expect(plays[0]?.idx).toBe('0');
    expect(plays[0]?.name).toBe('KALEIDXSCOPE');
    expect(plays[0]?.normalizedName).toBe('kaleidxscope');
    expect(plays[0]?.type).toBe('dx');
    expect(plays[0]?.difficulty).toBe('master');
    expect(plays[0]?.achievement).toBe(100.6215);
    expect(plays[0]?.dxScore).toBe(2480);
    expect(plays[0]?.maxDxScore).toBe(2610);
    expect(plays[0]?.track).toBe('TRACK 01');
    expect(plays[0]?.playedAt).toBe('2026/11/20 14:25');
    expect(plays[0]?.isNewRecord).toBe(true);
    expect(plays[0]?.combo.type).toBe('ap');
    expect(plays[0]?.sync.type).toBe('fdx');

    expect(plays[1]?.idx).toBe('1');
    expect(plays[1]?.type).toBe('std');
    expect(plays[1]?.difficulty).toBe('remaster');
    expect(plays[1]?.isNewRecord).toBe(false);
    expect(plays[1]?.combo.type).toBeNull();
    expect(plays[1]?.sync.type).toBeNull();
    expect(plays[1]?.jacket).toBe(
      'https://maimaidx-eng.com/maimai-mobile/img/Music/sample_std.png'
    );
  });
});

describe('parsePlaylogDetail', () => {
  it('parses DX chart judgement table, totals, fast/late, and max combo', () => {
    const html = `
      <div class="playlog_top_container">
        <div class="sub_title">
          <span class="f_b">TRACK 01</span>
          <span>2026/11/20 14:25</span>
        </div>
      </div>
      <img class="playlog_diff" src="/maimai-mobile/img/diff_master.png" />
      <img class="playlog_music_kind_icon" src="/maimai-mobile/img/music_dx.png" />
      <div class="basic_block m_5 m_t_17 m_r_60 p_5 p_l_10 f_13 break">KALEIDXSCOPE</div>
      <img class="music_img" src="/maimai-mobile/img/Music/sample_dx.png" />
      <div class="playlog_achievement_txt">100.6215%</div>
      <div class="playlog_score_block"><span class="white">2,480 / 2,610</span></div>
      <div class="col2"><div class="playlog_score_block"><span class="white">870 / 870</span></div></div>
      <div class="playlog_result_innerblock">
        <img src="/maimai-mobile/img/playlog/ap.png" />
        <img src="/maimai-mobile/img/playlog/fsd.png" />
      </div>
      <div class="playlog_fl_block">
        <div class="w_96 f_l t_r">12</div>
        <div class="w_96 f_l t_r">8</div>
      </div>
      <table class="playlog_notes_detail t_r f_l f_11 f_b">
        <tr><th></th><th>CP</th><th>P</th><th>GR</th><th>GD</th><th>M</th></tr>
        <tr><th>TAP</th><td>410</td><td>25</td><td>0</td><td>0</td><td>0</td></tr>
        <tr><th>HOLD</th><td>60</td><td>4</td><td>0</td><td>0</td><td>0</td></tr>
        <tr><th>SLIDE</th><td>180</td><td>10</td><td>0</td><td>0</td><td>0</td></tr>
        <tr><th>TOUCH</th><td>120</td><td>11</td><td>0</td><td>0</td><td>0</td></tr>
        <tr><th>BREAK</th><td>45</td><td>5</td><td>0</td><td>0</td><td>0</td></tr>
      </table>
    `;

    const detail = parsePlaylogDetail(html, '0');
    expect(detail.idx).toBe('0');
    expect(detail.type).toBe('dx');
    expect(detail.difficulty).toBe('master');
    expect(detail.dxScore).toBe(2480);
    expect(detail.maxDxScore).toBe(2610);
    expect(detail.maxCombo).toBe(870);
    expect(detail.totalCombo).toBe(870);
    expect(detail.fast).toBe(12);
    expect(detail.late).toBe(8);
    expect(detail.judgements.notes.tap).toEqual({
      criticalPerfect: 410,
      perfect: 25,
      great: 0,
      good: 0,
      miss: 0,
    });
    expect(detail.judgements.notes.touch).toEqual({
      criticalPerfect: 120,
      perfect: 11,
      great: 0,
      good: 0,
      miss: 0,
    });
    expect(detail.judgements.totals).toEqual({
      criticalPerfect: 815,
      perfect: 55,
      great: 0,
      good: 0,
      miss: 0,
    });
  });

  it('parses STD chart with blank Touch row as null while keeping accurate totals', () => {
    const html = `
      <img class="playlog_diff" src="/maimai-mobile/img/diff_remaster.png" />
      <img class="playlog_music_kind_icon" src="/maimai-mobile/img/music_standard.png" />
      <div class="basic_block m_5 p_5 f_13">PANDORA PARADOXXX</div>
      <div class="playlog_achievement_txt">99.6120%</div>
      <div class="playlog_score_block"><span class="white">3,120 / 3,450</span></div>
      <div class="f_r f_14 white">640 / 1,150</div>
      <div class="w_96 f_l t_r">31</div>
      <div class="w_96 f_l t_r">19</div>
      <table class="playlog_notes_detail">
        <tr><th></th><th>CP</th><th>P</th><th>GR</th><th>GD</th><th>M</th></tr>
        <tr><th>TAP</th><td>600</td><td>90</td><td>10</td><td>2</td><td>1</td></tr>
        <tr><th>HOLD</th><td>70</td><td>12</td><td>1</td><td>0</td><td>0</td></tr>
        <tr><th>SLIDE</th><td>240</td><td>30</td><td>3</td><td>0</td><td>0</td></tr>
        <tr><th>TOUCH</th><td></td><td></td><td></td><td></td><td></td></tr>
        <tr><th>BREAK</th><td>80</td><td>10</td><td>1</td><td>0</td><td>0</td></tr>
      </table>
    `;

    const detail = parsePlaylogDetail(html, '1');
    expect(detail.type).toBe('std');
    expect(detail.judgements.notes.touch).toBeNull();
    expect(detail.judgements.totals).toEqual({
      criticalPerfect: 990,
      perfect: 142,
      great: 15,
      good: 2,
      miss: 1,
    });
    expect(detail.maxCombo).toBe(640);
    expect(detail.totalCombo).toBe(1150);
  });

  it('throws ParseError when .playlog_notes_detail is missing', () => {
    expect(() => parsePlaylogDetail('<div>No table</div>', '0')).toThrow(ParseError);
  });
});
