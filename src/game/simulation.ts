// 試合シミュレーションの中核。
// 1打席ずつ確率モデルで結果を決め、進塁・得点を処理しながら実況ログを生成する。
// 純粋関数（副作用なし・乱数はRngでDI）なので、UIから切り離してテストできる。

import type { GameEvent, GameResult, Player, Team, TeamLine } from './types';
import { createRng, type Rng } from './rng';

/** 打席の結果種別 */
type AtBatOutcome =
  | 'strikeout'
  | 'walk'
  | 'groundout'
  | 'flyout'
  | 'lineout'
  | 'single'
  | 'double'
  | 'triple'
  | 'homerun';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 守備位置の方向表現（実況の彩り用） */
const HIT_DIRECTIONS = ['レフト', 'センター', 'ライト', '左中間', '右中間'];
const GROUND_DIRECTIONS = ['ショート', 'セカンド', 'サード', 'ファースト', '投手'];
const FLY_DIRECTIONS = ['レフト', 'センター', 'ライト'];

interface HalfState {
  bases: (Player | null)[]; // [一塁, 二塁, 三塁]
  outs: number;
  runs: number;
}

/**
 * 1打席の結果を確率で決定する。
 * 投手の疲労 fatigue(0〜1) が上がるほど制球・球威が落ちる。
 */
function resolveAtBat(batter: Player, pitcher: Player, fatigue: number, rng: Rng): AtBatOutcome {
  const p = pitcher.pitches!;
  const control = p.control * (1 - fatigue * 0.35);
  const velocity = p.velocity * (1 - fatigue * 0.3);

  // 四球: 制球が低いほど増える
  const pWalk = clamp(0.085 + (50 - control) / 320, 0.02, 0.22);
  if (rng.chance(pWalk)) return 'walk';

  // 三振: 球速が打者ミートを上回るほど増える
  const pK = clamp(0.2 + (velocity - batter.bats.meet) / 280, 0.06, 0.42);
  if (rng.chance(pK)) return 'strikeout';

  // インプレー: ヒットかアウトか（BABIP的な判定）
  // 打者ミート vs 投手制球＋守備で安打率を上下させる
  const hitChance = clamp(0.3 + (batter.bats.meet - control) / 360, 0.16, 0.46);
  if (rng.chance(hitChance)) {
    // 安打の種類はパワーで分布を変える
    const pow = batter.bats.power;
    const roll = rng.next();
    const pHR = clamp(0.05 + (pow - 50) / 300, 0.01, 0.22);
    const pTriple = clamp(0.02 + batter.bats.speed / 1500, 0.01, 0.05);
    const pDouble = clamp(0.18 + (pow - 50) / 500, 0.1, 0.28);
    if (roll < pHR) return 'homerun';
    if (roll < pHR + pTriple) return 'triple';
    if (roll < pHR + pTriple + pDouble) return 'double';
    return 'single';
  }

  // アウトの内訳（ゴロ/フライ/ライナー）
  const r = rng.next();
  if (r < 0.45) return 'groundout';
  if (r < 0.85) return 'flyout';
  return 'lineout';
}

/** 走者を base 個進める。3塁を越えたら得点として返す。 */
function advanceRunners(state: HalfState, batter: Player, basesToAdvance: number, batterReaches: number): number {
  // batterReaches: 打者が進む塁数（1=単打,2=二塁打,3=三塁打,4=本塁打）
  let runs = 0;
  const newBases: (Player | null)[] = [null, null, null];

  // 既存走者を進める（3塁→2塁→1塁の順で処理）
  for (let b = 2; b >= 0; b--) {
    const runner = state.bases[b];
    if (!runner) continue;
    const dest = b + basesToAdvance; // 0始まりの塁index
    if (dest >= 3) {
      runs += 1;
    } else {
      newBases[dest] = runner;
    }
  }

  // 打者を進める
  if (batterReaches >= 4) {
    runs += 1;
  } else {
    newBases[batterReaches - 1] = batter;
  }

  state.bases = newBases;
  return runs;
}

function describeBatter(order: number, batter: Player): string {
  return `${order}番 ${batter.name}`;
}

/** 半イニングを消化して、得点とイベント列を返す */
function playHalfInning(
  battingTeam: Team,
  pitcher: Player,
  startOrder: number,
  inning: number,
  half: 'top' | 'bottom',
  scoreRef: [number, number],
  scoreIndex: 0 | 1,
  pitchCount: { thrown: number },
  rng: Rng,
  events: GameEvent[],
): { runs: number; hits: number; nextOrder: number } {
  const state: HalfState = { bases: [null, null, null], outs: 0, runs: 0 };
  let order = startOrder;
  let hits = 0;

  const teamName = battingTeam.shortName;
  events.push({
    inning,
    half,
    text: `${inning}回${half === 'top' ? '表' : '裏'} ${battingTeam.name} の攻撃`,
    outs: 0,
    bases: [false, false, false],
    score: [scoreRef[0], scoreRef[1]],
    kind: 'info',
  });

  while (state.outs < 3) {
    const batter = battingTeam.lineup[order % 9];
    const orderNo = (order % 9) + 1;
    // 投手の疲労: 100球で最大付近に到達する想定
    const fatigue = clamp((pitchCount.thrown - pitcher.pitches!.stamina * 1.1) / 60, 0, 1);
    const outcome = resolveAtBat(batter, pitcher, fatigue, rng);
    pitchCount.thrown += rng.int(3, 7);

    const label = describeBatter(orderNo, batter);
    let runsScored = 0;
    let kind: GameEvent['kind'] = 'out';
    let text = '';

    switch (outcome) {
      case 'walk': {
        // 押し出しを考慮した強制進塁
        const before = state.bases.slice();
        // 一塁が埋まっていれば玉突きで進む
        if (before[0]) {
          if (before[1]) {
            if (before[2]) runsScored += 1; // 満塁→押し出し
            state.bases = [batter, before[0], before[1]];
          } else {
            state.bases = [batter, before[0], null];
          }
        } else {
          state.bases = [batter, before[1], before[2]];
        }
        kind = runsScored > 0 ? 'score' : 'walk';
        text = `${label}、フォアボールで出塁${runsScored > 0 ? '（押し出し！）' : ''}`;
        break;
      }
      case 'strikeout': {
        state.outs += 1;
        text = `${label}、空振り三振`;
        break;
      }
      case 'groundout': {
        // 走者一塁＆2アウト未満で併殺の可能性
        if (state.bases[0] && state.outs < 2 && rng.chance(0.35)) {
          state.outs += 2;
          state.bases[0] = null;
          text = `${label}、${rng.pick(GROUND_DIRECTIONS)}ゴロ ゲッツー！`;
        } else {
          state.outs += 1;
          // 3塁走者は犠打的に還ることがある
          if (state.bases[2] && state.outs < 3 && rng.chance(0.2)) {
            state.bases[2] = null;
            runsScored += 1;
            text = `${label}、${rng.pick(GROUND_DIRECTIONS)}ゴロの間に1点`;
          } else {
            text = `${label}、${rng.pick(GROUND_DIRECTIONS)}ゴロ`;
          }
        }
        break;
      }
      case 'flyout': {
        state.outs += 1;
        // 犠牲フライ
        if (state.bases[2] && state.outs < 3 && rng.chance(0.5)) {
          state.bases[2] = null;
          runsScored += 1;
          text = `${label}、${rng.pick(FLY_DIRECTIONS)}へ犠牲フライ 1点`;
        } else {
          text = `${label}、${rng.pick(FLY_DIRECTIONS)}フライ`;
        }
        break;
      }
      case 'lineout': {
        state.outs += 1;
        text = `${label}、${rng.pick(GROUND_DIRECTIONS)}ライナー`;
        break;
      }
      case 'single': {
        hits += 1;
        // 単打: 走者は1〜2塁進む（足が速いと2つ）
        const adv = batter.bats.speed > 65 && rng.chance(0.4) ? 2 : 1;
        runsScored += advanceRunners(state, batter, adv, 1);
        text = `${label}、${rng.pick(HIT_DIRECTIONS)}へヒット`;
        kind = 'hit';
        break;
      }
      case 'double': {
        hits += 1;
        runsScored += advanceRunners(state, batter, 2, 2);
        text = `${label}、${rng.pick(HIT_DIRECTIONS)}へ二塁打`;
        kind = 'hit';
        break;
      }
      case 'triple': {
        hits += 1;
        runsScored += advanceRunners(state, batter, 3, 3);
        text = `${label}、${rng.pick(HIT_DIRECTIONS)}を破る三塁打！`;
        kind = 'hit';
        break;
      }
      case 'homerun': {
        hits += 1;
        const onBase = state.bases.filter(Boolean).length;
        runsScored += advanceRunners(state, batter, 4, 4);
        text =
          onBase === 3
            ? `${label}、満塁ホームラン！！`
            : `${label}、${rng.pick(HIT_DIRECTIONS)}へホームラン！${onBase > 0 ? `（${onBase}者還る）` : ''}`;
        kind = 'homerun';
        break;
      }
    }

    if (runsScored > 0) {
      state.runs += runsScored;
      scoreRef[scoreIndex] += runsScored;
      if (kind !== 'homerun') kind = 'score';
    }

    events.push({
      inning,
      half,
      text,
      outs: state.outs,
      bases: [Boolean(state.bases[0]), Boolean(state.bases[1]), Boolean(state.bases[2])],
      score: [scoreRef[0], scoreRef[1]],
      kind,
    });

    order += 1;
    if (state.outs >= 3) break;
  }

  void teamName;
  return { runs: state.runs, hits, nextOrder: order };
}

/** 1試合をシミュレートする。seed を渡せば再現可能。 */
export function simulateGame(away: Team, home: Team, seed: number = Date.now()): GameResult {
  const rng = createRng(seed);
  const events: GameEvent[] = [];
  const score: [number, number] = [0, 0];
  const awayByInning: number[] = [];
  const homeByInning: number[] = [];
  let awayHits = 0;
  let homeHits = 0;

  const awayOrder = { v: 0 };
  const homeOrder = { v: 0 };
  const awayPitches = { thrown: 0 };
  const homePitches = { thrown: 0 };

  let inning = 1;
  const maxInnings = 12; // 延長は12回まで（決着しなければ引き分け）

  while (inning <= maxInnings) {
    // 表（アウェイの攻撃 / ホーム投手）
    const top = playHalfInning(
      away,
      home.pitcher,
      awayOrder.v,
      inning,
      'top',
      score,
      0,
      homePitches,
      rng,
      events,
    );
    awayOrder.v = top.nextOrder;
    awayByInning[inning - 1] = top.runs;
    awayHits += top.hits;

    // 9回裏以降、ホームが勝っていればサヨナラ（裏を行わない）
    if (inning >= 9 && score[1] > score[0]) {
      homeByInning[inning - 1] = homeByInning[inning - 1] ?? 0;
      break;
    }

    // 裏（ホームの攻撃 / アウェイ投手）
    const bot = playHalfInning(
      home,
      away.pitcher,
      homeOrder.v,
      inning,
      'bottom',
      score,
      1,
      awayPitches,
      rng,
      events,
    );
    homeOrder.v = bot.nextOrder;
    homeByInning[inning - 1] = bot.runs;
    homeHits += bot.hits;

    // 9回終了時点で決着していれば終了
    if (inning >= 9 && score[0] !== score[1]) break;

    inning += 1;
  }

  const playedInnings = Math.max(awayByInning.length, homeByInning.length);
  // 配列の穴を0で埋める
  for (let i = 0; i < playedInnings; i++) {
    if (awayByInning[i] == null) awayByInning[i] = 0;
    if (homeByInning[i] == null) homeByInning[i] = 0;
  }

  const awayLine: TeamLine = {
    team: away,
    runs: score[0],
    hits: awayHits,
    errors: 0,
    byInning: awayByInning,
  };
  const homeLine: TeamLine = {
    team: home,
    runs: score[1],
    hits: homeHits,
    errors: 0,
    byInning: homeByInning,
  };

  // 試合終了の実況
  const resultText =
    score[0] === score[1]
      ? `試合終了 — 引き分け（${score[0]}-${score[1]}）`
      : `試合終了 — ${(score[0] > score[1] ? away : home).name} の勝利（${Math.max(score[0], score[1])}-${Math.min(score[0], score[1])}）`;
  events.push({
    inning: playedInnings,
    half: 'bottom',
    text: resultText,
    outs: 3,
    bases: [false, false, false],
    score: [score[0], score[1]],
    kind: 'info',
  });

  return { away: awayLine, home: homeLine, events, innings: playedInnings };
}
