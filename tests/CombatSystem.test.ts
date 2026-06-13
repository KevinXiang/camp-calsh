import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import type { Camp, Unit, Projectile } from '../src/game/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 0, y: 0, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 0, y: 0, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0.3, ...o };
}
function mkGS(overrides: Partial<CombatGSView> = {}): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
    ...overrides,
  };
}

describe('CombatSystem', () => {
  it('小兵 hp≤0 则 alive=false, kills++', () => {
    const u = mkUnit({ faction: 'red', hp: 10 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 15, gs, { source: 'melee' });
    expect(u.alive).toBe(false);
    expect(gs.stats.blue.kills).toBe(1);
  });

  it('军营 hp≤0 则 destroyed=true, campsDestroyed++', () => {
    const c = mkCamp({ faction: 'blue', hp: 10 });
    const gs = mkGS({ camps: new Map([[c.id, c]]) });
    CombatSystem.applyDamage(c, 15, gs, { source: 'melee' });
    expect(c.destroyed).toBe(true);
    expect(gs.stats.red.campsDestroyed).toBe(1);
  });

  it('弹道命中目标扣血', () => {
    const u = mkUnit({ id: 'target', faction: 'red', hp: 100, x: 200, y: 0 });
    const p: Projectile = { id: 'p1', x: 195, y: 0, targetId: 'target', speed: 200, damage: 20, faction: 'blue', elapsed: 0, maxTime: 2 };
    const gs = mkGS({ units: new Map([[u.id, u]]), projectiles: [p] });
    CombatSystem.step(gs, 1);
    expect(u.hp).toBe(80);
  });

  it('弹道超时落空', () => {
    const p: Projectile = { id: 'p1', x: 0, y: 0, targetId: 'nobody', speed: 200, damage: 20, faction: 'blue', elapsed: 1.9, maxTime: 2 };
    const gs = mkGS({ projectiles: [p] });
    CombatSystem.step(gs, 0.2);
    expect(gs.projectiles.length).toBe(0);
  });

  it('死亡单位尸体保留不删除，deathTimer 归零停止', () => {
    const u = mkUnit({ alive: false, deathTimer: 0.05 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.step(gs, 0.1);
    expect(gs.units.has(u.id)).toBe(true);
    expect(u.deathTimer).toBe(0);
  });

  it('小兵死亡时 camp.aliveUnits--', () => {
    const c = mkCamp({ id: 'camp1', aliveUnits: 3 });
    const u = mkUnit({ campId: 'camp1', hp: 10, faction: 'red' });
    const gs = mkGS({ camps: new Map([[c.id, c]]), units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 15, gs, { source: 'melee' });
    expect(u.alive).toBe(false);
    expect(c.aliveUnits).toBe(2);
  });
});
