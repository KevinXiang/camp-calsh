import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import type { Camp, Unit } from '../src/game/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 0, y: 0, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 0, y: 0, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0, ...o };
}
function mkGS(overrides: Partial<CombatGSView> = {}): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
    ...overrides,
  };
}

describe('CombatSystem 尸体清理', () => {
  it('死亡且 deathTimer 归零的小兵从 units 移除', () => {
    const dead = mkUnit({ id: 'd', alive: false, deathTimer: 0 });
    const gs = mkGS({ units: new Map([[dead.id, dead]]) });
    CombatSystem.step(gs, 0.1);
    expect(gs.units.has('d')).toBe(false);
  });

  it('死亡但 deathTimer 未归零的小兵保留并继续倒计时', () => {
    const dead = mkUnit({ id: 'd', alive: false, deathTimer: 0.5 });
    const gs = mkGS({ units: new Map([[dead.id, dead]]) });
    CombatSystem.step(gs, 0.1);
    expect(gs.units.has('d')).toBe(true);
    expect(dead.deathTimer).toBeCloseTo(0.4, 5);
  });

  it('存活小兵绝不被移除', () => {
    const alive = mkUnit({ id: 'a', alive: true });
    const gs = mkGS({ units: new Map([[alive.id, alive]]) });
    CombatSystem.step(gs, 0.1);
    expect(gs.units.has('a')).toBe(true);
  });

  it('击杀时 deathTimer 设为正值（尸体停留）', () => {
    const u = mkUnit({ id: 'u', hp: 5 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 100, gs, { source: 'melee' });
    expect(u.alive).toBe(false);
    expect(u.deathTimer).toBeGreaterThan(0);
  });
});
