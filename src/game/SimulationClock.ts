export class SimulationClock {
  private readonly FIXED_DT = 1 / 60;
  private readonly MAX_STEPS = 10;
  private accumulator = 0;

  consume(deltaMs: number, running: boolean, speed: 1 | 2 | 3 | 4 | 5): number {
    if (!running) return 0;
    // 防御性 clamp：防止外部传入 >5 的值（如旧存档/异常调用）
    const safeSpeed = Math.max(1, Math.min(5, speed)) as 1 | 2 | 3 | 4 | 5;
    this.accumulator += (deltaMs / 1000) * safeSpeed;
    const steps = Math.min(Math.floor(this.accumulator / this.FIXED_DT), this.MAX_STEPS);
    this.accumulator -= steps * this.FIXED_DT;
    return steps;
  }

  fixedDt(): number { return this.FIXED_DT; }
}
