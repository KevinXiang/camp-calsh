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

describe('Bomb cluster target preference (clustered / aoe-ranged)', () => {
  it('优先锁定周围邻居最多的敌人（反密集）', () => {
    // 炸弹兵在 (0,0)
    const bomb = mkUnitFromDef('bomb', { id: 'b', faction: 'red', x: 0, y: 0 });
    // 孤立单位：近距离(100px)但周围没人
    const lone = mkUnitFromDef('archer', { id: 'lone', faction: 'blue', x: 100, y: 0 });
    // 集群中心 cc 在 (220,0)，周围 4 个邻居在距中心 36px 处（夹角 90°）
    // 邻居彼此间距 ≈ sqrt(36²+36²) ≈ 50.9 > 50 (AOE 半径)，互不相邻
    // 因此 cc 邻居数=4，每个边缘邻居邻居数=1（只有 cc）
    const cx = 220, cy = 0;
    const cc = mkUnitFromDef('sword', { id: 'cc', faction: 'blue', x: cx, y: cy });
    const n1 = mkUnitFromDef('sword', { id: 'n1', faction: 'blue', x: cx + 36, y: cy });
    const n2 = mkUnitFromDef('sword', { id: 'n2', faction: 'blue', x: cx, y: cy + 36 });
    const n3 = mkUnitFromDef('sword', { id: 'n3', faction: 'blue', x: cx - 36, y: cy });
    const n4 = mkUnitFromDef('sword', { id: 'n4', faction: 'blue', x: cx, y: cy - 36 });
    const s = mkState([], [bomb, lone, cc, n1, n2, n3, n4]);
    new UnitManager(s).step(0.1);
    // cc 邻居数最多(4)，应被选为目标（评分 = 220 - 4*80 = -100，最优）
    expect(bomb.targetId).toBe('cc');
  });

  it('密度相近（同为孤立）时选择更近的目标', () => {
    const bomb = mkUnitFromDef('bomb', { id: 'b', faction: 'red', x: 0, y: 0 });
    const near = mkUnitFromDef('sword', { id: 'n', faction: 'blue', x: 90, y: 0 });
    const far = mkUnitFromDef('sword', { id: 'f', faction: 'blue', x: 150, y: 0 });
    const s = mkState([], [bomb, near, far]);
    new UnitManager(s).step(0.1);
    expect(bomb.targetId).toBe('n');
  });
});
