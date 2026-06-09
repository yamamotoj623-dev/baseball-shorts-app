import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateMatchup } from './game/players';
import { simulateGame } from './game/simulation';
import type { GameEvent, GameResult, Team } from './game/types';
import { createRng } from './game/rng';
import { Scoreboard } from './ui/Scoreboard';
import { Diamond } from './ui/Diamond';
import { TeamCard } from './ui/TeamCard';

type Phase = 'preview' | 'playing' | 'finished';

const SPEEDS = [
  { label: 'ゆっくり', ms: 1100 },
  { label: 'ふつう', ms: 550 },
  { label: '速い', ms: 220 },
];

function freshMatchup(): { away: Team; home: Team; seed: number } {
  const seed = (Math.random() * 2 ** 31) >>> 0;
  const rng = createRng(seed);
  const { away, home } = generateMatchup(rng);
  return { away, home, seed };
}

export function App() {
  const [matchup, setMatchup] = useState(freshMatchup);
  const [result, setResult] = useState<GameResult | null>(null);
  const [cursor, setCursor] = useState(0); // 表示済みイベント数
  const [phase, setPhase] = useState<Phase>('preview');
  const [speedIdx, setSpeedIdx] = useState(1);
  const logRef = useRef<HTMLDivElement>(null);

  const visibleEvents = useMemo(
    () => (result ? result.events.slice(0, cursor) : []),
    [result, cursor],
  );
  const latest: GameEvent | undefined = visibleEvents[visibleEvents.length - 1];

  // 再生ループ
  useEffect(() => {
    if (phase !== 'playing' || !result) return;
    if (cursor >= result.events.length) {
      setPhase('finished');
      return;
    }
    const t = setTimeout(() => setCursor((c) => c + 1), SPEEDS[speedIdx].ms);
    return () => clearTimeout(t);
  }, [phase, cursor, result, speedIdx]);

  // 最新ログまでスクロール
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [cursor]);

  const startGame = useCallback(() => {
    const r = simulateGame(matchup.away, matchup.home, matchup.seed);
    setResult(r);
    setCursor(1);
    setPhase('playing');
  }, [matchup]);

  const skipToEnd = useCallback(() => {
    if (!result) return;
    setCursor(result.events.length);
    setPhase('finished');
  }, [result]);

  const newCard = useCallback(() => {
    setMatchup(freshMatchup());
    setResult(null);
    setCursor(0);
    setPhase('preview');
  }, []);

  // 現在のスコア（表示済みイベント基準）
  const score: [number, number] = latest ? latest.score : [0, 0];

  return (
    <div className="app">
      <header className="app__header">
        <h1>⚾ テキスト野球シミュ</h1>
        <span className="app__tag">MVP-1 / 試合シミュレーション</span>
      </header>

      <Scoreboard
        away={matchup.away}
        home={matchup.home}
        result={result}
        score={score}
        upTo={cursor}
      />

      {phase === 'preview' && (
        <section className="preview">
          <div className="preview__cards">
            <TeamCard team={matchup.away} side="ビジター" />
            <span className="preview__vs">VS</span>
            <TeamCard team={matchup.home} side="ホーム" />
          </div>
          <div className="controls">
            <button className="btn btn--primary" onClick={startGame}>
              ▶ 試合開始
            </button>
            <button className="btn" onClick={newCard}>
              🎲 別のカード
            </button>
          </div>
        </section>
      )}

      {phase !== 'preview' && (
        <section className="live">
          <div className="live__status">
            <Diamond bases={latest?.bases ?? [false, false, false]} outs={latest?.outs ?? 0} />
            <div className="live__controls">
              <div className="speed">
                {SPEEDS.map((s, i) => (
                  <button
                    key={s.label}
                    className={`chip ${i === speedIdx ? 'chip--on' : ''}`}
                    onClick={() => setSpeedIdx(i)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {phase === 'playing' ? (
                <button className="btn" onClick={skipToEnd}>
                  ⏭ 最後まで飛ばす
                </button>
              ) : (
                <button className="btn btn--primary" onClick={newCard}>
                  🎲 次の試合へ
                </button>
              )}
            </div>
          </div>

          <div className="log" ref={logRef}>
            {visibleEvents.map((ev, i) => (
              <div key={i} className={`log__line log__line--${ev.kind}`}>
                {ev.kind === 'info' ? (
                  <span className="log__info">{ev.text}</span>
                ) : (
                  <>
                    <span className="log__meta">
                      {ev.inning}回{ev.half === 'top' ? '表' : '裏'}・{ev.outs}死
                    </span>
                    <span className="log__text">{ev.text}</span>
                    <span className="log__score">
                      {ev.score[0]}-{ev.score[1]}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="app__footer">
        選手・チームはすべて自動生成のオリジナル（実在の人物・球団とは無関係）
      </footer>
    </div>
  );
}
