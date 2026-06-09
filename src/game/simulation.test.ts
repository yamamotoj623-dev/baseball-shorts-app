import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { generateMatchup } from './players';
import { simulateGame } from './simulation';

describe('simulateGame', () => {
  it('同じシードなら同じ結果になる（再現性）', () => {
    const rngA = createRng(123);
    const { away, home } = generateMatchup(rngA);
    const r1 = simulateGame(away, home, 999);
    const r2 = simulateGame(away, home, 999);
    expect(r1.away.runs).toBe(r2.away.runs);
    expect(r1.home.runs).toBe(r2.home.runs);
    expect(r1.events.length).toBe(r2.events.length);
  });

  it('スコア・安打は非負で、イニング別得点の合計と一致する', () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = createRng(seed);
      const { away, home } = generateMatchup(rng);
      const result = simulateGame(away, home, seed * 7 + 1);

      expect(result.away.runs).toBeGreaterThanOrEqual(0);
      expect(result.home.runs).toBeGreaterThanOrEqual(0);
      expect(result.away.hits).toBeGreaterThanOrEqual(0);

      const awaySum = result.away.byInning.reduce((a, b) => a + b, 0);
      const homeSum = result.home.byInning.reduce((a, b) => a + b, 0);
      expect(awaySum).toBe(result.away.runs);
      expect(homeSum).toBe(result.home.runs);
    }
  });

  it('9回以上行い、12回までに収まる', () => {
    const rng = createRng(42);
    const { away, home } = generateMatchup(rng);
    const result = simulateGame(away, home, 42);
    expect(result.innings).toBeGreaterThanOrEqual(9);
    expect(result.innings).toBeLessThanOrEqual(12);
  });

  it('決着がついた試合では最終イベントが勝敗を示す', () => {
    const rng = createRng(7);
    const { away, home } = generateMatchup(rng);
    const result = simulateGame(away, home, 7);
    const last = result.events[result.events.length - 1];
    expect(last.text).toContain('試合終了');
  });
});
