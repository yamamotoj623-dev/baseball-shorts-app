import type { Team } from '../game/types';
import type { TeamRecord } from '../game/league';
import { teamColor } from '../game/players';
import { CondMark } from './RosterEditor';

interface Props {
  away: Team;
  home: Team;
  records: Record<string, TeamRecord>;
  myShort?: string;
}

/** ホーム画面の「次の試合」カード。球団カラー・勝敗・先発・調子をコンパクトに */
export function MatchCard({ away, home, records, myShort }: Props) {
  return (
    <div className="match">
      <div className="match__label">NEXT GAME</div>
      <div className="match__row">
        <Side team={away} rec={records[away.shortName]} mine={away.shortName === myShort} align="left" />
        <div className="match__vs">VS</div>
        <Side team={home} rec={records[home.shortName]} mine={home.shortName === myShort} align="right" />
      </div>
      <div className="match__starters">
        <span className="match__sp">
          先発 {away.pitcher.name} <CondMark p={away.pitcher} />
        </span>
        <span className="match__sp match__sp--right">
          <CondMark p={home.pitcher} /> {home.pitcher.name} 先発
        </span>
      </div>
    </div>
  );
}

function Side({ team, rec, mine, align }: { team: Team; rec?: TeamRecord; mine: boolean; align: 'left' | 'right' }) {
  const color = teamColor(team);
  return (
    <div className={`match__side match__side--${align}`}>
      <span className="match__emblem" style={{ background: color }}>
        {team.shortName.slice(0, 2)}
      </span>
      <div className="match__info">
        <div className="match__team">
          {team.shortName}
          {mine && <span className="match__mine">MY</span>}
        </div>
        <div className="match__rec">{rec ? `${rec.w}勝${rec.l}敗${rec.t > 0 ? `${rec.t}分` : ''}` : '開幕前'}</div>
      </div>
    </div>
  );
}
