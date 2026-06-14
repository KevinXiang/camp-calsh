import { describe, it, expect } from 'vitest';
import { SimulationClock } from '../src/game/SimulationClock';
describe('SimulationClock', () => {
    it('暂停返回 0', () => {
        const c = new SimulationClock();
        expect(c.consume(100, false, 1)).toBe(0);
    });
    it('单帧不超过 MAX_STEPS(10)', () => {
        const c = new SimulationClock();
        expect(c.consume(100000, true, 4)).toBe(10);
    });
    it('多次 consume 累积超 10 步', () => {
        const c = new SimulationClock();
        let total = 0;
        for (let i = 0; i < 12; i++)
            total += c.consume(200, true, 1);
        expect(total).toBeGreaterThan(60);
    });
    it('2x 在多次调用后比 1x 快', () => {
        const c1 = new SimulationClock();
        let s1 = 0;
        for (let i = 0; i < 20; i++)
            s1 += c1.consume(100, true, 1);
        const c2 = new SimulationClock();
        let s2 = 0;
        for (let i = 0; i < 20; i++)
            s2 += c2.consume(100, true, 2);
        expect(s2).toBeGreaterThan(s1 * 1.5);
    });
});
