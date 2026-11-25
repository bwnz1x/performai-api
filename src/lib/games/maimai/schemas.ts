import { z } from 'zod';

export const MaimaiProfile = z.object({
  name: z.string().nullable().optional(),
  rating: z.object({
    value: z.number().int().nonnegative(),
    color: z.url().nullable().optional(),
  }),
  icon: z.url().nullable().optional(),
  title: z.object({
    value: z.string().nullable().optional(),
    typeUrl: z.url().nullable().optional(),
    type: z.enum(['rainbow', 'gold', 'silver', 'bronze', 'normal']).nullable().optional(),
  }),
  stars: z.number().int().nonnegative().nullable().optional(),
  playCount: z.object({
    versionPlayCount: z.number().int().nonnegative().nullable().optional(),
    totalPlayCount: z.number().int().nonnegative().nullable().optional(),
  }),
  courseRank: z.url().nullable().optional(),
  classRank: z.url().nullable().optional(),
});

export type MaimaiProfile = z.infer<typeof MaimaiProfile>;

export const Circle = z
  .object({
    name: z.string().nullable().optional(),
    class: z.url().nullable().optional(),
  })
  .nullable()
  .optional();

export type Circle = z.infer<typeof Circle>;

export const MaimaiProfileExtended = MaimaiProfile.extend({
  nameplate: z.url().nullable().optional(),
  frame: z.url().nullable().optional(),
  circle: Circle,
});

export type MaimaiProfileExtended = z.infer<typeof MaimaiProfileExtended>;

export const MaimaiRatingSong = z.object({
  name: z.string(),
  type: z.enum(['std', 'dx']),
  difficulty: z.enum(['basic', 'advanced', 'expert', 'master', 'remaster']),
  level: z.string(),
  internalLevel: z.number(),
  achievement: z.number(),
  dxScore: z.number(),
  rating: z.number().int(),
  jacket: z.url().nullable(),
  combo: z.object({
    type: z.string().nullable(),
    image: z.url().nullable(),
  }),
  sync: z.object({
    type: z.string().nullable(),
    image: z.url().nullable(),
  }),
});

export type MaimaiRatingSong = z.infer<typeof MaimaiRatingSong>;

export const MaimaiRatedChart = MaimaiRatingSong.extend({
  bucket: z.enum(['new', 'old']),
  isInBest50: z.boolean(),
});

export type MaimaiRatedChart = z.infer<typeof MaimaiRatedChart>;

export const MaimaiRating = z.object({
  rating: z.number().int(),
  newRatingSongs: z.array(MaimaiRatingSong),
  oldRatingSongs: z.array(MaimaiRatingSong),
  allScores: z.array(MaimaiRatedChart).optional(),
});

export type MaimaiRating = z.infer<typeof MaimaiRating>;

export const JudgementCounts = z.object({
  criticalPerfect: z.number().int().nonnegative(),
  perfect: z.number().int().nonnegative(),
  great: z.number().int().nonnegative(),
  good: z.number().int().nonnegative(),
  miss: z.number().int().nonnegative(),
});

export type JudgementCounts = z.infer<typeof JudgementCounts>;

export const NoteJudgementBreakdown = z.object({
  tap: JudgementCounts.nullable(),
  hold: JudgementCounts.nullable(),
  slide: JudgementCounts.nullable(),
  touch: JudgementCounts.nullable(),
  break: JudgementCounts.nullable(),
});

export type NoteJudgementBreakdown = z.infer<typeof NoteJudgementBreakdown>;

export const MaimaiJudgements = z.object({
  totals: JudgementCounts,
  notes: NoteJudgementBreakdown,
});

export type MaimaiJudgements = z.infer<typeof MaimaiJudgements>;

export const MaimaiRecentPlay = z.object({
  idx: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  type: z.enum(['std', 'dx']),
  difficulty: z.enum(['basic', 'advanced', 'expert', 'master', 'remaster']),
  achievement: z.number(),
  dxScore: z.number().int(),
  maxDxScore: z.number().int().nullable(),
  track: z.string().nullable(),
  playedAt: z.string().nullable(),
  isNewRecord: z.boolean(),
  jacket: z.url().nullable(),
  combo: z.object({
    type: z.string().nullable(),
    image: z.url().nullable(),
  }),
  sync: z.object({
    type: z.string().nullable(),
    image: z.url().nullable(),
  }),
});

export type MaimaiRecentPlay = z.infer<typeof MaimaiRecentPlay>;

export const MaimaiPlayDetail = z.object({
  idx: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  type: z.enum(['std', 'dx']),
  difficulty: z.enum(['basic', 'advanced', 'expert', 'master', 'remaster']),
  achievement: z.number(),
  dxScore: z.number().int().nullable(),
  maxDxScore: z.number().int().nullable(),
  playedAt: z.string().nullable(),
  jacket: z.url().nullable(),
  combo: z.object({
    type: z.string().nullable(),
    image: z.url().nullable(),
  }),
  sync: z.object({
    type: z.string().nullable(),
    image: z.url().nullable(),
  }),
  maxCombo: z.number().int().nullable(),
  totalCombo: z.number().int().nullable(),
  fast: z.number().int().nullable(),
  late: z.number().int().nullable(),
  judgements: MaimaiJudgements,
});

export type MaimaiPlayDetail = z.infer<typeof MaimaiPlayDetail>;

export const MaimaiPhoto = z.object({
  id: z.string(),
  songName: z.string(),
  difficulty: z.enum(['basic', 'advanced', 'expert', 'master', 'remaster']).nullable(),
  playedAt: z.string().nullable(),
  imageUrl: z.url(),
  suggestedFileName: z.string(),
});

export type MaimaiPhoto = z.infer<typeof MaimaiPhoto>;

export const MaimaiCollectionCategory = z.enum(['icon', 'nameplate', 'frame', 'trophy', 'partner']);

export type MaimaiCollectionCategory = z.infer<typeof MaimaiCollectionCategory>;

export const MaimaiCollectionItem = z.object({
  idx: z.string(),
  category: MaimaiCollectionCategory,
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.url().nullable(),
  trophyType: z.enum(['rainbow', 'gold', 'silver', 'bronze', 'normal']).nullable(),
  group: z.string().nullable(),
  isEquipped: z.boolean(),
  canEquip: z.boolean(),
});

export type MaimaiCollectionItem = z.infer<typeof MaimaiCollectionItem>;

export const MaimaiCollectionResponse = z.object({
  category: MaimaiCollectionCategory,
  equipped: MaimaiCollectionItem.nullable(),
  items: z.array(MaimaiCollectionItem),
});

export type MaimaiCollectionResponse = z.infer<typeof MaimaiCollectionResponse>;

export const MaimaiEquipResult = z.object({
  category: MaimaiCollectionCategory,
  idx: z.string(),
  equipped: MaimaiCollectionItem.nullable(),
});

export type MaimaiEquipResult = z.infer<typeof MaimaiEquipResult>;
