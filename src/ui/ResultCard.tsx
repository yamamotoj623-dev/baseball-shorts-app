import type { GameResult, Player, Team } from '../game/types';
import { teamColor } from '../game/players';

interface Props {
  result: GameResult;
  myShort?: string;
  onNext: () => void;
  onReplayLog: () => void;
}

/** 試合終了後のリザルト演出。勝敗・スコア・殊勲選手 */
export function ResultCard({ result, myShort, onNext, onReplayLog }: Props) {
  const aw = result.away.runs;
  const hm = result.home.runs;
  const myIsAway = result.away.team.shortName === myShort;
  const myIsHome = result.home.team.shortName === myShort;
  const involved = myIsAway || myIsHome;
  const myRuns = myIsAway ? aw : hm;
  const oppRuns = myIsAway ? hm : aw;
  const verdict = !involved ? (aw === hm ? 'DRAW' : '終了') : myRuns > oppRuns ? 'WIN' : myRuns < oppRuns ? 'LOSE' : 'DRAW';

  // 殊勲選手: 打点x2 + 本塁打x3 + 安打 が最大の選手
  const hero = (() => {
    let best: { p: Player; score: number; line: string } | null = null;
    const all: Player[] = [
      ...result.away.team.lineup,
      ...result.away.team.bench,
      ...result.home.team.lineup,
      ...result.home.team.bench,
    ];
    for (const [id, b] of Object.entries(result.batting)) {
      const score = b.rbi * 2 + b.hr * 3 + b.h;
      if (score <= 0) continue;
      const p = all.find((x) => x.id === id);
      if (!p) continue;
      const line = `${b.ab}打数${b.h}安打${b.hr > 0 ? ` ${b.hr}本塁打` : ''}${b.rbi > 0 ? ` ${b.rbi}打点` : ''}`;
      if (!best || score > best.score) best = { p, score, line };
    }
    return best;
  })();

  return (
    <div className="result">
      <div className={`result__panel result__panel--${verdict.toLowerCase()}`}>
        <div className={`result__verdict result__verdict--${verdict.toLowerCase()}`}>{verdict}</div>
        <div className="result__score">
          <TeamSide team={result.away.team} runs={aw} win={aw > hm} />
          <span className="result__dash">-</span>
          <TeamSide team={result.home.team} runs={hm} win={hm > aw} />
        </div>
        {hero && (
          <div className="result__hero">
            <span className="result__herolabel">殊勲</span>
            <span className="result__heroname">{hero.p.name}</span>
            <span className="result__heroline">{hero.line}</span>
          </div>
        )}
        <div className="result__actions">
          <button className="btn btn--primary" onClick={onNext}>
            次の試合へ
          </button>
          <button className="btn" onClick={onReplayLog}>
            経過を読む
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamSide({ team, runs, win }: { team: Team; runs: number; win: boolean }) {
  return (
    <div className={`result__team ${win ? 'result__team--win' : ''}`}>
      <span className="result__short" style={{ color: teamColor(team) }}>
        {team.shortName}
      </span>
      <span className="result__runs">{runs}</span>
    </div>
  );
}
