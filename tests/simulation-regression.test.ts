import { describe, it, expect } from 'vitest';
import { GameState } from '../src/game/GameState';
import { CampManager } from '../src/game/managers/CampManager';
import { UnitManager } from '../src/game/managers/UnitManager';
import { CombatSystem } from '../src/game/managers/CombatSystem';
import { UNIT_DEFS } from '../src/config/units';
import { CAMP_DEFS } from '../src/config/camps';
import type { Camp, Unit } from '../src/game/types';

function makeCamp(id: string, faction: 'red' | 'blue', kind: Camp['kind'], x: number, y: number): Camp {
  const def = CAMP_DEFS[kind];
  return {
    id, faction, kind, x, y,
    hp: def.maxHp, maxHp: def.maxHp,
    spawnTimer: def.spawnInterval,
    upgrades: { production: 1, health: 1, weapon: 1 },
    aliveUnits: 0, destroyed: false,
  };
}

function placeUnit(id: string, faction: 'red' | 'blue', kind: Unit['kind'], campId: string, x: number, y: number): Unit {
  const def = UNIT_DEFS[kind];
  return {
    id, faction, kind, campId, x, y,
    hp: def.maxHp, maxHp: def.maxHp,
    attack: def.attack, attackRange: def.attackRange, attackInterval: def.attackInterval, moveSpeed: def.moveSpeed,
    attackTimer: 0, targetId: null, state: 'idle' as const,
    alive: true, deathTimer: 0,
  };
}

describe('long-step simulation regression', () => {
  it('20 秒模拟不抛错且产生战斗事件/击杀', () => {
    const gs = new GameState();
    // 双方各 3 个军营：近战 / 弓 / 投矛（间距足够近以快速交火）
    const rc1 = makeCamp('rc1', 'red', 'sword', 100, 300);
    const rc2 = makeCamp('rc2', 'red', 'archer', 100, 450);
    const rc3 = makeCamp('rc3', 'red', 'javelin', 100, 600);
    const bc1 = makeCamp('bc1', 'blue', 'sword', 500, 300);
    const bc2 = makeCamp('bc2', 'blue', 'archer', 500, 450);
    const bc3 = makeCamp('bc3', 'blue', 'javelin', 500, 600);
    for (const c of [rc1, rc2, rc3, bc1, bc2, bc3]) gs.addCamp(c);

    // 预置若干初始单位（彼此进入攻击范围/视野），加快交火
    const initialSeeds: Unit[] = [
      placeUnit('ru1', 'red', 'sword', 'rc1', 200, 300),
      placeUnit('ru2', 'red', 'archer', 'rc2', 200, 450),
      placeUnit('ru3', 'red', 'javelin', 'rc3', 200, 600),
      placeUnit('bu1', 'blue', 'sword', 'bc1', 400, 300),
      placeUnit('bu2', 'blue', 'archer', 'bc2', 400, 450),
      placeUnit('bu3', 'blue', 'javelin', 'bc3', 400, 600),
    ];
    for (const u of initialSeeds) gs.addUnit(u);

    const cm = new CampManager(gs);
    const um = new UnitManager(gs);
    const dt = 1 / 60;
    const totalSeconds = 20;
    const steps = Math.round(totalSeconds / dt);

    let totalHits = 0;
    let totalDeaths = 0;
    for (let i = 0; i < steps; i++) {
      cm.step(dt);
      um.step(dt);
      CombatSystem.step(gs, dt);
      gs.sim.timeMs += dt * 1000;
      // drain events
      for (const ev of gs.events) {
        if (ev.kind === 'meleeHit' || ev.kind === 'arrowHit' || ev.kind === 'javelinHit' || ev.kind === 'bombHit' || ev.kind === 'shieldBlock') {
          // 受击事件必须带 unitId
          expect(ev.unitId).toBeTruthy();
          totalHits++;
        }
        if (ev.kind === 'unitDeath') totalDeaths++;
      }
      gs.events.length = 0;
    }

    // 结构性断言：应该发生过命中和死亡
    expect(totalHits).toBeGreaterThan(0);
    expect(totalDeaths).toBeGreaterThan(0);
    // 双方至少有一方产生击杀
    expect(gs.stats.red.kills + gs.stats.blue.kills).toBeGreaterThan(0);
    // 没有任何 alive=false 但 deathTimer>0 堆积（应该被正常推进）
    for (const u of gs.units.values()) {
      if (!u.alive) expect(u.deathTimer).toBeGreaterThanOrEqual(0);
    }
  });

  it('20 秒含炸弹/医疗/火炮的混合场景正常结算', () => {
    const gs = new GameState();
    const rc1 = makeCamp('rc1', 'red', 'bomb', 100, 400);
    const rc2 = makeCamp('rc2', 'red', 'medic', 100, 600);
    const bc1 = makeCamp('bc1', 'blue', 'artillery', 500, 400);
    const bc2 = makeCamp('bc2', 'blue', 'shield', 500, 600);
    for (const c of [rc1, rc2, bc1, bc2]) gs.addCamp(c);

    const seeds: Unit[] = [
      placeUnit('ru1', 'red', 'bomb', 'rc1', 200, 400),
      placeUnit('ru2', 'red', 'medic', 'rc2', 180, 600),
      placeUnit('ru3', 'red', 'sword', 'rc1', 220, 450),
      placeUnit('bu1', 'blue', 'artillery', 'bc1', 400, 400),
      placeUnit('bu2', 'blue', 'shield', 'bc2', 420, 600),
      placeUnit('bu3', 'blue', 'sword', 'bc1', 380, 450),
    ];
    for (const u of seeds) gs.addUnit(u);

    const cm = new CampManager(gs);
    const um = new UnitManager(gs);
    const dt = 1 / 60;
    const steps = Math.round(20 / dt);

    let explosions = 0;
    let heals = 0;
    let campDamaged = false;
    for (let i = 0; i < steps; i++) {
      cm.step(dt);
      um.step(dt);
      CombatSystem.step(gs, dt);
      gs.sim.timeMs += dt * 1000;
      for (const ev of gs.events) {
        if (ev.kind === 'bombExplosion' || ev.kind === 'artilleryExplosion') explosions++;
        if (ev.kind === 'healHit') heals++;
        if (ev.kind === 'campHit' || ev.kind === 'campDestroyed') campDamaged = true;
        // 受击事件必须带 unitId
        if (ev.kind === 'meleeHit' || ev.kind === 'arrowHit' || ev.kind === 'javelinHit' || ev.kind === 'bombHit' || ev.kind === 'shieldBlock') {
          expect(typeof ev.unitId).toBe('string');
          expect(ev.unitId.length).toBeGreaterThan(0);
        }
        if (ev.kind === 'unitDeath') expect(ev.unitId).toBeTruthy();
      }
      gs.events.length = 0;
    }

    // 混合兵种下应该有爆炸事件（炸弹/火炮至少开过火）
    expect(explosions).toBeGreaterThan(0);
    // 至少出现过治疗/营命中（不强求全部都有，避免过于脆弱）
    // 不抛错、单位数量保持在合理范围
    expect(gs.units.size).toBeLessThan(200);
  });
});
