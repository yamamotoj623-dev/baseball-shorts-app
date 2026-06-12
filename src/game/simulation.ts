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
  /** 現在の投手の持ち球（実況用） */
  repertoire: string[];
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
  /** 打席通し番号（折りたたみ表示のグルーピング用） */
  pa: number;
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
    bullpen: team.bullpen.filter((p) => (p.fatigue ?? 0) < 70).map(clonePlayer),
    pitcher: clonePlayer(team.pitcher),
    repertoire: C.deriveRepertoire(team.pitcher),
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
    d = { ab: 0, h: 0, k: 0, hr: 0, rbi: 0, sb: 0, bb: 0, d2: 0, d3: 0 };
    mem.batters.set(p.id, d);
  }
  return d;
}

function pitcherDay(mem: GameMemory, p: Player): C.PitcherDay {
  let d = mem.pitchers.get(p.id);
  if (!d) {
    d = { k: 0, outs: 0, runs: 0, bb: 0, ha: 0 };
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

// ── 実効能力（モチベーション・特殊能力・投打相性を反映） ──────────────────────────────

/** モチベーション＋調子の補正（各±6%） */
function moraleMul(p: Player): number {
  const m = p.motivation ?? 60;
  const c = p.condition ?? 2;
  const fatigue = p.fatigue ?? 0;
  // 疲労は最大-18%まで能力を削る
  return (0.94 + (m / 100) * 0.12) * (1 + (c - 2) * 0.03) * (1 - (fatigue / 100) * 0.18);
}

function has(p: Player, ability: string): boolean {
  return Boolean(p.abilities?.includes(ability));
}

/** 打者の実効ミート/パワー。risp=得点圏、vsLefty=相手が左腕 */
function batterEff(p: Player, risp: boolean, vsLefty: boolean): { meet: number; power: number } {
  const mul = moraleMul(p);
  let meet = p.bats.meet * mul;
  let power = p.bats.power * mul;
  if (risp && has(p, 'チャンス◎')) {
    meet += 8;
    power += 6;
  }
  if (has(p, 'パワーヒッター')) power += 9;
  if (has(p, 'アベレージヒッター')) meet += 9;
  if (vsLefty) {
    if (has(p, '対左投手◎')) meet += 9;
    else if (p.hand?.bat === '左') meet -= 4; // 左打者は左腕を苦にする
  }
  return { meet, power };
}

/** 投手の実効球速/制球。risp=ピンチ、lateInning=終盤 */
function pitcherEff(side: SideState, risp: boolean, inning: number): { velocity: number; control: number; fatigue: number } {
  const p = side.pitcher;
  const s = p.pitches!;
  const mul = moraleMul(p);
  let stamina = s.stamina;
  if (has(p, '鉄腕')) stamina += 12;
  const fatigue = clamp((side.pitchCount - stamina * 1.1) / 55, 0, 1);
  let velocity = s.velocity * mul * (1 - fatigue * 0.3);
  let control = s.control * mul * (1 - fatigue * 0.35) + side.calm;
  if (has(p, '火の玉ストレート')) velocity += 8;
  if (has(p, '精密機械')) control += 8;
  if (risp && has(p, '勝負強い')) {
    velocity += 6;
    control += 6;
  }
  if (inning >= 7 && has(p, '尻上がり')) velocity += 6;
  return { velocity, control, fatigue };
}

// ── 1球の確率モデル ──────────────────────────────

function throwPitch(batter: Player, side: SideState, strikes: number, risp: boolean, inning: number, rng: Rng): PitchResult {
  const eff = pitcherEff(side, risp, inning);
  const control = eff.control;
  const velocity = eff.velocity;
  const meet = batterEff(batter, risp, side.pitcher.hand?.throw === '左').meet;

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

function resolveInPlay(batter: Player, side: SideState, risp: boolean, inning: number, rng: Rng): InPlayOutcome {
  const effP = pitcherEff(side, risp, inning);
  const control = effP.control;
  const effB = batterEff(batter, risp, side.pitcher.hand?.throw === '左');

  const hitChance = clamp(0.34 + (effB.meet - control) / 340, 0.2, 0.5);
  if (rng.chance(hitChance)) {
    const pow = effB.power;
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
  def.repertoire = C.deriveRepertoire(next);
  def.pitchCount = 0;
  def.pitcherRuns = 0;
  def.calm = 0;

  const role = useCloser ? '守護神' : shelled ? '火消し' : 'リリーフ';
  return `🔁 投手交代: ${prev.name} → ${next.name}（${role}）`;
}

function maybeMoundVisit(def: SideState, state: HalfState, inning: number, rng: Rng, mem: GameMemory): string | null {
  const runners = state.bases.filter(Boolean).length;
  if (runners < 2 || def.visitedInning === inning) return null;
  if (runners < 3 && state.runs === 0) return null;
  if (!rng.chance(0.45)) return null;
  def.visitedInning = inning;
  def.calm = 7;
  // 終盤の大ピンチでは、たまに監督自らがマウンドへ
  const manager = inning >= 7 && runners >= 3 && rng.chance(0.4);
  return C.moundVisitText(rng, mem.used, def.pitcher, manager);
}

/** 監督の性格による采配係数 */
function managerAggro(team: { manager?: { style: string } }): { steal: number; pinch: number } {
  const style = team.manager?.style;
  if (style === '攻撃的') return { steal: 1.6, pinch: 1.2 };
  if (style === '堅実') return { steal: 0.6, pinch: 0.8 };
  if (style === 'データ重視') return { steal: 1.1, pinch: 1.05 };
  return { steal: 1, pinch: 1 };
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
  if (!rng.chance(clamp(0.75 * managerAggro(off.meta).pinch, 0.3, 0.95))) return null;

  const pinch = off.bench.splice(best, 1)[0];
  off.lineup[idx] = pinch;
  return `📣 代打: ${pinch.name} ← ${current.name}`;
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
  return `💨 代走: ${fast.name} ← ${runner.name}`;
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
  return `🧤 守備固め: ${sub.name} ← ${out.name}`;
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
        const aggro = managerAggro(off.meta).steal;
        const kingBonus = r1.abilities?.includes('盗塁王') ? 1.6 : 1;
        const attemptP = clamp(((r1.bats.speed - 46) / 150) * aggro * kingBonus, 0, 0.4);
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
          } else if (rng.chance(0.12)) {
            // リクエストで判定が覆って盗塁成功
            state.bases[1] = r1;
            state.bases[0] = null;
            const rd = batterDay(mem, r1);
            rd.sb += 1;
            push(C.requestStealSafeText(rng, mem.used, r1), 'hit');
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

    // この打席に属するイベントを束ねるID
    mem.pa += 1;
    const paId = mem.pa;

    // 打席ごとの状況見出し（◯番 ◯◯　一死二塁）
    push(
      C.situationHeader(orderNo, batter.name, state.outs, [
        Boolean(state.bases[0]),
        Boolean(state.bases[1]),
        Boolean(state.bases[2]),
      ]),
      'situation',
      { batter: batterLabel, paId },
    );

    // 打席紹介（今日の成績・特徴に言及。出しすぎない）
    const intro = C.batterIntroLine(rng, mem.used, batterLabel, batter, day, season?.bat.get(batter.id));
    if (intro) push(intro, 'mound', { batter: batterLabel, paId });

    const prefix = C.situationLine(rng, mem.used, {
      bases: [Boolean(state.bases[0]), Boolean(state.bases[1]), Boolean(state.bases[2])],
      outs: state.outs,
      inning,
      half,
      battingScore: scoreRef[scoreIndex],
      oppScore: scoreRef[defIndex],
    });
    // 前書き（チャンス／ピンチの煽り）は結果と混ぜず、独立した一行として出す
    if (prefix) push(prefix, 'mound', { batter: batterLabel, paId });

    // ── 1球ずつの勝負 ──
    let balls = 0;
    let strikes = 0;
    let terminal: 'walk' | 'hbp' | 'strikeout' | InPlayOutcome | null = null;

    while (terminal === null) {
      const risp = Boolean(state.bases[1] || state.bases[2]);
      const pr = throwPitch(batter, def, strikes, risp, inning, rng);
      def.pitchCount += 1;

      if (pr === 'hbp') {
        terminal = 'hbp';
        break;
      }
      if (pr === 'inplay') {
        terminal = resolveInPlay(batter, def, Boolean(state.bases[1] || state.bases[2]), inning, rng);
        break;
      }

      let result: 'ball' | 'called' | 'swing' | 'foul';
      if (pr === 'ball') {
        balls += 1;
        if (balls >= 4) {
          terminal = 'walk';
          break;
        }
        result = 'ball';
      } else if (pr === 'called') {
        strikes += 1;
        if (strikes >= 3) {
          terminal = 'strikeout';
          break;
        }
        result = 'called';
      } else if (pr === 'swing') {
        strikes += 1;
        if (strikes >= 3) {
          terminal = 'strikeout';
          break;
        }
        result = 'swing';
      } else {
        if (strikes < 2) strikes += 1;
        result = 'foul';
      }

      // 「外角高めのスライダーを見送ってボール 1-0」のように球種・コース・カウントを実況
      let pitchText = C.pitchLine(rng, def.repertoire, result, balls, strikes);
      if (balls === 3 && strikes === 2) pitchText += '（フルカウント）';
      push(pitchText, 'pitch', { count: [balls, strikes], batter: batterLabel, paId });
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
        day.bb += 1;
        pitcherDay(mem, def.pitcher).bb += 1;
        break;
      }
      case 'hbp': {
        runsScored += forceAdvance(state, batter);
        kind = runsScored > 0 ? 'score' : 'walk';
        day.bb += 1;
        pitcherDay(mem, def.pitcher).bb += 1;
        text = `${batterLabel}、デッドボール！体に当たって顔をしかめる${runsScored > 0 ? '（押し出し）' : ''}`;
        countAB = false;
        if (rng.chance(0.18) && off.bench.length > 0) {
          const sub = off.bench.shift()!;
          const li = off.lineup.findIndex((pl) => pl.id === batter.id);
          if (li >= 0) off.lineup[li] = sub;
          for (let b = 0; b < 3; b++) if (state.bases[b]?.id === batter.id) state.bases[b] = sub;
          push(text.slice(batterLabel.length + 1), kind, { batter: batterLabel, paId });
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
        } else if (rng.chance(0.02)) {
          // リクエスト（リプレー検証）で内野安打に覆る
          hits += 1;
          day.h += 1;
          pitcherDay(mem, def.pitcher).ha += 1;
          runsScored += advanceRunners(state, batter, 1, 1);
          text = C.requestInfieldHitText(rng, mem.used, batterLabel);
          kind = 'hit';
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
        pitcherDay(mem, def.pitcher).ha += 1;
        const adv = batter.bats.speed > 65 && rng.chance(0.4) ? 2 : 1;
        runsScored += advanceRunners(state, batter, adv, 1);
        text = C.singleText(rng, mem.used, batterLabel, runsScored > 0);
        kind = 'hit';
        break;
      }
      case 'double': {
        hits += 1;
        day.h += 1;
        day.d2 += 1;
        pitcherDay(mem, def.pitcher).ha += 1;
        const entitled = rng.chance(0.06);
        runsScored += advanceRunners(state, batter, 2, 2);
        text = C.doubleText(rng, mem.used, batterLabel, runsScored > 0, entitled);
        kind = 'hit';
        break;
      }
      case 'triple': {
        hits += 1;
        day.h += 1;
        day.d3 += 1;
        pitcherDay(mem, def.pitcher).ha += 1;
        runsScored += advanceRunners(state, batter, 3, 3);
        text = C.tripleText(rng, mem.used, batterLabel, runsScored > 0);
        kind = 'hit';
        break;
      }
      case 'homerun': {
        hits += 1;
        day.h += 1;
        day.hr += 1;
        pitcherDay(mem, def.pitcher).ha += 1;
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

    // 状況見出しに打者名があるので、結果行の先頭の打者名は省く
    const resultText = text.startsWith(`${batterLabel}、`) ? text.slice(batterLabel.length + 1) : text;
    push(resultText, kind, { batter: batterLabel, paId });

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
  const mem: GameMemory = { used: new Set(), batters: new Map(), pitchers: new Map(), pa: 0 };

  let inning = 1;
  const maxInnings = 12;
  let walkoff = false;

  while (inning <= maxInnings) {
    const top = playHalfInning(awaySide, homeSide, inning, 'top', score, 0, rng, events, mem, season);
    awayByInning[inning - 1] = top.runs;
    awayHits += top.hits;
    // 9回以降ホームがリードしていれば裏は行わず終了（チェンジ行は出さない）
    if (inning >= 9 && score[1] > score[0]) {
      homeByInning[inning - 1] = homeByInning[inning - 1] ?? 0;
      break;
    }
    pushChangeLine(events, inning, 'top', away, home, score);

    const bot = playHalfInning(homeSide, awaySide, inning, 'bottom', score, 1, rng, events, mem, season);
    homeByInning[inning - 1] = bot.runs;
    homeHits += bot.hits;
    if (bot.walkoff) {
      walkoff = true;
      break;
    }
    if (inning >= 9 && score[0] !== score[1]) break; // 決着＝チェンジ行なしで終了
    pushChangeLine(events, inning, 'bottom', away, home, score);

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
  for (const [id, d] of mem.batters) batting[id] = { ab: d.ab, h: d.h, hr: d.hr, k: d.k, rbi: d.rbi, sb: d.sb, bb: d.bb, d2: d.d2, d3: d.d3 };
  const pitching: GameResult['pitching'] = {};
  for (const [id, d] of mem.pitchers) pitching[id] = { outs: d.outs, runs: d.runs, k: d.k, bb: d.bb, ha: d.ha };

  return { away: awayLine, home: homeLine, events, innings: playedInnings, batting, pitching };
}
