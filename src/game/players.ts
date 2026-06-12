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

/** 架空チーム名のプール（地名 + 愛称 + 球団カラー） */
const TEAM_POOL: { name: string; short: string; color: string }[] = [
  { name: '東京グランツ', short: 'TYO', color: '#c9962f' },
  { name: '浪速タイガーズ', short: 'NAN', color: '#f2c200' },
  { name: '中部ドラゴンズ', short: 'CHU', color: '#0b3da0' },
  { name: '広島カープス', short: 'HIR', color: '#da3633' },
  { name: '東京スパローズ', short: 'TSW', color: '#0a7d4f' },
  { name: '横浜ベイズ', short: 'YOK', color: '#1f6feb' },
  { name: '福岡ホークズ', short: 'FUK', color: '#d4a017' },
  { name: '北海ファイターズ', short: 'HOK', color: '#5b6770' },
  { name: '房総マリナーズ', short: 'BSO', color: '#111418' },
  { name: '東北イーグルズ', short: 'TOH', color: '#8a0f1a' },
  { name: '武蔵ライオンズ', short: 'MSI', color: '#0a4ea0' },
  { name: '摂津バッファローズ', short: 'STU', color: '#1a2740' },
];

/** 球団カラー（カスタム球団は略称から安定したハッシュで決まる） */
export function teamColor(team: { shortName: string }): string {
  const found = TEAM_POOL.find((t) => t.short === team.shortName);
  if (found) return found.color;
  let h = 0;
  for (const c of team.shortName) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const palette = ['#e05273', '#1f6feb', '#2ea043', '#d29922', '#8957e5', '#39c5cf', '#da3633', '#ff7b72'];
  return palette[h % palette.length];
}

const FIELD_POSITIONS: Position[] = ['捕', '一', '二', '三', '遊', '左', '中', '右', '指'];

/** 外国人選手の名前プール（カタカナ） */
const FOREIGN_NAMES = [
  'スミス', 'ジョンソン', 'ラミレス', 'オルティス', 'マルティネス', 'テイラー',
  'アンダーソン', 'ロドリゲス', 'ペレス', 'ハミルトン', 'バーンズ', 'ケラー',
  'サンチェス', 'ウィリアムス', 'ガルシア', 'モレノ', 'デイビス', 'クルーズ',
];
const FOREIGN_FIRST = [
  'マイク', 'クリス', 'デビッド', 'カルロス', 'ホセ', 'フアン', 'アレックス',
  'トニー', 'ブライアン', 'ライアン', 'マーカス', 'レジー', 'エリック', 'ダルビン',
];

/** 外国人名（姓＋登録名）。NPBの登録名風に姓のみ表記する */
export function makeForeignName(rng: Rng): string {
  const last = rng.pick(FOREIGN_NAMES);
  return rng.chance(0.3) ? `${last}・${rng.pick(FOREIGN_FIRST)}` : last;
}

// ── ポイント予算（カスタム作成・自動生成の共通上限） ──
export const BATTER_BUDGET = 240; // ミート+パワー+走力+守備 の合計上限
export const PITCHER_BUDGET = 210; // 球速+制球+スタミナ の合計上限
export const FOREIGN_BONUS = 25; // 外国人はポイント上限ボーナス（その分年俸が高い）
export const FOREIGN_LIMIT = 4; // 外国人枠（NPB風）
export const PAYROLL_CAP = 300000; // 年俸総額キャップ 30億円（万円単位）

/** 特殊能力（打者）と試合中の効果 */
export const BATTER_ABILITIES = ['チャンス◎', 'パワーヒッター', 'アベレージヒッター', '盗塁王', '守備職人', '対左投手◎', '満塁男', 'サヨナラ男', '切り込み隊長', '広角打法', '流し打ち', '選球眼', '威圧感', 'ムード○', '内野安打○', 'アーチスト'] as const;
/** 特殊能力（投手） */
export const PITCHER_ABILITIES = ['火の玉ストレート', '精密機械', '鉄腕', '勝負強い', '尻上がり', 'キレ○', '奪三振', '重い球', '打たれ強い', 'クイック○', '牽制○', 'ノビ○', '低め○', 'ポーカーフェイス'] as const;

/** 平均 mid、ばらつき spread で 1〜99 にクランプした能力値 */
function stat(rng: Rng, mid: number, spread: number): number {
  // 2回の平均で正規分布っぽくする
  const r = (rng.next() + rng.next()) / 2;
  const v = Math.round(mid + (r - 0.5) * 2 * spread);
  return Math.max(1, Math.min(99, v));
}

function makeName(rng: Rng): string {
  return rng.pick(FAMILY_NAMES);
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

// 守備の隣接ポジション（メイン以外に守れる候補）
const ADJACENT: Partial<Record<Position, Position[]>> = {
  捕: ['一'],
  一: ['三', '左', '右'],
  二: ['遊', '三'],
  三: ['一', '遊'],
  遊: ['二', '三'],
  左: ['中', '右', '一'],
  中: ['左', '右'],
  右: ['左', '中', '一'],
  指: ['一', '左', '右'],
};

const PITCH_NAMES = ['ストレート', 'フォーシーム', 'ツーシーム', 'カットボール', 'シュート', 'スライダー', 'スイーパー', 'カーブ', 'ナックルカーブ', 'スラーブ', 'フォーク', 'スプリット', 'チェンジアップ', 'サークルチェンジ', 'シンカー', 'パワーカーブ', 'ナックル', 'ジャイロボール'];

/** 守備適性を生成（メイン100、隣接に中程度、まれに器用） */
function makeApt(rng: Rng, main: Position): Partial<Record<Position, number>> {
  const apt: Partial<Record<Position, number>> = { [main]: 90 + rng.int(0, 10) };
  for (const adj of ADJACENT[main] ?? []) {
    if (rng.chance(0.5)) apt[adj] = 40 + rng.int(0, 45); // △〜○
  }
  // ユーティリティ型はさらに広い
  if (rng.chance(0.12)) {
    const extra = rng.pick(FIELD_POSITIONS.filter((x) => x !== '指' && !(x in apt)));
    apt[extra] = 35 + rng.int(0, 30);
  }
  return apt;
}

/** 投手の持ち球を生成（ストレート＋変化球2〜4種、変化量つき） */
function makeArsenal(rng: Rng, strength: number): { name: string; break: number }[] {
  const arsenal = [{ name: 'ストレート', break: 0 }];
  const pool = PITCH_NAMES.slice(1);
  const n = 2 + rng.int(0, 3); // 計3〜5球種
  for (let i = 0; i < n && pool.length; i++) {
    const name = pool.splice(rng.int(0, pool.length), 1)[0];
    arsenal.push({ name, break: stat(rng, strength - 6, 18) });
  }
  return arsenal;
}

function finalize(rng: Rng, p: Player, isPitcher: boolean): Player {
  p.age = 18 + rng.int(0, 18);
  p.hand = makeHand(rng, isPitcher);
  p.motivation = 50 + rng.int(0, 25);
  p.potential = stat(rng, 50, 30);
  if (isPitcher) p.arsenal = makeArsenal(rng, p.pitches!.velocity);
  else if (p.position !== '指') p.apt = makeApt(rng, p.position);
  // 1〜2割の選手が特殊能力持ち
  if (rng.chance(0.18)) {
    const pool = isPitcher ? PITCHER_ABILITIES : BATTER_ABILITIES;
    p.abilities = [rng.pick([...pool])];
  } else {
    p.abilities = [];
  }
  p.fatigue = 0;
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
    apt: { [position]: 95 },
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
    arsenal: [
      { name: 'ストレート', break: 0 },
      { name: 'スライダー', break: 50 },
      { name: 'フォーク', break: 50 },
    ],
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
    p.arsenal = makeArsenal(rng, p.pitches.velocity);
  } else {
    const w = [rng.next() + 0.4, rng.next() + 0.4, rng.next() + 0.3, rng.next() + 0.3];
    const sum = w.reduce((a, b) => a + b, 0);
    const m = Math.max(15, Math.min(99, Math.round((budget * w[0]) / sum)));
    const pw = Math.max(15, Math.min(99, Math.round((budget * w[1]) / sum)));
    const sp = Math.max(15, Math.min(99, Math.round((budget * w[2]) / sum)));
    p.bats = { meet: m, power: pw, speed: sp, defense: Math.max(10, Math.min(99, budget - m - pw - sp)) };
    if (rng.chance(0.35)) p.abilities = [rng.pick([...BATTER_ABILITIES])];
    if (p.position !== '指') p.apt = makeApt(rng, p.position);
  }
  p.salary = salaryFor(p);
}

/** 守備適性のグレード記号（◎○△・空） */
export function aptMark(v: number): string {
  return v >= 85 ? '◎' : v >= 60 ? '○' : v >= 35 ? '△' : '✕';
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

/** チームの全選手（一軍＋二軍。pitcher は rotation に含まれるため重複除去） */
export function allPlayersOf(team: Team): Player[] {
  const m = new Map<string, Player>();
  for (const p of [...team.lineup, ...(team.rotation ?? [team.pitcher]), ...team.bullpen, ...team.bench, ...(team.farm ?? [])]) {
    m.set(p.id, p);
  }
  return [...m.values()];
}

/** チーム総年俸（万円・支配下のみ） */
export function payrollOf(team: Team): number {
  return allPlayersOf(team)
    .filter((p) => !p.ikusei)
    .reduce((a, p) => a + (p.salary ?? salaryFor(p)), 0);
}

/** 外国人の人数 */
export function foreignCount(team: Team): number {
  return allPlayersOf(team).filter((p) => p.foreign).length;
}

/** チーム内で名前が重複しないように振り直す */
function dedupeNames(players: Player[], rng: Rng): void {
  const used = new Set<string>();
  for (const p of players) {
    const base = p.name;
    let name = base;
    let guard = 0;
    while (used.has(name) && guard < 80) {
      // 重複したら下の名前の頭一文字を付ける（外国人は登録名）
      name = p.foreign ? `${base}・${rng.pick(FOREIGN_FIRST)}` : base + rng.pick(GIVEN_NAMES).slice(0, 1);
      guard += 1;
    }
    p.name = name;
    used.add(name);
  }
}

/** 1チーム生成。strength でチーム全体の地力を調整（50が平均） */
export function generateTeam(rng: Rng, meta: { name: string; short: string }, strength: number): Team {
  const lineup = FIELD_POSITIONS.map((pos) => makeBatter(rng, pos, strength));
  const pitcher = makePitcher(rng, strength);

  // 控え野手: 各ポジションをカバーできるよう7人
  const benchPos: Position[] = ['捕', '一', '二', '遊', '左', '中', '右'];
  const bench = benchPos.map((pos) => makeBatter(rng, pos, strength - 6));

  // 救援投手6人: スタミナは低め。末尾（抑え）は球威が高い
  const bullpen = [
    makeReliever(rng, strength - 6, 0),
    makeReliever(rng, strength - 4, 0),
    makeReliever(rng, strength - 2, 2),
    makeReliever(rng, strength, 2),
    makeReliever(rng, strength + 2, 5), // セットアッパー
    makeReliever(rng, strength + 4, 8), // 抑え: 球速ボーナス
  ];

  // 先発ローテーション6枚（1枚目が今日の先発）と二軍・スカウト
  const rotation = [
    pitcher,
    makePitcher(rng, strength - 2),
    makePitcher(rng, strength - 4),
    makePitcher(rng, strength - 5),
    makePitcher(rng, strength - 7),
    makePitcher(rng, strength - 9),
  ];
  const farm = makeFarm(rng, strength);

  // NPB風に数人を助っ人外国人に（打者2・投手1）
  makeForeign(rng, lineup[3]); // 主軸打者
  makeForeign(rng, lineup[6]);
  makeForeign(rng, rotation[1]);

  const all = [...lineup, ...rotation, ...bench, ...bullpen, ...farm];
  dedupeNames(all, rng);
  assignNumbers(all);

  return {
    name: meta.name,
    shortName: meta.short,
    lineup,
    pitcher,
    bench,
    bullpen,
    rotation,
    farm,
    rotationIdx: 0,
    scout: { name: makeName(rng), skill: stat(rng, 55, 20) },
    manager: generateManager(rng),
    coaches: generateCoaches(rng),
    funds: PAYROLL_CAP,
  };
}

/** 既存選手を助っ人外国人にする（名前を外国人名へ、能力を少し底上げ） */
export function makeForeign(rng: Rng, p: Player): void {
  p.foreign = true;
  p.name = makeForeignName(rng);
  if (p.pitches) {
    p.pitches.velocity = Math.min(99, p.pitches.velocity + rng.int(3, 9));
  } else {
    p.bats.power = Math.min(99, p.bats.power + rng.int(4, 12));
  }
  p.salary = salaryFor(p);
}

/** チームに背番号を割り当てる（投手は2桁帯、野手は1桁〜） */
function assignNumbers(players: Player[]): void {
  const used = new Set<number>();
  for (const p of players) if (p.uniform) used.add(p.uniform);
  let pNum = 11;
  let fNum = 1;
  for (const p of players) {
    if (p.uniform) continue;
    let n: number;
    if (p.pitches) {
      n = pNum;
      while (used.has(n)) n++;
      pNum = n + 1;
    } else {
      n = fNum;
      while (used.has(n) || (n >= 11 && n <= 28)) n++;
      fNum = n + 1;
    }
    p.uniform = n;
    used.add(n);
  }
}

/** 二軍を生成（若手中心・14人。うち4人は育成契約） */
function makeFarm(rng: Rng, strength: number): Player[] {
  const farm: Player[] = [];
  // 野手8人・投手6人
  for (let i = 0; i < 8; i++) farm.push(makeBatter(rng, rng.pick(FIELD_POSITIONS), strength - 8 - rng.int(0, 10)));
  for (let i = 0; i < 6; i++) farm.push(makePitcher(rng, strength - 8 - rng.int(0, 10)));
  for (const p of farm) {
    p.age = 18 + rng.int(0, 6); // 二軍は若手
    p.potential = stat(rng, 64, 22); // 伸びしろは大きめ
  }
  // 末尾4人を育成契約に
  for (let i = farm.length - 4; i < farm.length; i++) farm[i].ikusei = true;
  return farm;
}

/** 旧セーブデータにローテ・二軍・スカウト・調子を補完し、拡張サイズへ拡充する */
export function upgradeTeam(team: Team, rng: Rng): void {
  const strength = 48;
  if (!team.rotation || team.rotation.length === 0) team.rotation = [team.pitcher];
  if (!team.farm) team.farm = [];
  if (!team.scout) team.scout = { name: makeName(rng), skill: stat(rng, 55, 20) };
  team.rotationIdx ??= 0;

  // 拡張サイズへ不足分を補充
  while (team.rotation.length < 6) team.rotation.push(makePitcher(rng, strength - team.rotation.length));
  while (team.bullpen.length < 6) team.bullpen.push(makeReliever(rng, strength, team.bullpen.length >= 5 ? 6 : 0));
  while (team.bench.length < 7) team.bench.push(makeBatter(rng, rng.pick(FIELD_POSITIONS), strength - 6));
  while (team.farm.length < 14) {
    const fp = team.farm.length % 2 === 0 ? makeBatter(rng, rng.pick(FIELD_POSITIONS), strength - 12) : makePitcher(rng, strength - 12);
    fp.age = 18 + rng.int(0, 6);
    fp.potential = stat(rng, 64, 22);
    if (team.farm.length >= 10) fp.ikusei = true;
    team.farm.push(fp);
  }

  const everyone = [...team.lineup, ...team.rotation, ...team.bullpen, ...team.bench, ...team.farm];
  dedupeNames(everyone, rng);
  for (const p of everyone) {
    p.condition ??= 2;
    p.rest ??= 0;
    p.fatigue ??= 0;
    if (p.pitches) p.arsenal ??= makeArsenal(rng, p.pitches.velocity);
    else if (p.position !== '指') p.apt ??= makeApt(rng, p.position);
  }
  if (everyone.some((p) => !p.uniform)) assignNumbers(everyone);
}

/** 能力値（0-99）→ パワプロ風グレード S/A/B/C/D/E/F/G */
export function grade(v: number): string {
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  if (v >= 25) return 'F';
  return 'G';
}

/** ポジション分類（UI色分け用）: p=投手 / c=捕手 / if=内野 / of=外野 / dh=指名打者 */
export function posClass(pos: Position): 'p' | 'c' | 'if' | 'of' | 'dh' {
  if (pos === '投') return 'p';
  if (pos === '捕') return 'c';
  if (pos === '左' || pos === '中' || pos === '右') return 'of';
  if (pos === '指') return 'dh';
  return 'if';
}

/** 調子マーク（パワプロ風 5段階） */
export const CONDITION_MARKS = ['😫', '😟', '😐', '😀', '🔥'] as const;
export const CONDITION_LABELS = ['絶不調', '不調', '普通', '好調', '絶好調'] as const;

/** トレード・現役ドラフトで使う選手価値（能力＋若さ） */
export function playerValue(p: Player): number {
  const pts = pointsUsed(p);
  const youth = Math.max(0, 30 - (p.age ?? 27)) * 3;
  return pts + youth + (p.abilities?.length ?? 0) * 12;
}

/** 支配下人数（育成を除く全選手） */
export function registeredCount(team: Team): number {
  const all = [...team.lineup, ...(team.rotation ?? [team.pitcher]), ...team.bullpen, ...team.bench, ...(team.farm ?? [])];
  return all.filter((p) => !p.ikusei).length;
}

export const REGISTERED_LIMIT = 30; // 支配下登録の上限（簡略版）

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

const ARCHETYPES: NonNullable<Team['archetype']>[] = ['強打', '投手王国', '機動力', '守備堅守', 'バランス', '強打'];

/** 球団の個性（アーキタイプ）に応じて能力を寄せる */
function applyArchetype(team: Team, arch: NonNullable<Team['archetype']>): void {
  team.archetype = arch;
  const up = (v: number, d: number) => Math.max(1, Math.min(99, v + d));
  for (const p of team.lineup) {
    if (arch === '強打') p.bats.power = up(p.bats.power, 7);
    if (arch === '機動力') p.bats.speed = up(p.bats.speed, 9);
    if (arch === '守備堅守') p.bats.defense = up(p.bats.defense, 8);
  }
  if (arch === '投手王国') {
    for (const p of [...(team.rotation ?? []), ...team.bullpen]) {
      if (p.pitches) {
        p.pitches.velocity = up(p.pitches.velocity, 5);
        p.pitches.control = up(p.pitches.control, 5);
      }
    }
  }
}

/** リーグの全球団を生成（チーム名は重複しない。各球団に個性を付与） */
export function generateLeague(rng: Rng, count: number = 6): Team[] {
  const pool = [...TEAM_POOL];
  const teams: Team[] = [];
  const archs = [...ARCHETYPES].sort(() => rng.next() - 0.5);
  const n = Math.min(count, pool.length); // pool は splice で縮むため先に確定させる
  for (let i = 0; i < n; i++) {
    const meta = pool.splice(rng.int(0, pool.length), 1)[0];
    const team = generateTeam(rng, { name: meta.name, short: meta.short }, stat(rng, 52, 8));
    applyArchetype(team, archs[i % archs.length]);
    teams.push(team);
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
