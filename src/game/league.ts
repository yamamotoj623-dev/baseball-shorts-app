// リーグの永続化層。
// 6球団とシーズン個人成績（直近5試合の調子を含む）を localStorage に保存し、
// 試合をまたいで選手の物語（打率・本塁打・盗塁・防御率）が積み上がるようにする。

import type { GameResult, Player, Team } from './types';
import type { SeasonBatterInfo, SeasonPitcherInfo } from './commentary';
import type { SeasonContext } from './simulation';
import { createRng, type Rng } from './rng';
import { generateLeague, payrollOf, playerValue, salaryFor, signPlayer, upgradeTeam } from './players';

const STORAGE_KEY = 'baseball-sim-league-v1';
const RECENT_GAMES = 5;
/** この試合数ごとに1年が経過（加齢・年俸更改・決算） */
export const SEASON_LENGTH = 30;

/** シーズン通算（打者） */
export interface BatTotals {
  g: number;
  ab: number;
  h: number;
  hr: number;
  rbi: number;
  k: number;
  sb: number;
  bb: number;
  d2: number;
  d3: number;
  /** 直近の試合ごとの成績（最大5件） */
  recent: { ab: number; h: number; hr: number }[];
}

/** シーズン通算（投手） */
export interface PitTotals {
  g: number;
  outs: number;
  runs: number;
  k: number;
  bb: number;
  ha: number;
}

/** チームの勝敗記録 */
export interface TeamRecord {
  w: number;
  l: number;
  t: number;
  /** 直近5試合の結果（W/L/T、新しいものが末尾） */
  last5?: string[];
}

export interface LeagueState {
  version: number;
  teams: Team[];
  bat: Record<string, BatTotals>;
  pit: Record<string, PitTotals>;
  /** チーム勝敗（チーム略称をキーに） */
  records: Record<string, TeamRecord>;
  /** プレイヤーが選んだ自球団（略称）。未選択なら undefined */
  myTeam?: string;
  /** 消化済み試合数 */
  games: number;
  /** 球団ニュース（成長・年度替わり等。新しいものが先頭） */
  news?: string[];
  /** スタミナ（試合1回につき1消費。時間で回復） */
  stamina?: number;
  /** スタミナの最終更新時刻（epoch ms） */
  staminaAt?: number;
  /** 再配分チケット（選手の能力を振り直すのに1枚必要） */
  tickets?: number;
  /** 二軍の通算成績（一軍とは別集計） */
  farmBat?: Record<string, { g: number; ab: number; h: number; hr: number; rbi: number }>;
  farmPit?: Record<string, { g: number; outs: number; runs: number; k: number }>;
  /** 現役ドラフトを実施済みの年度 */
  genDraftYear?: number;
}

// ── スタミナ・チケット経済（将来の課金ポイント） ──────────────────────────────

export const STAMINA_MAX = 10;
/** 1スタミナの回復にかかる時間 */
export const STAMINA_REGEN_MS = 10 * 60 * 1000;

/** 経過時間ぶんスタミナを回復させる（呼ぶたびに現在値へ更新） */
export function refreshStamina(league: LeagueState): void {
  const now = Date.now();
  league.stamina ??= STAMINA_MAX;
  league.staminaAt ??= now;
  if (league.stamina >= STAMINA_MAX) {
    league.staminaAt = now;
    return;
  }
  const gained = Math.floor((now - league.staminaAt) / STAMINA_REGEN_MS);
  if (gained > 0) {
    league.stamina = Math.min(STAMINA_MAX, league.stamina + gained);
    league.staminaAt = league.stamina >= STAMINA_MAX ? now : league.staminaAt + gained * STAMINA_REGEN_MS;
  }
}

/** 次の1回復までの残りミリ秒（満タンなら0） */
export function nextStaminaIn(league: LeagueState): number {
  if ((league.stamina ?? STAMINA_MAX) >= STAMINA_MAX) return 0;
  return Math.max(0, STAMINA_REGEN_MS - (Date.now() - (league.staminaAt ?? Date.now())));
}

/** スタミナを1消費。足りなければ false */
export function spendStamina(league: LeagueState): boolean {
  refreshStamina(league);
  if ((league.stamina ?? 0) < 1) return false;
  if (league.stamina === STAMINA_MAX) league.staminaAt = Date.now();
  league.stamina = (league.stamina ?? 0) - 1;
  return true;
}

/** 再配分チケットを1消費。足りなければ false */
export function spendTicket(league: LeagueState): boolean {
  if ((league.tickets ?? 0) < 1) return false;
  league.tickets = (league.tickets ?? 0) - 1;
  return true;
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
    news: [],
    stamina: STAMINA_MAX,
    staminaAt: Date.now(),
    tickets: 3,
    farmBat: {},
    farmPit: {},
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
    parsed.news ??= [];
    parsed.stamina ??= STAMINA_MAX;
    parsed.staminaAt ??= Date.now();
    parsed.tickets ??= 3;
    parsed.farmBat ??= {};
    parsed.farmPit ??= {};
    const mig = createRng(7777);
    for (const t of parsed.teams) upgradeTeam(t, mig);
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
    const t = (league.bat[id] ??= { g: 0, ab: 0, h: 0, hr: 0, rbi: 0, k: 0, sb: 0, bb: 0, d2: 0, d3: 0, recent: [] });
    t.g += 1;
    t.ab += gb.ab;
    t.h += gb.h;
    t.hr += gb.hr;
    t.rbi += gb.rbi;
    t.k += gb.k;
    t.sb += gb.sb;
    t.bb += gb.bb ?? 0;
    t.d2 += gb.d2 ?? 0;
    t.d3 += gb.d3 ?? 0;
    t.recent.push({ ab: gb.ab, h: gb.h, hr: gb.hr });
    if (t.recent.length > RECENT_GAMES) t.recent.splice(0, t.recent.length - RECENT_GAMES);
  }
  for (const [id, gp] of Object.entries(result.pitching)) {
    if (gp.outs === 0 && gp.runs === 0) continue;
    const t = (league.pit[id] ??= { g: 0, outs: 0, runs: 0, k: 0, bb: 0, ha: 0 });
    t.g += 1;
    t.outs += gp.outs;
    t.runs += gp.runs;
    t.k += gp.k;
    t.bb += gp.bb ?? 0;
    t.ha += gp.ha ?? 0;
  }

  // チーム勝敗を記録
  const aKey = result.away.team.shortName;
  const hKey = result.home.team.shortName;
  const ar = (league.records[aKey] ??= { w: 0, l: 0, t: 0 });
  const hr = (league.records[hKey] ??= { w: 0, l: 0, t: 0 });
  let aRes = 'T';
  let hRes = 'T';
  if (result.away.runs > result.home.runs) {
    ar.w += 1;
    hr.l += 1;
    aRes = 'W';
    hRes = 'L';
  } else if (result.away.runs < result.home.runs) {
    ar.l += 1;
    hr.w += 1;
    aRes = 'L';
    hRes = 'W';
  } else {
    ar.t += 1;
    hr.t += 1;
  }
  (ar.last5 ??= []).push(aRes);
  (hr.last5 ??= []).push(hRes);
  if (ar.last5.length > 5) ar.last5.splice(0, ar.last5.length - 5);
  if (hr.last5.length > 5) hr.last5.splice(0, hr.last5.length - 5);

  league.games += 1;
}

/** 自球団を設定する */
export function setMyTeam(league: LeagueState, shortName: string): void {
  league.myTeam = shortName;
}

/** 自球団を取得（未設定なら undefined） */
export function myTeamOf(league: LeagueState): Team | undefined {
  return league.teams.find((t) => t.shortName === league.myTeam);
}

/** 獲得した選手を自球団に組み込む。各獲得の「放出選手」名を返す */
export function applyDraft(league: LeagueState, picks: Player[]): { signed: string; released: string }[] {
  const team = myTeamOf(league);
  if (!team) return [];
  return picks.map((p) => {
    const released = signPlayer(team, p);
    return { signed: p.name, released: released.name };
  });
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
  last5?: string[];
}

/** 勝率順の順位表を構築する（勝率＝勝/(勝+負)、ゲーム差つき） */
export function standings(league: LeagueState): StandingRow[] {
  const rows = league.teams.map((team) => {
    const r = league.records[team.shortName] ?? { w: 0, l: 0, t: 0 };
    const decided = r.w + r.l;
    return { team, w: r.w, l: r.l, t: r.t, pct: decided > 0 ? r.w / decided : 0, gb: 0, rank: 0, last5: r.last5 };
  });
  rows.sort((a, b) => b.pct - a.pct || b.w - a.w || a.l - b.l);
  const lead = rows[0];
  rows.forEach((row, i) => {
    row.rank = i + 1;
    row.gb = lead ? ((lead.w - row.w) + (row.l - lead.l)) / 2 : 0;
  });
  return rows;
}

// ── 成長・モチベーション・資金エンジン ──────────────────────────────

function allPlayersOf(team: Team): Player[] {
  return [...team.lineup, team.pitcher, ...team.bullpen, ...team.bench];
}

/** 年齢による成長係数（若手は伸び、ベテランは止まり、高齢は衰える） */
function ageFactor(age: number): number {
  if (age <= 23) return 1.0;
  if (age <= 27) return 0.55;
  if (age <= 30) return 0.25;
  if (age <= 32) return 0.05;
  return 0;
}

function coachSkillOf(team: Team, type: '打撃' | '投手'): number {
  return team.coaches?.find((c) => c.type === type)?.skill ?? 50;
}

function bumpStat(p: Player, rng: Rng, delta: number): string | null {
  if (p.pitches) {
    const keys = ['velocity', 'control', 'stamina'] as const;
    const k = rng.pick([...keys]);
    const before = p.pitches[k];
    p.pitches[k] = Math.max(1, Math.min(99, before + delta));
    if (p.pitches[k] === before) return null;
    const label = { velocity: '球速', control: '制球', stamina: 'スタミナ' }[k];
    return `${label}${delta > 0 ? '+1' : '-1'}`;
  }
  const keys = delta > 0 ? (['meet', 'power', 'speed', 'defense'] as const) : (['speed', 'defense'] as const);
  const k = rng.pick([...keys]);
  const before = p.bats[k];
  p.bats[k] = Math.max(1, Math.min(99, before + delta));
  if (p.bats[k] === before) return null;
  const label = { meet: 'ミート', power: 'パワー', speed: '走力', defense: '守備' }[k];
  return `${label}${delta > 0 ? '+1' : '-1'}`;
}

/**
 * 試合後の進行処理: モチベーション更新・出場選手の成長・年度替わり。
 * 自球団に関するニュース行を返す（UI表示用）。applyGame の後に呼ぶ。
 */
export function progressTick(league: LeagueState, result: GameResult): string[] {
  const rng = createRng(league.games * 7919 + 13);
  const news: string[] = [];
  const myShort = league.myTeam;

  const homeWon = result.home.runs > result.away.runs;
  const awayWon = result.away.runs > result.home.runs;
  const appeared = new Set([...Object.keys(result.batting), ...Object.keys(result.pitching)]);

  // 調子の変動・投手の休養・自軍の二軍戦
  for (const team of league.teams) {
    driftCondition(team, rng);
    const played = team.shortName === result.away.team.shortName || team.shortName === result.home.team.shortName;
    if (played) applyRest(team, appeared);
    if (team.shortName === myShort) simulateFarmGame(league, team, rng);
  }

  for (const team of [result.away.team, result.home.team]) {
    const won = team === result.away.team ? awayWon : homeWon;
    const lost = team === result.away.team ? homeWon : awayWon;
    const isMine = team.shortName === myShort;
    const realTeam = league.teams.find((t) => t.shortName === team.shortName);
    if (!realTeam) continue;

    for (const p of allPlayersOf(realTeam)) {
      // モチベーション: 勝敗と出場で増減
      let m = p.motivation ?? 60;
      if (won) m += 2;
      if (lost) m -= 2;
      if (appeared.has(p.id)) m += 1;
      p.motivation = Math.max(20, Math.min(95, m));

      // 成長: 出場した選手のみ。年齢×素質×コーチで確率が決まる
      if (!appeared.has(p.id)) continue;
      const coach = coachSkillOf(realTeam, p.pitches ? '投手' : '打撃');
      const growP = 0.16 * ageFactor(p.age ?? 27) * (0.7 + (p.potential ?? 50) / 140) * (1 + (coach - 50) / 250);
      if (rng.chance(Math.max(0, growP))) {
        const msg = bumpStat(p, rng, 1);
        if (msg && isMine) news.push(`📈 ${p.name}が成長（${msg}）`);
      }
      // 衰え: 33歳以上はまれに能力が落ちる
      if ((p.age ?? 27) >= 33 && rng.chance(0.08)) {
        const msg = bumpStat(p, rng, -1);
        if (msg && isMine) news.push(`📉 ${p.name}、年齢の影響か（${msg}）`);
      }
    }
  }

  // 自球団が勝つたび、3勝ごとに再配分チケットを1枚獲得
  if (myShort) {
    const myWon = (result.away.team.shortName === myShort && awayWon) || (result.home.team.shortName === myShort && homeWon);
    if (myWon) {
      const w = league.records[myShort]?.w ?? 0;
      if (w > 0 && w % 3 === 0) {
        league.tickets = (league.tickets ?? 0) + 1;
        news.push('🎟 3勝達成ボーナス！再配分チケットを1枚獲得');
      }
    }
  }

  // ── 年度替わり（SEASON_LENGTH 試合ごと）──
  if (league.games > 0 && league.games % SEASON_LENGTH === 0) {
    const year = Math.floor(league.games / SEASON_LENGTH);
    const champ = standings(league)[0];
    if (champ) {
      const mine = champ.team.shortName === myShort;
      news.unshift(
        mine
          ? `🏆🎉 リーグ優勝！！ ${champ.team.name}が第${year}年度を制した！（${champ.w}勝${champ.l}敗）`
          : `🏆 第${year}年度リーグ優勝: ${champ.team.name}（${champ.w}勝${champ.l}敗）`,
      );
    }
    news.unshift(`🗓 第${year}年度が終了。全選手が1歳年を取り、年俸が更改された`);
    for (const team of league.teams) {
      const isMine = team.shortName === myShort;
      for (const p of allPlayersOf(team)) {
        p.age = (p.age ?? 27) + 1;
        // オフの自主トレ: 若手は伸びる
        if ((p.age ?? 27) <= 25 && rng.chance(0.6)) bumpStat(p, rng, 1);
        // 年俸更改: 現能力から再算定（成長していれば昇給）
        const old = p.salary ?? salaryFor(p);
        p.salary = salaryFor(p);
        if (isMine && p.salary > old * 1.15) news.push(`💰 ${p.name}が大幅昇給（${Math.round(old / 100) / 10}億→${Math.round(p.salary / 100) / 10}億円相当）`);
      }
      // 球団決算: 入場料収入＋勝利ボーナス − 年俸総額
      const rec = league.records[team.shortName] ?? { w: 0, l: 0, t: 0 };
      const income = 250000 + rec.w * 2500;
      team.funds = Math.max(0, (team.funds ?? 300000) + income - payrollOf(team));
      if (isMine) news.push(`🏦 球団決算: 収入${Math.round(income / 10000)}億 − 年俸${Math.round(payrollOf(team) / 10000)}億 → 資金${Math.round((team.funds ?? 0) / 10000)}億円`);
    }
  }

  league.news = [...news, ...(league.news ?? [])].slice(0, 8);
  return news;
}

// ── ローテーション・休養・調子・二軍 ──────────────────────────────

/** 今日の先発をローテから選ぶ（休養中はスキップ）。team.pitcher を更新する */
export function rotateStarter(team: Team): void {
  const rot = team.rotation ?? [team.pitcher];
  if (rot.length === 0) return;
  let idx = team.rotationIdx ?? 0;
  for (let i = 0; i < rot.length; i++) {
    const cand = rot[(idx + i) % rot.length];
    if ((cand.rest ?? 0) <= 0) {
      team.pitcher = cand;
      team.rotationIdx = (idx + i + 1) % rot.length;
      return;
    }
  }
  // 全員休養中なら最も回復が近い投手を強行登板
  team.pitcher = rot[idx % rot.length];
  team.rotationIdx = (idx + 1) % rot.length;
}

/** 登板した投手に休養を課し、他は1回復させる（試合後に呼ぶ） */
function applyRest(team: Team, appeared: Set<string>): void {
  const rot = team.rotation ?? [];
  for (const p of [...rot, ...team.bullpen]) {
    if (appeared.has(p.id)) {
      // 先発はローテ1巡（中3試合）、リリーフは1試合休み
      p.rest = rot.includes(p) ? 3 : 1;
    } else {
      p.rest = Math.max(0, (p.rest ?? 0) - 1);
    }
  }
}

/** 調子をランダムウォークさせる（全員、試合ごと） */
function driftCondition(team: Team, rng: Rng): void {
  const all = [...team.lineup, ...(team.rotation ?? []), ...team.bullpen, ...team.bench, ...(team.farm ?? [])];
  for (const p of all) {
    const c = p.condition ?? 2;
    const r = rng.next();
    p.condition = r < 0.18 ? Math.min(4, c + 1) : r < 0.36 ? Math.max(0, c - 1) : c;
  }
}

/** 自軍の二軍戦を簡易シミュレートして二軍成績を蓄積する */
function simulateFarmGame(league: LeagueState, team: Team, rng: Rng): void {
  for (const p of team.farm ?? []) {
    if (p.pitches) {
      const t = ((league.farmPit ??= {})[p.id] ??= { g: 0, outs: 0, runs: 0, k: 0 });
      t.g += 1;
      t.outs += 9 + rng.int(0, 7); // 3〜5回
      const quality = (p.pitches.velocity + p.pitches.control) / 2;
      t.runs += Math.max(0, rng.int(0, 5) - Math.floor((quality - 40) / 15));
      t.k += rng.int(1, 6);
    } else {
      const t = ((league.farmBat ??= {})[p.id] ??= { g: 0, ab: 0, h: 0, hr: 0, rbi: 0 });
      t.g += 1;
      const ab = 3 + rng.int(0, 2);
      t.ab += ab;
      let h = 0;
      for (let i = 0; i < ab; i++) if (rng.chance(0.18 + p.bats.meet / 400)) h += 1;
      t.h += h;
      if (rng.chance(p.bats.power / 600)) {
        t.hr += 1;
        t.rbi += 1 + rng.int(0, 2);
      } else if (h > 0 && rng.chance(0.3)) {
        t.rbi += 1;
      }
    }
  }
}

// ── トレード・現役ドラフト ──────────────────────────────

/** トレード提案。AIは価値が釣り合えば受ける（自分の選手価値の92%以上を要求） */
export function proposeTrade(league: LeagueState, mine: Player, theirs: Player, theirTeam: Team): boolean {
  const my = myTeamOf(league);
  if (!my) return false;
  if (playerValue(mine) < playerValue(theirs) * 0.92) return false; // 安すぎる提案は拒否

  const swapOut = (team: Team, p: Player, incoming: Player): boolean => {
    const groups: Player[][] = [team.lineup, team.bench, team.rotation ?? [], team.bullpen, team.farm ?? []];
    for (const g of groups) {
      const i = g.findIndex((x) => x.id === p.id);
      if (i >= 0) {
        // 野手同士はポジションを引き継ぐ
        if (!p.pitches && !incoming.pitches) incoming.position = p.position;
        g[i] = incoming;
        if (team.pitcher.id === p.id) team.pitcher = incoming;
        return true;
      }
    }
    return false;
  };

  // 同タイプ（投手⇔投手 / 野手⇔野手）のみ成立
  if (Boolean(mine.pitches) !== Boolean(theirs.pitches)) return false;
  if (!swapOut(my, mine, theirs)) return false;
  swapOut(theirTeam, theirs, mine);
  league.news = [`🤝 トレード成立: ${mine.name} ⇄ ${theirs.name}（${theirTeam.shortName}）`, ...(league.news ?? [])].slice(0, 8);
  return true;
}

/** 現役ドラフト候補（他球団の控え・二軍からモチベーションの低い選手を1人ずつ） */
export function genDraftCandidates(league: LeagueState): { player: Player; team: Team }[] {
  const my = league.myTeam;
  const cands: { player: Player; team: Team }[] = [];
  for (const team of league.teams) {
    if (team.shortName === my) continue;
    const pool = [...team.bench, ...(team.farm ?? [])].filter((p) => !p.ikusei);
    if (pool.length === 0) continue;
    pool.sort((a, b) => (a.motivation ?? 60) - (b.motivation ?? 60));
    cands.push({ player: pool[0], team });
  }
  return cands;
}

/** 現役ドラフトで1人指名（自軍の最低モチベ控えが相手球団へ）。年1回 */
export function executeGenDraft(league: LeagueState, pick: { player: Player; team: Team }): boolean {
  const my = myTeamOf(league);
  if (!my) return false;
  const year = Math.floor(league.games / SEASON_LENGTH);
  if (league.genDraftYear === year) return false;

  // 相手球団から外す
  const groups: Player[][] = [pick.team.bench, pick.team.farm ?? []];
  let removed = false;
  for (const g of groups) {
    const i = g.findIndex((x) => x.id === pick.player.id);
    if (i >= 0) {
      // 自軍から放出する選手（モチベ最低の控え）
      const myPool = [...my.bench];
      myPool.sort((a, b) => (a.motivation ?? 60) - (b.motivation ?? 60));
      const out = myPool[0];
      const oi = my.bench.findIndex((x) => x.id === out.id);
      g[i] = out; // 相手に渡す
      my.bench[oi] = pick.player; // 自軍に加える
      pick.player.motivation = 75; // 新天地で心機一転
      removed = true;
      break;
    }
  }
  if (!removed) return false;
  league.genDraftYear = year;
  league.news = [`📋 現役ドラフト: ${pick.player.name}を獲得（${pick.team.shortName}へ控え選手を放出）`, ...(league.news ?? [])].slice(0, 8);
  return true;
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
