import type { Camp, Unit, Projectile, SideStats } from '../types';
import type { CombatEvent } from '../effects/types';
import { UNIT_DEFS } from '../../config/units';
import { SpatialGrid } from '../spatial/SpatialGrid';
import { CombatSystem } from './CombatSystem';

export interface UnitGSView {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
  projectiles: Projectile[];
  events: CombatEvent[];
  stats: { red: SideStats; blue: SideStats };
}

export class UnitManager {
  private grid = new SpatialGrid<Unit>(80);
  private readonly SIGHT = 250;

  constructor(private gs: UnitGSView) {}

  step(dt: number): void {
    this.grid.rebuild([...this.gs.units.values()].filter(u => u.alive));
    for (const u of this.gs.units.values()) {
      if (!u.alive) continue;
      this.acquireTarget(u);
      this.act(u, dt);
    }
  }

  private acquireTarget(u: Unit): void {
    if (u.targetId) {
      const t = this.gs.units.get(u.targetId) ?? this.gs.camps.get(u.targetId);
      const alive = t ? ('alive' in t ? (t as Unit).alive : !(t as Camp).destroyed) : false;
      if (alive) return;
      u.targetId = null;
    }
    const cands = this.grid.queryCircle(u.x, u.y, this.SIGHT);

    // 攻击距离内的敌方小兵（最近）
    const inRange = cands.filter(e => e.faction !== u.faction && e.alive &&
      Math.hypot(e.x - u.x, e.y - u.y) <= u.attackRange
    );
    if (inRange.length > 0) {
      inRange.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
      u.targetId = inRange[0].id;
      return;
    }

    // 最近敌方小兵
    const enemies = cands.filter(e => e.faction !== u.faction && e.alive);
    if (enemies.length > 0) {
      enemies.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
      u.targetId = enemies[0].id;
      return;
    }

    // 最近敌方军营
    const camps = [...this.gs.camps.values()].filter(c => c.faction !== u.faction && !c.destroyed);
    if (camps.length > 0) {
      camps.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
      u.targetId = camps[0].id;
    }
  }

  private act(u: Unit, dt: number): void {
    if (!u.targetId) { u.state = 'idle'; return; }
    const target = this.gs.units.get(u.targetId) ?? this.gs.camps.get(u.targetId);
    if (!target) { u.targetId = null; u.state = 'idle'; return; }
    const tx = target.x; const ty = target.y;
    const dist = Math.hypot(tx - u.x, ty - u.y);

    if (dist <= u.attackRange) {
      u.state = 'attacking';
      u.attackTimer -= dt;
      if (u.attackTimer <= 0) {
        u.attackTimer = u.attackInterval;
        if (UNIT_DEFS[u.kind]?.attackType === 'ranged') {
          const dx = tx - u.x; const dy = ty - u.y; const d = Math.hypot(dx, dy) || 1;
          this.gs.projectiles.push({
            id: crypto.randomUUID(), x: u.x, y: u.y, targetId: u.targetId!,
            speed: 200, damage: u.attack, faction: u.faction, elapsed: 0, maxTime: 2,
          });
        } else {
          CombatSystem.applyDamage(target as Unit | Camp, u.attack, this.gs, { source: 'melee' });
        }
      }
    } else {
      u.state = 'moving';
      const speed = u.moveSpeed * dt;
      const ratio = Math.min(1, speed / dist);
      u.x += (tx - u.x) * ratio;
      u.y += (ty - u.y) * ratio;
    }
  }
}
