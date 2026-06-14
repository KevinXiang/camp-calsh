export interface Problem {
  a: number;
  b: number;
  op: '+' | '-';
  answer: number;
}

/**
 * 生成一道 10 以内加减法。
 * - 加法：a + b ≤ 10
 * - 减法：a - b ≥ 0（即 a ≥ b）
 * 答案始终在 [0, 10]。rng 可注入便于测试。
 */
export function generateProblem(rng: () => number = Math.random): Problem {
  const op: '+' | '-' = rng() < 0.5 ? '+' : '-';
  if (op === '+') {
    const sum = Math.floor(rng() * 11);          // 0..10
    const a = Math.floor(rng() * (sum + 1));     // 0..sum
    return { a, b: sum - a, op: '+', answer: sum };
  } else {
    const a = Math.floor(rng() * 10);            // 0..9
    const b = Math.floor(rng() * (a + 1));       // 0..a
    return { a, b, op: '-', answer: a - b };
  }
}
