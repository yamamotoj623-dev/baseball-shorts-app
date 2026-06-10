import { useState } from 'react';
import type { Player, Team } from '../game/types';

interface Props {
  team: Team;
  pool: Player[];
  /** 何人まで獲得できるか */
  maxPicks: number;
  onConfirm: (picks: Player[]) => void;
  onSkip: () => void;
}

const batScore = (p: Player) => p.bats.meet + p.bats.power;
const pitScore = (p: Player) => (p.pitches ? p.pitches.velocity + p.pitches.control + p.pitches.stamina : 0);

/** ドラフト／補強画面。プールから最大 maxPicks 人を獲得する */
export function Draft({ team, pool, maxPicks, onConfirm, onSkip }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // 入れ替わりで放出される見込みの選手（弱い順）
  const weakestBat = [...team.lineup].sort((a, b) => batScore(a) - batScore(b))[0];
  const weakestArm = [team.pitcher, ...team.bullpen].sort((a, b) => pitScore(a) - pitScore(b))[0];

  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else if (n.size < maxPicks) n.add(id);
      return n;
    });

  const confirm = () => onConfirm(pool.filter((p) => picked.has(p.id)));

  return (
    <section className="draft">
      <h2 className="draft__title">補強ドラフト</h2>
      <p className="draft__lead">
        {team.name} の戦力。獲得した選手は同タイプの最も弱い選手と入れ替わります（最大 {maxPicks} 人）。
      </p>
      <div className="draft__hint">
        現在の最弱: 野手 <b>{weakestBat.name}</b>（ミ{weakestBat.bats.meet}/パ{weakestBat.bats.power}） / 投手{' '}
        <b>{weakestArm.name}</b>（球{weakestArm.pitches!.velocity}/制{weakestArm.pitches!.control}）
      </div>

      <div className="draft__list">
        {pool.map((p) => {
          const on = picked.has(p.id);
          const isPitcher = Boolean(p.pitches);
          return (
            <button key={p.id} className={`draft__card ${on ? 'draft__card--on' : ''}`} onClick={() => toggle(p.id)}>
              <span className="draft__pos">{p.position}</span>
              <span className="draft__pname">{p.name}</span>
              {isPitcher ? (
                <span className="draft__stats">
                  球{p.pitches!.velocity} 制{p.pitches!.control} ス{p.pitches!.stamina}
                </span>
              ) : (
                <span className="draft__stats">
                  ミ{p.bats.meet} パ{p.bats.power} 走{p.bats.speed} 守{p.bats.defense}
                </span>
              )}
              <span className="draft__check">{on ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="draft__actions">
        <button className="btn btn--primary" onClick={confirm} disabled={picked.size === 0}>
          {picked.size > 0 ? `${picked.size}人を獲得` : '獲得する選手を選択'}
        </button>
        <button className="btn" onClick={onSkip}>
          スキップ
        </button>
      </div>
    </section>
  );
}
