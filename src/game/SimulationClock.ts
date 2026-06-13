export class SimulationClock {
  private readonly FIXED_DT = 1 / 60;
  private readonly MAX_STEPS = 10;
  private accumulator = 0;

  consume(deltaMs: number, running: boolean, speed: 1 | 2 | 4): number {
    if (!running) return 0;
    this.accumulator += (deltaMs / 1000) * speed;
    const steps = Math.min(Math.floor(this.accumulator / this.FIXED_DT), this.MAX_STEPS);
    this.accumulator -= steps * this.FIXED_DT;
    return steps;
  }

  fixedDt(): number { return this.FIXED_DT; }
}
