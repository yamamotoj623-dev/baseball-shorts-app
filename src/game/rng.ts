// 再現可能な乱数生成器（mulberry32）。
// シードを固定すれば同じ試合を再現でき、テストやデバッグがしやすい。

export interface Rng {
  /** 0以上1未満の乱数 */
  next(): number;
  /** min以上max未満の整数 */
  int(min: number, max: number): number;
  /** 確率 p (0〜1) で true */
  chance(p: number): boolean;
  /** 配列からランダムに1つ */
  pick<T>(arr: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
