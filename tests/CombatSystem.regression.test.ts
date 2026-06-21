import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import { SpatialGrid } from '../src/game/spatial/SpatialGrid';
import type { Camp, Unit } from '../src/game/types';

function emptyGS(): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
  };
}

function mkUnit(id: string, faction: 'red' | 'blue', kind: Unit['kind'], x: number, y: number, hp = 100): Unit {
  return { id, faction, kind, campId: 'c', x, y, hp, maxHp: hp,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'idle' as const, alive: true, deathTimer: 0 };
}

function cloneGS(gs: CombatGSView): CombatGSView {
  const units = new Map<string, Unit>();
  for (const [id, u] of gs.units) units.set(id, { ...u });
  const camps = new Map<string, Camp>();
  for (const [id, c] of gs.camps) camps.set(id, { ...c });
  return {
    units, camps, projectiles: [], events: [],
    stats: { red: { ...gs.stats.red }, blue: { ...gs.stats.blue } },
  };
}

describe('CombatSystem damage resolution invariants', () => {
  it('applyDamage 击杀单位正确增加 kills', () => {
    const gs = emptyGS();
    const u = mkUnit('u1', 'blue', 'sword', 0, 0, 20);
    gs.units.set(u.id, u);
    CombatSystem.applyDamage(u, 25, gs, { source: 'melee' });
    expect(u.alive).toBe(false);
    expect(gs.stats.red.kills).toBe(1);
    expect(gs.events.some(e => e.kind === 'unitDeath' && e.unitId === 'u1')).toBe(true);
  });

  it('致命营地伤害只发 campDestroyed，不发 campHit', () => {
    const gs = emptyGS();
    const c: Camp = { id: 'c1', faction: 'blue', kind: 'sword', x: 0, y: 0,
      hp: 10, maxHp: 500, spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 },
      aliveUnits: 0, destroyed: false };
    gs.camps.set(c.id, c);
    CombatSystem.applyDamage(c as unknown as Unit | Camp, 100, gs, { source: 'melee' });
    expect(c.destroyed).toBe(true);
    expect(gs.events.some(e => e.kind === 'campDestroyed')).toBe(true);
    expect(gs.events.some(e => e.kind === 'campHit')).toBe(false);
    expect(gs.stats.red.campsDestroyed).toBe(1);
  });

  it('非致命营地伤害只发 campHit，不摧毁', () => {
    const gs = emptyGS();
    const c: Camp = { id: 'c1', faction: 'blue', kind: 'sword', x: 0, y: 0,
      hp: 500, maxHp: 500, spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 },
      aliveUnits: 0, destroyed: false };
    gs.camps.set(c.id, c);
    CombatSystem.applyDamage(c as unknown as Unit | Camp, 10, gs, { source: 'melee' });
    expect(c.destroyed).toBe(false);
    expect(gs.events.some(e => e.kind === 'campHit')).toBe(true);
    expect(gs.events.some(e => e.kind === 'campDestroyed')).toBe(false);
  });

  it('对已摧毁营地再调用 damageCamp 是幂等', () => {
    const gs = emptyGS();
    const c: Camp = { id: 'c1', faction: 'blue', kind: 'sword', x: 0, y: 0,
      hp: 0, maxHp: 500, spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 },
      aliveUnits: 0, destroyed: true };
    gs.camps.set(c.id, c);
    CombatSystem['damageCamp'](c, 100, gs, true);
    expect(gs.stats.red.campsDestroyed).toBe(0);
    expect(gs.events).toHaveLength(0);
  });
});

describe('SpatialGrid AOE parity', () => {
  // 对确定性布局，验证用 grid 查询命中的单位集合与全量扫描一致
  function buildLayout(seed: number): { gsA: CombatGSView; gsB: CombatGSView } {
    const gsA = emptyGS();
    const gsB = emptyGS();
    let s = seed;
    const rand = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < 40; i++) {
      const faction: 'red' | 'blue' = i % 2 === 0 ? 'red' : 'blue';
      const kinds: Unit['kind'][] = ['sword', 'archer', 'shield', 'javelin', 'bomb'];
      const kind = kinds[i % kinds.length];
      const x = rand() * 600; const y = rand() * 600;
      const uA = mkUnit(`u${i}`, faction, kind, x, y, 100);
      const uB = mkUnit(`u${i}`, faction, kind, x, y, 100);
      gsA.units.set(uA.id, uA);
      gsB.units.set(uB.id, uB);
    }
    const campA: Camp = { id: 'c-blue', faction: 'blue', kind: 'sword', x: 300, y: 300, hp: 500, maxHp: 500,
      spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 0, destroyed: false };
    const campB: Camp = { ...campA };
    gsA.camps.set(campA.id, campA);
    gsB.camps.set(campB.id, campB);
    return { gsA, gsB };
  }

  function buildGrid(gs: CombatGSView): SpatialGrid<Unit> {
    const grid = new SpatialGrid<Unit>(80);
    const alive: Unit[] = [];
    for (const u of gs.units.values()) if (u.alive) alive.push(u);
    grid.rebuild(alive);
    return grid;
  }

  it('applyAOE：grid 路径与全量扫描命中同一批单位，HP 变化一致', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { gsA, gsB } = buildLayout(seed);
      const gridB = buildGrid(gsB);
      CombatSystem.applyAOE(200, 200, 20, 'red', gsA, 100);            // 全量
      CombatSystem.applyAOE(200, 200, 20, 'red', gsB, 100, gridB);     // grid
      for (const [id, ua] of gsA.units) {
        const ub = gsB.units.get(id)!;
        expect(ub.hp).toBe(ua.hp);
        expect(ub.alive).toBe(ua.alive);
      }
      const hitKinds = new Set(['meleeHit','arrowHit','javelinHit','shieldBlock','bombHit']);
      const hitA = gsA.events.filter(e => hitKinds.has(e.kind)).map(e => (e as {unitId:string}).unitId).sort();
      const hitB = gsB.events.filter(e => hitKinds.has(e.kind)).map(e => (e as {unitId:string}).unitId).sort();
      expect(hitB).toEqual(hitA);
    }
  });

  it('applyArtillerySplash：grid 路径与全量扫描一致', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const { gsA, gsB } = buildLayout(seed);
      const gridB = buildGrid(gsB);
      CombatSystem.applyArtillerySplash(300, 300, 12, 'red', gsA, 120, 2);
      CombatSystem.applyArtillerySplash(300, 300, 12, 'red', gsB, 120, 2, gridB);
      for (const [id, ua] of gsA.units) {
        const ub = gsB.units.get(id)!;
        expect(ub.hp).toBe(ua.hp);
      }
      expect(gsB.stats.red.kills).toBe(gsA.stats.red.kills);
    }
  });

  it('圆边界上的单位不会被 grid 查询漏掉', () => {
    const grid = new SpatialGrid<Unit>(80);
    // 把单位放在距圆心刚好等于 radius 的位置
    const u = mkUnit('edge', 'blue', 'sword', 100, 100, 50);
    grid.insert(u);
    const hits = grid.queryCircle(50, 100, 50);  // 圆心(50,100)，半径50，u 在 (100,100) → 距离=50 恰好在边界
    expect(hits.map(h => h.id)).toContain('edge');
  });
});

describe('Large-scale step smoke', () => {
  it('200 单位同场模拟若干 step 不抛错、不出现异常状态', () => {
    const gs = emptyGS();
    // 红蓝各 100 单位
    for (let i = 0; i < 100; i++) {
      const u1 = mkUnit(`r${i}`, 'red', i % 3 === 0 ? 'archer' : i % 3 === 1 ? 'sword' : 'shield',
        50 + Math.random() * 200, Math.random() * 800, 80);
      const u2 = mkUnit(`b${i}`, 'blue', i % 3 === 0 ? 'archer' : i % 3 === 1 ? 'sword' : 'shield',
        800 - Math.random() * 200, Math.random() * 800, 80);
      gs.units.set(u1.id, u1);
      gs.units.set(u2.id, u2);
    }
    // 放两个军营
    const rc: Camp = { id: 'rc', faction: 'red', kind: 'sword', x: 0, y: 400, hp: 500, maxHp: 500,
      spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 0, destroyed: false };
    const bc: Camp = { id: 'bc', faction: 'blue', kind: 'sword', x: 1000, y: 400, hp: 500, maxHp: 500,
      spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 0, destroyed: false };
    gs.camps.set(rc.id, rc); gs.camps.set(bc.id, bc);

    const dt = 1 / 60;
    for (let i = 0; i < 180; i++) {  // 3 秒
      CombatSystem.step(gs, dt);
      gs.events.length = 0;
    }
    // 至少发生过伤害或死亡
    let aliveCount = 0;
    for (const u of gs.units.values()) if (u.alive) aliveCount++;
    expect(aliveCount).toBeGreaterThan(0);
    expect(aliveCount).toBeLessThan(201);
    // 所有存活单位 hp 合法
    for (const u of gs.units.values()) {
      if (u.alive) {
        expect(u.hp).toBeGreaterThan(0);
        expect(u.hp).toBeLessThanOrEqual(u.maxHp);
      }
    }
  });
});
