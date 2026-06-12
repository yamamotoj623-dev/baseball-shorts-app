import { useMemo, useState } from 'react';
import type { Player, Team } from '../game/types';
import {
  BATTER_ABILITIES,
  PITCHER_ABILITIES,
  FOREIGN_LIMIT,
  PAYROLL_CAP,
  blankCustomTeam,
  budgetFor,
  foreignCount,
  payrollOf,
  pointsUsed,
  randomizePlayer,
  salaryFor,
  generateManager,
  generateCoaches,
  grade,
  makeForeignName,
  budgetFor as _bf,
} from '../game/players';
import { createRng } from '../game/rng';

/** 総合グレード（全能力の平均→S〜G） */
function overallGrade(p: Player): string {
  const v = p.pitches
    ? (p.pitches.velocity + p.pitches.control + p.pitches.stamina) / 3
    : (p.bats.meet + p.bats.power + p.bats.speed + p.bats.defense) / 4;
  return grade(Math.round(v));
}
void _bf;

interface Props {
  onComplete: (team: Team) => void;
  onCancel: () => void;
}

const MANAGER_STYLES = ['攻撃的', '堅実', 'データ重視'] as const;

/** マスターリーグ形式の球団作成。ポイント振り分け・投打・特殊能力・外国人枠・年俸キャップ */
export function TeamBuilder({ onComplete, onCancel }: Props) {
  const [team, setTeam] = useState<Team>(() => {
    const t = blankCustomTeam();
    t.manager = { ...generateManager(createRng(Date.now() >>> 0)), style: '堅実' };
    t.coaches = generateCoaches(createRng((Date.now() >>> 0) + 1));
    return t;
  });
  const [editing, setEditing] = useState<{ group: 'lineup' | 'pitcher' | 'bullpen' | 'bench'; index: number } | null>(null);

  const refresh = () => setTeam({ ...team });

  const playerAt = (g: NonNullable<typeof editing>): Player => {
    if (g.group === 'lineup') return team.lineup[g.index];
    if (g.group === 'pitcher') return team.pitcher;
    if (g.group === 'bullpen') return team.bullpen[g.index];
    return team.bench[g.index];
  };

  const payroll = useMemo(() => payrollOf(team), [team]);
  const foreigners = useMemo(() => foreignCount(team), [team]);
  const allPlayers = [...team.lineup, team.pitcher, ...team.bullpen, ...team.bench];
  const unnamed = allPlayers.filter((p) => !p.name.trim()).length;
  const overBudget = allPlayers.filter((p) => pointsUsed(p) > budgetFor(p)).length;
  const canFinish =
    team.name.trim() && team.shortName.trim() && unnamed === 0 && overBudget === 0 && payroll <= PAYROLL_CAP && foreigners <= FOREIGN_LIMIT;

  const randomizeAll = () => {
    const rng = createRng((Math.random() * 2 ** 31) >>> 0);
    for (const p of allPlayers) randomizePlayer(p, rng);
    refresh();
  };

  const finish = () => {
    for (const p of allPlayers) p.salary = salaryFor(p);
    onComplete(team);
  };

  return (
    <section className="builder">
      <h2 className="builder__title">球団を作る（マスターリーグ）</h2>
      <p className="builder__lead">
        野手240pt・投手210ptを振り分け（外国人は+25pt／枠{FOREIGN_LIMIT}人）。年俸総額{PAYROLL_CAP / 10000}億円以内に収めてください。指名打者制（DH）です。
      </p>

      <div className="builder__meta">
        <input
          className="builder__input"
          placeholder="球団名（例: 東都ブレイカーズ）"
          value={team.name}
          onChange={(e) => {
            team.name = e.target.value;
            refresh();
          }}
        />
        <input
          className="builder__input builder__input--short"
          placeholder="略称（例: TKB）"
          maxLength={5}
          value={team.shortName}
          onChange={(e) => {
            team.shortName = e.target.value.toUpperCase();
            refresh();
          }}
        />
      </div>

      <div className="builder__manager">
        <span className="builder__mlabel">監督</span>
        <input
          className="builder__input builder__input--short"
          placeholder="監督名"
          value={team.manager?.name ?? ''}
          onChange={(e) => {
            if (team.manager) team.manager.name = e.target.value;
            refresh();
          }}
        />
        {MANAGER_STYLES.map((st) => (
          <button
            key={st}
            className={`chip ${team.manager?.style === st ? 'chip--on' : ''}`}
            onClick={() => {
              if (team.manager) team.manager.style = st;
              refresh();
            }}
          >
            {st}
          </button>
        ))}
      </div>

      <div className="builder__manager">
        <span className="builder__mlabel">コーチ</span>
        {(team.coaches ?? []).map((c, i) => (
          <span key={i} className="builder__coach">
            <span className="builder__ctype">{c.type}</span>
            <input
              className="builder__input builder__input--coach"
              placeholder={`${c.type}コーチ名`}
              value={c.name}
              onChange={(e) => {
                c.name = e.target.value;
                refresh();
              }}
            />
            <span className="builder__cskill">指導{c.skill}</span>
          </span>
        ))}
      </div>

      <div className={`builder__payroll ${payroll > PAYROLL_CAP ? 'builder__payroll--over' : ''}`}>
        年俸総額 {(payroll / 10000).toFixed(1)}億 / {PAYROLL_CAP / 10000}億円　・　外国人 {foreigners}/{FOREIGN_LIMIT}人
      </div>

      <RosterGroup title="スタメン（DH制）" players={team.lineup} onEdit={(i) => setEditing({ group: 'lineup', index: i })} />
      <RosterGroup title="先発投手" players={[team.pitcher]} onEdit={() => setEditing({ group: 'pitcher', index: 0 })} />
      <RosterGroup title="救援投手" players={team.bullpen} onEdit={(i) => setEditing({ group: 'bullpen', index: i })} />
      <RosterGroup title="控え野手" players={team.bench} onEdit={(i) => setEditing({ group: 'bench', index: i })} />

      <div className="builder__actions">
        <button className="btn" onClick={randomizeAll}>
          🎲 全員お任せ
        </button>
        <button className="btn btn--primary" onClick={finish} disabled={!canFinish}>
          ⚾ この球団で参戦
        </button>
        <button className="btn btn--ghost" onClick={onCancel}>
          戻る
        </button>
      </div>
      {!canFinish && (
        <p className="builder__warn">
          {!team.name.trim() || !team.shortName.trim() ? '球団名と略称を入力。' : ''}
          {unnamed > 0 ? `名前未入力の選手が${unnamed}人。` : ''}
          {overBudget > 0 ? `ポイント超過の選手が${overBudget}人。` : ''}
          {payroll > PAYROLL_CAP ? '年俸総額が上限を超えています。' : ''}
          {foreigners > FOREIGN_LIMIT ? '外国人枠を超えています。' : ''}
        </p>
      )}

      {editing && (
        <PlayerEditor
          player={playerAt(editing)}
          onChange={refresh}
          onClose={() => {
            playerAt(editing).salary = salaryFor(playerAt(editing));
            setEditing(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function RosterGroup({ title, players, onEdit }: { title: string; players: Player[]; onEdit: (i: number) => void }) {
  return (
    <div className="builder__group">
      <h3 className="builder__gtitle">{title}</h3>
      {players.map((p, i) => {
        const used = pointsUsed(p);
        const budget = budgetFor(p);
        return (
          <button key={p.id} className="builder__row" onClick={() => onEdit(i)}>
            <span className="builder__pos">{p.position}</span>
            <span className={`builder__pname ${p.name ? '' : 'builder__pname--empty'}`}>
              {p.name || '（タップして設定）'}
              {p.foreign ? ' 🌐' : ''}
            </span>
            <span className="builder__hand">
              {p.hand?.throw}投{p.hand?.bat}打
            </span>
            <span className={`builder__pts ${used > budget ? 'builder__pts--over' : ''}`}>
              {used}/{budget}pt
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 選手1人の編集パネル（名前・年齢・投打・能力振り分け・特殊能力・外国人）。再配分でも使う */
export function PlayerEditor({ player, onChange, onClose }: { player: Player; onChange: () => void; onClose: () => void }) {
  const isPitcher = Boolean(player.pitches);
  const budget = budgetFor(player);
  const used = pointsUsed(player);
  const remain = budget - used;
  const abilities = isPitcher ? PITCHER_ABILITIES : BATTER_ABILITIES;

  const stat = (label: string, get: () => number, set: (v: number) => void) => (
    <div className="editor__stat" key={label}>
      <span className="editor__slabel">{label}</span>
      <button className="editor__btn" onClick={() => { set(Math.max(1, get() - 5)); onChange(); }}>-5</button>
      <button className="editor__btn" onClick={() => { set(Math.max(1, get() - 1)); onChange(); }}>-</button>
      <span className="editor__val">{get()}</span>
      <span className={`editor__grade editor__grade--${grade(get())}`}>{grade(get())}</span>
      <div className="editor__bar">
        <span className={`editor__barfill bar--${grade(get())}`} style={{ width: `${get()}%` }} />
      </div>
      <button className="editor__btn" onClick={() => { if (remain >= 1) { set(Math.min(99, get() + 1)); onChange(); } }}>+</button>
      <button className="editor__btn" onClick={() => { const d = Math.min(5, remain, 99 - get()); if (d > 0) { set(get() + d); onChange(); } }}>+5</button>
    </div>
  );

  const toggleAbility = (a: string) => {
    const cur = player.abilities ?? [];
    if (cur.includes(a)) player.abilities = cur.filter((x) => x !== a);
    else if (cur.length < 2) player.abilities = [...cur, a]; // 最大2つ
    onChange();
  };

  return (
    <div className="editor" onClick={onClose}>
      <div className="editor__panel" onClick={(e) => e.stopPropagation()}>
        <div className="editor__head">
          <span className={`editor__ovr editor__grade--${overallGrade(player)}`}>{overallGrade(player)}</span>
          <input
            className="editor__numin"
            type="number"
            placeholder="背番号"
            value={player.uniform ?? ''}
            onChange={(e) => { player.uniform = Number(e.target.value) || undefined; onChange(); }}
          />
          <input
            className="builder__input"
            placeholder="選手名"
            value={player.name}
            onChange={(e) => {
              player.name = e.target.value;
              onChange();
            }}
          />
          <button className="btn btn--ghost" onClick={() => { randomizePlayer(player, createRng((Math.random() * 2 ** 31) >>> 0)); onChange(); }}>
            🎲
          </button>
        </div>

        <div className="editor__rows">
          <div className="editor__row">
            <span>年齢 {player.age}</span>
            <button className="editor__btn" onClick={() => { player.age = Math.max(18, (player.age ?? 24) - 1); onChange(); }}>-</button>
            <button className="editor__btn" onClick={() => { player.age = Math.min(40, (player.age ?? 24) + 1); onChange(); }}>+</button>
            <span className="editor__sep" />
            <span>投:</span>
            {(['右', '左'] as const).map((h) => (
              <button key={h} className={`chip ${player.hand?.throw === h ? 'chip--on' : ''}`} onClick={() => { player.hand = { throw: h, bat: player.hand?.bat ?? '右' }; onChange(); }}>{h}</button>
            ))}
            <span>打:</span>
            {(['右', '左', '両'] as const).map((h) => (
              <button key={h} className={`chip ${player.hand?.bat === h ? 'chip--on' : ''}`} onClick={() => { player.hand = { throw: player.hand?.throw ?? '右', bat: h }; onChange(); }}>{h}</button>
            ))}
          </div>
          <div className="editor__row">
            <button
              className={`chip ${player.foreign ? 'chip--on' : ''}`}
              onClick={() => {
                player.foreign = !player.foreign;
                // 外国人にしたら名前を外国人名へ（未入力時のみ自動補完）
                if (player.foreign && !player.name.trim()) player.name = makeForeignName(createRng((Math.random() * 2 ** 31) >>> 0));
                onChange();
              }}
            >
              🌐 外国人（+25pt / 年俸1.6倍）
            </button>
          </div>
        </div>

        <div className={`editor__remain ${remain < 0 ? 'editor__remain--over' : ''}`}>残り {remain}pt（上限{budget}）</div>

        {isPitcher ? (
          <>
            {stat('球速', () => player.pitches!.velocity, (v) => (player.pitches!.velocity = v))}
            {stat('制球', () => player.pitches!.control, (v) => (player.pitches!.control = v))}
            {stat('スタミナ', () => player.pitches!.stamina, (v) => (player.pitches!.stamina = v))}
          </>
        ) : (
          <>
            {stat('ミート', () => player.bats.meet, (v) => (player.bats.meet = v))}
            {stat('パワー', () => player.bats.power, (v) => (player.bats.power = v))}
            {stat('走力', () => player.bats.speed, (v) => (player.bats.speed = v))}
            {stat('守備', () => player.bats.defense, (v) => (player.bats.defense = v))}
          </>
        )}

        <div className="editor__abilities">
          <span className="editor__slabel">特殊能力（最大2つ）</span>
          {abilities.map((a) => (
            <button key={a} className={`chip ${player.abilities?.includes(a) ? 'chip--on' : ''}`} onClick={() => toggleAbility(a)}>{a}</button>
          ))}
        </div>

        <div className="editor__salary">想定年俸: {((salaryFor(player)) / 10000).toFixed(2)}億円</div>

        <button className="btn btn--primary editor__done" onClick={onClose}>
          OK
        </button>
      </div>
    </div>
  );
}
