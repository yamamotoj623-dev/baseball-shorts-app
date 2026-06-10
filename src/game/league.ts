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

export interface LeagueState {
  version: number;
  teams: Team[];
  bat: Record<string, BatTotals>;
  pit: Record<string, PitTotals>;
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
    games: 0,
  };
}

export function loadLeague(): LeagueState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeagueState;
    if (parsed.version !== 1 || !Array.isArray(parsed.teams) || parsed.teams.length < 2) return null;
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
  league.games += 1;
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
