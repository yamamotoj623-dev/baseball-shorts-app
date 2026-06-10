// リーグの永続化層。
// 6球団とシーズン個人成績（直近5試合の調子を含む）を localStorage に保存し、
// 試合をまたいで選手の物語（打率・本塁打・盗塁・防御率）が積み上がるようにする。

import type { GameResult, Team } from './types';
import type { SeasonBatterInfo, SeasonPitcherInfo } from './commentary';
import type { SeasonContext } from './simulation';
import { createRng } from './rng';
import { generateLeague } from './players';

const STORAGE_KEY = 'baseball-sim-league-v1';
const RECENT_GAMES = 5;

/** シーズン通算（打者） */
export interface BatTotals {
  g: number;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  k: number;
  sb: number;
  /** 直近の試合ごとの成績（最大5件） */
  recent: { ab: number; h: number; hr: number }[];
}

/** シーズン通算（投手） */
export interface PitTotals {
  g: number;
  outs: number;
  runs: number;
  k: number;
}

/** チームの勝敗記録 */
export interface TeamRecord {
  w: number;
  l: number;
  t: number;
}

export interface LeagueState {
  version: number;
  teams: Team[];
  bat: Record<string, BatTotals>;
  pit: Record<string, PitTotals>;
  /** チーム勝敗（チーム略称をキーに） */
  records: Record<string, TeamRecord>;
  /** 消化済み試合数 */
  games: number;
}

export function newLeague(): LeagueState {
  const seed = (Math.random() * 2 ** 31) >>> 0;
  const rng = createRng(seed);
  return {
    version: 1,
    teams: generateLeague(rng, 6),
    bat: {},
    pit: {},
    records: {},
    games: 0,
  };
}

export function loadLeague(): LeagueState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeagueState;
    if (parsed.version !== 1 || !Array.isArray(parsed.teams) || parsed.teams.length < 2) return null;
    // 旧バージョンのセーブには無いフィールドを補完
    parsed.records ??= {};
    parsed.bat ??= {};
    parsed.pit ??= {};
    return parsed;
  } catch {
    return null;
  }
}

export function saveLeague(league: LeagueState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(league));
  } catch {
    // ストレージ不可（プライベートモード等）でもゲームは続行できる
  }
}

export function resetLeague(): LeagueState {
  const league = newLeague();
  saveLeague(league);
  return league;
}

/** 試合結果をシーズン成績へ反映する */
export function applyGame(league: LeagueState, result: GameResult): void {
  for (const [id, gb] of Object.entries(result.batting)) {
    const t = (league.bat[id] ??= { g: 0, ab: 0, h: 0, hr: 0, rbi: 0, k: 0, sb: 0, recent: [] });
    t.g += 1;
    t.ab += gb.ab;
    t.h += gb.h;
    t.hr += gb.hr;
    t.rbi += gb.rbi;
    t.k += gb.k;
    t.sb += gb.sb;
    t.recent.push({ ab: gb.ab, h: gb.h, hr: gb.hr });
    if (t.recent.length > RECENT_GAMES) t.recent.splice(0, t.recent.length - RECENT_GAMES);
  }
  for (const [id, gp] of Object.entries(result.pitching)) {
    if (gp.outs === 0 && gp.runs === 0) continue;
    const t = (league.pit[id] ??= { g: 0, outs: 0, runs: 0, k: 0 });
    t.g += 1;
    t.outs += gp.outs;
    t.runs += gp.runs;
    t.k += gp.k;
  }

  // チーム勝敗を記録
  const aKey = result.away.team.shortName;
  const hKey = result.home.team.shortName;
  const ar = (league.records[aKey] ??= { w: 0, l: 0, t: 0 });
  const hr = (league.records[hKey] ??= { w: 0, l: 0, t: 0 });
  if (result.away.runs > result.home.runs) {
    ar.w += 1;
    hr.l += 1;
  } else if (result.away.runs < result.home.runs) {
    ar.l += 1;
    hr.w += 1;
  } else {
    ar.t += 1;
    hr.t += 1;
  }

  league.games += 1;
}

/** 順位表の1行 */
export interface StandingRow {
  rank: number;
  team: Team;
  w: number;
  l: number;
  t: number;
  pct: number;
  /** ゲーム差（首位は0） */
  gb: number;
}

/** 勝率順の順位表を構築する（勝率＝勝/(勝+負)、ゲーム差つき） */
export function standings(league: LeagueState): StandingRow[] {
  const rows = league.teams.map((team) => {
    const r = league.records[team.shortName] ?? { w: 0, l: 0, t: 0 };
    const decided = r.w + r.l;
    return { team, w: r.w, l: r.l, t: r.t, pct: decided > 0 ? r.w / decided : 0, gb: 0, rank: 0 };
  });
  rows.sort((a, b) => b.pct - a.pct || b.w - a.w || a.l - b.l);
  const lead = rows[0];
  rows.forEach((row, i) => {
    row.rank = i + 1;
    row.gb = lead ? ((lead.w - row.w) + (row.l - lead.l)) / 2 : 0;
  });
  return rows;
}

/** 実況用のシーズンサマリを構築する */
export function seasonContext(league: LeagueState): SeasonContext {
  const bat = new Map<string, SeasonBatterInfo>();
  for (const [id, t] of Object.entries(league.bat)) {
    const recentAb = t.recent.reduce((a, r) => a + r.ab, 0);
    const recentH = t.recent.reduce((a, r) => a + r.h, 0);
    const recentHr = t.recent.reduce((a, r) => a + r.hr, 0);
    bat.set(id, {
      games: t.g,
      ab: t.ab,
      h: t.h,
      hr: t.hr,
      sb: t.sb,
      avg: t.ab > 0 ? t.h / t.ab : 0,
      recentAb,
      recentH,
      recentHr,
    });
  }
  const pit = new Map<string, SeasonPitcherInfo>();
  for (const [id, t] of Object.entries(league.pit)) {
    pit.set(id, {
      games: t.g,
      era: t.outs > 0 ? (t.runs * 27) / t.outs : 0,
      k: t.k,
    });
  }
  return { bat, pit };
}
