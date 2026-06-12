// ゲームの中核となる型定義。
// 試合シミュレーションはここで定義した型だけに依存し、UI から切り離す。

/** 打者能力（0〜100 を想定） */
export interface BatterStats {
  meet: number; // ミート（当てる力・出塁）
  power: number; // パワー（長打力）
  speed: number; // 走力（進塁・盗塁の素地）
  defense: number; // 守備（失策の少なさ・守備範囲）
}

/** 投手能力（0〜100 を想定） */
export interface PitcherStats {
  velocity: number; // 球速（空振りを奪う力）
  control: number; // 制球（四球の少なさ）
  stamina: number; // スタミナ（終盤の球威維持）
}

export type Position =
  | '投'
  | '捕'
  | '一'
  | '二'
  | '三'
  | '遊'
  | '左'
  | '中'
  | '右'
  | '指';

/** 投打 */
export interface Hand {
  throw: '右' | '左';
  bat: '右' | '左' | '両';
}

export interface Player {
  id: string;
  name: string;
  position: Position;
  bats: BatterStats;
  /** 投手のみ保持 */
  pitches?: PitcherStats;
  /** 年齢（18〜45想定） */
  age?: number;
  /** 投打 */
  hand?: Hand;
  /** 外国人選手か */
  foreign?: boolean;
  /** 特殊能力（例: チャンス◎, 火の玉ストレート） */
  abilities?: string[];
  /** 年俸（万円） */
  salary?: number;
  /** モチベーション 0-100（実成績に反映） */
  motivation?: number;
  /** 隠し成長性 0-100（高いほど伸びる） */
  potential?: number;
  /** 成長タイプ（早熟＝若くピーク/普通/晩成＝大器晩成） */
  growth?: '早熟' | '普通' | '晩成';
  /** 調子 0-4（0=絶不調〜4=絶好調。試合ごとに変動し能力に反映） */
  condition?: number;
  /** 登板後の残り休養試合数（投手。0で登板可） */
  rest?: number;
  /** 疲労 0〜100（0=万全。出場で蓄積し、休養で回復。能力に反映） */
  fatigue?: number;
  /** 背番号 */
  uniform?: number;
  /** 守備適性（ポジション→適性0〜100。◎100/○75/△50/×0未満は不可） */
  apt?: Partial<Record<Position, number>>;
  /** 持ち球（投手。球種名と変化量0〜100） */
  arsenal?: { name: string; break: number }[];
  /** ベンチ役割（代打/代走/守備固め） */
  benchRole?: '代打' | '代走' | '守備固め';
  /** 育成契約か（一軍出場には支配下登録が必要） */
  ikusei?: boolean;
}

/** 監督（采配と性格） */
export interface Manager {
  name: string;
  /** 攻撃的=盗塁/代打積極 / 堅実=手堅い / データ重視=確率の高い采配 */
  style: '攻撃的' | '堅実' | 'データ重視';
  /** 采配力 0-100 */
  skill: number;
}

export interface Coach {
  type: '打撃' | '投手';
  name: string;
  /** 指導力 0-100（選手の成長を加速） */
  skill: number;
}

export interface Team {
  name: string;
  shortName: string;
  /** 打順（1〜9番） */
  lineup: Player[];
  /** 先発投手 */
  pitcher: Player;
  /** 控え野手（代打・代走・守備固め・負傷交代に使う） */
  bench: Player[];
  /** 救援投手（継投に使う。末尾ほど勝ちパターン） */
  bullpen: Player[];
  /** 監督 */
  manager?: Manager;
  /** コーチ陣 */
  coaches?: Coach[];
  /** 球団資金（万円） */
  funds?: number;
  /** 先発ローテーション（pitcher は「今日の先発」。試合ごとに巡る） */
  rotation?: Player[];
  /** 二軍（育成契約者を含む） */
  farm?: Player[];
  /** スカウト（ドラフトで選手の能力をどこまで見抜けるか） */
  scout?: { name: string; skill: number };
  /** ローテの巡り（次に投げる先発の index） */
  rotationIdx?: number;
  /** 球団の性格（生成バイアス＝チームカラー/個性） */
  archetype?: '強打' | '投手王国' | '機動力' | '守備堅守' | 'バランス';
}

/** 1試合の集計（簡易ボックススコア） */
export interface TeamLine {
  team: Team;
  runs: number;
  hits: number;
  errors: number;
  /** イニングごとの得点 */
  byInning: number[];
}

/** 実況イベントの種別（UIでの色分け・再生テンポ制御に使う） */
export type EventKind =
  | 'info' // イニング表示・チェンジ・試合終了
  | 'situation' // 打席ごとの状況見出し（◯番 ◯◯　一死二塁）
  | 'pitch' // 1球（BSOランプ用。ログには残さない）
  | 'hit'
  | 'out'
  | 'score'
  | 'walk'
  | 'homerun'
  | 'mound' // マウンドでの間
  | 'sub' // 継投・代打・代走・守備固め
  | 'injury'; // 負傷・アクシデント

/** 実況ログ1行（pitch はライブパネルのみで消費） */
export interface GameEvent {
  /** イニング番号（1始まり） */
  inning: number;
  /** 表 = top / 裏 = bottom */
  half: 'top' | 'bottom';
  /** 実況テキスト */
  text: string;
  /** この時点でのアウトカウント */
  outs: number;
  /** 塁状況（一・二・三塁に走者がいるか） */
  bases: [boolean, boolean, boolean];
  /** この時点のスコア [away, home] */
  score: [number, number];
  kind: EventKind;
  /** ボールカウント [ボール, ストライク]。打席進行中のみ */
  count?: [number, number];
  /** 現在の打者ラベル（例: 「4番 木村颯太」） */
  batter?: string;
  /** 現在の投手ラベル（例: 「高橋匠（52球）」） */
  pitcherLabel?: string;
  /** 同じ打席に属するイベントをまとめるためのID（折りたたみ表示用） */
  paId?: number;
}

/** 1試合の打者個人成績 */
export interface GameBatting {
  ab: number;
  h: number;
  hr: number;
  k: number;
  rbi: number;
  sb: number;
  /** 四死球 */
  bb: number;
  /** 二塁打 */
  d2: number;
  /** 三塁打 */
  d3: number;
}

/** 1試合の投手個人成績 */
export interface GamePitching {
  outs: number;
  runs: number;
  k: number;
  /** 与四死球 */
  bb: number;
  /** 被安打 */
  ha: number;
}

export interface GameResult {
  away: TeamLine;
  home: TeamLine;
  events: GameEvent[];
  /** 何回まで行ったか（延長含む） */
  innings: number;
  /** 選手ID別の個人成績（シーズン集計に使う） */
  batting: Record<string, GameBatting>;
  pitching: Record<string, GamePitching>;
}
