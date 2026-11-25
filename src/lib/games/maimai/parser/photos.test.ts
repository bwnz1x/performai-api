import { describe, expect, it } from 'bun:test';

import { parsePhotoAlbum } from '@/lib/games/maimai/parser/photos';

const SAMPLE_ALBUM_HTML = `
  <div class="music_master_score_back p_10 m_10">
    <div class="block_info">2025/8/9 19:05</div>
    <div class="black_block">Xaleid◆scopiX</div>
    <img class="w_430" src="https://maimaidx-eng.com/maimai-mobile/img/Photo/abc12345.jpg" />
  </div>
  <div class="music_remaster_score_back p_10 m_10">
    <div class="block_info">2025/08/10 21:30</div>
    <div class="black_block">PANDORA:PARADOXXX / Test</div>
    <img class="w_430" src="/maimai-mobile/img/Photo/def67890.jpg" />
  </div>
`;

describe('parsePhotoAlbum', () => {
  it('parses song name, difficulty, padded playedAt, resolved imageUrl, and safe filename', () => {
    const photos = parsePhotoAlbum(SAMPLE_ALBUM_HTML, 'intl');
    expect(photos).toHaveLength(2);

    expect(photos[0]).toEqual({
      id: 'abc12345',
      songName: 'Xaleid◆scopiX',
      difficulty: 'master',
      playedAt: '2025/08/09 19:05',
      imageUrl: 'https://maimaidx-eng.com/maimai-mobile/img/Photo/abc12345.jpg',
      suggestedFileName: '2025-08-09_1905_Xaleid◆scopiX_MASTER.jpg',
    });

    expect(photos[1]?.difficulty).toBe('remaster');
    expect(photos[1]?.imageUrl).toBe(
      'https://maimaidx-eng.com/maimai-mobile/img/Photo/def67890.jpg'
    );
    expect(photos[1]?.suggestedFileName).toBe(
      '2025-08-10_2130_PANDORA-PARADOXXX_-_Test_REMASTER.jpg'
    );
  });

  it('returns empty array when no photos exist', () => {
    expect(parsePhotoAlbum('<div class="main_wrapper">No photos</div>', 'intl')).toEqual([]);
  });
});
