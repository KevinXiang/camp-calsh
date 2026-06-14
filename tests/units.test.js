import { describe, it, expect } from 'vitest';
import { UNIT_DEFS } from '../src/config/units';
describe('UNIT_DEFS', () => {
    it('包含 4 种小兵', () => {
        const kinds = ['sword', 'shield', 'archer', 'javelin'];
        for (const k of kinds)
            expect(UNIT_DEFS[k]).toBeDefined();
    });
    it('剑兵数值符合 PRD 9.3', () => {
        expect(UNIT_DEFS.sword).toMatchObject({ attackType: 'melee', maxHp: 100, attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60 });
    });
    it('盾兵数值', () => {
        expect(UNIT_DEFS.shield).toMatchObject({ attackType: 'melee', maxHp: 160, attack: 7 });
    });
    it('弓兵数值', () => {
        expect(UNIT_DEFS.archer).toMatchObject({ attackType: 'ranged', maxHp: 60, attack: 8, attackRange: 180 });
    });
    it('投矛兵数值', () => {
        expect(UNIT_DEFS.javelin).toMatchObject({ attackType: 'ranged', maxHp: 70, attack: 18, attackInterval: 2.0 });
    });
});
