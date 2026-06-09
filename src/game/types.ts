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

export interface Player {
  id: string;
  name: string;
  position: Position;
  bats: BatterStats;
  /** 投手のみ保持 */
  pitches?: PitcherStats;
}

export interface Team {
  name: string;
  shortName: string;
  /** 打順（1〜9番） */
  lineup: Player[];
  /** 先発投手 */
  pitcher: Player;
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

/** 実況ログ1行 */
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
  /** イベント種別（UIでの色分け用） */
  kind: 'info' | 'hit' | 'out' | 'score' | 'walk' | 'homerun';
}

export interface GameResult {
  away: TeamLine;
  home: TeamLine;
  events: GameEvent[];
  /** 何回まで行ったか（延長含む） */
  innings: number;
}
