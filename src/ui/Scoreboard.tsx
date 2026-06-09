import type { GameEvent, Team } from '../game/types';

interface Props {
  away: Team;
  home: Team;
  /** これまでに表示済みのイベント（再生位置まで） */
  events: GameEvent[];
  /** 現在スコア [away, home] */
  score: [number, number];
}

/**
 * ラインスコア。**表示済みイベントだけ**から集計するので、
 * 実況の進行と完全に同期する（先に最終結果が見えてしまわない）。
 */
export function Scoreboard({ away, home, events, score }: Props) {
  const line = buildLine(events);
  const cols = Math.max(9, line.maxInning);

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
          <Row name={away.shortName} byInning={line.away} runs={score[0]} hits={line.awayHits} cols={cols} />
          <Row name={home.shortName} byInning={line.home} runs={score[1]} hits={line.homeHits} cols={cols} />
        </tbody>
      </table>
    </div>
  );
}

/** 表示済みイベントから、イニング別得点・安打・最大イニングを集計する */
function buildLine(events: GameEvent[]) {
  const away: (number | null)[] = [];
  const home: (number | null)[] = [];
  let prevA = 0;
  let prevH = 0;
  let awayHits = 0;
  let homeHits = 0;
  let maxInning = 0;

  for (const ev of events) {
    const idx = ev.inning - 1;
    maxInning = Math.max(maxInning, ev.inning);

    // その半イニングが始まったら 0 を置いてセルを「開始済み」にする
    if (ev.half === 'top') {
      if (away[idx] == null) away[idx] = 0;
    } else if (home[idx] == null) {
      home[idx] = 0;
    }

    const dA = ev.score[0] - prevA;
    const dH = ev.score[1] - prevH;
    if (dA > 0) away[idx] = (away[idx] ?? 0) + dA;
    if (dH > 0) home[idx] = (home[idx] ?? 0) + dH;
    prevA = ev.score[0];
    prevH = ev.score[1];

    if (ev.kind === 'hit' || ev.kind === 'homerun') {
      if (ev.half === 'top') awayHits += 1;
      else homeHits += 1;
    }
  }

  return { away, home, awayHits, homeHits, maxInning };
}

function Row({
  name,
  byInning,
  runs,
  hits,
  cols,
}: {
  name: string;
  byInning: (number | null)[];
  runs: number;
  hits: number;
  cols: number;
}) {
  return (
    <tr>
      <td className="linescore__team">{name}</td>
      {Array.from({ length: cols }, (_, i) => (
        <td key={i}>{byInning[i] != null ? byInning[i] : ''}</td>
      ))}
      <td className="linescore__total">{runs}</td>
      <td>{hits}</td>
    </tr>
  );
}
