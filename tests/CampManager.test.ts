import { describe, it, expect } from 'vitest';
import { CampManager, type GameStateView } from '../src/game/managers/CampManager';
import type { Camp, Unit } from '../src/game/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 100, y: 100, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 0, destroyed: false, ...o };
}
function mkState(camps: Camp[], spawnMultiplier = { red: 1, blue: 1 }): GameStateView {
  const cm = new Map<string, Camp>(); for (const c of camps) cm.set(c.id, c);
  const um = new Map<string, Unit>();
  return { camps: cm, units: um, sim: { spawnMultiplier }, addUnit(u: Unit) { um.set(u.id, u); } };
}

describe('CampManager', () => {
  it('产兵间隔到后产出一兵', () => {
    const s = mkState([mkCamp({ spawnTimer: 0.01 })]);
    new CampManager(s).step(4);
    expect(s.units.size).toBe(1);
  });
  it('产兵属性取自配置', () => {
    const s = mkState([mkCamp({ spawnTimer: 0.01 })]);
    new CampManager(s).step(4);
    const u = [...s.units.values()][0];
    expect(u.faction).toBe('red'); expect(u.kind).toBe('sword'); expect(u.campId).toBe('c1'); expect(u.maxHp).toBe(100);
  });
  it('摧毁后不产兵', () => {
    const s = mkState([mkCamp({ spawnTimer: 0.01, destroyed: true })]);
    new CampManager(s).step(4);
    expect(s.units.size).toBe(0);
  });
  it('aliveUnits=20 不产兵', () => {
    const s = mkState([mkCamp({ spawnTimer: 0.01, aliveUnits: 20 })]);
    new CampManager(s).step(4);
    expect(s.units.size).toBe(0);
  });
  it('多军营独立产兵', () => {
    const s = mkState([mkCamp({ id: 'a', spawnTimer: 0.01 }), mkCamp({ id: 'b', spawnTimer: 0.01, kind: 'archer', x: 300 })]);
    new CampManager(s).step(5);
    expect(s.units.size).toBeGreaterThanOrEqual(2);
  });
  it('产兵倍率：2x 在半个周期内即产兵', () => {
    // sword 默认 spawnInterval=4，spawnTimer 初始 4，0.5x 周期=2s；倍率 2x 应在 2s 后产兵
    const s = mkState([mkCamp({ spawnTimer: 4 })], { red: 2, blue: 1 });
    new CampManager(s).step(2.01);
    expect(s.units.size).toBe(1);
  });
  it('产兵倍率：1x 在半个周期不产兵', () => {
    const s = mkState([mkCamp({ spawnTimer: 4 })], { red: 1, blue: 1 });
    new CampManager(s).step(2.01);
    expect(s.units.size).toBe(0);
  });
  it('产兵倍率仅影响对应阵营', () => {
    const camps = [
      mkCamp({ id: 'r', faction: 'red',  spawnTimer: 4 }),
      mkCamp({ id: 'b', faction: 'blue', spawnTimer: 4, x: 300 }),
    ];
    const s = mkState(camps, { red: 4, blue: 1 });
    new CampManager(s).step(1.01);  // 红方 4x → 1s 已够；蓝方 1x → 1s 远不够
    const factions = [...s.units.values()].map(u => u.faction);
    expect(factions).toEqual(['red']);
  });
});
