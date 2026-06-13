import type { Camp, Unit, Projectile, SideStats } from '../types';

export interface CombatGSView {
  units: Map<string, Unit>;
  camps: Map<string, Camp>;
  projectiles: Projectile[];
  stats: { red: SideStats; blue: SideStats };
}

export class CombatSystem {
  static applyDamage(target: Unit | Camp, dmg: number, gs: CombatGSView): void {
    target.hp -= dmg;
    if (target.hp > 0) return;

    if ('alive' in target) {
      target.alive = false;
      target.state = 'idle';
      const camp = gs.camps.get(target.campId);
      if (camp) camp.aliveUnits = Math.max(0, camp.aliveUnits - 1);
      const killerFaction = target.faction === 'red' ? 'blue' : 'red';
      gs.stats[killerFaction].kills++;
    } else {
      target.destroyed = true;
      const killerFaction = target.faction === 'red' ? 'blue' : 'red';
      gs.stats[killerFaction].campsDestroyed++;
    }
  }

  static step(gs: CombatGSView, dt: number): void {
    // 弹道推进/命中
    const survived: Projectile[] = [];
    for (const p of gs.projectiles) {
      p.elapsed += dt;
      if (p.elapsed >= p.maxTime) continue;

      const target = gs.units.get(p.targetId) ?? gs.camps.get(p.targetId);
      if (!target) continue;

      const tgt = target as { x: number; y: number };
      const dx = tgt.x - p.x; const dy = tgt.y - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 12) {
        CombatSystem.applyDamage(target as Unit | Camp, p.damage, gs);
        continue;
      }

      const step = Math.min(p.speed * dt, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      survived.push(p);
    }
    gs.projectiles = survived;

    // 死亡清理
    for (const u of gs.units.values()) {
      if (u.alive) continue;
      u.deathTimer -= dt;
      if (u.deathTimer <= 0) gs.units.delete(u.id);
    }
  }
}
