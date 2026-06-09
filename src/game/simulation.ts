// 試合シミュレーションの中核。
// 「1球単位」で進行し、BSO・継投・代打・代走・守備固め・マウンド集合・死球/負傷まで扱う。
// 純粋関数（副作用なし・乱数はRngでDI）なので、UIから切り離してテストできる。

import type { GameEvent, GameResult, Player, Team, TeamLine } from './types';
import { createRng, type Rng } from './rng';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── 実況テンプレート ──────────────────────────────
const HIT_DIRECTIONS = ['レフト', 'センター', 'ライト', '左中間', '右中間'];
const GROUND_DIRECTIONS = ['ショート', 'セカンド', 'サード', 'ファースト', '投手'];
const FLY_DIRECTIONS = ['レフト', 'センター', 'ライト'];

const BALL_CALLS = ['ボール、外れた', 'ボール', '低めに外れてボール', '際どいがボールの判定'];
const CALLED_STRIKES = ['ストライク、見逃した', 'ズバッとストライク！', '外角いっぱい、ストライク'];
const SWING_MISSES = ['空振り！', 'バットが空を切る！', '豪快に空振り'];
const FOULS = ['ファウル', 'カットしてファウル', 'ファウルで粘る', '打ち上げたがファウルグラウンドへ'];

const STRIKEOUT_VERBS = ['空振り三振！！', '見逃し三振！手が出なかった', '三振に斬って取った！', '空を切って三振'];
const GROUND_VERBS = ['ゴロ', 'ボテボテのゴロ', '詰まったゴロ', '鋭いゴロ'];
const FLY_VERBS = ['へのフライ', 'へ平凡なフライ', 'へ打ち上げた', 'へ高く上がった'];
const SINGLE_PHRASES = ['へ弾き返すヒット！', '前へ落ちるクリーンヒット！', 'へ運ぶシングルヒット', 'を抜けるヒット！'];

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
  /** 現在の投手の球数 */
  pitchCount: number;
  /** 現在の投手の失点 */
  pitcherRuns: number;
  /** 打順カーソル（試合を通して継続） */
  order: number;
  /** このイニングにマウンド集合を使ったか */
  visitedInning: number;
  /** マウンド集合後の一時的な制球ボーナス（打席ごとに減衰） */
  calm: number;
  /** 守備固めを実施済みか */
  defSubDone: boolean;
}

interface HalfState {
  bases: (Player | null)[]; // [一塁, 二塁, 三塁]
  outs: number;
  runs: number;
}

function makeSide(team: Team): SideState {
  return {
    meta: team,
    lineup: [...team.lineup],
    bench: [...team.bench],
    bullpen: [...team.bullpen],
    pitcher: team.pitcher,
    pitchCount: 0,
    pitcherRuns: 0,
    order: 0,
    visitedInning: 0,
    calm: 0,
    defSubDone: false,
  };
}

// ── 場面の演出ヘルパー ──────────────────────────────

function basesLabel(bases: (Player | null)[]): string {
  const on: string[] = [];
  if (bases[0]) on.push('一');
  if (bases[1]) on.push('二');
  if (bases[2]) on.push('三');
  if (on.length === 0) return '';
  if (on.length === 3) return '満塁';
  return on.join('・') + '塁';
}

/** 打席前の場面に応じた緊迫感の枕詞（チャンス／ピンチの演出） */
function situationPrefix(bases: (Player | null)[], outs: number): string {
  const loaded = bases[0] && bases[1] && bases[2];
  const risp = bases[1] || bases[2];
  if (loaded) return outs === 2 ? '二死満塁、一打で試合が動く。' : '満塁の大チャンス。';
  if (risp && outs === 2) return `二死${basesLabel(bases)}、ここで一打が欲しい。`;
  if (risp) return `${basesLabel(bases)}と好機。`;
  return '';
}

/** 得点が入ったときの「同点／勝ち越し／逆転」などの演出 */
function scoringReaction(prevBatting: number, opp: number, added: number): string {
  const after = prevBatting + added;
  if (prevBatting < opp) {
    if (after > opp) return ' ── 逆転だ！！';
    if (after === opp) return ' ── 同点に追いついた！';
    return ` ── ${added}点を返す`;
  }
  if (prevBatting === opp) return ' ── ついに勝ち越し！';
  return ' ── さらにリードを広げる';
}

function pitcherLabel(side: SideState): string {
  return `${side.pitcher.name}（${side.pitchCount}球）`;
}

// ── 1球の確率モデル ──────────────────────────────

function throwPitch(
  batter: Player,
  side: SideState,
  balls: number,
  strikes: number,
  rng: Rng,
): PitchResult {
  const p = side.pitcher.pitches!;
  const fatigue = clamp((side.pitchCount - p.stamina * 1.1) / 55, 0, 1);
  const control = p.control * (1 - fatigue * 0.35) + side.calm;
  const velocity = p.velocity * (1 - fatigue * 0.3);
  const meet = batter.bats.meet;

  // 死球はごく稀（制球が荒れていると微増）
  const pHbp = clamp(0.003 + (40 - control) / 8000, 0.001, 0.012);
  if (rng.chance(pHbp)) return 'hbp';

  // ボール: 制球が低い・疲労が濃いほど増える
  const pBall = clamp(0.34 + (50 - control) / 270, 0.19, 0.5);
  // 空振り: 球速 vs ミート
  const pSwing = clamp(0.095 + (velocity - meet) / 420, 0.04, 0.22);
  // 見逃しストライク
  const pCalled = 0.14;
  // ファウル: 追い込まれると粘る
  const pFoul = strikes >= 2 ? 0.26 : 0.2;

  const r = rng.next();
  if (r < pBall) return 'ball';
  if (r < pBall + pSwing) return 'swing';
  if (r < pBall + pSwing + pCalled) return 'called';
  if (r < pBall + pSwing + pCalled + pFoul) return 'foul';
  void balls;
  return 'inplay';
}

/** インプレーの結末を決める */
function resolveInPlay(batter: Player, side: SideState, rng: Rng): InPlayOutcome {
  const p = side.pitcher.pitches!;
  const fatigue = clamp((side.pitchCount - p.stamina * 1.1) / 55, 0, 1);
  const control = p.control * (1 - fatigue * 0.35) + side.calm;

  const hitChance = clamp(0.34 + (batter.bats.meet - control) / 340, 0.2, 0.5);
  if (rng.chance(hitChance)) {
    const pow = batter.bats.power;
    const roll = rng.next();
    const pHR = clamp(0.06 + (pow - 50) / 280, 0.015, 0.24);
    const pTriple = clamp(0.02 + batter.bats.speed / 1500, 0.01, 0.05);
    const pDouble = clamp(0.18 + (pow - 50) / 500, 0.1, 0.28);
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

/** 打席結果に応じて走者を進める。3塁を越えたら得点として返す。 */
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

/** 四球・死球の押し出し進塁 */
function forceAdvance(state: HalfState, batter: Player): number {
  let runs = 0;
  const b = state.bases;
  if (b[0]) {
    if (b[1]) {
      if (b[2]) runs += 1; // 満塁→押し出し
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

/** 継投判断。交代したらイベントを返す */
function maybeChangePitcher(
  def: SideState,
  inning: number,
  scoreDiff: number, // 守備側から見た点差（正=リード）
): string | null {
  if (def.bullpen.length === 0) return null;
  const p = def.pitcher.pitches!;
  const exhausted = def.pitchCount > p.stamina * 1.25 + 30;
  const shelled = def.pitcherRuns >= 5 && inning >= 4;
  const lateGame = inning >= 8 && Math.abs(scoreDiff) <= 2 && def.pitchCount > p.stamina * 0.9;
  if (!exhausted && !shelled && !lateGame) return null;

  const prev = def.pitcher;
  // 9回の接戦は勝ちパターン（末尾＝抑え）を投入
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

/** マウンド集合。ピンチで内野陣が集まり、投手が立ち直るチャンス */
function maybeMoundVisit(def: SideState, state: HalfState, inning: number, rng: Rng): string | null {
  const runners = state.bases.filter(Boolean).length;
  if (runners < 2 || def.visitedInning === inning) return null;
  // 本当に火がついた場面だけ（満塁、または既に失点しているピンチ）
  if (runners < 3 && state.runs === 0) return null;
  if (!rng.chance(0.45)) return null;
  def.visitedInning = inning;
  def.calm = 7;
  const variations = [
    `🤝 ここで内野陣がマウンドに集まる。捕手が${def.pitcher.name}に何事か声をかけ、ひと呼吸`,
    `🤝 たまらずベンチから伝令。内野陣も集まり、${def.pitcher.name}は大きく息を吐いた`,
  ];
  return rng.pick(variations);
}

/** 代打判断。終盤・チャンス・弱い打者で、ベンチに上位互換がいれば */
function maybePinchHitter(off: SideState, state: HalfState, inning: number, trailingBy: number, rng: Rng): string | null {
  if (inning < 7 || off.bench.length === 0) return null;
  const idx = off.order % 9;
  const current = off.lineup[idx];
  const risp = Boolean(state.bases[1] || state.bases[2]);
  const need = trailingBy >= 0 && trailingBy <= 4; // 同点〜4点ビハインド
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

/** 代走判断。終盤の接戦、鈍足走者が出塁したら俊足を送る */
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
  // 打順にも入る（リエントリーなし）
  const li = off.lineup.findIndex((pl) => pl.id === runner.id);
  if (li >= 0) off.lineup[li] = fast;
  state.bases[0] = fast;
  return `💨 代走に${fast.name}。一塁ベース上、いつでもスタートを切れる構えだ`;
}

/** 守備固め。リードした終盤、守備の穴を控えの守備職人と入れ替える */
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
  def.lineup[weakest] = sub;
  def.defSubDone = true;
  return `🧤 守備固め。${out.name}に代えて${sub.name}が入る。逃げ切り態勢だ`;
}

/** 負傷交代。塁上の選手が走塁で痛める稀なアクシデント */
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

  push(`■ ${inning}回${half === 'top' ? '表' : '裏'}　${off.meta.name} の攻撃`, 'info');

  // 守備固め（守備側がリードしている終盤）
  const defLeading = scoreRef[defIndex] > scoreRef[scoreIndex];
  const defSub = maybeDefensiveSub(def, inning, defLeading, rng);
  if (defSub) push(defSub, 'sub');

  while (state.outs < 3) {
    // ── 打席前のベンチワーク ──
    const defDiff = scoreRef[defIndex] - scoreRef[scoreIndex];
    const change = maybeChangePitcher(def, inning, defDiff);
    if (change) push(change, 'sub');

    const visit = maybeMoundVisit(def, state, inning, rng);
    if (visit) push(visit, 'mound');

    const trailingBy = scoreRef[defIndex] - scoreRef[scoreIndex];
    const ph = maybePinchHitter(off, state, inning, trailingBy, rng);
    if (ph) push(ph, 'sub');

    const batter = off.lineup[off.order % 9];
    const orderNo = (off.order % 9) + 1;
    const batterLabel = `${orderNo}番 ${batter.name}`;
    const prefix = situationPrefix(state.bases, state.outs);

    // ── 1球ずつの勝負 ──
    let balls = 0;
    let strikes = 0;
    let terminal: 'walk' | 'hbp' | 'strikeout' | InPlayOutcome | null = null;

    while (terminal === null) {
      const pr = throwPitch(batter, def, balls, strikes, rng);
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
        pitchText = rng.pick(BALL_CALLS);
      } else if (pr === 'called') {
        strikes += 1;
        if (strikes >= 3) {
          terminal = 'strikeout';
          break;
        }
        pitchText = rng.pick(CALLED_STRIKES);
      } else if (pr === 'swing') {
        strikes += 1;
        if (strikes >= 3) {
          terminal = 'strikeout';
          break;
        }
        pitchText = rng.pick(SWING_MISSES);
      } else {
        // foul
        if (strikes < 2) strikes += 1;
        pitchText = rng.pick(FOULS);
      }

      if (balls === 3 && strikes === 2) pitchText += ' ──フルカウント';
      push(pitchText, 'pitch', { count: [balls, strikes], batter: batterLabel });
    }

    // ── 打席結果の処理 ──
    let runsScored = 0;
    let kind: GameEvent['kind'] = 'out';
    let text = '';

    switch (terminal) {
      case 'walk': {
        runsScored += forceAdvance(state, batter);
        kind = runsScored > 0 ? 'score' : 'walk';
        text = `${batterLabel}、フォアボールを選んで出塁${runsScored > 0 ? '（押し出し！）' : ''}`;
        break;
      }
      case 'hbp': {
        runsScored += forceAdvance(state, batter);
        kind = runsScored > 0 ? 'score' : 'walk';
        text = `${batterLabel}、デッドボール！体に当たって顔をしかめる${runsScored > 0 ? '（押し出し）' : ''}`;
        // 死球は負傷リスクが高い
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
        text = `${batterLabel}、${rng.pick(STRIKEOUT_VERBS)}`;
        break;
      }
      case 'groundout': {
        if (state.bases[0] && state.outs < 2 && rng.chance(0.35)) {
          state.outs += 2;
          state.bases[0] = null;
          text = `${batterLabel}、${rng.pick(GROUND_DIRECTIONS)}${rng.pick(GROUND_VERBS)}、これを併殺！ゲッツーに倒れる`;
        } else {
          state.outs += 1;
          if (state.bases[2] && state.outs < 3 && rng.chance(0.2)) {
            state.bases[2] = null;
            runsScored += 1;
            text = `${batterLabel}、${rng.pick(GROUND_DIRECTIONS)}${rng.pick(GROUND_VERBS)}の間に三塁走者が生還、1点`;
          } else {
            text = `${batterLabel}、${rng.pick(GROUND_DIRECTIONS)}${rng.pick(GROUND_VERBS)}に倒れる`;
          }
        }
        break;
      }
      case 'flyout': {
        state.outs += 1;
        if (state.bases[2] && state.outs < 3 && rng.chance(0.5)) {
          state.bases[2] = null;
          runsScored += 1;
          text = `${batterLabel}、${rng.pick(FLY_DIRECTIONS)}へ犠牲フライ！三塁走者が還って1点`;
        } else {
          text = `${batterLabel}、${rng.pick(FLY_DIRECTIONS)}${rng.pick(FLY_VERBS)}`;
        }
        break;
      }
      case 'lineout': {
        state.outs += 1;
        text = `${batterLabel}、${rng.pick(GROUND_DIRECTIONS)}への鋭いライナー、惜しくも正面`;
        break;
      }
      case 'single': {
        hits += 1;
        const adv = batter.bats.speed > 65 && rng.chance(0.4) ? 2 : 1;
        runsScored += advanceRunners(state, batter, adv, 1);
        const dir = rng.pick(HIT_DIRECTIONS);
        text = runsScored > 0 ? `${batterLabel}、${dir}へタイムリーヒット！` : `${batterLabel}、${dir}${rng.pick(SINGLE_PHRASES)}`;
        kind = 'hit';
        break;
      }
      case 'double': {
        hits += 1;
        runsScored += advanceRunners(state, batter, 2, 2);
        const dir = rng.pick(HIT_DIRECTIONS);
        text = runsScored > 0 ? `${batterLabel}、${dir}を破るタイムリーツーベース！` : `${batterLabel}、${dir}へ鋭い二塁打`;
        kind = 'hit';
        break;
      }
      case 'triple': {
        hits += 1;
        runsScored += advanceRunners(state, batter, 3, 3);
        const dir = rng.pick(HIT_DIRECTIONS);
        text =
          runsScored > 0
            ? `${batterLabel}、${dir}を真っ二つ！走者を一掃する三塁打！！`
            : `${batterLabel}、${dir}深くへ快速の三塁打！`;
        kind = 'hit';
        break;
      }
      case 'homerun': {
        hits += 1;
        const onBase = state.bases.filter(Boolean).length;
        const total = onBase + 1;
        runsScored += advanceRunners(state, batter, 4, 4);
        const dir = rng.pick(HIT_DIRECTIONS);
        const name = onBase === 3 ? '満塁ホームラン' : total === 1 ? 'ソロホームラン' : `${total}ランホームラン`;
        text = `${batterLabel}、打った瞬間それと分かる一発！${dir}スタンドへ${name}ーーっ！！`;
        kind = 'homerun';
        break;
      }
    }

    // ── 得点処理・演出 ──
    let walkoff = false;
    if (runsScored > 0) {
      const prevBatting = scoreRef[scoreIndex];
      const opp = scoreRef[defIndex];
      state.runs += runsScored;
      scoreRef[scoreIndex] += runsScored;
      def.pitcherRuns += runsScored;
      if (kind !== 'homerun' && kind !== 'injury') kind = 'score';
      text += scoringReaction(prevBatting, opp, runsScored);
      // サヨナラ
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

    // マウンド集合の効果は打席ごとに薄れる
    def.calm = Math.max(0, def.calm - 3);

    off.order += 1;
    if (state.outs >= 3) break;
  }

  return { runs: state.runs, hits, walkoff: false };
}

/** イニングの区切りに、現在スコアを示す「チェンジ」行を入れる */
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
export function simulateGame(away: Team, home: Team, seed: number = Date.now()): GameResult {
  const rng = createRng(seed);
  const events: GameEvent[] = [];
  const score: [number, number] = [0, 0];
  const awayByInning: number[] = [];
  const homeByInning: number[] = [];
  let awayHits = 0;
  let homeHits = 0;

  const awaySide = makeSide(away);
  const homeSide = makeSide(home);

  let inning = 1;
  const maxInnings = 12; // 延長は12回まで（決着しなければ引き分け）
  let walkoff = false;

  while (inning <= maxInnings) {
    // 表（アウェイの攻撃 / ホーム守備）
    const top = playHalfInning(awaySide, homeSide, inning, 'top', score, 0, rng, events);
    awayByInning[inning - 1] = top.runs;
    awayHits += top.hits;
    pushChangeLine(events, inning, 'top', away, home, score);

    // 9回裏以降、ホームが勝っていれば裏を行わない
    if (inning >= 9 && score[1] > score[0]) {
      homeByInning[inning - 1] = homeByInning[inning - 1] ?? 0;
      break;
    }

    // 裏（ホームの攻撃 / アウェイ守備）
    const bot = playHalfInning(homeSide, awaySide, inning, 'bottom', score, 1, rng, events);
    homeByInning[inning - 1] = bot.runs;
    homeHits += bot.hits;
    if (bot.walkoff) {
      walkoff = true;
      break;
    }
    pushChangeLine(events, inning, 'bottom', away, home, score);

    // 9回終了時点で決着していれば終了
    if (inning >= 9 && score[0] !== score[1]) break;

    inning += 1;
  }

  const playedInnings = Math.max(awayByInning.length, homeByInning.length);
  for (let i = 0; i < playedInnings; i++) {
    if (awayByInning[i] == null) awayByInning[i] = 0;
    if (homeByInning[i] == null) homeByInning[i] = 0;
  }

  const awayLine: TeamLine = { team: away, runs: score[0], hits: awayHits, errors: 0, byInning: awayByInning };
  const homeLine: TeamLine = { team: home, runs: score[1], hits: homeHits, errors: 0, byInning: homeByInning };

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

  return { away: awayLine, home: homeLine, events, innings: playedInnings };
}
