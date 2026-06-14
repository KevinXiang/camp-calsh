import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import type { Camp, Unit, Projectile } from '../src/game/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 0, y: 0, hp: 200, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 0, y: 0, hp: 40, maxHp: 100,
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

describe('CombatSystem.applyHeal', () => {
  it('恢复目标 HP', () => {
    const u = mkUnit({ hp: 30, maxHp: 100 });
    CombatSystem.applyHeal(u, 20, mkGS());
    expect(u.hp).toBe(50);
  });

  it('不超过 maxHp', () => {
    const u = mkUnit({ hp: 95, maxHp: 100 });
    CombatSystem.applyHeal(u, 20, mkGS());
    expect(u.hp).toBe(100);
  });

  it('推 healHit 事件', () => {
    const u = mkUnit({ x: 10, y: 20, hp: 30 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyHeal(u, 20, gs);
    expect(gs.events.some(ev => ev.kind === 'healHit')).toBe(true);
  });

  it('也能治兵营', () => {
    const c = mkCamp({ hp: 100, maxHp: 500 });
    CombatSystem.applyHeal(c, 50, mkGS());
    expect(c.hp).toBe(150);
  });

  it('弹道 kind=heal 命中调用 applyHeal', () => {
    const u = mkUnit({ hp: 30, x: 200, y: 0, maxHp: 100 });
    const p: Projectile = { id: 'p1', kind: 'heal', x: 195, y: 0, targetId: 'u1', speed: 200, damage: 20, faction: 'red', elapsed: 0, maxTime: 2 };
    const gs = mkGS({ units: new Map([[u.id, u]]), projectiles: [p] });
    CombatSystem.step(gs, 1);
    expect(u.hp).toBe(50);
    expect(gs.events.some(ev => ev.kind === 'healHit')).toBe(true);
  });
});
