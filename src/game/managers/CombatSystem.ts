import type { Camp, Unit, Projectile, SideStats } from '../types';
import type { CombatEvent } from '../effects/types';

export interface CombatGSView {
  units: Map<string, Unit>;
  camps: Map<string, Camp>;
  projectiles: Projectile[];
  events: CombatEvent[];
  stats: { red: SideStats; blue: SideStats };
}

export interface DamageOpts {
  source: 'melee' | 'ranged';
}

export class CombatSystem {
  static applyDamage(target: Unit | Camp, dmg: number, gs: CombatGSView, opts: DamageOpts): void {
    target.hp -= dmg;

    if ('alive' in target) {
      // 单位被打：发命中事件（无论是否致死）
      gs.events.push({ kind: 'meleeHit', x: target.x, y: target.y, faction: target.faction });
      if (target.hp <= 0) {
        target.alive = false;
        target.state = 'idle';
        target.deathTimer = 0.3;
        const camp = gs.camps.get(target.campId);
        if (camp) camp.aliveUnits = Math.max(0, camp.aliveUnits - 1);
        const killerFaction = target.faction === 'red' ? 'blue' : 'red';
        gs.stats[killerFaction].kills++;
        gs.events.push({ kind: 'unitDeath', unitId: target.id, x: target.x, y: target.y, faction: target.faction });
      }
    } else {
      // 军营被打
      if (target.hp <= 0) {
        target.destroyed = true;
        const killerFaction = target.faction === 'red' ? 'blue' : 'red';
        gs.stats[killerFaction].campsDestroyed++;
        gs.events.push({ kind: 'campDestroyed', campId: target.id, x: target.x, y: target.y, faction: target.faction });
      } else {
        gs.events.push({ kind: 'campHit', campId: target.id, x: target.x, y: target.y });
      }
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
        CombatSystem.applyDamage(target as Unit | Camp, p.damage, gs, { source: 'ranged' });
        continue;
      }

      const step = Math.min(p.speed * dt, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      survived.push(p);
    }
    gs.projectiles = survived;

    // 死亡计时（尸体保留）
    for (const u of gs.units.values()) {
      if (u.alive) continue;
      if (u.deathTimer > 0) u.deathTimer = Math.max(0, u.deathTimer - dt);
    }
  }
}
