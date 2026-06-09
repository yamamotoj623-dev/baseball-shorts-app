import type { GameResult, Team } from '../game/types';

interface Props {
  away: Team;
  home: Team;
  result: GameResult | null;
  score: [number, number];
  /** 表示済みイベント数（試合中は途中経過を反映） */
  upTo: number;
}

/**
 * 簡易ラインスコア。試合前は名前だけ、試合中・後はイニング別得点を表示。
 * 進行中の途中経過は App から渡される現在スコアを使う。
 */
export function Scoreboard({ away, home, result, score }: Props) {
  const innings = result ? result.innings : 9;
  const cols = Math.max(9, innings);

  const awayByInning = result?.away.byInning ?? [];
  const homeByInning = result?.home.byInning ?? [];

  return (
    <div className="scoreboard">
      <table className="linescore">
        <thead>
          <tr>
            <th className="linescore__team"></th>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i}>{i + 1}</th>
            ))}
            <th className="linescore__total">R</th>
            <th>H</th>
          </tr>
        </thead>
        <tbody>
          <Row name={away.shortName} byInning={awayByInning} runs={score[0]} hits={result?.away.hits} cols={cols} />
          <Row name={home.shortName} byInning={homeByInning} runs={score[1]} hits={result?.home.hits} cols={cols} />
        </tbody>
      </table>
    </div>
  );
}

function Row({
  name,
  byInning,
  runs,
  hits,
  cols,
}: {
  name: string;
  byInning: number[];
  runs: number;
  hits?: number;
  cols: number;
}) {
  return (
    <tr>
      <td className="linescore__team">{name}</td>
      {Array.from({ length: cols }, (_, i) => (
        <td key={i}>{byInning[i] != null ? byInning[i] : ''}</td>
      ))}
      <td className="linescore__total">{runs}</td>
      <td>{hits ?? ''}</td>
    </tr>
  );
}
