import { useState } from 'react';
import type { Player, Team } from '../game/types';
import { PosBadge } from './RosterEditor';

interface Props {
  team: Team;
  pool: Player[];
  /** 何人まで獲得できるか */
  maxPicks: number;
  /** 他球団と競合している選手のID（指名すると抽選になる） */
  competing: Set<string>;
  onConfirm: (picks: Player[]) => void;
  onSkip: () => void;
}

const batScore = (p: Player) => p.bats.meet + p.bats.power;
const pitScore = (p: Player) => (p.pitches ? p.pitches.velocity + p.pitches.control + p.pitches.stamina : 0);

/** スカウト力に応じた能力表示。高いと実数、低いとグレード（S〜E） */
function scoutView(p: Player, skill: number): string {
  const grade = (v: number) => (v >= 85 ? 'S' : v >= 72 ? 'A' : v >= 60 ? 'B' : v >= 48 ? 'C' : v >= 36 ? 'D' : 'E');
  if (skill >= 72) {
    return p.pitches
      ? `球${p.pitches.velocity} 制${p.pitches.control} ス${p.pitches.stamina}`
      : `ミ${p.bats.meet} パ${p.bats.power} 走${p.bats.speed} 守${p.bats.defense}`;
  }
  if (skill >= 50) {
    return p.pitches
      ? `球:${grade(p.pitches.velocity)} 制:${grade(p.pitches.control)} ス:${grade(p.pitches.stamina)}`
      : `ミ:${grade(p.bats.meet)} パ:${grade(p.bats.power)} 走:${grade(p.bats.speed)} 守:${grade(p.bats.defense)}`;
  }
  // スカウト力が低いと一部が「?」
  const g = (v: number, i: number) => ((p.id.charCodeAt(2 + i) + i) % 3 === 0 ? '?' : grade(v));
  return p.pitches
    ? `球:${g(p.pitches.velocity, 0)} 制:${g(p.pitches.control, 1)} ス:${g(p.pitches.stamina, 2)}`
    : `ミ:${g(p.bats.meet, 0)} パ:${g(p.bats.power, 1)} 走:${g(p.bats.speed, 2)} 守:${g(p.bats.defense, 3)}`;
}

/** ドラフト／補強画面。スカウトの眼力で見え方が変わり、競合選手は抽選になる */
export function Draft({ team, pool, maxPicks, competing, onConfirm, onSkip }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const skill = team.scout?.skill ?? 50;

  const weakestBat = [...team.lineup].sort((a, b) => batScore(a) - batScore(b))[0];
  const weakestArm = [team.pitcher, ...team.bullpen].sort((a, b) => pitScore(a) - pitScore(b))[0];

  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else if (n.size < maxPicks) n.add(id);
      return n;
    });

  return (
    <section className="draft">
      <h2 className="draft__title">📋 ドラフト・補強会議</h2>
      <p className="draft__lead">
        スカウト{team.scout?.name ?? ''}（眼力{skill}）の調査リスト。🔥は他球団も狙う競合選手——指名すると抽選です。最大{maxPicks}人。
      </p>
      <div className="draft__hint">
        入替候補: 野手 <b>{weakestBat.name}</b> / 投手 <b>{weakestArm.name}</b>（獲得選手は同タイプの最弱と入替）
      </div>

      <div className="draft__list">
        {pool.map((p) => {
          const on = picked.has(p.id);
          return (
            <button key={p.id} className={`draft__card ${on ? 'draft__card--on' : ''}`} onClick={() => toggle(p.id)}>
              <PosBadge pos={p.position} />
              <span className="draft__pname">
                {p.name}
                {competing.has(p.id) && <span className="draft__hot">🔥競合</span>}
                <span className="rrow__age">{p.age}歳</span>
              </span>
              <span className="draft__stats">{scoutView(p, skill)}</span>
              <span className="draft__check">{on ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="draft__actions">
        <button className="btn btn--primary" onClick={() => onConfirm(pool.filter((p) => picked.has(p.id)))} disabled={picked.size === 0}>
          {picked.size > 0 ? `${picked.size}人を指名` : '指名する選手を選択'}
        </button>
        <button className="btn" onClick={onSkip}>
          スキップ
        </button>
      </div>
    </section>
  );
}
