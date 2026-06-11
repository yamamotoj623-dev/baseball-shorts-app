import type { StandingRow } from '../game/league';

interface Props {
  rows: StandingRow[];
  /** ハイライトするチーム略称（今から試合する2チーム） */
  highlight?: string[];
}

/** ペナントの順位表 */
export function Standings({ rows, highlight = [] }: Props) {
  const played = rows.some((r) => r.w + r.l + r.t > 0);
  return (
    <div className="standings">
      <h3 className="standings__title">順位表</h3>
      <table className="standings__table">
        <thead>
          <tr>
            <th></th>
            <th className="standings__team">チーム</th>
            <th>勝</th>
            <th>敗</th>
            <th>分</th>
            <th>勝率</th>
            <th>差</th>
            <th>直近5</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team.shortName} className={highlight.includes(r.team.shortName) ? 'standings__row--hl' : ''}>
              <td className="standings__rank">{r.rank}</td>
              <td className="standings__team">
                <span className="standings__short">{r.team.shortName}</span>
                <span className="standings__name">{r.team.name}</span>
              </td>
              <td>{r.w}</td>
              <td>{r.l}</td>
              <td>{r.t}</td>
              <td className="standings__pct">{played ? fmtPct(r.pct) : '-'}</td>
              <td>{r.rank === 1 ? '-' : fmtGb(r.gb)}</td>
              <td className="standings__last5">
                {(r.last5 ?? []).map((x, i) => (
                  <span key={i} className={`dot dot--${x.toLowerCase()}`}>
                    {x === 'W' ? '○' : x === 'L' ? '●' : '△'}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtPct(p: number): string {
  return `.${Math.round(p * 1000).toString().padStart(3, '0')}`;
}

function fmtGb(gb: number): string {
  return gb.toFixed(1);
}
