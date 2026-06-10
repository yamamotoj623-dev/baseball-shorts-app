// オリジナル選手・チームの自動生成。
// 実在の選手・球団は使わず、権利リスクをゼロにする（企画書 8章）。

import type { Coach, Hand, Manager, Player, Position, Team } from './types';
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

/** 外国人選手の名前プール（カタカナ） */
const FOREIGN_NAMES = [
  'スミス', 'ジョンソン', 'ラミレス', 'オルティス', 'マルティネス', 'テイラー',
  'アンダーソン', 'ロドリゲス', 'ペレス', 'ハミルトン', 'バーンズ', 'ケラー',
  'サンチェス', 'ウィリアムス', 'ガルシア', 'モレノ', 'デイビス', 'クルーズ',
];

// ── ポイント予算（カスタム作成・自動生成の共通上限） ──
export const BATTER_BUDGET = 240; // ミート+パワー+走力+守備 の合計上限
export const PITCHER_BUDGET = 210; // 球速+制球+スタミナ の合計上限
export const FOREIGN_BONUS = 25; // 外国人はポイント上限ボーナス（その分年俸が高い）
export const FOREIGN_LIMIT = 4; // 外国人枠（NPB風）
export const PAYROLL_CAP = 300000; // 年俸総額キャップ 30億円（万円単位）

/** 特殊能力（打者）と試合中の効果 */
export const BATTER_ABILITIES = ['チャンス◎', 'パワーヒッター', 'アベレージヒッター', '盗塁王', '守備職人', '対左投手◎'] as const;
/** 特殊能力（投手） */
export const PITCHER_ABILITIES = ['火の玉ストレート', '精密機械', '鉄腕', '勝負強い', '尻上がり'] as const;

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

// セッションごとに一意なプレフィックスを付け、保存済みリーグの選手IDと
// 新規生成（ドラフト等）の選手IDが衝突しないようにする。
const ID_SESSION = Math.random().toString(36).slice(2, 8);
let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `p${ID_SESSION}${idCounter}`;
}

/** 投打をランダム生成（投手は左腕25%、打者は左打30%・両打10%） */
function makeHand(rng: Rng, isPitcher: boolean): Hand {
  const throwH = rng.chance(isPitcher ? 0.25 : 0.15) ? '左' : '右';
  const r = rng.next();
  const bat = r < 0.3 ? '左' : r < 0.4 ? '両' : '右';
  return { throw: throwH, bat };
}

/** 年俸を能力ポイント合計から算定（万円）。特殊能力と外国人で割増 */
export function salaryFor(p: Player): number {
  const pts = p.pitches
    ? p.pitches.velocity + p.pitches.control + p.pitches.stamina
    : p.bats.meet + p.bats.power + p.bats.speed + p.bats.defense;
  const budget = p.pitches ? PITCHER_BUDGET : BATTER_BUDGET;
  let base = 1500 + Math.max(0, pts - budget * 0.55) * 55;
  base += (p.abilities?.length ?? 0) * 2200;
  if (p.foreign) base *= 1.6;
  return Math.round(base / 100) * 100;
}

function finalize(rng: Rng, p: Player, isPitcher: boolean): Player {
  p.age = 18 + rng.int(0, 18);
  p.hand = makeHand(rng, isPitcher);
  p.motivation = 50 + rng.int(0, 25);
  p.potential = stat(rng, 50, 30);
  // 1〜2割の選手が特殊能力持ち
  if (rng.chance(0.18)) {
    const pool = isPitcher ? PITCHER_ABILITIES : BATTER_ABILITIES;
    p.abilities = [rng.pick([...pool])];
  } else {
    p.abilities = [];
  }
  p.salary = salaryFor(p);
  return p;
}

function makeBatter(rng: Rng, position: Position, strength: number): Player {
  const p: Player = {
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
  return finalize(rng, p, false);
}

function makePitcher(rng: Rng, strength: number): Player {
  const p: Player = {
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
  return finalize(rng, p, true);
}

/** 監督を生成 */
export function generateManager(rng: Rng): Manager {
  return {
    name: makeName(rng),
    style: rng.pick(['攻撃的', '堅実', 'データ重視'] as const),
    skill: stat(rng, 55, 18),
  };
}

/** コーチ陣を生成（打撃・投手） */
export function generateCoaches(rng: Rng): Coach[] {
  return [
    { type: '打撃', name: makeName(rng), skill: stat(rng, 55, 18) },
    { type: '投手', name: makeName(rng), skill: stat(rng, 55, 18) },
  ];
}

// ── カスタム球団作成（マスターリーグ形式）のAPI ──

/** 空の打者（ポイントを budget の半分だけ均等配分した状態から編集開始） */
export function blankBatter(position: Position): Player {
  const base = Math.floor((BATTER_BUDGET / 4) * 0.8);
  return {
    id: nextId(),
    name: '',
    position,
    bats: { meet: base, power: base, speed: base, defense: base },
    age: 24,
    hand: { throw: '右', bat: '右' },
    foreign: false,
    abilities: [],
    motivation: 60,
    potential: 50,
  };
}

/** 空の投手 */
export function blankPitcher(): Player {
  const base = Math.floor((PITCHER_BUDGET / 3) * 0.8);
  return {
    id: nextId(),
    name: '',
    position: '投',
    bats: { meet: 25, power: 20, speed: 40, defense: 45 },
    pitches: { velocity: base, control: base, stamina: base },
    age: 24,
    hand: { throw: '右', bat: '右' },
    foreign: false,
    abilities: [],
    motivation: 60,
    potential: 50,
  };
}

/** 選手のポイント上限（外国人ボーナス込み） */
export function budgetFor(p: Player): number {
  return (p.pitches ? PITCHER_BUDGET : BATTER_BUDGET) + (p.foreign ? FOREIGN_BONUS : 0);
}

/** 現在の使用ポイント */
export function pointsUsed(p: Player): number {
  return p.pitches
    ? p.pitches.velocity + p.pitches.control + p.pitches.stamina
    : p.bats.meet + p.bats.power + p.bats.speed + p.bats.defense;
}

/** お任せ: 予算をちょうど使い切るランダム配分にし、名前等も埋める */
export function randomizePlayer(p: Player, rng: Rng): void {
  if (!p.name) p.name = p.foreign ? rng.pick(FOREIGN_NAMES) : makeName(rng);
  p.age = 18 + rng.int(0, 18);
  p.hand = makeHand(rng, Boolean(p.pitches));
  const budget = budgetFor(p);
  if (p.pitches) {
    const w = [rng.next() + 0.4, rng.next() + 0.4, rng.next() + 0.3];
    const sum = w[0] + w[1] + w[2];
    p.pitches.velocity = Math.max(20, Math.min(99, Math.round((budget * w[0]) / sum)));
    p.pitches.control = Math.max(20, Math.min(99, Math.round((budget * w[1]) / sum)));
    p.pitches.stamina = Math.max(20, Math.min(99, budget - p.pitches.velocity - p.pitches.control));
    if (rng.chance(0.35)) p.abilities = [rng.pick([...PITCHER_ABILITIES])];
  } else {
    const w = [rng.next() + 0.4, rng.next() + 0.4, rng.next() + 0.3, rng.next() + 0.3];
    const sum = w.reduce((a, b) => a + b, 0);
    const m = Math.max(15, Math.min(99, Math.round((budget * w[0]) / sum)));
    const pw = Math.max(15, Math.min(99, Math.round((budget * w[1]) / sum)));
    const sp = Math.max(15, Math.min(99, Math.round((budget * w[2]) / sum)));
    p.bats = { meet: m, power: pw, speed: sp, defense: Math.max(10, Math.min(99, budget - m - pw - sp)) };
    if (rng.chance(0.35)) p.abilities = [rng.pick([...BATTER_ABILITIES])];
  }
  p.salary = salaryFor(p);
}

/** カスタム球団のひな型（17人ロスター: 打順9・先発1・救援3・控え4） */
export function blankCustomTeam(): Team {
  return {
    name: '',
    shortName: '',
    lineup: FIELD_POSITIONS.map((pos) => blankBatter(pos)),
    pitcher: blankPitcher(),
    bullpen: [blankPitcher(), blankPitcher(), blankPitcher()],
    bench: [blankBatter('左'), blankBatter('二'), blankBatter('捕'), blankBatter('中')],
    funds: PAYROLL_CAP,
  };
}

/** チーム総年俸（万円） */
export function payrollOf(team: Team): number {
  const all = [...team.lineup, team.pitcher, ...team.bullpen, ...team.bench];
  return all.reduce((a, p) => a + (p.salary ?? salaryFor(p)), 0);
}

/** 外国人の人数 */
export function foreignCount(team: Team): number {
  const all = [...team.lineup, team.pitcher, ...team.bullpen, ...team.bench];
  return all.filter((p) => p.foreign).length;
}

/** チーム内で名前が重複しないように振り直す */
function dedupeNames(players: Player[], rng: Rng): void {
  const used = new Set<string>();
  for (const p of players) {
    let guard = 0;
    while (used.has(p.name) && guard < 50) {
      p.name = makeName(rng);
      guard += 1;
    }
    used.add(p.name);
  }
}

/** 1チーム生成。strength でチーム全体の地力を調整（50が平均） */
export function generateTeam(rng: Rng, meta: { name: string; short: string }, strength: number): Team {
  const lineup = FIELD_POSITIONS.map((pos) => makeBatter(rng, pos, strength));
  const pitcher = makePitcher(rng, strength);

  // 控え野手: スタメンよりやや劣るが、守備・走力特化型が混ざる
  const bench = Array.from({ length: 4 }, () => makeBatter(rng, rng.pick(FIELD_POSITIONS), strength - 6));

  // 救援投手: スタミナは低め。末尾（抑え）は球威が高い
  const bullpen = [
    makeReliever(rng, strength - 4, 0),
    makeReliever(rng, strength, 0),
    makeReliever(rng, strength + 4, 8), // 抑え: 球速ボーナス
  ];

  dedupeNames([...lineup, pitcher, ...bench, ...bullpen], rng);

  return {
    name: meta.name,
    shortName: meta.short,
    lineup,
    pitcher,
    bench,
    bullpen,
    manager: generateManager(rng),
    coaches: generateCoaches(rng),
    funds: PAYROLL_CAP,
  };
}

function makeReliever(rng: Rng, strength: number, velocityBonus: number): Player {
  const p = makePitcher(rng, strength);
  p.pitches = {
    velocity: Math.min(99, p.pitches!.velocity + velocityBonus),
    control: p.pitches!.control,
    stamina: stat(rng, 32, 10), // 救援はスタミナ短め
  };
  p.salary = salaryFor(p);
  return p;
}

/** リーグの全球団を生成（チーム名は重複しない） */
export function generateLeague(rng: Rng, count: number = 6): Team[] {
  const pool = [...TEAM_POOL];
  const teams: Team[] = [];
  const n = Math.min(count, pool.length); // pool は splice で縮むため先に確定させる
  for (let i = 0; i < n; i++) {
    const meta = pool.splice(rng.int(0, pool.length), 1)[0];
    teams.push(generateTeam(rng, { name: meta.name, short: meta.short }, stat(rng, 52, 8)));
  }
  return teams;
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

/** ドラフト／FA市場の選手プールを生成（投手と各ポジションが混ざる。当たり外れ大きめ） */
export function generateDraftPool(rng: Rng, size: number = 9): Player[] {
  const pool: Player[] = [];
  for (let i = 0; i < size; i++) {
    // 約3割が投手
    if (i % 3 === 0) pool.push(makePitcher(rng, stat(rng, 55, 15)));
    else pool.push(makeBatter(rng, rng.pick(FIELD_POSITIONS), stat(rng, 55, 15)));
  }
  dedupeNames(pool, rng);
  return pool;
}

const batScore = (p: Player) => p.bats.meet + p.bats.power + p.bats.speed * 0.4 + p.bats.defense * 0.4;
const pitScore = (p: Player) => (p.pitches ? p.pitches.velocity + p.pitches.control + p.pitches.stamina : 0);

/** 獲得した選手をチームに組み込む。最も弱い同種の選手を放出して枠を保つ。放出選手を返す */
export function signPlayer(team: Team, p: Player): Player {
  if (p.position === '投' || p.pitches) {
    // 先発＋ブルペンの中で最弱を放出して獲得選手を入れ、最強を先発に据える
    const arms = [team.pitcher, ...team.bullpen];
    let wi = 0;
    for (let i = 1; i < arms.length; i++) if (pitScore(arms[i]) < pitScore(arms[wi])) wi = i;
    const released = arms[wi];
    arms[wi] = p;
    let bi = 0;
    for (let i = 1; i < arms.length; i++) if (pitScore(arms[i]) > pitScore(arms[bi])) bi = i;
    team.pitcher = arms[bi];
    arms.splice(bi, 1);
    team.bullpen = arms;
    return released;
  }
  // 野手: スタメン最弱と入れ替え、守備位置を引き継ぐ
  let wi = 0;
  for (let i = 1; i < team.lineup.length; i++) if (batScore(team.lineup[i]) < batScore(team.lineup[wi])) wi = i;
  const released = team.lineup[wi];
  p.position = released.position;
  team.lineup[wi] = p;
  return released;
}

/** チームの総合力（打撃・投手の目安値、0〜100想定） */
export function teamOverall(team: Team): { bat: number; pit: number } {
  const bat = team.lineup.reduce((a, p) => a + (p.bats.meet + p.bats.power) / 2, 0) / team.lineup.length;
  const arms = [team.pitcher, ...team.bullpen];
  const pit = arms.reduce((a, p) => a + pitScore(p) / 3, 0) / arms.length;
  return { bat: Math.round(bat), pit: Math.round(pit) };
}
