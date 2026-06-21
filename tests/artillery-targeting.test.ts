import { describe, it, expect } from 'vitest';
import { UnitManager, type UnitGSView } from '../src/game/managers/UnitManager';
import type { Camp, Unit } from '../src/game/types';
import { UNIT_DEFS } from '../src/config/units';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 100, y: 100, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 0, destroyed: false, ...o };
}

function mkUnitFromDef(kind: Unit['kind'], o: Partial<Unit> = {}): Unit {
  const d = UNIT_DEFS[kind];
  return {
    id: 'u1', faction: 'red', kind, campId: 'c1', x: 0, y: 0,
    hp: d.maxHp, maxHp: d.maxHp,
    attack: d.attack, attackRange: d.attackRange, attackInterval: d.attackInterval, moveSpeed: d.moveSpeed,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0,
    ...o,
  };
}

function mkState(camps: Camp[], units: Unit[]): UnitGSView {
  const cm = new Map<string, Camp>(); for (const c of camps) cm.set(c.id, c);
  const um = new Map<string, Unit>(); for (const u of units) um.set(u.id, u);
  return { camps: cm, units: um, projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } } };
}

describe('Artillery target preference (campFirst / siege)', () => {
  it('视野内有敌方营地时优先锁营地（攻城定位）', () => {
    const art = mkUnitFromDef('artillery', { id: 'a', faction: 'red', x: 0, y: 0 });
    const enemy = mkUnitFromDef('sword', { id: 'e', faction: 'blue', x: 150, y: 0 });
    const enemyCamp = mkCamp({ id: 'ec', faction: 'blue', x: 260, y: 0 });
    const s = mkState([enemyCamp], [art, enemy]);
    new UnitManager(s).step(0.1);
    expect(art.targetId).toBe('ec');
  });

  it('视野内无营地时锁定敌方小兵', () => {
    const art = mkUnitFromDef('artillery', { id: 'a', faction: 'red', x: 0, y: 0 });
    const enemy = mkUnitFromDef('sword', { id: 'e', faction: 'blue', x: 150, y: 0 });
    const s = mkState([], [art, enemy]);
    new UnitManager(s).step(0.1);
    expect(art.targetId).toBe('e');
  });

  it('无目标时 idle', () => {
    const art = mkUnitFromDef('artillery', { id: 'a', faction: 'red', x: 0, y: 0 });
    const s = mkState([], [art]);
    new UnitManager(s).step(0.1);
    expect(art.state).toBe('idle');
    expect(art.targetId).toBeNull();
  });
});

describe('Artillery minimum attack range (melee weakness)', () => {
  it('目标（营地）在最小射程内时不开火', () => {
    const art = mkUnitFromDef('artillery', { id: 'a', faction: 'red', x: 0, y: 0, attackTimer: 0 });
    const enemyCamp = mkCamp({ id: 'ec', faction: 'blue', x: 50, y: 0 }); // dist=50 < minAttackRange=80
    const s = mkState([enemyCamp], [art]);
    art.targetId = 'ec';
    new UnitManager(s).step(0.1);
    // 不应发射 projectile
    expect(s.projectiles.length).toBe(0);
  });

  it('目标（营地）在攻击范围内、超过最小射程时正常开火', () => {
    const art = mkUnitFromDef('artillery', { id: 'a', faction: 'red', x: 0, y: 0, attackTimer: 0 });
    const enemyCamp = mkCamp({ id: 'ec', faction: 'blue', x: 200, y: 0 }); // 80 <= 200 <= 280
    const s = mkState([enemyCamp], [art]);
    art.targetId = 'ec';
    // 让 attackTimer 触发
    art.attackTimer = 0;
    new UnitManager(s).step(0.1);
    // 应发射一个 artillery 弹道
    expect(s.projectiles.some(p => p.kind === 'artillery')).toBe(true);
  });
});
