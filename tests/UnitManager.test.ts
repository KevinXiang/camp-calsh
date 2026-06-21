import { describe, it, expect } from 'vitest';
import { UnitManager, type UnitGSView } from '../src/game/managers/UnitManager';
import type { Camp, Unit } from '../src/game/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red', kind: 'sword', x: 100, y: 100, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 0, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 0, y: 0, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0,
    ...o };
}
function mkState(camps: Camp[], units: Unit[]): UnitGSView {
  const cm = new Map<string, Camp>(); for (const c of camps) cm.set(c.id, c);
  const um = new Map<string, Unit>(); for (const u of units) um.set(u.id, u);
  return { camps: cm, units: um, projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } } };
}

describe('UnitManager', () => {
  it('朝敌方军营移动', () => {
    const u = mkUnit({ faction: 'red', x: 0, y: 0 });
    const s = mkState([mkCamp({ id: 'ec', faction: 'blue', x: 100, y: 0 })], [u]);
    new UnitManager(s).step(0.5);
    expect(u.x).toBeGreaterThan(0); expect(u.x).toBeLessThanOrEqual(31);
  });
  it('无敌方军营 idle', () => {
    const u = mkUnit();
    const s = mkState([], [u]);
    new UnitManager(s).step(1);
    expect(u.state).toBe('idle'); expect(u.x).toBe(0);
  });
  it('死亡不移动', () => {
    const u = mkUnit({ alive: false });
    const s = mkState([mkCamp({ faction: 'blue' })], [u]);
    new UnitManager(s).step(1);
    expect(u.x).toBe(0);
  });
  it('同阵营非目标', () => {
    const u = mkUnit({ faction: 'red' });
    const s = mkState([mkCamp({ faction: 'red' })], [u]);
    new UnitManager(s).step(1);
    expect(u.state).toBe('idle');
  });
  it('寻敌：攻击距离内有敌方小兵时设为目标', () => {
    const ally = mkUnit({ id: 'a', faction: 'red', x: 0, y: 0, attackRange: 180, targetId: null });
    const enemy = mkUnit({ id: 'e', faction: 'blue', x: 50, y: 0 });
    const s: UnitGSView = { camps: new Map(), units: new Map([[ally.id, ally], [enemy.id, enemy]]), projectiles: [], events: [],
      stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
               blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } } };
    new UnitManager(s).step(0.1);
    expect(ally.targetId).toBe('e');
  });
  it('视野内有敌方小兵时切换目标，不再穿过直奔兵营', () => {
    const redCamp = mkCamp({ id: 'rc', faction: 'red', x: -300, y: 0 });
    const blueCamp = mkCamp({ id: 'bc', faction: 'blue', x: 300, y: 0 });
    const red = mkUnit({ id: 'r', faction: 'red', x: -50, y: 0, targetId: 'bc' });
    const blue = mkUnit({ id: 'b', faction: 'blue', x: 50, y: 0, targetId: 'rc' });
    const s = mkState([redCamp, blueCamp], [red, blue]);
    new UnitManager(s).step(0.1);
    expect(red.targetId).toBe('b');
    expect(blue.targetId).toBe('r');
  });
  it('视野内无敌方小兵时锁定敌方兵营（直接拆）', () => {
    const blueCamp = mkCamp({ id: 'bc', faction: 'blue', x: 300, y: 0 });
    const red = mkUnit({ id: 'r', faction: 'red', x: 0, y: 0, targetId: null });
    const s = mkState([blueCamp], [red]);
    new UnitManager(s).step(0.1);
    expect(red.targetId).toBe('bc');
  });
});
