// 実況テキストの生成モジュール。
// ・各場面に多数のバリエーションを持ち、used-set で試合内の重複を避ける
// ・選手の特徴（能力値由来）や試合内の文脈（今日の成績など）を織り込む

import type { Player } from './types';
import type { Rng } from './rng';

/** 試合内で同じ言い回しを繰り返さないためのピッカー */
export function pickFresh(rng: Rng, used: Set<string>, pool: string[]): string {
  for (let i = 0; i < 5; i++) {
    const cand = pool[Math.floor(rng.next() * pool.length)];
    if (!used.has(cand)) {
      used.add(cand);
      return cand;
    }
  }
  return pool[Math.floor(rng.next() * pool.length)];
}

// ── 選手の特徴ラベル ──────────────────────────────

export function batterTrait(p: Player): string | null {
  const b = p.bats;
  if (b.power >= 74) return '長距離砲';
  if (b.meet >= 74) return '安打製造機';
  if (b.speed >= 74) return '俊足';
  if (b.defense >= 74) return '名手';
  return null;
}

export function pitcherTrait(p: Player): string | null {
  const s = p.pitches;
  if (!s) return null;
  if (s.velocity >= 74) return '本格派';
  if (s.control >= 74) return '精密機械';
  if (s.stamina >= 74) return 'タフネス';
  return null;
}

// ── 1球の実況（ライブパネル用） ──────────────────────────────

export const BALL_CALLS = [
  'ボール、外れた',
  'ボール',
  '低めに外れてボール',
  '際どいコース、判定はボール',
  '大きく外れた。捕手が腕を伸ばして止める',
  '指先にかからなかったか、ボール',
];
export const CALLED_STRIKES = [
  'ストライク、見逃した',
  'ズバッとストライク！',
  '外角いっぱいに決まってストライク',
  '膝元へ、見逃してストライク',
  'うなるような一球がミットに収まる。ストライク',
];
export const SWING_MISSES = [
  '空振り！',
  'バットが空を切る！',
  '豪快に空振り',
  '振り遅れた、空振り',
  '落ちる球にバットが止まらない！空振り',
];
export const FOULS = [
  'ファウル',
  'カットしてファウル',
  'ファウルで粘る',
  '打ち上げたがファウルグラウンドへ',
  '鋭い当たりはしかしファウル',
  'バックネットへのファウル',
];

// ── 場面の前置き（チャンス・ピンチの演出） ──────────────────────────────

export interface SituCtx {
  bases: [boolean, boolean, boolean];
  outs: number;
  inning: number;
  half: 'top' | 'bottom';
  battingScore: number;
  oppScore: number;
}

export function situationLine(rng: Rng, used: Set<string>, ctx: SituCtx): string {
  const { bases, outs, inning, battingScore, oppScore } = ctx;
  const loaded = bases[0] && bases[1] && bases[2];
  const risp = bases[1] || bases[2];
  const diff = battingScore - oppScore;
  const late = inning >= 7;

  // 毎打席は付けない。レバレッジが高いほど付きやすい
  const baseP = loaded ? 0.85 : risp && outs === 2 ? 0.7 : risp ? 0.5 : 0.18;
  if (!rngChance(rng, baseP)) return '';

  if (loaded) {
    const pool =
      diff < 0
        ? [
            '満塁。一打逆転のチャンスがやってきた。',
            'ベンチも観客も総立ち、満塁の好機。',
            '塁上は埋まった。ここで還せば試合は分からない。',
            '押せ押せの満塁。球場の空気が変わる。',
          ]
        : diff === 0
          ? [
              '満塁。勝ち越しのランナーは三塁。',
              '緊迫の同点、しかも満塁。',
              '満塁。一本出れば一気に試合が傾く。',
            ]
          : [
              '満塁。ここで突き放したい。',
              'なおも満塁。畳みかける絶好機。',
              '満塁とチャンスは続く。',
            ];
    if (outs === 2) pool.push('二死満塁。すべてはこの一振りに。', '2アウト満塁、逃げ場のない勝負。');
    return pickFresh(rng, used, pool);
  }

  if (risp && outs === 2) {
    const pool = [
      '二死から走者を還せるか。',
      '2アウト、しかし得点圏。あと一本が遠いか、近いか。',
      '土俵際の攻防、二死ながらチャンス。',
      '二死。それでも得点圏に走者を置いて。',
      'ツーアウトから流れを呼び込めるか。',
    ];
    if (late && diff < 0) pool.push('残されたアウトはわずか。それでも諦めない。', '終盤の二死、執念の攻撃。');
    return pickFresh(rng, used, pool);
  }

  if (risp) {
    const pool = [
      '得点圏に走者を進めて。',
      'チャンスメイクに成功。スタンドが沸き始める。',
      '走者は得点圏。内野は前進気味の守備。',
      '一打が出れば先に走者が還る場面。',
      'じわりと相手バッテリーに圧がかかる。',
    ];
    return pickFresh(rng, used, pool);
  }

  // 走者なしでも、終盤の接戦は空気を伝える
  if (late && Math.abs(diff) <= 1 && outs === 0 && !bases[0]) {
    const pool =
      diff < 0
        ? ['反撃はまずこの先頭打者から。', '土壇場の攻撃が始まる。出塁が欲しい。']
        : diff === 0
          ? ['同点の終盤。先頭打者の出塁が勝敗を分ける。', '緊迫の同点劇。まずはランナーを。']
          : ['リードは最少。追加点が欲しい展開だ。'];
    return pickFresh(rng, used, pool);
  }

  return '';
}

function rngChance(rng: Rng, p: number): boolean {
  return rng.next() < p;
}

// ── 試合内のストーリー（今日の成績・特徴に言及） ──────────────────────────────

export interface BatterDay {
  ab: number;
  h: number;
  k: number;
  hr: number;
  rbi: number;
  sb: number;
}

/** シーズン通算の打者サマリ（リーグ永続化から渡される） */
export interface SeasonBatterInfo {
  games: number;
  ab: number;
  h: number;
  hr: number;
  sb: number;
  avg: number;
  /** 直近5試合の合計 */
  recentAb: number;
  recentH: number;
  recentHr: number;
}

/** シーズン通算の投手サマリ */
export interface SeasonPitcherInfo {
  games: number;
  era: number;
  k: number;
}

function fmtAvg(avg: number): string {
  return `.${Math.round(avg * 1000).toString().padStart(3, '0')}`;
}

/** 打席に入る打者の紹介行。語ることがなければ null */
export function batterIntroLine(
  rng: Rng,
  used: Set<string>,
  label: string,
  batter: Player,
  day: BatterDay,
  season?: SeasonBatterInfo,
): string | null {
  const trait = batterTrait(batter);
  const candidates: string[] = [];

  // ── シーズン成績・直近の調子への言及 ──
  if (season && season.ab >= 15) {
    if (season.avg >= 0.32) {
      candidates.push(
        `打席には${label}。今季打率${fmtAvg(season.avg)}と絶好調のシーズンを送っている`,
        `${label}。リーグ屈指の打率${fmtAvg(season.avg)}、相手バッテリーは細心の注意を払う`,
      );
    } else if (season.avg <= 0.21) {
      candidates.push(
        `打席には${label}。今季は打率${fmtAvg(season.avg)}と苦しんでいる`,
        `${label}、今季ここまで${fmtAvg(season.avg)}。状態を上げたいところだ`,
      );
    }
    if (season.hr >= 3) {
      candidates.push(`打席には${label}。今季すでに${season.hr}本のアーチを描いている`);
    }
    if (season.recentAb >= 12) {
      const recentAvg = season.recentH / season.recentAb;
      if (recentAvg >= 0.4) {
        candidates.push(
          `打席には${label}。ここ数試合で${season.recentH}安打と当たりに当たっている`,
          `${label}、直近の打棒は手がつけられない。この打席も期待がかかる`,
        );
      } else if (recentAvg <= 0.13) {
        candidates.push(
          `打席には${label}。ここ数試合は当たりが止まっており、復調の一打が欲しい`,
          `${label}、直近${season.recentAb}打数${season.recentH}安打と急ブレーキ。流れを変えられるか`,
        );
      }
    }
  }

  if (day.hr > 0) {
    candidates.push(
      `打席には${label}。今日はすでに本塁打を放っている。${day.hr + 1}本目が出るか`,
      `${label}、この打席も注目だ。先ほどの一発の感触は残っているか`,
    );
  }
  if (day.h >= 2) {
    candidates.push(
      `打席には${label}。ここまで${day.ab}打数${day.h}安打と当たっている`,
      `${label}、今日は完全に投手を捉えている。マルチヒットの固め打ちなるか`,
    );
  }
  if (day.ab >= 2 && day.h === 0) {
    candidates.push(
      `打席には${label}。今日はここまで${day.ab}打数ノーヒット。そろそろ一本欲しい`,
      `${label}、ここまで快音なし。汚名返上の打席となるか`,
    );
  }
  if (day.k >= 2) {
    candidates.push(`${label}、ここまで${day.k}三振。三たびバットが空を切るのか、それとも`);
  }
  if (candidates.length === 0 && trait && rng.next() < 0.25) {
    const traitLines: Record<string, string[]> = {
      長距離砲: [`打席には${label}。一発のある${trait}、バッテリーは慎重になる`, `${label}。柵越えを狙える男の登場に、外野が深く守る`],
      安打製造機: [`打席には${label}。当てる技術はチーム随一の${trait}だ`],
      俊足: [`打席には${label}。${trait}だけに内野は前進守備気味`],
      名手: [`打席には${label}。守備の人と思わせて、打席でも油断はできない`],
    };
    candidates.push(...(traitLines[trait] ?? []));
  }

  if (candidates.length === 0) return null;
  if (rng.next() > 0.45) return null; // 出しすぎない
  return pickFresh(rng, used, candidates);
}

export interface PitcherDay {
  k: number;
  outs: number;
  runs: number;
}

/** イニング頭の投手への言及。語ることがなければ null */
export function pitcherNoteLine(
  rng: Rng,
  used: Set<string>,
  pitcher: Player,
  day: PitcherDay,
  season?: SeasonPitcherInfo,
): string | null {
  const ip = Math.floor(day.outs / 3);
  const trait = pitcherTrait(pitcher);
  const candidates: string[] = [];

  // シーズン成績への言及
  if (season && season.games >= 2) {
    if (season.era <= 2.3) {
      candidates.push(
        `マウンドの${pitcher.name}、今季防御率${season.era.toFixed(2)}と盤石の投球を続けている`,
      );
    } else if (season.era >= 5.5) {
      candidates.push(
        `${pitcher.name}、今季は防御率${season.era.toFixed(2)}と苦しいシーズン。今日こそ結果が欲しい`,
      );
    }
  }
  if (ip >= 4 && day.runs === 0) {
    candidates.push(
      `先発${pitcher.name}、ここまで${ip}回を無失点。${trait ? `${trait}の本領発揮、` : ''}危なげない投球が続く`,
      `マウンドの${pitcher.name}は今日、一度もホームを踏ませていない`,
    );
  } else if (ip >= 4 && day.k >= 6) {
    candidates.push(`${pitcher.name}、ここまで${day.k}奪三振と${trait ? `${trait}らしい` : '圧巻の'}ピッチング`);
  } else if (day.runs >= 4) {
    candidates.push(`${pitcher.name}、今日は苦しい投球。すでに${day.runs}失点とらしさを欠く`);
  }
  if (candidates.length === 0) return null;
  if (rng.next() > 0.5) return null;
  return pickFresh(rng, used, candidates);
}

// ── 打席結果のバリエーション ──────────────────────────────

const HIT_DIRECTIONS = ['レフト', 'センター', 'ライト', '左中間', '右中間'];
const GROUND_DIRECTIONS = ['ショート', 'セカンド', 'サード', 'ファースト', '投手'];
const FLY_DIRECTIONS = ['レフト', 'センター', 'ライト'];

export function strikeoutText(rng: Rng, used: Set<string>, label: string, pitcher: Player): string {
  const pool = [
    `${label}、空振り三振！！`,
    `${label}、見逃し三振！手が出なかった`,
    `${label}、三振に斬って取った！`,
    `${label}、空を切って三振`,
    `${label}、追い込まれてからの決め球に万事休す。三振`,
    `${label}、粘ったが最後はバットが届かない。三振`,
  ];
  if ((pitcher.pitches?.velocity ?? 0) >= 74) {
    pool.push(`${label}、${pitcher.name}の速球が唸りを上げて三振！`, `${label}、力と力の勝負は投手に軍配。豪快に三振`);
  }
  return pickFresh(rng, used, pool);
}

export function groundoutText(rng: Rng, used: Set<string>, label: string): string {
  const dir = pickFresh(rng, used, GROUND_DIRECTIONS.map((d) => d));
  const pool = [
    `${label}、${dir}ゴロに倒れる`,
    `${label}、ボテボテの${dir}ゴロ`,
    `${label}、詰まらされて${dir}ゴロ`,
    `${label}、鋭い当たりだが${dir}の正面。ゴロアウト`,
    `${label}、${dir}ゴロ。軽快な捌きでアウト`,
  ];
  return pickFresh(rng, used, pool);
}

export function dpText(rng: Rng, used: Set<string>, label: string): string {
  const pool = [
    `${label}、ショートゴロ──これを4-6-3、鮮やかなダブルプレー！`,
    `${label}、セカンドゴロ。6-4-3とテンポよく併殺完成`,
    `${label}、痛恨のゲッツー。チャンスが一瞬で潰える`,
    `${label}、サードゴロ併殺打。内野の堅守が光る`,
  ];
  return pickFresh(rng, used, pool);
}

export function flyoutText(rng: Rng, used: Set<string>, label: string): string {
  const dir = pickFresh(rng, used, FLY_DIRECTIONS.map((d) => d));
  const pool = [
    `${label}、${dir}へのフライ`,
    `${label}、${dir}へ打ち上げた。定位置でキャッチ`,
    `${label}、いい角度に見えたが${dir}フライ。風が押し戻したか`,
    `${label}、${dir}へ高々と上がって、これは捕られる`,
  ];
  return pickFresh(rng, used, pool);
}

export function lineoutText(rng: Rng, used: Set<string>, label: string): string {
  const dir = pickFresh(rng, used, GROUND_DIRECTIONS.map((d) => d));
  const pool = [
    `${label}、${dir}への鋭いライナー、惜しくも正面`,
    `${label}、痛烈な打球！しかし${dir}が好捕`,
    `${label}、弾丸ライナーは${dir}のグラブへ吸い込まれた`,
  ];
  return pickFresh(rng, used, pool);
}

export function singleText(rng: Rng, used: Set<string>, label: string, timely: boolean): string {
  const dir = pickFresh(rng, used, HIT_DIRECTIONS.map((d) => d));
  if (timely) {
    return pickFresh(rng, used, [
      `${label}、${dir}へタイムリーヒット！`,
      `${label}、${dir}前へ運んだ！走者が還る！`,
      `${label}、しぶとく${dir}へ落とすタイムリー！`,
      `${label}、${dir}へ会心のタイムリーヒット！`,
    ]);
  }
  return pickFresh(rng, used, [
    `${label}、${dir}へ弾き返すヒット！`,
    `${label}、${dir}前へ落ちるクリーンヒット`,
    `${label}、${dir}へ運ぶシングルヒット`,
    `${label}、${dir}を抜けるヒット！`,
    `${label}、詰まりながらも${dir}前へポトリ。これもヒットだ`,
    `${label}、ライナーで${dir}へ。素晴らしい打球だ`,
  ]);
}

export function doubleText(rng: Rng, used: Set<string>, label: string, timely: boolean, entitled: boolean): string {
  const dir = pickFresh(rng, used, HIT_DIRECTIONS.map((d) => d));
  if (entitled) {
    return pickFresh(rng, used, [
      `${label}、${dir}へ大きなバウンド──スタンドに入った！エンタイトルツーベース`,
      `${label}、フェンス直撃かと思われた打球はワンバウンドで場外へ。エンタイトルツーベース`,
    ]);
  }
  if (timely) {
    return pickFresh(rng, used, [
      `${label}、${dir}を破るタイムリーツーベース！`,
      `${label}、${dir}へ痛烈な二塁打！走者が生還！`,
      `${label}、フェンス際まで運ぶタイムリーツーベース！`,
    ]);
  }
  return pickFresh(rng, used, [
    `${label}、${dir}へ鋭い二塁打`,
    `${label}、${dir}を深々と破るツーベース！`,
    `${label}、ライン際に落ちる技ありの二塁打`,
  ]);
}

export function tripleText(rng: Rng, used: Set<string>, label: string, timely: boolean): string {
  const dir = pickFresh(rng, used, ['左中間', '右中間', 'ライト線', 'レフト線']);
  if (timely) {
    return pickFresh(rng, used, [
      `${label}、${dir}を真っ二つ！走者を一掃する三塁打！！`,
      `${label}、${dir}へ伸びる打球！俊足を飛ばして三塁打、走者生還！`,
    ]);
  }
  return pickFresh(rng, used, [
    `${label}、${dir}深くへ快速の三塁打！`,
    `${label}、${dir}へ転がる間に一気に三塁へ！スリーベース`,
  ]);
}

export function homerunText(rng: Rng, used: Set<string>, label: string, batter: Player, runsTotal: number): string {
  const dir = pickFresh(rng, used, HIT_DIRECTIONS.map((d) => d));
  const name = runsTotal === 4 ? '満塁ホームラン' : runsTotal === 1 ? 'ソロホームラン' : `${runsTotal}ランホームラン`;
  const pool = [
    `${label}、打った瞬間それと分かる一発！${dir}スタンドへ${name}ーーっ！！`,
    `${label}、高々と舞い上がった打球は──入ったー！${dir}へ${name}！！`,
    `${label}、フルスイング！白球は${dir}スタンドへ一直線、${name}！！`,
  ];
  if (batter.bats.power >= 74) {
    pool.push(`${label}、これぞ長距離砲の本領！場外級の特大アーチ、${name}！！`);
  }
  return pickFresh(rng, used, pool);
}

export function walkText(rng: Rng, used: Set<string>, label: string, oshidashi: boolean): string {
  if (oshidashi) {
    return pickFresh(rng, used, [
      `${label}、ストレートの四球──押し出し！手痛い1点`,
      `${label}、ボール4つ。満塁で歩かせてしまい押し出しの失点`,
    ]);
  }
  return pickFresh(rng, used, [
    `${label}、フォアボールを選んで出塁`,
    `${label}、よく見極めた。四球で歩く`,
    `${label}、際どい球をすべてカットして四球をもぎ取る`,
    `${label}、制球が定まらず四球`,
  ]);
}

// ── 新プレー（盗塁・牽制・失策・野選） ──────────────────────────────

export function stealSuccessText(rng: Rng, used: Set<string>, runner: Player, seasonNth?: number): string {
  const base = pickFresh(rng, used, [
    `${runner.name}、スタートを切った──二塁へ滑り込んでセーフ！盗塁成功！`,
    `${runner.name}が走った！捕手の送球も及ばず、鮮やかな盗塁`,
    `初球から${runner.name}が仕掛けた！楽々セーフ、足で揺さぶる`,
  ]);
  if (seasonNth && seasonNth >= 3) return `${base}（今季${seasonNth}個目）`;
  return base;
}

export function caughtStealingText(rng: Rng, used: Set<string>, runner: Player): string {
  return pickFresh(rng, used, [
    `${runner.name}が走った──しかし捕手の送球がドンピシャ！盗塁死！`,
    `${runner.name}、スタートを切るがタッチアウト！痛い走塁死だ`,
    `仕掛けた${runner.name}だが、これは完全に読まれていた。盗塁失敗`,
  ]);
}

export function pickoffFlavorText(rng: Rng, used: Set<string>, pitcher: Player): string {
  return pickFresh(rng, used, [
    `${pitcher.name}、一塁へ鋭い牽制。走者は素早く帰塁`,
    `${pitcher.name}、二度三度と牽制を入れて走者の足を封じにかかる`,
    `クイックを意識した${pitcher.name}、まずは牽制でひと睨み`,
  ]);
}

export function pickoffOutText(rng: Rng, used: Set<string>, runner: Player): string {
  return pickFresh(rng, used, [
    `牽制──飛び出した！${runner.name}、戻れずタッチアウト！手痛い走塁ミス`,
    `絶妙の牽制！${runner.name}が塁間に挟まれて万事休す。牽制アウト`,
  ]);
}

export function errorText(rng: Rng, used: Set<string>, label: string, fielder: Player, isFly: boolean): string {
  if (isFly) {
    return pickFresh(rng, used, [
      `${label}の飛球──${fielder.name}、落とした！まさかの落球で出塁を許す（記録は失策）`,
      `${label}、平凡なフライ。しかし${fielder.name}がグラブに当てて落とす！エラーだ`,
    ]);
  }
  return pickFresh(rng, used, [
    `${label}のゴロ──${fielder.name}がファンブル！記録は失策、出塁を許す`,
    `${label}、何でもないゴロだったが${fielder.name}の送球が逸れた！悪送球で出塁`,
    `${label}のゴロを${fielder.name}が弾いた！イレギュラーか、記録はエラー`,
  ]);
}

export function fielderChoiceText(rng: Rng, used: Set<string>, label: string): string {
  return pickFresh(rng, used, [
    `${label}のゴロ、二塁封殺──一塁は間に合わない！フィルダースチョイス`,
    `${label}、ゴロの間に先行走者は刺されたが、自身は一塁に生きる（野選）`,
  ]);
}

// ── 得点時のリアクション ──────────────────────────────

export function scoringReactionText(
  rng: Rng,
  used: Set<string>,
  prevBatting: number,
  opp: number,
  added: number,
): string {
  const after = prevBatting + added;
  if (prevBatting < opp) {
    if (after > opp)
      return pickFresh(rng, used, [
        ' ── 逆転だ！！スタンドが揺れる！',
        ' ── ついにひっくり返した！',
        ' ── 試合をひっくり返す殊勲打！',
      ]);
    if (after === opp)
      return pickFresh(rng, used, [
        ' ── 同点に追いついた！',
        ' ── 振り出しに戻した！',
        ' ── 執念で同点！ベンチは大盛り上がりだ',
      ]);
    return pickFresh(rng, used, [` ── まず${added}点を返す`, ' ── 反撃ののろしを上げた', ' ── 点差を詰める']);
  }
  if (prevBatting === opp)
    return pickFresh(rng, used, [
      ' ── ついに均衡を破った！',
      ' ── 勝ち越し！欲しかった1点が入る',
      ' ── 先んじたのはこちらだ！',
    ]);
  return pickFresh(rng, used, [
    ' ── リードをさらに広げる',
    ' ── 突き放しにかかる',
    ' ── ダメ押しと言いたい追加点',
  ]);
}

// ── マウンドでの間（NPB流: 投手コーチ・捕手） ──────────────────────────────

export function moundVisitText(rng: Rng, used: Set<string>, pitcher: Player): string {
  return pickFresh(rng, used, [
    `🤝 ここで投手コーチがゆっくりとマウンドへ。${pitcher.name}に間を与える`,
    `🤝 捕手がマウンドに駆け寄り、${pitcher.name}とひと言ふた言。呼吸を整える`,
    `🤝 内野陣がマウンドに集まる。${pitcher.name}、大きく息を吐いた`,
  ]);
}
