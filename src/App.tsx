import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { simulateGame } from './game/simulation';
import type { GameEvent, GameResult, Team } from './game/types';
import { applyGame, loadLeague, newLeague, resetLeague, saveLeague, seasonContext, type LeagueState } from './game/league';
import { Scoreboard } from './ui/Scoreboard';
import { Diamond } from './ui/Diamond';
import { TeamCard } from './ui/TeamCard';

type Phase = 'preview' | 'playing' | 'finished';

// pitch: 1球の間 / char: 2文字あたりのタイプ速度 / pause: 結果行のあとの溜め
const SPEEDS = [
  { label: 'ゆっくり', pitch: 500, char: 50, pause: 900 },
  { label: 'ふつう', pitch: 240, char: 26, pause: 520 },
  { label: '速い', pitch: 70, char: 0, pause: 140 },
];

/** リーグから対戦カードを1つ選ぶ */
function pickMatchup(league: LeagueState): { away: Team; home: Team; seed: number } {
  const seed = (Math.random() * 2 ** 31) >>> 0;
  const n = league.teams.length;
  const ai = Math.floor(Math.random() * n);
  let hi = Math.floor(Math.random() * (n - 1));
  if (hi >= ai) hi += 1;
  return { away: league.teams[ai], home: league.teams[hi], seed };
}

export function App() {
  const [league, setLeague] = useState<LeagueState>(() => {
    const loaded = loadLeague();
    if (loaded) return loaded;
    const fresh = newLeague();
    saveLeague(fresh);
    return fresh;
  });
  const [matchup, setMatchup] = useState(() => pickMatchup(league));
  const [result, setResult] = useState<GameResult | null>(null);
  const [cursor, setCursor] = useState(0); // 再生中のイベント index
  const [chars, setChars] = useState(0); // 現在行のタイプライター進行
  const [phase, setPhase] = useState<Phase>('preview');
  const [speedIdx, setSpeedIdx] = useState(1);
  const logRef = useRef<HTMLDivElement>(null);

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
      t = window.setTimeout(() => setChars((c) => Math.min(ev.text.length, c + 2)), sp.char);
    } else {
      // 行を読み切ったあとの溜め。大きいプレーほど長く余韻を残す
      const weight = ev.kind === 'homerun' ? 2.4 : ev.kind === 'score' || ev.kind === 'injury' ? 1.8 : ev.kind === 'sub' || ev.kind === 'mound' ? 1.4 : 1;
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
    // シーズン成績を実況の文脈として渡してからシミュレートし、結果を成績に反映
    const season = seasonContext(league);
    const r = simulateGame(matchup.away, matchup.home, matchup.seed, season);
    applyGame(league, r);
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
  }, []);

  // ── 表示用データ ──
  const played = useMemo(() => (result ? result.events.slice(0, cursor + 1) : []), [result, cursor]);
  const current: GameEvent | undefined = played[played.length - 1];

  // ログ行: pitch 以外。現在行はタイプ進行ぶんだけ見せる
  const logEvents = useMemo(() => played.filter((e) => e.kind !== 'pitch'), [played]);

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

  return (
    <div className="app">
      <header className="app__header">
        <h1>⚾ テキスト野球シミュ</h1>
        <span className="app__tag">シーズン第{league.games + (phase === 'preview' ? 1 : 0)}戦</span>
      </header>

      <Scoreboard away={matchup.away} home={matchup.home} events={played} score={score} />

      {phase === 'preview' && (
        <section className="preview">
          <div className="preview__cards">
            <TeamCard team={matchup.away} side="ビジター" seasonBat={league.bat} />
            <span className="preview__vs">VS</span>
            <TeamCard team={matchup.home} side="ホーム" seasonBat={league.bat} />
          </div>
          <div className="controls">
            <button className="btn btn--primary" onClick={startGame}>
              ▶ プレイボール
            </button>
            <button className="btn" onClick={newCard}>
              🎲 別のカード
            </button>
            <button className="btn btn--ghost" onClick={onResetLeague}>
              ♻️ リーグ再生成
            </button>
          </div>
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

          <div className="log" ref={logRef}>
            {logEvents.map((ev, i) => {
              const isCurrent = phase === 'playing' && i === logEvents.length - 1 && ev === current;
              const text = isCurrent && sp.char > 0 ? ev.text.slice(0, chars) : ev.text;
              return (
                <div key={i} className={`log__line log__line--${ev.kind}`}>
                  {ev.kind === 'info' ? (
                    <span className="log__info">{text}</span>
                  ) : (
                    <>
                      <span className="log__meta">
                        {ev.inning}回{ev.half === 'top' ? '表' : '裏'}
                      </span>
                      <span className="log__text">
                        {text}
                        {isCurrent && chars < ev.text.length && <span className="log__cursor">▌</span>}
                      </span>
                      <span className="log__score">
                        {ev.score[0]}-{ev.score[1]}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="app__footer">
        選手・チームはすべて自動生成のオリジナル（実在の人物・球団とは無関係）
      </footer>
    </div>
  );
}
