import type { Camp, Unit } from '../types';

export interface UnitGSView {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
}

export class UnitManager {
  constructor(private gs: UnitGSView) {}

  step(dt: number): void {
    for (const u of this.gs.units.values()) {
      if (!u.alive) continue;
      const enemies = [...this.gs.camps.values()].filter(c => c.faction !== u.faction && !c.destroyed);
      if (enemies.length === 0) { u.state = 'idle'; continue; }
      let closest = enemies[0]; let minD = Math.hypot(closest.x - u.x, closest.y - u.y);
      for (let i = 1; i < enemies.length; i++) {
        const d = Math.hypot(enemies[i].x - u.x, enemies[i].y - u.y);
        if (d < minD) { closest = enemies[i]; minD = d; }
      }
      u.state = 'moving';
      const dx = closest.x - u.x, dy = closest.y - u.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) continue;
      u.x += (dx / dist) * u.moveSpeed * dt;
      u.y += (dy / dist) * u.moveSpeed * dt;
    }
  }
}
