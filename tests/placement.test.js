import { describe, it, expect } from 'vitest';
import { canPlaceCamp } from '../src/game/placement';
import { CAMP_MIN_DISTANCE } from '../src/config/camps';
function makeCamp(id, x, y) {
    return {
        id, faction: 'red', kind: 'sword', x, y,
        hp: 500, maxHp: 500, spawnTimer: 0,
        upgrades: { production: 1, health: 1, weapon: 1 },
        aliveUnits: 0, destroyed: false,
    };
}
describe('canPlaceCamp', () => {
    it('空战场任意位置可放置', () => {
        expect(canPlaceCamp([], 0, 0, CAMP_MIN_DISTANCE)).toBe(true);
    });
    it('与现有军营距离小于最小间距时不可放置', () => {
        const existing = [makeCamp('a', 0, 0)];
        expect(canPlaceCamp(existing, 50, 0, CAMP_MIN_DISTANCE)).toBe(false);
    });
    it('与现有军营距离等于最小间距时可放置（边界）', () => {
        const existing = [makeCamp('a', 0, 0)];
        expect(canPlaceCamp(existing, CAMP_MIN_DISTANCE, 0, CAMP_MIN_DISTANCE)).toBe(true);
    });
    it('距离大于最小间距时可放置', () => {
        const existing = [makeCamp('a', 0, 0)];
        expect(canPlaceCamp(existing, 200, 0, CAMP_MIN_DISTANCE)).toBe(true);
    });
    it('多军营场景：与任一过近即不可放置', () => {
        const existing = [makeCamp('a', 0, 0), makeCamp('b', 300, 0)];
        expect(canPlaceCamp(existing, 230, 0, CAMP_MIN_DISTANCE)).toBe(false);
    });
    it('忽略已摧毁的军营（不阻挡放置）', () => {
        const dead = makeCamp('a', 0, 0);
        dead.destroyed = true;
        expect(canPlaceCamp([dead], 10, 0, CAMP_MIN_DISTANCE)).toBe(true);
    });
});
