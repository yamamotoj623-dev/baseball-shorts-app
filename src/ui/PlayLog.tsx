import { useState, type RefObject } from 'react';
import type { GameEvent } from '../game/types';

interface Props {
  /** 表示済みイベント（再生位置まで） */
  events: GameEvent[];
  /** いま再生中のイベント（タイプライター対象） */
  current?: GameEvent;
  /** 現在行のタイプ進行文字数 */
  chars: number;
  /** タイプライター演出が有効か（速い設定では無効） */
  typing: boolean;
  scrollRef: RefObject<HTMLDivElement>;
}

type PaBlock = {
  kind: 'pa';
  paId: number;
  key: string;
  header?: GameEvent;
  extras: GameEvent[]; // 打席紹介などの色付け実況
  pitches: GameEvent[];
  results: GameEvent[]; // 打席結果（通常1つ。死球→負傷で2つ）
};
type Block = PaBlock | { kind: 'standalone'; ev: GameEvent; key: string };

/** フラットなイベント列を「打席ブロック」と「単独行」に束ねる */
function buildBlocks(events: GameEvent[]): Block[] {
  const blocks: Block[] = [];
  const map = new Map<number, PaBlock>();
  events.forEach((ev, i) => {
    if (ev.paId != null) {
      let blk = map.get(ev.paId);
      if (!blk) {
        blk = { kind: 'pa', paId: ev.paId, key: `pa${ev.paId}`, extras: [], pitches: [], results: [] };
        map.set(ev.paId, blk);
        blocks.push(blk);
      }
      if (ev.kind === 'situation') blk.header = ev;
      else if (ev.kind === 'pitch') blk.pitches.push(ev);
      else if (ev.kind === 'mound') blk.extras.push(ev);
      else blk.results.push(ev);
    } else {
      blocks.push({ kind: 'standalone', ev, key: `s${i}` });
    }
  });
  return blocks;
}

/** 打席結果の種別から、左アクセント色（出塁＝緑 / アウト＝赤 / 本塁打＝金）を決める */
function accentClass(results: GameEvent[]): string {
  if (results.length === 0) return 'pa--live';
  const k = results[results.length - 1].kind;
  if (k === 'out') return 'pa--out';
  if (k === 'injury') return 'pa--injury';
  if (k === 'homerun') return 'pa--hr';
  return 'pa--reach';
}

/** 走者状況のラベル（一・二塁／満塁など。空なら ''） */
function runnersLabel(bases: [boolean, boolean, boolean]): string {
  const on: string[] = [];
  if (bases[0]) on.push('一');
  if (bases[1]) on.push('二');
  if (bases[2]) on.push('三');
  if (on.length === 0) return '';
  if (on.length === 3) return '満塁';
  return on.join('・') + '塁';
}

/** 打席決着後の状況（「3アウト」「1アウト二塁」「一塁」など）。NPB速報の経過に倣う */
function stateSuffix(ev: GameEvent): string {
  if (ev.outs >= 3) return '3アウト';
  const o = ev.outs > 0 ? `${ev.outs}アウト` : '';
  return o + runnersLabel(ev.bases);
}

export function PlayLog({ events, current, chars, typing, scrollRef }: Props) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const blocks = buildBlocks(events);
  const toggle = (id: number) =>
    setOpen((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  // タイプライター適用後のテキスト
  const slice = (ev: GameEvent) => (ev === current && typing && chars < ev.text.length ? ev.text.slice(0, chars) : ev.text);
  const caret = (ev: GameEvent) => ev === current && chars < ev.text.length;

  return (
    <div className="log" ref={scrollRef}>
      {blocks.map((b) => {
        if (b.kind === 'standalone') {
          const ev = b.ev;
          if (ev.kind === 'info') {
            return (
              <div key={b.key} className="log__line log__line--info">
                <span className="log__info">{slice(ev)}</span>
              </div>
            );
          }
          return (
            <div key={b.key} className={`log__line log__line--${ev.kind}`}>
              <span className="log__meta">
                {ev.inning}回{ev.half === 'top' ? '表' : '裏'}
              </span>
              <span className="log__text">
                {slice(ev)}
                {caret(ev) && <span className="log__cursor">▌</span>}
              </span>
              <span className="log__score">
                {ev.score[0]}-{ev.score[1]}
              </span>
            </div>
          );
        }

        // 打席ブロック
        const inProgress = b.results.length === 0;
        const isCurrent = current?.paId === b.paId;
        const expanded = inProgress || isCurrent || open.has(b.paId);
        const canToggle = b.results.length > 0; // 結果が出た打席だけ畳める

        return (
          <div key={b.key} className={`pa ${accentClass(b.results)}`}>
            <button
              className="pa__header"
              onClick={() => canToggle && toggle(b.paId)}
              disabled={!canToggle}
            >
              <span className="pa__head-text">{b.header?.text}</span>
              {canToggle && <span className="pa__toggle">{expanded ? '▾' : '▸'}</span>}
            </button>

            {expanded && b.extras.map((ev, i) => (
              <div key={`e${i}`} className="pa__note">
                {slice(ev)}
                {caret(ev) && <span className="log__cursor">▌</span>}
              </div>
            ))}

            {expanded &&
              b.pitches.map((ev, i) => (
                <div key={`p${i}`} className="pa__pitch">
                  <span className="pa__pnum">{i + 1}</span>
                  <span className="pa__ptext">{ev.text}</span>
                </div>
              ))}

            {b.results.map((ev, i) => {
              // 決着球の通し番号（投球数＝記録された投球＋決着の1球）
              const num = b.pitches.length + 1;
              const suffix = ev.kind === 'injury' ? '' : stateSuffix(ev);
              return (
                <div key={`r${i}`} className={`pa__result pa__result--${ev.kind}`}>
                  {i === 0 && <span className={`pa__pnum pa__pnum--${accentClass(b.results).slice(4)}`}>{num}</span>}
                  <span className="pa__rtext">
                    {slice(ev)}
                    {caret(ev) && <span className="log__cursor">▌</span>}
                  </span>
                  {suffix && <span className="pa__state">{suffix}</span>}
                  <span className="pa__score">
                    {ev.score[0]}-{ev.score[1]}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
