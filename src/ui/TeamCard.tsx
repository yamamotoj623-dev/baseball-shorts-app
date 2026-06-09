import type { Player, Team } from '../game/types';

interface Props {
  team: Team;
  side: string;
}

/** チームの打順・先発投手を能力値つきで一覧表示（試合前プレビュー用） */
export function TeamCard({ team, side }: Props) {
  return (
    <div className="teamcard">
      <div className="teamcard__head">
        <span className="teamcard__side">{side}</span>
        <h2 className="teamcard__name">{team.name}</h2>
      </div>

      <table className="roster">
        <thead>
          <tr>
            <th>#</th>
            <th></th>
            <th>選手</th>
            <th title="ミート">ミ</th>
            <th title="パワー">パ</th>
            <th title="走力">走</th>
            <th title="守備">守</th>
          </tr>
        </thead>
        <tbody>
          {team.lineup.map((p, i) => (
            <BatterRow key={p.id} order={i + 1} player={p} />
          ))}
        </tbody>
      </table>

      <div className="teamcard__pitcher">
        <span className="teamcard__pos">先発</span>
        <span className="teamcard__pname">{team.pitcher.name}</span>
        <span className="teamcard__pstats">
          球速 {team.pitcher.pitches!.velocity} / 制球 {team.pitcher.pitches!.control} / スタミナ{' '}
          {team.pitcher.pitches!.stamina}
        </span>
      </div>

      <div className="teamcard__depth">
        <span className="teamcard__pos">ブルペン</span>
        <span className="teamcard__names">{team.bullpen.map((p) => p.name).join('、')}</span>
      </div>
      <div className="teamcard__depth">
        <span className="teamcard__pos">ベンチ</span>
        <span className="teamcard__names">{team.bench.map((p) => p.name).join('、')}</span>
      </div>
    </div>
  );
}

function BatterRow({ order, player }: { order: number; player: Player }) {
  const b = player.bats;
  return (
    <tr>
      <td className="roster__num">{order}</td>
      <td className="roster__pos">{player.position}</td>
      <td className="roster__name">{player.name}</td>
      <td>{b.meet}</td>
      <td>{b.power}</td>
      <td>{b.speed}</td>
      <td>{b.defense}</td>
    </tr>
  );
}
