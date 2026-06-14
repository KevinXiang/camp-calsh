import { describe, it, expect } from 'vitest';
import { CampManager } from '../src/game/managers/CampManager';
function mkCamp(o = {}) {
    return { id: 'c1', faction: 'red', kind: 'sword', x: 100, y: 100, hp: 500, maxHp: 500,
        spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 0, destroyed: false, ...o };
}
function mkState(camps) {
    const cm = new Map();
    for (const c of camps)
        cm.set(c.id, c);
    const um = new Map();
    return { camps: cm, units: um, addUnit(u) { um.set(u.id, u); } };
}
describe('CampManager', () => {
    it('产兵间隔到后产出一兵', () => {
        const s = mkState([mkCamp({ spawnTimer: 0.01 })]);
        new CampManager(s).step(4);
        expect(s.units.size).toBe(1);
    });
    it('产兵属性取自配置', () => {
        const s = mkState([mkCamp({ spawnTimer: 0.01 })]);
        new CampManager(s).step(4);
        const u = [...s.units.values()][0];
        expect(u.faction).toBe('red');
        expect(u.kind).toBe('sword');
        expect(u.campId).toBe('c1');
        expect(u.maxHp).toBe(100);
    });
    it('摧毁后不产兵', () => {
        const s = mkState([mkCamp({ spawnTimer: 0.01, destroyed: true })]);
        new CampManager(s).step(4);
        expect(s.units.size).toBe(0);
    });
    it('aliveUnits=20 不产兵', () => {
        const s = mkState([mkCamp({ spawnTimer: 0.01, aliveUnits: 20 })]);
        new CampManager(s).step(4);
        expect(s.units.size).toBe(0);
    });
    it('多军营独立产兵', () => {
        const s = mkState([mkCamp({ id: 'a', spawnTimer: 0.01 }), mkCamp({ id: 'b', spawnTimer: 0.01, kind: 'archer', x: 300 })]);
        new CampManager(s).step(5);
        expect(s.units.size).toBeGreaterThanOrEqual(2);
    });
});
