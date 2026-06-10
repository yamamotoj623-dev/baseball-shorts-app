import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { simulateGame } from './game/simulation';
import type { GameEvent, GameResult, Player, Team } from './game/types';
import {
  applyDraft,
  applyGame,
  loadLeague,
  newLeague,
  nextStaminaIn,
  progressTick,
  refreshStamina,
  resetLeague,
  saveLeague,
  seasonContext,
  setMyTeam,
  spendStamina,
  spendTicket,
  standings,
  STAMINA_MAX,
  type LeagueState,
} from './game/league';
import { generateDraftPool, salaryFor, teamOverall } from './game/players';
import { createRng } from './game/rng';
import { Scoreboard } from './ui/Scoreboard';
import { Diamond } from './ui/Diamond';
import { TeamCard } from './ui/TeamCard';
import { PlayLog } from './ui/PlayLog';
import { Standings } from './ui/Standings';
import { TeamSelect } from './ui/TeamSelect';
import { Draft } from './ui/Draft';
import { TeamBuilder, PlayerEditor } from './ui/TeamBuilder';
import { StatsPanel } from './ui/StatsPanel';

type Phase = 'preview' | 'playing' | 'finished';
type Screen = 'select' | 'build' | 'draft' | 'game' | 'stats';
const DRAFT_PICKS = 3;

// pitch: 1球の間 / char: 1文字あたりのタイプ速度(ms) / pause: 結果行のあとの溜め
const SPEEDS = [
  { label: 'じっくり', pitch: 1100, char: 75, pause: 1700 },
  { label: 'ゆっくり', pitch: 650, char: 45, pause: 1050 },
  { label: 'ふつう', pitch: 320, char: 22, pause: 560 },
  { label: '速い', pitch: 80, char: 0, pause: 150 },
];
const DEFAULT_SPEED = 1; // 「ゆっくり」を初期選択に

/** リーグから対戦カードを1つ選ぶ。自球団があれば必ずその試合にする */
function pickMatchup(league: LeagueState): { away: Team; home: Team; seed: number } {
  const seed = (Math.random() * 2 ** 31) >>> 0;
  const teams = league.teams;
  const n = teams.length;
  const myIdx = league.myTeam ? teams.findIndex((t) => t.shortName === league.myTeam) : -1;
  let ai: number;
  let hi: number;
  if (myIdx >= 0) {
    let opp = Math.floor(Math.random() * (n - 1));
    if (opp >= myIdx) opp += 1;
    if (Math.random() < 0.5) {
      ai = myIdx;
      hi = opp;
    } else {
      ai = opp;
      hi = myIdx;
    }
  } else {
    ai = Math.floor(Math.random() * n);
    hi = Math.floor(Math.random() * (n - 1));
    if (hi >= ai) hi += 1;
  }
  return { away: teams[ai], home: teams[hi], seed };
}

function freshPool(): Player[] {
  return generateDraftPool(createRng((Math.random() * 2 ** 31) >>> 0), 9);
}

export function App() {
  const [league, setLeague] = useState<LeagueState>(() => {
    const loaded = loadLeague();
    if (loaded) return loaded;
    const fresh = newLeague();
    saveLeague(fresh);
    return fresh;
  });
  const [screen, setScreen] = useState<Screen>(() => (league.myTeam ? 'game' : 'select'));
  const [draftPool, setDraftPool] = useState<Player[]>([]);
  const [matchup, setMatchup] = useState(() => pickMatchup(league));
  const [result, setResult] = useState<GameResult | null>(null);
  const [cursor, setCursor] = useState(0); // 再生中のイベント index
  const [chars, setChars] = useState(0); // 現在行のタイプライター進行
  const [phase, setPhase] = useState<Phase>('preview');
  const [speedIdx, setSpeedIdx] = useState(DEFAULT_SPEED);
  const logRef = useRef<HTMLDivElement>(null);

  // ── マイチーム選択・ドラフト ──
  const onPickTeam = useCallback(
    (shortName: string) => {
      setMyTeam(league, shortName);
      saveLeague(league);
      setLeague({ ...league });
      setMatchup(pickMatchup(league));
      setDraftPool(freshPool());
      setScreen('draft');
    },
    [league],
  );

  const openDraft = useCallback(() => {
    setDraftPool(freshPool());
    setScreen('draft');
  }, []);

  const onDraftConfirm = useCallback(
    (picks: Player[]) => {
      applyDraft(league, picks);
      saveLeague(league);
      setLeague({ ...league });
      setMatchup(pickMatchup(league));
      setScreen('game');
    },
    [league],
  );

  const onDraftSkip = useCallback(() => {
    setMatchup(pickMatchup(league));
    setScreen('game');
  }, [league]);

  // ── カスタム球団作成（マスターリーグ）──
  const onBuildComplete = useCallback(
    (custom: Team) => {
      // 略称の衝突を避ける
      while (league.teams.some((t) => t.shortName === custom.shortName)) custom.shortName += 'X';
      // 総合力が最も低い球団を買収（入れ替え）
      let wi = 0;
      const score = (t: Team) => {
        const ov = teamOverall(t);
        return ov.bat + ov.pit;
      };
      for (let i = 1; i < league.teams.length; i++) if (score(league.teams[i]) < score(league.teams[wi])) wi = i;
      league.teams[wi] = custom;
      setMyTeam(league, custom.shortName);
      league.news = [`🏟 ${custom.name} がリーグに参入！`, ...(league.news ?? [])].slice(0, 8);
      saveLeague(league);
      setLeague({ ...league });
      setMatchup(pickMatchup(league));
      setScreen('game');
    },
    [league],
  );

  // ── 再配分チケットで能力を振り直す ──
  const [reallocTarget, setReallocTarget] = useState<Player | null>(null);
  const [reallocPick, setReallocPick] = useState(false);

  const startRealloc = useCallback(
    (p: Player) => {
      if (!spendTicket(league)) return;
      saveLeague(league);
      setLeague({ ...league });
      setReallocPick(false);
      setReallocTarget(p);
    },
    [league],
  );

  const endRealloc = useCallback(() => {
    if (reallocTarget) reallocTarget.salary = salaryFor(reallocTarget);
    saveLeague(league);
    setLeague({ ...league });
    setReallocTarget(null);
  }, [league, reallocTarget]);

  // ── 再生エンジン ──
  // pitch イベントはライブパネルだけを更新して速く流し、
  // それ以外（結果・采配・イニング）は一文字ずつタイプして溜めを作る。
  useEffect(() => {
    if (phase !== 'playing' || !result) return;
    const ev = result.events[cursor];
    if (!ev) {
      setPhase('finished');
      return;
    }
    const sp = SPEEDS[speedIdx];
    let t: number;
    if (ev.kind === 'pitch') {
      t = window.setTimeout(() => setCursor((c) => c + 1), sp.pitch);
    } else if (sp.char > 0 && chars < ev.text.length) {
      t = window.setTimeout(() => setChars((c) => Math.min(ev.text.length, c + 1)), sp.char);
    } else {
      // 行を読み切ったあとの溜め。大きいプレーほど長く余韻を残す。状況見出しは短く
      const weight =
        ev.kind === 'homerun'
          ? 2.4
          : ev.kind === 'score' || ev.kind === 'injury'
            ? 1.8
            : ev.kind === 'sub' || ev.kind === 'mound'
              ? 1.4
              : ev.kind === 'situation'
                ? 0.5
                : 1;
      t = window.setTimeout(() => {
        setChars(0);
        setCursor((c) => c + 1);
      }, sp.pause * weight);
    }
    return () => clearTimeout(t);
  }, [phase, cursor, chars, result, speedIdx]);

  // 最新ログまでスクロール
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [cursor, chars]);

  const startGame = useCallback(() => {
    // スタミナを1消費（時間で回復。将来の課金ポイント）
    if (!spendStamina(league)) {
      setLeague({ ...league });
      return;
    }
    // シーズン成績を実況の文脈として渡してからシミュレートし、結果を成績に反映
    const season = seasonContext(league);
    const r = simulateGame(matchup.away, matchup.home, matchup.seed, season);
    applyGame(league, r);
    progressTick(league, r); // 成長・モチベーション・年度替わり
    saveLeague(league);
    setLeague({ ...league });
    setResult(r);
    setCursor(0);
    setChars(0);
    setPhase('playing');
  }, [matchup, league]);

  const skipToEnd = useCallback(() => {
    if (!result) return;
    setCursor(result.events.length);
    setChars(0);
    setPhase('finished');
  }, [result]);

  const newCard = useCallback(() => {
    setMatchup(pickMatchup(league));
    setResult(null);
    setCursor(0);
    setChars(0);
    setPhase('preview');
  }, [league]);

  const onResetLeague = useCallback(() => {
    if (!window.confirm('リーグを作り直すと全選手のシーズン成績がリセットされます。よろしいですか？')) return;
    const fresh = resetLeague();
    setLeague(fresh);
    setMatchup(pickMatchup(fresh));
    setResult(null);
    setCursor(0);
    setChars(0);
    setPhase('preview');
    setScreen('select');
  }, []);

  // ── 表示用データ ──
  const played = useMemo(() => (result ? result.events.slice(0, cursor + 1) : []), [result, cursor]);
  const current: GameEvent | undefined = played[played.length - 1];

  // ライブパネル: 直近のカウント・打者・投手
  const live = useMemo(() => {
    let count: [number, number] | undefined;
    let batter: string | undefined;
    let pitcher: string | undefined;
    for (let i = played.length - 1; i >= 0; i--) {
      const e = played[i];
      if (pitcher === undefined && e.pitcherLabel) pitcher = e.pitcherLabel;
      if (batter === undefined && e.batter) batter = e.batter;
      if (count === undefined && e.kind === 'pitch') count = e.count;
      // 打席が終わったらカウントはリセット表示
      if (count === undefined && e.kind !== 'pitch' && e.batter) count = [0, 0];
      if (pitcher && batter && count) break;
    }
    return { count, batter, pitcher };
  }, [played]);

  const score: [number, number] = current ? current.score : [0, 0];
  const sp = SPEEDS[speedIdx];

  const myTeam = league.teams.find((t) => t.shortName === league.myTeam);

  // スタミナの時間回復を1分ごとに表示へ反映
  useEffect(() => {
    const id = window.setInterval(() => {
      refreshStamina(league);
      setLeague({ ...league });
    }, 60000);
    return () => clearInterval(id);
  }, [league]);

  const stamina = league.stamina ?? STAMINA_MAX;
  const staminaWait = nextStaminaIn(league);
  const tickets = league.tickets ?? 0;

  return (
    <div className="app">
      <header className="app__header">
        <h1>⚾ テキスト野球シミュ</h1>
        {screen === 'game' && myTeam && <span className="app__tag">{myTeam.name}・第{league.games + (phase === 'preview' ? 1 : 0)}戦</span>}
      </header>

      {screen === 'select' && <TeamSelect teams={league.teams} onPick={onPickTeam} onCustom={() => setScreen('build')} />}

      {screen === 'build' && <TeamBuilder onComplete={onBuildComplete} onCancel={() => setScreen('select')} />}

      {screen === 'stats' && myTeam && <StatsPanel league={league} team={myTeam} onClose={() => setScreen('game')} />}

      {screen === 'draft' && myTeam && (
        <Draft team={myTeam} pool={draftPool} maxPicks={DRAFT_PICKS} onConfirm={onDraftConfirm} onSkip={onDraftSkip} />
      )}

      {screen === 'game' && (
        <>
          <Scoreboard away={matchup.away} home={matchup.home} events={played} score={score} />

          {phase === 'preview' && (
            <section className="preview">
              <div className="economy">
                <span className="economy__item">
                  ⚡ {stamina}/{STAMINA_MAX}
                  {stamina < STAMINA_MAX && staminaWait > 0 && (
                    <span className="economy__timer">（あと{Math.ceil(staminaWait / 60000)}分で+1）</span>
                  )}
                </span>
                <span className="economy__item">🎟 チケット {tickets}枚</span>
                {myTeam?.funds != null && <span className="economy__item">🏦 {(myTeam.funds / 10000).toFixed(1)}億円</span>}
              </div>

              {(league.news?.length ?? 0) > 0 && (
                <div className="news">
                  {league.news!.slice(0, 4).map((n, i) => (
                    <div key={i} className="news__line">
                      {n}
                    </div>
                  ))}
                </div>
              )}

              <div className="preview__cards">
                <TeamCard team={matchup.away} side="ビジター" seasonBat={league.bat} record={league.records[matchup.away.shortName]} myTeam={league.myTeam} />
                <span className="preview__vs">VS</span>
                <TeamCard team={matchup.home} side="ホーム" seasonBat={league.bat} record={league.records[matchup.home.shortName]} myTeam={league.myTeam} />
              </div>
              <div className="controls">
                <button className="btn btn--primary" onClick={startGame} disabled={stamina < 1}>
                  {stamina >= 1 ? '▶ プレイボール（⚡1）' : '⚡ スタミナ不足'}
                </button>
                <button className="btn" onClick={newCard}>
                  🎲 別のカード
                </button>
                <button className="btn" onClick={openDraft}>
                  ✍️ 補強
                </button>
                <button className="btn" onClick={() => setScreen('stats')}>
                  📊 成績
                </button>
                <button className="btn" onClick={() => setReallocPick(true)} disabled={tickets < 1}>
                  🎟 再配分
                </button>
                <button className="btn btn--ghost" onClick={onResetLeague}>
                  ♻️ リーグ再生成
                </button>
              </div>

              <Standings rows={standings(league)} highlight={league.myTeam ? [league.myTeam] : []} />
            </section>
          )}

      {phase !== 'preview' && (
        <section className="live">
          <div className="live__status">
            <Diamond
              bases={current?.bases ?? [false, false, false]}
              outs={current?.outs ?? 0}
              count={live.count}
            />
            <div className="live__matchup">
              <div className="live__inning">
                {current ? `${current.inning}回${current.half === 'top' ? '表' : '裏'}` : ''}
              </div>
              <div className="live__score">
                <span>{matchup.away.shortName}</span>
                <strong>
                  {score[0]} - {score[1]}
                </strong>
                <span>{matchup.home.shortName}</span>
              </div>
              {live.batter && (
                <div className="live__vs">
                  <span className="live__role">打</span> {live.batter}
                  <span className="live__role live__role--p">投</span> {live.pitcher}
                  {live.count && (
                    <span className="live__count">
                      {live.count[0]}-{live.count[1]}
                    </span>
                  )}
                </div>
              )}
              {current?.kind === 'pitch' && <div className="live__pitch">{current.text}</div>}
            </div>
          </div>

          <div className="live__controls">
            <div className="speed">
              {SPEEDS.map((s, i) => (
                <button key={s.label} className={`chip ${i === speedIdx ? 'chip--on' : ''}`} onClick={() => setSpeedIdx(i)}>
                  {s.label}
                </button>
              ))}
            </div>
            {phase === 'playing' ? (
              <button className="btn" onClick={skipToEnd}>
                ⏭ 最後まで
              </button>
            ) : (
              <button className="btn btn--primary" onClick={newCard}>
                🎲 次の試合へ
              </button>
            )}
          </div>

          <PlayLog events={played} current={current} chars={chars} typing={sp.char > 0} scrollRef={logRef} />
        </section>
          )}
        </>
      )}

      {reallocPick && myTeam && (
        <div className="editor" onClick={() => setReallocPick(false)}>
          <div className="editor__panel" onClick={(e) => e.stopPropagation()}>
            <h3 className="stats__sub">🎟 再配分する選手を選択（チケット1枚消費）</h3>
            <div className="draft__list">
              {[...myTeam.lineup, myTeam.pitcher, ...myTeam.bullpen, ...myTeam.bench].map((p) => (
                <button key={p.id} className="draft__card" onClick={() => startRealloc(p)}>
                  <span className="draft__pos">{p.position}</span>
                  <span className="draft__pname">{p.name}</span>
                  <span className="draft__stats">
                    {p.pitches
                      ? `球${p.pitches.velocity} 制${p.pitches.control} ス${p.pitches.stamina}`
                      : `ミ${p.bats.meet} パ${p.bats.power} 走${p.bats.speed} 守${p.bats.defense}`}
                  </span>
                </button>
              ))}
            </div>
            <button className="btn editor__done" onClick={() => setReallocPick(false)}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {reallocTarget && <PlayerEditor player={reallocTarget} onChange={() => setLeague({ ...league })} onClose={endRealloc} />}

      <footer className="app__footer">
        選手・チームはすべて自動生成のオリジナル（実在の人物・球団とは無関係）
      </footer>
    </div>
  );
}
