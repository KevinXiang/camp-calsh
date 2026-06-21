import { describe, it, expect } from 'vitest';
import { UnitManager, type UnitGSView } from '../src/game/managers/UnitManager';
import { CombatSystem } from '../src/game/managers/CombatSystem';
import type { Camp, Unit, Projectile, Faction } from '../src/game/types';
import { UNIT_DEFS } from '../src/config/units';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'red' as Faction, kind: 'sword', x: 100, y: 100, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 0, destroyed: false, ...o };
}

function mkUnitFromDef(kind: Unit['kind'], o: Partial<Unit> = {}): Unit {
  const d = UNIT_DEFS[kind];
  return {
    id: 'u1', faction: 'red' as Faction, kind, campId: 'c1', x: 0, y: 0,
    hp: d.maxHp, maxHp: d.maxHp,
    attack: d.attack, attackRange: d.attackRange, attackInterval: d.attackInterval, moveSpeed: d.moveSpeed,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0,
    ...o,
  };
}

function mkState(camps: Camp[], units: Unit[], projectiles: Projectile[] = []): UnitGSView {
  const cm = new Map<string, Camp>(); for (const c of camps) cm.set(c.id, c);
  const um = new Map<string, Unit>(); for (const u of units) um.set(u.id, u);
  return { camps: cm, units: um, projectiles, events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } } };
}

describe('Medic pure support (no poison)', () => {
  it('医疗兵配置仅保留治疗字段，无毒伤字段', () => {
    const medicDef = UNIT_DEFS.medic as unknown as Record<string, unknown>;
    expect(medicDef.healAmount).toBeGreaterThan(0);
    expect(medicDef.poisonDamage).toBeUndefined();
    expect(medicDef.poisonDuration).toBeUndefined();
    expect(medicDef.poisonRange).toBeUndefined();
    expect(medicDef.poisonCooldown).toBeUndefined();
  });

  it('医疗兵只产生 heal 投射物', () => {
    const medic = mkUnitFromDef('medic', { id: 'm', faction: 'red', x: 0, y: 0, attackTimer: 0 });
    // 受伤友军
    const friend = mkUnitFromDef('sword', { id: 'f', faction: 'red', x: 100, y: 0, hp: 50 });
    const s = mkState([], [medic, friend]);
    new UnitManager(s).step(0.1);
    expect(s.projectiles.some(p => p.kind === 'heal')).toBe(true);
    // poison 类型已被移除，无法出现
    const kinds = new Set(s.projectiles.map(p => p.kind));
    expect(kinds.has('poison' as never)).toBe(false);
  });

  it('CombatSystem 不再暴露 applyPoison / tickPoison', () => {
    expect((CombatSystem as unknown as Record<string, unknown>).applyPoison).toBeUndefined();
    expect((CombatSystem as unknown as Record<string, unknown>).tickPoison).toBeUndefined();
  });

  it('医疗兵优先搜索血量百分比最低的友军', () => {
    const medic = mkUnitFromDef('medic', { id: 'm', faction: 'red', x: 0, y: 0 });
    // 友军 A：50/100 = 50%
    const friendA = mkUnitFromDef('sword', { id: 'fa', faction: 'red', x: 100, y: 0, hp: 50 });
    // 友军 B：60/180 ≈ 33%（更低）
    const friendB = mkUnitFromDef('shield', { id: 'fb', faction: 'red', x: 150, y: 0, hp: 60 });
    const s = mkState([], [medic, friendA, friendB]);
    new UnitManager(s).step(0.1);
    expect(medic.targetId).toBe('fb');
  });

  it('治疗弹命中时回血', () => {
    const target = mkUnitFromDef('sword', { id: 't', faction: 'red', x: 0, y: 0, hp: 50, maxHp: 100 });
    const healProj: Projectile = { id: 'p1', kind: 'heal', x: -5, y: 0, targetId: 't', speed: 200, damage: 14, faction: 'red', elapsed: 0, maxTime: 2 };
    const s = mkState([], [target], [healProj]);
    CombatSystem.step(s, 0.1);
    expect(target.hp).toBe(64); // 50 + 14
    expect(s.events.some(e => e.kind === 'healHit')).toBe(true);
  });
});
