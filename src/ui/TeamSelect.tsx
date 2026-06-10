import type { Team } from '../game/types';
import { teamOverall } from '../game/players';

interface Props {
  teams: Team[];
  onPick: (shortName: string) => void;
}

/** 自球団を選ぶ画面（オーナー就任） */
export function TeamSelect({ teams, onPick }: Props) {
  return (
    <section className="select">
      <h2 className="select__title">あなたの球団を選んでください</h2>
      <p className="select__lead">監督兼GMとして、この球団を率いてペナント制覇を目指します。</p>
      <div className="select__grid">
        {teams.map((t) => {
          const ov = teamOverall(t);
          return (
            <button key={t.shortName} className="select__card" onClick={() => onPick(t.shortName)}>
              <div className="select__short">{t.shortName}</div>
              <div className="select__name">{t.name}</div>
              <div className="select__ovr">
                <span>打 {ov.bat}</span>
                <span>投 {ov.pit}</span>
              </div>
              <div className="select__ace">エース {t.pitcher.name}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
