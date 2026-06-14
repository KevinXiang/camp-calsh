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
    // 当前目标仍是存活敌方【小兵】→ 保持（避免在多个近敌间抖动）
    const cur = u.targetId ? this.gs.units.get(u.targetId) : undefined;
    if (cur && cur.alive && cur.faction !== u.faction) return;

    const cands = this.grid.queryCircle(u.x, u.y, this.SIGHT);
    const dist = (e: { x: number; y: number }) => Math.hypot(e.x - u.x, e.y - u.y);
    const byDist = (a: Unit, b: Unit) => dist(a) - dist(b);

    // 1. 视野内有敌方小兵 → 锁定最近一只。
    //    关键：即便当前正进军兵营也切换，这样两军相遇会交战而非穿过彼此。
    const enemies = cands.filter(e => e.faction !== u.faction && e.alive);
    if (enemies.length > 0) {
      enemies.sort(byDist);
      u.targetId = enemies[0].id;
      return;
    }

    // 2. 视野内无敌方小兵：保留或锁定最近敌方兵营（没小兵就直接拆）
    if (u.targetId) {
      const c = this.gs.camps.get(u.targetId);
      if (c && !c.destroyed) return;  // 继续进军当前兵营
      u.targetId = null;
    }
    const camps = [...this.gs.camps.values()].filter(c => c.faction !== u.faction && !c.destroyed);
    if (camps.length > 0) {
      camps.sort((a, b) => dist(a) - dist(b));
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
