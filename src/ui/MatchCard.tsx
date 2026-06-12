import type { Team } from '../game/types';
import type { TeamRecord } from '../game/league';
import { teamColor, teamAbbr } from '../game/players';
import { CondMark } from './RosterEditor';

interface Props {
  away: Team;
  home: Team;
  records: Record<string, TeamRecord>;
  myShort?: string;
  /** 先発の今季防御率（表示用文字列） */
  awayEra?: string;
  homeEra?: string;
  round?: { n: number; total: number };
}

/** ホーム画面の対戦カード（プロスピ風: 大型エンブレムが「対」を挟む） */
export function MatchCard({ away, home, records, myShort, awayEra, homeEra, round }: Props) {
  return (
    <div className="match">
      <div className="match__label">
        {round ? `第${round.n}ラウンド` : 'NEXT GAME'}
        {round && <span className="match__round">{round.n}/{round.total}</span>}
      </div>
      <div className="match__row">
        <Side team={away} rec={records[away.shortName]} mine={away.shortName === myShort} />
        <div className="match__tai">対</div>
        <Side team={home} rec={records[home.shortName]} mine={home.shortName === myShort} />
      </div>
      <div className="match__starters">
        <span className="match__sp">
          <CondMark p={away.pitcher} /> {away.pitcher.name}
          <em>{awayEra ?? '-'}</em>
        </span>
        <span className="match__vslabel">先発予告</span>
        <span className="match__sp match__sp--right">
          <em>{homeEra ?? '-'}</em> {home.pitcher.name} <CondMark p={home.pitcher} />
        </span>
      </div>
    </div>
  );
}

function Side({ team, rec, mine }: { team: Team; rec?: TeamRecord; mine: boolean }) {
  const color = teamColor(team);
  return (
    <div className="match__side2">
      <span className={`match__emblem2 ${mine ? 'match__emblem2--mine' : ''}`} style={{ background: `radial-gradient(circle at 32% 28%, ${color}, #0a0e14 130%)` }}>
        {teamAbbr(team)}
      </span>
      <div className="match__team">
        {teamAbbr(team)}
        {mine && <span className="match__mine">MY</span>}
      </div>
      {team.archetype && <div className="match__arch">{team.archetype}</div>}
      <div className="match__rec">{rec ? `${rec.w}勝${rec.l}敗${rec.t > 0 ? `${rec.t}分` : ''}` : '開幕前'}</div>
    </div>
  );
}
