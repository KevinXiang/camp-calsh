import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import type { Camp, Unit } from '../src/game/types';
import type { CombatEvent } from '../src/game/effects/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 0, y: 0, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 10, y: 20, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0.3,
    ...o };
}
function mkGS(overrides: Partial<CombatGSView> = {}): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
    ...overrides,
  };
}

describe('CombatSystem events', () => {
  it('近战攻击单位时发射 meleeHit 事件（带目标坐标 + unitId）', () => {
    const u = mkUnit({ id: 'u1', x: 50, y: 60, hp: 100 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'melee' });
    const e = gs.events.find(ev => ev.kind === 'meleeHit') as Extract<CombatEvent, { kind: 'meleeHit' }>;
    expect(e).toBeDefined();
    expect(e.unitId).toBe('u1');
    expect(e.x).toBe(50);
    expect(e.y).toBe(60);
    expect(e.faction).toBe('red');
  });

  it('远程命中目标也发射 meleeHit（视为命中爆星共用）', () => {
    const u = mkUnit({ x: 50, y: 60 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'ranged' });
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(true);
  });

  it('单位死亡时发射 unitDeath 事件', () => {
    const u = mkUnit({ x: 7, y: 8, hp: 5 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 100, gs, { source: 'melee' });
    const e = gs.events.find(ev => ev.kind === 'unitDeath') as Extract<CombatEvent, { kind: 'unitDeath' }>;
    expect(e).toBeDefined();
    expect(e.unitId).toBe('u1');
    expect(e.x).toBe(7);
    expect(e.y).toBe(8);
  });

  it('军营受击时发射 campHit 事件（未摧毁）', () => {
    const c = mkCamp({ x: 100, y: 200, hp: 500 });
    const gs = mkGS({ camps: new Map([[c.id, c]]) });
    CombatSystem.applyDamage(c, 50, gs, { source: 'melee' });
    const e = gs.events.find(ev => ev.kind === 'campHit') as Extract<CombatEvent, { kind: 'campHit' }>;
    expect(e).toBeDefined();
    expect(e.campId).toBe('c1');
  });

  it('军营摧毁时发射 campDestroyed 事件（不再发 campHit）', () => {
    const c = mkCamp({ x: 100, y: 200, hp: 30 });
    const gs = mkGS({ camps: new Map([[c.id, c]]) });
    CombatSystem.applyDamage(c, 100, gs, { source: 'melee' });
    expect(gs.events.some(ev => ev.kind === 'campDestroyed')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'campHit')).toBe(false);
  });

  it('远程命中且 weaponKind=javelin 时发射 javelinHit 事件而非 meleeHit', () => {
    const u = mkUnit({ id: 'uj', x: 11, y: 22 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'ranged', weaponKind: 'javelin' });
    const e = gs.events.find(ev => ev.kind === 'javelinHit') as Extract<CombatEvent, { kind: 'javelinHit' }>;
    expect(e).toBeDefined();
    expect(e.unitId).toBe('uj');
    expect(e.x).toBe(11);
    expect(e.y).toBe(22);
    expect(e.faction).toBe('red');
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });

  it('远程命中且 weaponKind=arrow 发射 arrowHit 事件（带坐标、unitId 与阵营）', () => {
    const u = mkUnit({ id: 'ua', x: 5, y: 5 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 10, gs, { source: 'ranged', weaponKind: 'arrow' });
    const e = gs.events.find(ev => ev.kind === 'arrowHit') as Extract<CombatEvent, { kind: 'arrowHit' }>;
    expect(e).toBeDefined();
    expect(e.unitId).toBe('ua');
    expect(e.x).toBe(5);
    expect(e.y).toBe(5);
    expect(e.faction).toBe('red');
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
    expect(gs.events.some(ev => ev.kind === 'javelinHit')).toBe(false);
  });

  it('近战攻击盾兵时推 shieldBlock 替代 meleeHit（带 unitId）', () => {
    const u = mkUnit({ id: 'ush', kind: 'shield', x: 33, y: 44 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 5, gs, { source: 'melee' });
    const e = gs.events.find(ev => ev.kind === 'shieldBlock') as Extract<CombatEvent, { kind: 'shieldBlock' }>;
    expect(e).toBeDefined();
    expect(e.unitId).toBe('ush');
    expect(e.x).toBe(33);
    expect(e.y).toBe(44);
    expect(e.faction).toBe('red');
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });

  it('javelin 攻击盾兵时推 shieldBlock 替代 javelinHit（盾兵身份压过武器）', () => {
    const u = mkUnit({ id: 'ush2', kind: 'shield', x: 50, y: 60 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 5, gs, { source: 'ranged', weaponKind: 'javelin' });
    const sb = gs.events.find(ev => ev.kind === 'shieldBlock') as Extract<CombatEvent, { kind: 'shieldBlock' }>;
    expect(sb).toBeDefined();
    expect(sb.unitId).toBe('ush2');
    expect(gs.events.some(ev => ev.kind === 'javelinHit')).toBe(false);
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });

  it('炸弹命中普通单位推 bombHit 而非 meleeHit（带 unitId）', () => {
    const u = mkUnit({ id: 'ub', kind: 'sword', x: 20, y: 30 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 15, gs, { source: 'ranged', weaponKind: 'bomb' });
    const e = gs.events.find(ev => ev.kind === 'bombHit') as Extract<CombatEvent, { kind: 'bombHit' }>;
    expect(e).toBeDefined();
    expect(e.unitId).toBe('ub');
    expect(e.x).toBe(20);
    expect(e.y).toBe(30);
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });

  it('治疗弹命中推 healHit 事件', () => {
    const u = mkUnit({ x: 15, y: 25, hp: 30 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyHeal(u, 20, gs);
    expect(gs.events.some(ev => ev.kind === 'healHit')).toBe(true);
  });
});
