import { useState } from 'react';
import type { Player, Team } from '../game/types';
import {
  CONDITION_MARKS,
  CONDITION_LABELS,
  posClass,
  playerValue,
  registeredCount,
  REGISTERED_LIMIT,
} from '../game/players';
import {
  executeGenDraft,
  genDraftCandidates,
  proposeTrade,
  SEASON_LENGTH,
  type LeagueState,
} from '../game/league';

/** ポジションバッジ（パワプロ風色分け: 投=青/捕=ピンク/内野=黄/外野=緑/DH=灰） */
export function PosBadge({ pos }: { pos: Player['position'] }) {
  return <span className={`posb posb--${posClass(pos)}`}>{pos}</span>;
}

/** 調子マーク（⤵↘→↗⤴） */
export function CondMark({ p }: { p: Player }) {
  const c = p.condition ?? 2;
  return (
    <span className={`cond cond--${c}`} title={CONDITION_LABELS[c]}>
      {CONDITION_MARKS[c]}
    </span>
  );
}

function statLine(p: Player): string {
  return p.pitches
    ? `球${p.pitches.velocity} 制${p.pitches.control} ス${p.pitches.stamina}`
    : `ミ${p.bats.meet} パ${p.bats.power} 走${p.bats.speed} 守${p.bats.defense}`;
}

interface Props {
  league: LeagueState;
  team: Team;
  onChange: () => void;
  onClose: () => void;
}

type Tab = '打順' | '投手' | '二軍' | 'トレード' | '現役D';

/** 編成画面: 打順・ポジション・ローテ/ブルペン・一二軍入替・トレード・現役ドラフト */
export function RosterEditor({ league, team, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('打順');
  const [posSwap, setPosSwap] = useState<number | null>(null);
  const [tradeMine, setTradeMine] = useState<Player | null>(null);
  const [tradeMsg, setTradeMsg] = useState('');

  const swap = <T,>(arr: T[], i: number, j: number) => {
    [arr[i], arr[j]] = [arr[j], arr[i]];
  };

  return (
    <section className="roster-ed">
      <div className="roster-ed__head">
        <h2 className="roster-ed__title">⚙️ 編成 — {team.name}</h2>
        <button className="btn btn--primary" onClick={onClose}>
          完了
        </button>
      </div>

      <div className="roster-ed__tabs">
        {(['打順', '投手', '二軍', 'トレード', '現役D'] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'tab--on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === '打順' && (
        <div>
          <p className="roster-ed__hint">↑↓で打順入替、ポジションをタップで2人の守備位置を交換、⇄で控えと入替</p>
          {team.lineup.map((p, i) => (
            <div key={p.id} className="rrow">
              <span className="rrow__no">{i + 1}</span>
              <button
                className={`rrow__pos ${posSwap === i ? 'rrow__pos--sel' : ''}`}
                onClick={() => {
                  if (posSwap === null) setPosSwap(i);
                  else {
                    const a = team.lineup[posSwap];
                    const b = team.lineup[i];
                    const tmp = a.position;
                    a.position = b.position;
                    b.position = tmp;
                    setPosSwap(null);
                    onChange();
                  }
                }}
              >
                <PosBadge pos={p.position} />
              </button>
              <CondMark p={p} />
              <span className="rrow__name">{p.name}</span>
              <span className="rrow__stats">{statLine(p)}</span>
              <button className="rrow__btn" disabled={i === 0} onClick={() => { swap(team.lineup, i, i - 1); onChange(); }}>↑</button>
              <button className="rrow__btn" disabled={i === 8} onClick={() => { swap(team.lineup, i, i + 1); onChange(); }}>↓</button>
            </div>
          ))}
          <h3 className="roster-ed__sub">控え（ベンチ）</h3>
          {team.bench.map((p, bi) => (
            <div key={p.id} className="rrow">
              <span className="rrow__no" />
              <PosBadge pos={p.position} />
              <CondMark p={p} />
              <span className="rrow__name">{p.name}</span>
              <span className="rrow__stats">{statLine(p)}</span>
              <select
                className="rrow__sel"
                value=""
                onChange={(e) => {
                  const li = Number(e.target.value);
                  if (Number.isNaN(li)) return;
                  // 控えとスタメンを入替（守備位置はスタメン側を引き継ぐ）
                  const starter = team.lineup[li];
                  const benchP = team.bench[bi];
                  benchP.position = starter.position;
                  team.lineup[li] = benchP;
                  team.bench[bi] = starter;
                  onChange();
                }}
              >
                <option value="">⇄ 先発と入替</option>
                {team.lineup.map((s, li) => (
                  <option key={s.id} value={li}>
                    {li + 1}番 {s.name}と
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {tab === '投手' && (
        <div>
          <p className="roster-ed__hint">先発は登板後に3試合の休養が必要。リリーフは1試合。⇄で配置転換</p>
          <h3 className="roster-ed__sub">先発ローテーション</h3>
          {(team.rotation ?? []).map((p, i) => (
            <div key={p.id} className="rrow">
              <span className="rrow__no">{i + 1}</span>
              <PosBadge pos="投" />
              <CondMark p={p} />
              <span className="rrow__name">{p.name}</span>
              <span className="rrow__stats">{statLine(p)}</span>
              <span className={`rrow__rest ${p.rest ? 'rrow__rest--ng' : ''}`}>{p.rest ? `休${p.rest}` : '可'}</span>
              <button
                className="rrow__btn"
                onClick={() => {
                  // ローテ→ブルペンへ配置転換（ブルペン先頭と交換）
                  if (team.bullpen.length === 0) return;
                  const out = team.rotation![i];
                  team.rotation![i] = team.bullpen[0];
                  team.bullpen[0] = out;
                  if (team.pitcher.id === out.id) team.pitcher = team.rotation![i];
                  onChange();
                }}
              >
                ⇄中継ぎ
              </button>
            </div>
          ))}
          <h3 className="roster-ed__sub">ブルペン（中継ぎ・抑え）</h3>
          {team.bullpen.map((p, i) => (
            <div key={p.id} className="rrow">
              <span className="rrow__no" />
              <PosBadge pos="投" />
              <CondMark p={p} />
              <span className="rrow__name">{p.name}{i === team.bullpen.length - 1 ? '（抑え）' : ''}</span>
              <span className="rrow__stats">{statLine(p)}</span>
              <span className={`rrow__rest ${p.rest ? 'rrow__rest--ng' : ''}`}>{p.rest ? `休${p.rest}` : '可'}</span>
            </div>
          ))}
        </div>
      )}

      {tab === '二軍' && (
        <div>
          <p className="roster-ed__hint">
            支配下 {registeredCount(team)}/{REGISTERED_LIMIT}人。育成選手は支配下登録すると一軍へ上げられます
          </p>
          {(team.farm ?? []).map((p, fi) => (
            <div key={p.id} className="rrow">
              <span className="rrow__no" />
              <PosBadge pos={p.position} />
              <CondMark p={p} />
              <span className="rrow__name">
                {p.name}
                {p.ikusei && <span className="badge-ikusei">育成</span>}
                <span className="rrow__age">{p.age}歳</span>
              </span>
              <span className="rrow__stats">{statLine(p)}</span>
              {p.ikusei ? (
                <button
                  className="rrow__btn"
                  disabled={registeredCount(team) >= REGISTERED_LIMIT}
                  onClick={() => {
                    p.ikusei = false;
                    onChange();
                  }}
                >
                  支配下登録
                </button>
              ) : (
                <button
                  className="rrow__btn"
                  onClick={() => {
                    // 一軍と入替: 投手はブルペン末尾、野手はベンチ末尾と交換
                    const farm = team.farm!;
                    if (p.pitches) {
                      const down = team.bullpen[team.bullpen.length - 1];
                      team.bullpen[team.bullpen.length - 1] = p;
                      farm[fi] = down;
                    } else {
                      const down = team.bench[team.bench.length - 1];
                      p.position = down.position;
                      team.bench[team.bench.length - 1] = p;
                      farm[fi] = down;
                    }
                    onChange();
                  }}
                >
                  ⬆一軍
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'トレード' && (
        <div>
          <p className="roster-ed__hint">
            同タイプ（野手⇔野手 / 投手⇔投手）で価値が釣り合えば成立。まず放出する自軍選手を選択
          </p>
          {tradeMsg && <div className="news"><div className="news__line">{tradeMsg}</div></div>}
          {!tradeMine ? (
            <div>
              {[...team.lineup, ...team.bench, ...(team.rotation ?? []), ...team.bullpen].map((p) => (
                <button key={p.id} className="rrow rrow--btn" onClick={() => setTradeMine(p)}>
                  <PosBadge pos={p.position} />
                  <span className="rrow__name">{p.name}</span>
                  <span className="rrow__stats">{statLine(p)}</span>
                  <span className="rrow__value">価値{playerValue(p)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div className="news">
                <div className="news__line">
                  放出: {tradeMine.name}（価値{playerValue(tradeMine)}）
                  <button className="btn btn--ghost" onClick={() => setTradeMine(null)}>変更</button>
                </div>
              </div>
              {league.teams
                .filter((t) => t.shortName !== team.shortName)
                .flatMap((t) =>
                  [...t.lineup, ...t.bench, ...(t.rotation ?? []), ...t.bullpen]
                    .filter((p) => Boolean(p.pitches) === Boolean(tradeMine.pitches))
                    .map((p) => ({ p, t })),
                )
                .sort((a, b) => playerValue(b.p) - playerValue(a.p))
                .slice(0, 14)
                .map(({ p, t }) => (
                  <button
                    key={p.id}
                    className="rrow rrow--btn"
                    onClick={() => {
                      const ok = proposeTrade(league, tradeMine, p, t);
                      setTradeMsg(ok ? `🤝 成立！${tradeMine.name} ⇄ ${p.name}` : `❌ ${t.shortName}は提案を拒否（価値が見合わない）`);
                      if (ok) setTradeMine(null);
                      onChange();
                    }}
                  >
                    <span className="rrow__team">{t.shortName}</span>
                    <PosBadge pos={p.position} />
                    <span className="rrow__name">{p.name}</span>
                    <span className="rrow__stats">{statLine(p)}</span>
                    <span className="rrow__value">価値{playerValue(p)}</span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

      {tab === '現役D' && (
        <div>
          <p className="roster-ed__hint">
            現役ドラフト: 他球団で出場機会に恵まれない選手を年1回獲得できます（自軍の控え1人を放出）
          </p>
          {league.genDraftYear === Math.floor(league.games / SEASON_LENGTH) ? (
            <p className="stats__empty">今年度の現役ドラフトは実施済みです。</p>
          ) : (
            genDraftCandidates(league).map(({ player, team: t }) => (
              <button
                key={player.id}
                className="rrow rrow--btn"
                onClick={() => {
                  if (executeGenDraft(league, { player, team: t })) onChange();
                }}
              >
                <span className="rrow__team">{t.shortName}</span>
                <PosBadge pos={player.position} />
                <span className="rrow__name">
                  {player.name}
                  <span className="rrow__age">{player.age}歳</span>
                </span>
                <span className="rrow__stats">{statLine(player)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
