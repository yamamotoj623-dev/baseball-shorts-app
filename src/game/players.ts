// オリジナル選手・チームの自動生成。
// 実在の選手・球団は使わず、権利リスクをゼロにする（企画書 8章）。

import type { Player, Position, Team } from './types';
import type { Rng } from './rng';

const FAMILY_NAMES = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '清水', '斎藤',
  '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '岡田', '後藤', '長谷川',
];

const GIVEN_NAMES = [
  '翔', '大輝', '健太', '陽斗', '蓮', '颯太', '悠真', '駿', '拓海', '海斗',
  '怜', '隼人', '直樹', '亮', '匠', '優斗', '航', '誠', '剛', '純',
];

/** 架空チーム名のプール（地名 + 愛称） */
const TEAM_POOL: { name: string; short: string }[] = [
  { name: 'ノーザン・ベアーズ', short: 'BEARS' },
  { name: 'シーサイド・マリナーズ', short: 'MARI' },
  { name: 'メトロ・ファルコンズ', short: 'FALC' },
  { name: 'グリーンフィールド・タイタンズ', short: 'TITA' },
  { name: 'サンダー・ドラゴンズ', short: 'DRGN' },
  { name: 'クリムゾン・ウルブズ', short: 'WOLV' },
  { name: 'リバーサイド・キングス', short: 'KING' },
  { name: 'スターライト・コメッツ', short: 'COMT' },
];

const FIELD_POSITIONS: Position[] = ['捕', '一', '二', '三', '遊', '左', '中', '右', '指'];

/** 平均 mid、ばらつき spread で 1〜99 にクランプした能力値 */
function stat(rng: Rng, mid: number, spread: number): number {
  // 2回の平均で正規分布っぽくする
  const r = (rng.next() + rng.next()) / 2;
  const v = Math.round(mid + (r - 0.5) * 2 * spread);
  return Math.max(1, Math.min(99, v));
}

function makeName(rng: Rng): string {
  return `${rng.pick(FAMILY_NAMES)}${rng.pick(GIVEN_NAMES)}`;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `p${idCounter}`;
}

function makeBatter(rng: Rng, position: Position, strength: number): Player {
  return {
    id: nextId(),
    name: makeName(rng),
    position,
    bats: {
      meet: stat(rng, strength, 18),
      power: stat(rng, strength, 22),
      speed: stat(rng, strength, 20),
      defense: stat(rng, strength, 18),
    },
  };
}

function makePitcher(rng: Rng, strength: number): Player {
  return {
    id: nextId(),
    name: makeName(rng),
    position: '投',
    bats: { meet: stat(rng, 25, 12), power: stat(rng, 20, 12), speed: stat(rng, 40, 15), defense: stat(rng, 45, 15) },
    pitches: {
      velocity: stat(rng, strength, 18),
      control: stat(rng, strength, 18),
      stamina: stat(rng, strength, 16),
    },
  };
}

/** 1チーム生成。strength でチーム全体の地力を調整（50が平均） */
export function generateTeam(rng: Rng, meta: { name: string; short: string }, strength: number): Team {
  const lineup = FIELD_POSITIONS.map((pos) => makeBatter(rng, pos, strength));
  const pitcher = makePitcher(rng, strength);
  return {
    name: meta.name,
    shortName: meta.short,
    lineup,
    pitcher,
  };
}

/** 対戦する2チームを生成（チーム名は重複しないように選ぶ） */
export function generateMatchup(rng: Rng): { away: Team; home: Team } {
  const pool = [...TEAM_POOL];
  const awayMeta = pool.splice(rng.int(0, pool.length), 1)[0];
  const homeMeta = pool.splice(rng.int(0, pool.length), 1)[0];
  // チームの地力に少し差をつけて試合に起伏を出す
  const away = generateTeam(rng, { name: awayMeta.name, short: awayMeta.short }, stat(rng, 52, 8));
  const home = generateTeam(rng, { name: homeMeta.name, short: homeMeta.short }, stat(rng, 52, 8));
  return { away, home };
}
