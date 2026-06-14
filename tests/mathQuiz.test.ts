import { describe, it, expect } from 'vitest';
import { generateProblem } from '../src/ui/mathQuiz';

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('generateProblem', () => {
  it('加法题：a + b === answer，且 answer ≤ 10', () => {
    const p = generateProblem(seqRng([0.0, 0.5, 0.4]));
    expect(p.op).toBe('+');
    expect(p.a).toBe(2);
    expect(p.b).toBe(3);
    expect(p.answer).toBe(5);
  });

  it('减法题：a - b === answer，且 answer ≥ 0', () => {
    const p = generateProblem(seqRng([0.6, 0.7, 0.3]));
    expect(p.op).toBe('-');
    expect(p.a).toBe(7);
    expect(p.b).toBe(2);
    expect(p.answer).toBe(5);
  });

  it('答案始终在 [0, 10] 区间（随机采样 1000 次）', () => {
    let sawPlus = false, sawMinus = false;
    for (let i = 0; i < 1000; i++) {
      const p = generateProblem();
      expect(p.answer).toBeGreaterThanOrEqual(0);
      expect(p.answer).toBeLessThanOrEqual(10);
      expect(p.a).toBeGreaterThanOrEqual(0);
      expect(p.b).toBeGreaterThanOrEqual(0);
      if (p.op === '+') {
        sawPlus = true;
        expect(p.a + p.b).toBe(p.answer);
      } else {
        sawMinus = true;
        expect(p.a - p.b).toBe(p.answer);
      }
    }
    expect(sawPlus).toBe(true);
    expect(sawMinus).toBe(true);
  });

  it('减法保证 a >= b（不出负数结果）', () => {
    for (let i = 0; i < 500; i++) {
      const p = generateProblem();
      if (p.op === '-') {
        expect(p.a).toBeGreaterThanOrEqual(p.b);
      }
    }
  });
});
