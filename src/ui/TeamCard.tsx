import type { Player, Team } from '../game/types';
import type { BatTotals, TeamRecord } from '../game/league';

interface Props {
  team: Team;
  side: string;
  /** シーズン打撃成績（選手ID別）。あれば率・本を表示 */
  seasonBat?: Record<string, BatTotals>;
  /** チームの勝敗（あれば見出しに表示） */
  record?: TeamRecord;
  /** 自球団の略称（一致すればバッジ表示） */
  myTeam?: string;
}

/** チームの打順・先発投手を能力値つきで一覧表示（試合前プレビュー用） */
export function TeamCard({ team, side, seasonBat, record, myTeam }: Props) {
  const hasSeason = Boolean(seasonBat && Object.keys(seasonBat).length > 0);
  const hasRecord = record && record.w + record.l + record.t > 0;
  const isMine = myTeam === team.shortName;
  return (
    <div className={`teamcard ${isMine ? 'teamcard--mine' : ''}`}>
      <div className="teamcard__head">
        <span className="teamcard__side">{side}{isMine ? '・マイチーム' : ''}</span>
        <h2 className="teamcard__name">{team.name}</h2>
        {hasRecord && (
          <span className="teamcard__record">
            {record!.w}勝{record!.l}敗{record!.t > 0 ? `${record!.t}分` : ''}
          </span>
        )}
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
            {hasSeason && <th title="今季打率">率</th>}
            {hasSeason && <th title="今季本塁打">本</th>}
          </tr>
        </thead>
        <tbody>
          {team.lineup.map((p, i) => (
            <BatterRow key={p.id} order={i + 1} player={p} season={seasonBat?.[p.id]} hasSeason={hasSeason} />
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

function BatterRow({
  order,
  player,
  season,
  hasSeason,
}: {
  order: number;
  player: Player;
  season?: BatTotals;
  hasSeason: boolean;
}) {
  const b = player.bats;
  const avg = season && season.ab > 0 ? `.${Math.round((season.h / season.ab) * 1000).toString().padStart(3, '0')}` : '-';
  return (
    <tr>
      <td className="roster__num">{order}</td>
      <td className="roster__pos">{player.position}</td>
      <td className="roster__name">{player.name}</td>
      <td>{b.meet}</td>
      <td>{b.power}</td>
      <td>{b.speed}</td>
      <td>{b.defense}</td>
      {hasSeason && <td className="roster__season">{avg}</td>}
      {hasSeason && <td className="roster__season">{season?.hr ?? 0}</td>}
    </tr>
  );
}
