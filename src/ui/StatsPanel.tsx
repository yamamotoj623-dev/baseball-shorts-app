import type { Team } from '../game/types';
import type { LeagueState } from '../game/league';

interface Props {
  league: LeagueState;
  team: Team;
  onClose: () => void;
}

/** 出塁率 (H+BB)/(AB+BB) ※犠飛・死球の細分は簡略化 */
function obp(h: number, bb: number, ab: number): number {
  const d = ab + bb;
  return d > 0 ? (h + bb) / d : 0;
}

/** 長打率 */
function slg(h: number, d2: number, d3: number, hr: number, ab: number): number {
  if (ab === 0) return 0;
  const singles = h - d2 - d3 - hr;
  return (singles + 2 * d2 + 3 * d3 + 4 * hr) / ab;
}

function f3(v: number): string {
  return `.${Math.round(v * 1000).toString().padStart(3, '0')}`;
}

/** 球速能力 → 平均球速(km/h) の見せ方（トラッキング風） */
function avgVelo(velocity: number): string {
  return (128 + velocity * 0.24).toFixed(1);
}

/** セイバーメトリクス成績画面（自球団の打者・投手＋リーグOPSランキング） */
export function StatsPanel({ league, team, onClose }: Props) {
  const batRows = team.lineup
    .map((p) => ({ p, t: league.bat[p.id] }))
    .filter((r) => r.t && r.t.ab + r.t.bb > 0);

  const arms = [team.pitcher, ...team.bullpen];
  const pitRows = arms.map((p) => ({ p, t: league.pit[p.id] })).filter((r) => r.t && r.t.outs > 0);

  // リーグOPSランキング（規定: リーグ消化試合×2打数）
  const minAb = Math.max(10, league.games * 2);
  const leaders = league.teams
    .flatMap((tm) => tm.lineup.map((p) => ({ p, tm, t: league.bat[p.id] })))
    .filter((r) => r.t && r.t.ab >= minAb)
    .map((r) => ({
      ...r,
      ops: obp(r.t!.h, r.t!.bb, r.t!.ab) + slg(r.t!.h, r.t!.d2 ?? 0, r.t!.d3 ?? 0, r.t!.hr, r.t!.ab),
    }))
    .sort((a, b) => b.ops - a.ops)
    .slice(0, 5);

  return (
    <section className="stats">
      <div className="stats__head">
        <h2 className="stats__title">📊 {team.name} の成績</h2>
        <button className="btn" onClick={onClose}>
          閉じる
        </button>
      </div>

      <h3 className="stats__sub">打撃（セイバー指標つき）</h3>
      {batRows.length === 0 ? (
        <p className="stats__empty">まだ試合データがありません。</p>
      ) : (
        <div className="stats__scroll">
          <table className="stats__table">
            <thead>
              <tr>
                <th className="stats__name">選手</th>
                <th>率</th>
                <th>本</th>
                <th>点</th>
                <th>盗</th>
                <th>出塁率</th>
                <th>長打率</th>
                <th>OPS</th>
              </tr>
            </thead>
            <tbody>
              {batRows.map(({ p, t }) => {
                const o = obp(t!.h, t!.bb ?? 0, t!.ab);
                const s = slg(t!.h, t!.d2 ?? 0, t!.d3 ?? 0, t!.hr, t!.ab);
                return (
                  <tr key={p.id}>
                    <td className="stats__name">{p.name}</td>
                    <td>{t!.ab > 0 ? f3(t!.h / t!.ab) : '-'}</td>
                    <td>{t!.hr}</td>
                    <td>{t!.rbi}</td>
                    <td>{t!.sb}</td>
                    <td>{f3(o)}</td>
                    <td>{f3(s)}</td>
                    <td className="stats__hl">{(o + s).toFixed(3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="stats__sub">投手（トラッキング風データつき）</h3>
      {pitRows.length === 0 ? (
        <p className="stats__empty">まだ登板データがありません。</p>
      ) : (
        <div className="stats__scroll">
          <table className="stats__table">
            <thead>
              <tr>
                <th className="stats__name">選手</th>
                <th>防御率</th>
                <th>WHIP</th>
                <th>K/9</th>
                <th>BB/9</th>
                <th>平均球速</th>
              </tr>
            </thead>
            <tbody>
              {pitRows.map(({ p, t }) => {
                const ip = t!.outs / 3;
                return (
                  <tr key={p.id}>
                    <td className="stats__name">{p.name}</td>
                    <td className="stats__hl">{((t!.runs * 9) / ip).toFixed(2)}</td>
                    <td>{(((t!.bb ?? 0) + (t!.ha ?? 0)) / ip).toFixed(2)}</td>
                    <td>{((t!.k * 9) / ip).toFixed(1)}</td>
                    <td>{(((t!.bb ?? 0) * 9) / ip).toFixed(1)}</td>
                    <td>{avgVelo(p.pitches?.velocity ?? 50)} km/h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="stats__sub">リーグOPSランキング（規定打数 {minAb}）</h3>
      {leaders.length === 0 ? (
        <p className="stats__empty">規定到達者なし。</p>
      ) : (
        <ol className="stats__leaders">
          {leaders.map((r, i) => (
            <li key={r.p.id}>
              <span className="stats__rank">{i + 1}</span> {r.p.name}（{r.tm.shortName}）
              <span className="stats__hl">　OPS {r.ops.toFixed(3)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
