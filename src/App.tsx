import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { simulateGame } from './game/simulation';
import type { GameEvent, GameResult, Player, Team } from './game/types';
import {
  applyDraft,
  rotateStarter,
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
import { generateDraftPool, salaryFor, teamColor, teamOverall } from './game/players';
import { createRng } from './game/rng';
import { Scoreboard } from './ui/Scoreboard';
import { Diamond } from './ui/Diamond';
import { PlayLog } from './ui/PlayLog';
import { MatchCard } from './ui/MatchCard';
import { ResultCard } from './ui/ResultCard';
import { Standings } from './ui/Standings';
import { TeamSelect } from './ui/TeamSelect';
import { Draft } from './ui/Draft';
import { TeamBuilder, PlayerEditor } from './ui/TeamBuilder';
import { StatsPanel } from './ui/StatsPanel';
import { RosterEditor } from './ui/RosterEditor';

type Phase = 'preview' | 'playing' | 'finished';
type Screen = 'select' | 'build' | 'draft' | 'game';
type Tab = 'home' | 'roster' | 'stats' | 'standings' | 'more';
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
  rotateStarter(teams[ai]);
  rotateStarter(teams[hi]);
  return { away: teams[ai], home: teams[hi], seed };
}

function freshPool(): Player[] {
  return generateDraftPool(createRng((Math.random() * 2 ** 31) >>> 0), 9);
}

/** プール内で他球団と競合する選手（価値上位3人） */
function competingOf(pool: Player[]): Set<string> {
  const v = (p: Player) =>
    p.pitches ? p.pitches.velocity + p.pitches.control + p.pitches.stamina : p.bats.meet + p.bats.power + p.bats.speed;
  return new Set([...pool].sort((a, b) => v(b) - v(a)).slice(0, 3).map((p) => p.id));
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
  const [tab, setTab] = useState<Tab>('home');
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
    setTab('home');
  }, []);

  const onDraftConfirm = useCallback(
    (picks: Player[]) => {
      // 競合選手はくじ引き（50%）。外れたら他球団へ
      const competing = competingOf(draftPool);
      const won: Player[] = [];
      const lost: string[] = [];
      for (const p of picks) {
        if (competing.has(p.id) && Math.random() < 0.5) lost.push(p.name);
        else won.push(p);
      }
      const signed = applyDraft(league, won);
      const lines = [
        ...lost.map((n) => `💔 ${n}は抽選で他球団へ…交渉権を逃した`),
        ...signed.map((r) => `✍️ ${r.signed}を獲得（${r.released}が退団）`),
      ];
      league.news = [...lines, ...(league.news ?? [])].slice(0, 8);
      saveLeague(league);
      setLeague({ ...league });
      setMatchup(pickMatchup(league));
      setScreen('game');
    },
    [league, draftPool],
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

  const eraOf = (id: string) => {
    const t = league.pit[id];
    return t && t.outs > 0 ? ((t.runs * 9) / (t.outs / 3)).toFixed(2) : '-';
  };
  const stamina = league.stamina ?? STAMINA_MAX;
  const staminaWait = nextStaminaIn(league);
  const tickets = league.tickets ?? 0;
  const inSetup = screen === 'select' || screen === 'build' || screen === 'draft';
  const myColor = myTeam ? teamColor(myTeam) : '#2f81f7';
  const myRec = myTeam ? league.records[myTeam.shortName] : undefined;
  const myRank = myTeam ? standings(league).find((r) => r.team.shortName === myTeam.shortName)?.rank : undefined;
  const [resultDismissed, setResultDismissed] = useState(false);

  return (
    <div className={`app ${!inSetup ? 'app--nav' : ''}`}>
      {/* ── セットアップ（球団選択・作成・ドラフト）── */}
      {screen === 'select' && <TeamSelect teams={league.teams} onPick={onPickTeam} onCustom={() => setScreen('build')} />}
      {screen === 'build' && <TeamBuilder onComplete={onBuildComplete} onCancel={() => setScreen('select')} />}
      {screen === 'draft' && myTeam && (
        <Draft team={myTeam} pool={draftPool} maxPicks={DRAFT_PICKS} competing={competingOf(draftPool)} onConfirm={onDraftConfirm} onSkip={onDraftSkip} />
      )}

      {/* ── メイン（タブナビ）── */}
      {screen === 'game' && myTeam && (
        <>
          {/* 球団バナー */}
          {screen === 'game' && phase !== 'playing' && (
            <div className="topbar">
              <span className="topbar__logo">劇場ペナント</span>
              <span className="topbar__res">🏦 {myTeam.funds != null ? (myTeam.funds / 10000).toFixed(1) : '-'}億</span>
              <span className="topbar__res">⚡ {stamina}/{STAMINA_MAX}</span>
              <span className="topbar__res">🎟 {tickets}</span>
            </div>
          )}

          {tab === 'home' && phase === 'preview' && (
            <div className="banner" style={{ borderColor: myColor }}>
              <span className="banner__emblem" style={{ background: myColor }}>
                {myTeam.shortName.slice(0, 2)}
              </span>
              <div className="banner__body">
                <div className="banner__name">{myTeam.name}</div>
                <div className="banner__sub">
                  {myRank ? `${myRank}位` : ''} {myRec ? `・${myRec.w}勝${myRec.l}敗${myRec.t > 0 ? `${myRec.t}分` : ''}` : ''}・第
                  {league.games + 1}戦
                </div>
              </div>
              <div className="banner__chips">
                <span className="chip-eco">⚡{stamina}</span>
                <span className="chip-eco">🎟{tickets}</span>
              </div>
            </div>
          )}

          {tab === 'home' && (
            <>
              {phase === 'preview' && (
                <section className="home">
                  {myRank != null && myRec && (
                    <div className="rankcard">
                      <div className="rankcard__label">セ・パ統一リーグ</div>
                      <div className="rankcard__main">
                        <span className="rankcard__rank">{myRank}<small>位</small></span>
                        <span className="rankcard__rec">{myRec.w}勝{myRec.l}敗{myRec.t > 0 ? `${myRec.t}分` : ''}</span>
                      </div>
                      <div className="rankcard__round">第{(league.games % 30) + 1}戦 / 30（第{Math.floor(league.games / 30) + 1}年度）</div>
                    </div>
                  )}
                  <MatchCard
                    away={matchup.away}
                    home={matchup.home}
                    records={league.records}
                    myShort={league.myTeam}
                    awayEra={eraOf(matchup.away.pitcher.id)}
                    homeEra={eraOf(matchup.home.pitcher.id)}
                    round={{ n: (league.games % 30) + 1, total: 30 }}
                  />
                  <button className="playcta" onClick={startGame} disabled={stamina < 1}>
                    {stamina >= 1 ? '▶ プレイボール' : `⚡ スタミナ回復まで 約${Math.ceil(staminaWait / 60000)}分`}
                    <span className="playcta__sub">{stamina >= 1 ? `⚡1消費（残り${stamina}）` : '時間経過で回復します'}</span>
                  </button>

                  {(league.news?.length ?? 0) > 0 && (
                    <div className="news">
                      <div className="news__title">球団ニュース</div>
                      {league.news!.slice(0, 4).map((n, i) => (
                        <div key={i} className="news__line">
                          {n}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {phase !== 'preview' && (
                <section className={`live ${current?.kind === 'homerun' ? 'live--hr' : ''}`}>
                  <Scoreboard away={matchup.away} home={matchup.home} events={played} score={score} />
                  <div className="live__status">
                    <Diamond bases={current?.bases ?? [false, false, false]} outs={current?.outs ?? 0} count={live.count} />
                    <div className="live__matchup">
                      <div className="live__inning">{current ? `${current.inning}回${current.half === 'top' ? '表' : '裏'}` : ''}</div>
                      <div className="live__score">
                        <span>{matchup.away.shortName}</span>
                        <strong key={`${score[0]}-${score[1]}`} className="live__scorenum">
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
                    {phase === 'playing' && (
                      <button className="btn" onClick={skipToEnd}>
                        ⏭ 最後まで
                      </button>
                    )}
                  </div>

                  <PlayLog events={played} current={current} chars={chars} typing={sp.char > 0} scrollRef={logRef} />

                  {phase === 'finished' && !resultDismissed && result && (
                    <ResultCard
                      result={result}
                      myShort={league.myTeam}
                      onNext={() => {
                        setResultDismissed(false);
                        newCard();
                      }}
                      onReplayLog={() => setResultDismissed(true)}
                    />
                  )}
                  {phase === 'finished' && resultDismissed && (
                    <button className="playcta" onClick={() => { setResultDismissed(false); newCard(); }}>
                      次の試合へ
                    </button>
                  )}
                </section>
              )}
            </>
          )}

          {tab === 'roster' && (
            <RosterEditor
              league={league}
              team={myTeam}
              onChange={() => {
                saveLeague(league);
                setLeague({ ...league });
              }}
              onClose={() => {
                saveLeague(league);
                setLeague({ ...league });
                setMatchup(pickMatchup(league));
                setTab('home');
              }}
            />
          )}

          {tab === 'stats' && <StatsPanel league={league} team={myTeam} onClose={() => setTab('home')} />}

          {tab === 'standings' && (
            <section className="home">
              <Standings rows={standings(league)} highlight={league.myTeam ? [league.myTeam] : []} />
            </section>
          )}

          {tab === 'more' && (
            <section className="more">
              <button className="more__item" onClick={openDraft}>
                📋 ドラフト・補強会議<span className="more__desc">スカウトのリストから最大3人を指名</span>
              </button>
              <button className="more__item" onClick={() => setReallocPick(true)} disabled={tickets < 1}>
                🎟 能力の再配分<span className="more__desc">チケット{tickets}枚所持。1枚で1選手を振り直し</span>
              </button>
              <div className="more__info">
                ⚡ スタミナ {stamina}/{STAMINA_MAX}
                {stamina < STAMINA_MAX && `（あと約${Math.ceil(staminaWait / 60000)}分で+1）`}
                <br />🏦 球団資金 {myTeam.funds != null ? (myTeam.funds / 10000).toFixed(1) : '-'}億円 ・ 監督方針{' '}
                {myTeam.manager?.style ?? '-'}
              </div>
              <button className="more__item more__item--danger" onClick={onResetLeague}>
                ♻️ リーグを作り直す<span className="more__desc">全データをリセットして最初から</span>
              </button>
            </section>
          )}

          {/* 下部ナビ（試合再生中は隠す） */}
          {phase !== 'playing' && (
            <nav className="nav">
              {(
                [
                  ['home', '⚾', '試合'],
                  ['roster', '⚙️', '編成'],
                  ['stats', '📊', '成績'],
                  ['standings', '🏆', '順位'],
                  ['more', '☰', 'その他'],
                ] as const
              ).map(([key, icon, label]) => (
                <button key={key} className={`nav__item ${tab === key ? 'nav__item--on' : ''}`} onClick={() => setTab(key)}>
                  <span className="nav__icon">{icon}</span>
                  {label}
                </button>
              ))}
            </nav>
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
    </div>
  );
}
