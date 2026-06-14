export class SimulationClock {
    constructor() {
        this.FIXED_DT = 1 / 60;
        this.MAX_STEPS = 10;
        this.accumulator = 0;
    }
    consume(deltaMs, running, speed) {
        if (!running)
            return 0;
        this.accumulator += (deltaMs / 1000) * speed;
        const steps = Math.min(Math.floor(this.accumulator / this.FIXED_DT), this.MAX_STEPS);
        this.accumulator -= steps * this.FIXED_DT;
        return steps;
    }
    fixedDt() { return this.FIXED_DT; }
}
