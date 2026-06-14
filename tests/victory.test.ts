import { describe, it, expect } from 'vitest';
import { checkWinner, type VictoryView } from '../src/game/victory';
import type { Faction } from '../src/game/types';

function mkView(camps: [Faction, boolean][], unitsAlive: [Faction, boolean][]): VictoryView {
  const c = new Map<string, { faction: Faction; destroyed: boolean }>();
  camps.forEach(([f, d], i) => c.set(`c${i}`, { faction: f, destroyed: d }));
  const u = new Map<string, { faction: Faction; alive: boolean }>();
  unitsAlive.forEach(([f, a], i) => u.set(`u${i}`, { faction: f, alive: a }));
  return { camps: c, units: u };
}

describe('checkWinner', () => {
  it('双方都有军营时无胜者', () => {
    expect(checkWinner(mkView([['red', false], ['blue', false]], []))).toBeNull();
  });
  it('红方军营全毁且无存活单位 → 蓝方胜', () => {
    const v = mkView([['red', true], ['blue', false]], []);
    expect(checkWinner(v)).toBe('blue');
  });
  it('红方军营全毁但仍有存活单位 → 未分胜负', () => {
    const v = mkView([['red', true], ['blue', false]], [['red', true]]);
    expect(checkWinner(v)).toBeNull();
  });
  it('蓝方彻底覆灭 → 红方胜', () => {
    const v = mkView([['red', false], ['blue', true]], []);
    expect(checkWinner(v)).toBe('red');
  });
  it('双方都空（尚未放置）→ 无胜者', () => {
    expect(checkWinner(mkView([], []))).toBeNull();
  });
  it('仅放置一方军营（另一方从未参战）→ 无胜者（回归：不应立即判胜）', () => {
    const v = mkView([['red', false]], []);  // 只放了红营，蓝方从未放置
    expect(checkWinner(v)).toBeNull();
  });
  it('忽略已死亡单位', () => {
    const v = mkView([['red', true], ['blue', false]], [['red', false], ['red', false]]);
    expect(checkWinner(v)).toBe('blue');
  });
});
