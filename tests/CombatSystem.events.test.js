import { describe, it, expect } from 'vitest';
import { CombatSystem } from '../src/game/managers/CombatSystem';
function mkCamp(o = {}) {
    return { id: 'c1', faction: 'red', kind: 'sword', x: 0, y: 0, hp: 500, maxHp: 500,
        spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o = {}) {
    return { id: 'u1', faction: 'red', kind: 'sword', campId: 'c1', x: 10, y: 20, hp: 100, maxHp: 100,
        attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
        attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0.3, ...o };
}
function mkGS(overrides = {}) {
    return {
        units: new Map(), camps: new Map(), projectiles: [], events: [],
        stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
            blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
        ...overrides,
    };
}
describe('CombatSystem events', () => {
    it('近战攻击单位时发射 meleeHit 事件（带目标坐标）', () => {
        const u = mkUnit({ x: 50, y: 60, hp: 100 });
        const gs = mkGS({ units: new Map([[u.id, u]]) });
        CombatSystem.applyDamage(u, 10, gs, { source: 'melee' });
        const e = gs.events.find(ev => ev.kind === 'meleeHit');
        expect(e).toBeDefined();
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
        const e = gs.events.find(ev => ev.kind === 'unitDeath');
        expect(e).toBeDefined();
        expect(e.unitId).toBe('u1');
        expect(e.x).toBe(7);
        expect(e.y).toBe(8);
    });
    it('军营受击时发射 campHit 事件（未摧毁）', () => {
        const c = mkCamp({ x: 100, y: 200, hp: 500 });
        const gs = mkGS({ camps: new Map([[c.id, c]]) });
        CombatSystem.applyDamage(c, 50, gs, { source: 'melee' });
        const e = gs.events.find(ev => ev.kind === 'campHit');
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
});
