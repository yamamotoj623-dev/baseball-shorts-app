// 試合シミュレーションの中核。
// 「1球単位」で進行し、BSO・盗塁・牽制・失策・野選・継投・代打・代走・守備固め・負傷まで扱う。
// 実況文は commentary.ts に分離し、試合内で言い回しが重複しないようにしている。
// 純粋関数（副作用なし・乱数はRngでDI）なので、UIから切り離してテストできる。

import type { GameEvent, GameResult, Player, Team, TeamLine } from './types';
import { createRng, type Rng } from './rng';
import * as C from './commentary';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 1球の結果 */
type PitchResult = 'ball' | 'called' | 'swing' | 'foul' | 'inplay' | 'hbp';

/** インプレーの結末 */
type InPlayOutcome = 'groundout' | 'flyout' | 'lineout' | 'single' | 'double' | 'triple' | 'homerun';

/** 攻守それぞれのチーム状態（試合中に変化する） */
interface SideState {
  meta: Team;
  lineup: Player[];
  bench: Player[];
  bullpen: Player[];
  pitcher: Player;
  pitchCount: number;
  pitcherRuns: number;
  order: number;
  visitedInning: number;
  calm: number;
  defSubDone: boolean;
  errors: number;
}

interface HalfState {
  bases: (Player | null)[]; // [一塁, 二塁, 三塁]
  outs: number;
  runs: number;
}

/** 試合内の文脈（ストーリー実況・言い回しの重複回避に使う） */
interface GameMemory {
  used: Set<string>;
  batters: Map<string, C.BatterDay>;
  pitchers: Map<string, C.PitcherDay>;
}

/** シーズン通算成績（リーグ永続化層から渡される。実況の前置きに使う） */
export interface SeasonContext {
  bat: Map<string, C.SeasonBatterInfo>;
  pit: Map<string, C.SeasonPitcherInfo>;
}

/** 試合中の交代でポジション等を書き換えても、永続化されたチームを汚さないよう複製する */
function clonePlayer(p: Player): Player {
  return { ...p, bats: { ...p.bats }, pitches: p.pitches ? { ...p.pitches } : undefined };
}

function makeSide(team: Team): SideState {
  return {
    meta: team,
    lineup: team.lineup.map(clonePlayer),
    bench: team.bench.map(clonePlayer),
    bullpen: team.bullpen.map(clonePlayer),
    pitcher: clonePlayer(team.pitcher),
    pitchCount: 0,
    pitcherRuns: 0,
    order: 0,
    visitedInning: 0,
    calm: 0,
    defSubDone: false,
    errors: 0,
  };
}

function batterDay(mem: GameMemory, p: Player): C.BatterDay {
  let d = mem.batters.get(p.id);
  if (!d) {
    d = { ab: 0, h: 0, k: 0, hr: 0, rbi: 0, sb: 0 };
    mem.batters.set(p.id, d);
  }
  return d;
}

function pitcherDay(mem: GameMemory, p: Player): C.PitcherDay {
  let d = mem.pitchers.get(p.id);
  if (!d) {
    d = { k: 0, outs: 0, runs: 0 };
    mem.pitchers.set(p.id, d);
  }
  return d;
}

function pitcherLabel(side: SideState): string {
  return `${side.pitcher.name}（${side.pitchCount}球）`;
}

/** ポジションで守備者を探す（交代で見つからなければランダム） */
function fielderAt(def: SideState, positions: string[], rng: Rng): Player {
  const cands = def.lineup.filter((p) => positions.includes(p.position));
  if (cands.length > 0) return rng.pick(cands);
  return rng.pick(def.lineup);
}

// ── 1球の確率モデル ──────────────────────────────

function throwPitch(batter: Player, side: SideState, strikes: number, rng: Rng): PitchResult {
  const p = side.pitcher.pitches!;
  const fatigue = clamp((side.pitchCount - p.stamina * 1.1) / 55, 0, 1);
  const control = p.control * (1 - fatigue * 0.35) + side.calm;
  const velocity = p.velocity * (1 - fatigue * 0.3);
  const meet = batter.bats.meet;

  const pHbp = clamp(0.003 + (40 - control) / 8000, 0.001, 0.012);
  if (rng.chance(pHbp)) return 'hbp';

  const pBall = clamp(0.34 + (50 - control) / 270, 0.19, 0.5);
  const pSwing = clamp(0.095 + (velocity - meet) / 420, 0.04, 0.22);
  const pCalled = 0.14;
  const pFoul = strikes >= 2 ? 0.26 : 0.2;

  const r = rng.next();
  if (r < pBall) return 'ball';
  if (r < pBall + pSwing) return 'swing';
  if (r < pBall + pSwing + pCalled) return 'called';
  if (r < pBall + pSwing + pCalled + pFoul) return 'foul';
  return 'inplay';
}

function resolveInPlay(batter: Player, side: SideState, rng: Rng): InPlayOutcome {
  const p = side.pitcher.pitches!;
  const fatigue = clamp((side.pitchCount - p.stamina * 1.1) / 55, 0, 1);
  const control = p.control * (1 - fatigue * 0.35) + side.calm;

  const hitChance = clamp(0.34 + (batter.bats.meet - control) / 340, 0.2, 0.5);
  if (rng.chance(hitChance)) {
    const pow = batter.bats.power;
    const roll = rng.next();
    const pHR = clamp(0.05 + (pow - 50) / 210, 0.01, 0.3); // パワーで大きく変動
    const pTriple = clamp(0.005 + (batter.bats.speed - 30) / 1300, 0.004, 0.06); // 走力依存
    const pDouble = clamp(0.18 + (pow - 50) / 380, 0.08, 0.32);
    if (roll < pHR) return 'homerun';
    if (roll < pHR + pTriple) return 'triple';
    if (roll < pHR + pTriple + pDouble) return 'double';
    return 'single';
  }
  const r = rng.next();
  if (r < 0.45) return 'groundout';
  if (r < 0.85) return 'flyout';
  return 'lineout';
}

// ── 進塁処理 ──────────────────────────────

function advanceRunners(state: HalfState, batter: Player, basesToAdvance: number, batterReaches: number): number {
  let runs = 0;
  const newBases: (Player | null)[] = [null, null, null];
  for (let b = 2; b >= 0; b--) {
    const runner = state.bases[b];
    if (!runner) continue;
    const dest = b + basesToAdvance;
    if (dest >= 3) runs += 1;
    else newBases[dest] = runner;
  }
  if (batterReaches >= 4) runs += 1;
  else newBases[batterReaches - 1] = batter;
  state.bases = newBases;
  return runs;
}

function forceAdvance(state: HalfState, batter: Player): number {
  let runs = 0;
  const b = state.bases;
  if (b[0]) {
    if (b[1]) {
      if (b[2]) runs += 1;
      state.bases = [batter, b[0], b[1]];
    } else {
      state.bases = [batter, b[0], b[2]];
    }
  } else {
    state.bases = [batter, b[1], b[2]];
  }
  return runs;
}

// ── ベンチワーク（監督AI） ──────────────────────────────

function maybeChangePitcher(def: SideState, inning: number, scoreDiff: number): string | null {
  if (def.bullpen.length === 0) return null;
  const p = def.pitcher.pitches!;
  const exhausted = def.pitchCount > p.stamina * 1.25 + 30;
  const shelled = def.pitcherRuns >= 5 && inning >= 4;
  const lateGame = inning >= 8 && Math.abs(scoreDiff) <= 2 && def.pitchCount > p.stamina * 0.9;
  if (!exhausted && !shelled && !lateGame) return null;

  const prev = def.pitcher;
  const useCloser = inning >= 9 && scoreDiff >= 0 && scoreDiff <= 3;
  const next = useCloser ? def.bullpen.pop()! : def.bullpen.shift()!;
  def.pitcher = next;
  def.pitchCount = 0;
  def.pitcherRuns = 0;
  def.calm = 0;

  const reason = shelled ? `${prev.name}、ここで無念の降板。` : exhausted ? `${prev.name}は力尽きた。` : 'ベンチが動いた。';
  const role = useCloser ? '守護神' : 'リリーフ';
  return `🔁 ピッチャー交代。${reason}${role}・${next.name}がマウンドへ${useCloser ? '。球場のボルテージが上がる' : ''}`;
}

function maybeMoundVisit(def: SideState, state: HalfState, inning: number, rng: Rng, mem: GameMemory): string | null {
  const runners = state.bases.filter(Boolean).length;
  if (runners < 2 || def.visitedInning === inning) return null;
  if (runners < 3 && state.runs === 0) return null;
  if (!rng.chance(0.45)) return null;
  def.visitedInning = inning;
  def.calm = 7;
  return C.moundVisitText(rng, mem.used, def.pitcher);
}

function maybePinchHitter(off: SideState, state: HalfState, inning: number, trailingBy: number, rng: Rng): string | null {
  if (inning < 7 || off.bench.length === 0) return null;
  const idx = off.order % 9;
  const current = off.lineup[idx];
  const risp = Boolean(state.bases[1] || state.bases[2]);
  const need = trailingBy >= 0 && trailingBy <= 4;
  if (!risp && !(inning >= 9 && need)) return null;

  const score = (pl: Player) => pl.bats.meet + pl.bats.power;
  let best = -1;
  for (let i = 0; i < off.bench.length; i++) {
    if (best < 0 || score(off.bench[i]) > score(off.bench[best])) best = i;
  }
  if (score(off.bench[best]) < score(current) + 10) return null;
  if (!rng.chance(0.75)) return null;

  const pinch = off.bench.splice(best, 1)[0];
  off.lineup[idx] = pinch;
  return `📣 ここで代打！${current.name}に代わって${pinch.name}。ベンチの勝負手だ`;
}

function maybePinchRunner(off: SideState, state: HalfState, inning: number, closeGame: boolean, rng: Rng): string | null {
  if (inning < 8 || !closeGame || off.bench.length === 0) return null;
  const runner = state.bases[0];
  if (!runner || runner.bats.speed >= 55) return null;
  let best = -1;
  for (let i = 0; i < off.bench.length; i++) {
    if (off.bench[i].bats.speed > 68 && (best < 0 || off.bench[i].bats.speed > off.bench[best].bats.speed)) best = i;
  }
  if (best < 0 || !rng.chance(0.7)) return null;
  const fast = off.bench.splice(best, 1)[0];
  const li = off.lineup.findIndex((pl) => pl.id === runner.id);
  if (li >= 0) off.lineup[li] = fast;
  state.bases[0] = fast;
  return `💨 代走に${fast.name}。一塁ベース上、いつでもスタートを切れる構えだ`;
}

function maybeDefensiveSub(def: SideState, inning: number, leading: boolean, rng: Rng): string | null {
  if (inning < 8 || !leading || def.defSubDone || def.bench.length === 0) return null;
  let weakest = 0;
  for (let i = 1; i < def.lineup.length; i++) {
    if (def.lineup[i].bats.defense < def.lineup[weakest].bats.defense) weakest = i;
  }
  let best = -1;
  for (let i = 0; i < def.bench.length; i++) {
    if (best < 0 || def.bench[i].bats.defense > def.bench[best].bats.defense) best = i;
  }
  if (best < 0 || def.bench[best].bats.defense < def.lineup[weakest].bats.defense + 10) return null;
  if (!rng.chance(0.8)) return null;
  const out = def.lineup[weakest];
  const sub = def.bench.splice(best, 1)[0];
  sub.position = out.position; // 守備位置を引き継ぐ
  def.lineup[weakest] = sub;
  def.defSubDone = true;
  return `🧤 守備固め。${out.name}に代えて${sub.name}が入る。逃げ切り態勢だ`;
}

function maybeInjury(off: SideState, state: HalfState, baseIdx: number, rng: Rng): string | null {
  if (!rng.chance(0.004) || off.bench.length === 0) return null;
  const hurt = state.bases[baseIdx];
  if (!hurt) return null;
  const sub = off.bench.shift()!;
  const li = off.lineup.findIndex((pl) => pl.id === hurt.id);
  if (li >= 0) off.lineup[li] = sub;
  state.bases[baseIdx] = sub;
  return `⚠️ ${hurt.name}、走塁中に足を痛めて倒れ込んだ……トレーナーが駆け寄る。無念の交代、${sub.name}が緊急出場`;
}

// ── 半イニング ──────────────────────────────

interface HalfResult {
  runs: number;
  hits: number;
  walkoff: boolean;
}

function playHalfInning(
  off: SideState,
  def: SideState,
  inning: number,
  half: 'top' | 'bottom',
  scoreRef: [number, number],
  scoreIndex: 0 | 1,
  rng: Rng,
  events: GameEvent[],
  mem: GameMemory,
  season?: SeasonContext,
): HalfResult {
  const state: HalfState = { bases: [null, null, null], outs: 0, runs: 0 };
  let hits = 0;
  const defIndex = (1 - scoreIndex) as 0 | 1;

  const push = (text: string, kind: GameEvent['kind'], extra?: Partial<GameEvent>) => {
    events.push({
      inning,
      half,
      text,
      outs: state.outs,
      bases: [Boolean(state.bases[0]), Boolean(state.bases[1]), Boolean(state.bases[2])],
      score: [scoreRef[0], scoreRef[1]],
      kind,
      pitcherLabel: pitcherLabel(def),
      ...extra,
    });
  };

  /** 守備側投手にアウトを記録 */
  const chargeOuts = (n: number) => {
    pitcherDay(mem, def.pitcher).outs += n;
  };

  push(`■ ${inning}回${half === 'top' ? '表' : '裏'}　${off.meta.name} の攻撃`, 'info');

  // 好投・乱調への言及（イニング頭）
  const note = C.pitcherNoteLine(rng, mem.used, def.pitcher, pitcherDay(mem, def.pitcher), season?.pit.get(def.pitcher.id));
  if (note) push(note, 'mound');

  // 守備固め
  const defLeading = scoreRef[defIndex] > scoreRef[scoreIndex];
  const defSub = maybeDefensiveSub(def, inning, defLeading, rng);
  if (defSub) push(defSub, 'sub');

  while (state.outs < 3) {
    // ── 打席前のベンチワーク ──
    const defDiff = scoreRef[defIndex] - scoreRef[scoreIndex];
    const change = maybeChangePitcher(def, inning, defDiff);
    if (change) push(change, 'sub');

    const visit = maybeMoundVisit(def, state, inning, rng, mem);
    if (visit) push(visit, 'mound');

    const ph = maybePinchHitter(off, state, inning, defDiff, rng);
    if (ph) push(ph, 'sub');

    // ── 走塁イベント（牽制・盗塁）。一塁走者がいて二塁が空いている時 ──
    const runner1 = state.bases[0];
    if (runner1 && !state.bases[1]) {
      // 牽制（フレーバー or 稀にアウト）
      if (runner1.bats.speed >= 62 && rng.chance(0.07)) {
        if (rng.chance(0.045)) {
          state.outs += 1;
          state.bases[0] = null;
          chargeOuts(1);
          push(C.pickoffOutText(rng, mem.used, runner1), 'out');
          if (state.outs >= 3) break;
        } else {
          push(C.pickoffFlavorText(rng, mem.used, def.pitcher), 'mound');
        }
      }
      // 盗塁（俊足ほど仕掛ける。NPB水準: 両軍計で企図1強/試合・成功率7割前後）
      const r1 = state.bases[0];
      if (r1) {
        const attemptP = clamp((r1.bats.speed - 46) / 150, 0, 0.28);
        if (rng.chance(attemptP)) {
          const catcher = fielderAt(def, ['捕'], rng);
          const successP = clamp(0.6 + (r1.bats.speed - 50) / 105 - (catcher.bats.defense - 50) / 240, 0.38, 0.95);
          if (rng.chance(successP)) {
            state.bases[1] = r1;
            state.bases[0] = null;
            const rd = batterDay(mem, r1);
            rd.sb += 1;
            const nth = (season?.bat.get(r1.id)?.sb ?? 0) + rd.sb;
            push(C.stealSuccessText(rng, mem.used, r1, nth), 'hit');
          } else {
            state.outs += 1;
            state.bases[0] = null;
            chargeOuts(1);
            push(C.caughtStealingText(rng, mem.used, r1), 'out');
            if (state.outs >= 3) break;
          }
        }
      }
    }

    const batter = off.lineup[off.order % 9];
    const orderNo = (off.order % 9) + 1;
    const batterLabel = `${orderNo}番 ${batter.name}`;
    const day = batterDay(mem, batter);

    // 打席紹介（今日の成績・特徴に言及。出しすぎない）
    const intro = C.batterIntroLine(rng, mem.used, batterLabel, batter, day, season?.bat.get(batter.id));
    if (intro) push(intro, 'mound', { batter: batterLabel });

    const prefix = C.situationLine(rng, mem.used, {
      bases: [Boolean(state.bases[0]), Boolean(state.bases[1]), Boolean(state.bases[2])],
      outs: state.outs,
      inning,
      half,
      battingScore: scoreRef[scoreIndex],
      oppScore: scoreRef[defIndex],
    });

    // ── 1球ずつの勝負 ──
    let balls = 0;
    let strikes = 0;
    let terminal: 'walk' | 'hbp' | 'strikeout' | InPlayOutcome | null = null;

    while (terminal === null) {
      const pr = throwPitch(batter, def, strikes, rng);
      def.pitchCount += 1;

      if (pr === 'hbp') {
        terminal = 'hbp';
        break;
      }
      if (pr === 'inplay') {
        terminal = resolveInPlay(batter, def, rng);
        break;
      }

      let pitchText = '';
      if (pr === 'ball') {
        balls += 1;
        if (balls >= 4) {
          terminal = 'walk';
          break;
        }
        pitchText = rng.pick(C.BALL_CALLS);
      } else if (pr === 'called') {
        strikes += 1;
        if (strikes >= 3) {
          terminal = 'strikeout';
          break;
        }
        pitchText = rng.pick(C.CALLED_STRIKES);
      } else if (pr === 'swing') {
        strikes += 1;
        if (strikes >= 3) {
          terminal = 'strikeout';
          break;
        }
        pitchText = rng.pick(C.SWING_MISSES);
      } else {
        if (strikes < 2) strikes += 1;
        pitchText = rng.pick(C.FOULS);
      }

      if (balls === 3 && strikes === 2) pitchText += ' ──フルカウント';
      push(pitchText, 'pitch', { count: [balls, strikes], batter: batterLabel });
    }

    // ── 打席結果の処理 ──
    let runsScored = 0;
    let kind: GameEvent['kind'] = 'out';
    let text = '';
    let countAB = true; // 打数に数えるか
    let creditRbi = true; // 打点を付けるか（失策出塁では付けない）

    switch (terminal) {
      case 'walk': {
        runsScored += forceAdvance(state, batter);
        kind = runsScored > 0 ? 'score' : 'walk';
        text = C.walkText(rng, mem.used, batterLabel, runsScored > 0);
        countAB = false;
        break;
      }
      case 'hbp': {
        runsScored += forceAdvance(state, batter);
        kind = runsScored > 0 ? 'score' : 'walk';
        text = `${batterLabel}、デッドボール！体に当たって顔をしかめる${runsScored > 0 ? '（押し出し）' : ''}`;
        countAB = false;
        if (rng.chance(0.18) && off.bench.length > 0) {
          const sub = off.bench.shift()!;
          const li = off.lineup.findIndex((pl) => pl.id === batter.id);
          if (li >= 0) off.lineup[li] = sub;
          for (let b = 0; b < 3; b++) if (state.bases[b]?.id === batter.id) state.bases[b] = sub;
          push(text, kind, { batter: batterLabel });
          text = `⚠️ ${batter.name}、患部を押さえてベンチへ下がる……${sub.name}が代わって塁に就いた`;
          kind = 'injury';
        }
        break;
      }
      case 'strikeout': {
        state.outs += 1;
        chargeOuts(1);
        pitcherDay(mem, def.pitcher).k += 1;
        day.k += 1;
        text = C.strikeoutText(rng, mem.used, batterLabel, def.pitcher);
        break;
      }
      case 'groundout': {
        // 失策チェック（内野）
        const infielder = fielderAt(def, ['一', '二', '三', '遊'], rng);
        const pErr = clamp(0.06 + (50 - infielder.bats.defense) / 420, 0.006, 0.15);
        if (rng.chance(pErr)) {
          runsScored += advanceRunners(state, batter, 1, 1);
          def.errors += 1;
          text = C.errorText(rng, mem.used, batterLabel, infielder, false);
          kind = 'walk'; // 出塁系の色
          creditRbi = false;
          break;
        }
        if (state.bases[0] && state.outs < 2 && rng.chance(0.33)) {
          state.outs += 2;
          chargeOuts(2);
          state.bases[0] = null;
          text = C.dpText(rng, mem.used, batterLabel);
        } else if (state.bases[0] && state.outs < 2 && rng.chance(0.08)) {
          // 野選: 一塁走者が二塁で封殺され、打者が一塁に生きる
          state.outs += 1;
          chargeOuts(1);
          state.bases[0] = batter;
          text = C.fielderChoiceText(rng, mem.used, batterLabel);
          kind = 'walk';
        } else {
          state.outs += 1;
          chargeOuts(1);
          if (state.bases[2] && state.outs < 3 && rng.chance(0.2)) {
            state.bases[2] = null;
            runsScored += 1;
            text = `${batterLabel}、ゴロの間に三塁走者が生還、1点`;
          } else {
            text = C.groundoutText(rng, mem.used, batterLabel);
          }
        }
        break;
      }
      case 'flyout': {
        // 失策チェック（外野・確率は内野の半分）
        const outfielder = fielderAt(def, ['左', '中', '右'], rng);
        const pErr = clamp(0.02 + (50 - outfielder.bats.defense) / 850, 0.003, 0.06);
        if (rng.chance(pErr)) {
          runsScored += advanceRunners(state, batter, 1, 1);
          def.errors += 1;
          text = C.errorText(rng, mem.used, batterLabel, outfielder, true);
          kind = 'walk';
          creditRbi = false;
          break;
        }
        state.outs += 1;
        chargeOuts(1);
        if (state.bases[2] && state.outs < 3 && rng.chance(0.5)) {
          state.bases[2] = null;
          runsScored += 1;
          text = `${batterLabel}、犠牲フライ！三塁走者がタッチアップから生還`;
        } else {
          text = C.flyoutText(rng, mem.used, batterLabel);
        }
        break;
      }
      case 'lineout': {
        state.outs += 1;
        chargeOuts(1);
        text = C.lineoutText(rng, mem.used, batterLabel);
        break;
      }
      case 'single': {
        hits += 1;
        day.h += 1;
        const adv = batter.bats.speed > 65 && rng.chance(0.4) ? 2 : 1;
        runsScored += advanceRunners(state, batter, adv, 1);
        text = C.singleText(rng, mem.used, batterLabel, runsScored > 0);
        kind = 'hit';
        break;
      }
      case 'double': {
        hits += 1;
        day.h += 1;
        const entitled = rng.chance(0.06);
        runsScored += advanceRunners(state, batter, 2, 2);
        text = C.doubleText(rng, mem.used, batterLabel, runsScored > 0, entitled);
        kind = 'hit';
        break;
      }
      case 'triple': {
        hits += 1;
        day.h += 1;
        runsScored += advanceRunners(state, batter, 3, 3);
        text = C.tripleText(rng, mem.used, batterLabel, runsScored > 0);
        kind = 'hit';
        break;
      }
      case 'homerun': {
        hits += 1;
        day.h += 1;
        day.hr += 1;
        const onBase = state.bases.filter(Boolean).length;
        runsScored += advanceRunners(state, batter, 4, 4);
        text = C.homerunText(rng, mem.used, batterLabel, batter, onBase + 1);
        kind = 'homerun';
        break;
      }
    }

    if (countAB) day.ab += 1;
    if (runsScored > 0 && creditRbi) day.rbi += runsScored;

    // ── 得点処理・演出 ──
    let walkoff = false;
    if (runsScored > 0) {
      const prevBatting = scoreRef[scoreIndex];
      const opp = scoreRef[defIndex];
      state.runs += runsScored;
      scoreRef[scoreIndex] += runsScored;
      def.pitcherRuns += runsScored;
      pitcherDay(mem, def.pitcher).runs += runsScored;
      if (kind !== 'homerun' && kind !== 'injury') kind = 'score';
      text += C.scoringReactionText(rng, mem.used, prevBatting, opp, runsScored);
      if (half === 'bottom' && inning >= 9 && scoreRef[1] > scoreRef[0]) {
        text += '　サヨナラだーーっ！！ベンチから選手が飛び出してくる！';
        walkoff = true;
      }
    }

    if (prefix && kind !== 'injury') text = prefix + text;
    push(text, kind, { batter: batterLabel });

    if (walkoff) return { runs: state.runs, hits, walkoff: true };

    // ── 打席後のベンチワーク ──
    if (terminal === 'single' || terminal === 'walk' || terminal === 'hbp') {
      const closeGame = Math.abs(scoreRef[0] - scoreRef[1]) <= 2;
      const pr = maybePinchRunner(off, state, inning, closeGame, rng);
      if (pr) push(pr, 'sub');
    }
    if (terminal === 'single' || terminal === 'double' || terminal === 'triple') {
      const baseIdx = terminal === 'single' ? 0 : terminal === 'double' ? 1 : 2;
      const inj = maybeInjury(off, state, baseIdx, rng);
      if (inj) push(inj, 'injury');
    }

    def.calm = Math.max(0, def.calm - 3);

    off.order += 1;
    if (state.outs >= 3) break;
  }

  return { runs: state.runs, hits, walkoff: false };
}

function pushChangeLine(
  events: GameEvent[],
  inning: number,
  half: 'top' | 'bottom',
  away: Team,
  home: Team,
  score: [number, number],
): void {
  events.push({
    inning,
    half,
    text: `── チェンジ ──　${away.shortName} ${score[0]} - ${score[1]} ${home.shortName}`,
    outs: 3,
    bases: [false, false, false],
    score: [score[0], score[1]],
    kind: 'info',
  });
}

/** 1試合をシミュレートする。seed を渡せば再現可能。 */
export function simulateGame(away: Team, home: Team, seed: number = Date.now(), season?: SeasonContext): GameResult {
  const rng = createRng(seed);
  const events: GameEvent[] = [];
  const score: [number, number] = [0, 0];
  const awayByInning: number[] = [];
  const homeByInning: number[] = [];
  let awayHits = 0;
  let homeHits = 0;

  const awaySide = makeSide(away);
  const homeSide = makeSide(home);
  const mem: GameMemory = { used: new Set(), batters: new Map(), pitchers: new Map() };

  let inning = 1;
  const maxInnings = 12;
  let walkoff = false;

  while (inning <= maxInnings) {
    const top = playHalfInning(awaySide, homeSide, inning, 'top', score, 0, rng, events, mem, season);
    awayByInning[inning - 1] = top.runs;
    awayHits += top.hits;
    pushChangeLine(events, inning, 'top', away, home, score);

    if (inning >= 9 && score[1] > score[0]) {
      homeByInning[inning - 1] = homeByInning[inning - 1] ?? 0;
      break;
    }

    const bot = playHalfInning(homeSide, awaySide, inning, 'bottom', score, 1, rng, events, mem, season);
    homeByInning[inning - 1] = bot.runs;
    homeHits += bot.hits;
    if (bot.walkoff) {
      walkoff = true;
      break;
    }
    pushChangeLine(events, inning, 'bottom', away, home, score);

    if (inning >= 9 && score[0] !== score[1]) break;

    inning += 1;
  }

  const playedInnings = Math.max(awayByInning.length, homeByInning.length);
  for (let i = 0; i < playedInnings; i++) {
    if (awayByInning[i] == null) awayByInning[i] = 0;
    if (homeByInning[i] == null) homeByInning[i] = 0;
  }

  const awayLine: TeamLine = { team: away, runs: score[0], hits: awayHits, errors: awaySide.errors, byInning: awayByInning };
  const homeLine: TeamLine = { team: home, runs: score[1], hits: homeHits, errors: homeSide.errors, byInning: homeByInning };

  const resultText =
    score[0] === score[1]
      ? `試合終了 ── 引き分け（${score[0]}-${score[1]}）。両軍譲らず、決着は次の対戦へ`
      : walkoff
        ? `試合終了 ── ${home.name}、劇的なサヨナラ勝ち！（${score[1]}-${score[0]}）`
        : `試合終了 ── ${(score[0] > score[1] ? away : home).name} の勝利！（${Math.max(score[0], score[1])}-${Math.min(score[0], score[1])}）`;
  events.push({
    inning: playedInnings,
    half: 'bottom',
    text: resultText,
    outs: 3,
    bases: [false, false, false],
    score: [score[0], score[1]],
    kind: 'info',
  });

  const batting: GameResult['batting'] = {};
  for (const [id, d] of mem.batters) batting[id] = { ab: d.ab, h: d.h, hr: d.hr, k: d.k, rbi: d.rbi, sb: d.sb };
  const pitching: GameResult['pitching'] = {};
  for (const [id, d] of mem.pitchers) pitching[id] = { outs: d.outs, runs: d.runs, k: d.k };

  return { away: awayLine, home: homeLine, events, innings: playedInnings, batting, pitching };
}
