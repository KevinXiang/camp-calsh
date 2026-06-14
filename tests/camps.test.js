import { describe, it, expect } from 'vitest';
import { CAMP_DEFS } from '../src/config/camps';
describe('CAMP_DEFS', () => {
    it('包含 4 种军营', () => {
        const kinds = ['sword', 'shield', 'archer', 'javelin'];
        for (const k of kinds) {
            expect(CAMP_DEFS[k]).toBeDefined();
        }
    });
    it('剑兵营数值符合 PRD 8.4', () => {
        expect(CAMP_DEFS.sword).toMatchObject({
            produces: 'sword',
            maxHp: 500,
            spawnInterval: 4,
            unitCap: 20,
        });
    });
    it('盾兵营数值 600/5', () => {
        expect(CAMP_DEFS.shield).toMatchObject({ maxHp: 600, spawnInterval: 5 });
    });
    it('弓兵营数值 450/5', () => {
        expect(CAMP_DEFS.archer).toMatchObject({ maxHp: 450, spawnInterval: 5 });
    });
    it('投矛营数值 450/6', () => {
        expect(CAMP_DEFS.javelin).toMatchObject({ maxHp: 450, spawnInterval: 6 });
    });
    it('所有军营 unitCap 为 20', () => {
        for (const def of Object.values(CAMP_DEFS)) {
            expect(def.unitCap).toBe(20);
        }
    });
});
