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

describe('Javelin target preference (highestHp / assassin-ranged)', () => {
  it('视野内有 medic 时优先锁定 medic（斩首高价值目标）', () => {
    const jav = mkUnitFromDef('javelin', { id: 'j', faction: 'red', x: 0, y: 0 });
    const sword = mkUnitFromDef('sword', { id: 's', faction: 'blue', x: 100, y: 0 });
    const medic = mkUnitFromDef('medic', { id: 'm', faction: 'blue', x: 150, y: 0 });
    const s = mkState([], [jav, sword, medic]);
    new UnitManager(s).step(0.1);
    expect(jav.targetId).toBe('m');
  });

  it('视野内有 artillery 时优先锁定 artillery（攻城单位）', () => {
    const jav = mkUnitFromDef('javelin', { id: 'j', faction: 'red', x: 0, y: 0 });
    const sword = mkUnitFromDef('sword', { id: 's', faction: 'blue', x: 100, y: 0 });
    const art = mkUnitFromDef('artillery', { id: 'a', faction: 'blue', x: 140, y: 0 });
    const s = mkState([], [jav, sword, art]);
    new UnitManager(s).step(0.1);
    expect(jav.targetId).toBe('a');
  });

  it('没有高价值目标时，偏好更高血量单位', () => {
    const jav = mkUnitFromDef('javelin', { id: 'j', faction: 'red', x: 0, y: 0 });
    const swordNear = mkUnitFromDef('sword', { id: 's1', faction: 'blue', x: 80, y: 0 });
    const shieldFar = mkUnitFromDef('shield', { id: 'sh', faction: 'blue', x: 120, y: 0 }); // 高血量但稍远
    const s = mkState([], [jav, swordNear, shieldFar]);
    new UnitManager(s).step(0.1);
    // 盾兵虽然更远，但 maxHp 高，应被投矛兵优先
    expect(jav.targetId).toBe('sh');
  });
});
