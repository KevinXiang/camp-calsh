import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import type { Camp, Unit } from '../src/game/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'blue', kind: 'sword', x: 0, y: 0, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'blue', kind: 'sword', campId: 'c1', x: 0, y: 0, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0,
    poisonTimer: 0, poisonDps: 0, poisonCooldownTimer: 0, ...o };
}
function mkGS(overrides: Partial<CombatGSView> = {}): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
    ...overrides,
  };
}

describe('CombatSystem.applyAOE', () => {
  it('半径内所有敌方 unit 受伤', () => {
    const u1 = mkUnit({ id: 'u1', x: 10, y: 0, hp: 100 });
    const u2 = mkUnit({ id: 'u2', x: 40, y: 0, hp: 100 });
    const u3 = mkUnit({ id: 'u3', x: 60, y: 0, hp: 100 });
    const gs = mkGS({ units: new Map([[u1.id, u1], [u2.id, u2], [u3.id, u3]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(u1.hp).toBe(80);
    expect(u2.hp).toBe(80);
    expect(u3.hp).toBe(100);
  });

  it('不打自己人', () => {
    const enemy = mkUnit({ id: 'e', faction: 'blue', x: 10, y: 0, hp: 100 });
    const ally = mkUnit({ id: 'a', faction: 'red', x: 10, y: 0, hp: 100 });
    const gs = mkGS({ units: new Map([[enemy.id, enemy], [ally.id, ally]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(enemy.hp).toBe(80);
    expect(ally.hp).toBe(100);
  });

  it('半径内敌方 camp 也受伤', () => {
    const c = mkCamp({ id: 'camp1', faction: 'blue', x: 30, y: 0, hp: 500 });
    const gs = mkGS({ camps: new Map([[c.id, c]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(c.hp).toBe(480);
  });

  it('每次爆炸推一个 bombExplosion 事件', () => {
    const gs = mkGS();
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(gs.events.filter(ev => ev.kind === 'bombExplosion')).toHaveLength(1);
  });

  it('圈内盾兵走 shieldBlock（身份压过 bomb）', () => {
    const shield = mkUnit({ id: 's', faction: 'blue', kind: 'shield', x: 10, y: 0, hp: 160 });
    const gs = mkGS({ units: new Map([[shield.id, shield]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(gs.events.some(ev => ev.kind === 'shieldBlock')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'bombHit')).toBe(false);
    expect(shield.hp).toBe(140);
  });

  it('圈内普通 unit 走 bombHit', () => {
    const u = mkUnit({ id: 'u', faction: 'blue', kind: 'sword', x: 10, y: 0, hp: 100 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(gs.events.some(ev => ev.kind === 'bombHit')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });
});
