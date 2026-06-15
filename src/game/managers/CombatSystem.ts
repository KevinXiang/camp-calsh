import type { Camp, Unit, Projectile, SideStats, Faction } from '../types';
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
  /** 仅 source==='ranged' 时有意义；用于命中特效分发。 */
  weaponKind?: 'arrow' | 'javelin' | 'bomb' | 'artillery';
}

export class CombatSystem {
  static applyDamage(target: Unit | Camp, dmg: number, gs: CombatGSView, opts: DamageOpts): void {
    target.hp -= dmg;

    if ('alive' in target) {
      // 盾兵被打：所有命中（近战/弓/矛）走 shieldBlock 火花。
      // 优先级高于 weaponKind 分发 — 盾兵的身份特效压过武器特效。
      if (target.kind === 'shield') {
        gs.events.push({ kind: 'shieldBlock', x: target.x, y: target.y, faction: target.faction });
      } else if (opts.weaponKind === 'bomb') {
        // 炸弹 AOE 命中普通单位：独立 bombHit（仅触发闪白，无独立特效）
        gs.events.push({ kind: 'bombHit', x: target.x, y: target.y, faction: target.faction });
      } else {
        const isJavelin = opts.source === 'ranged' && opts.weaponKind === 'javelin';
        gs.events.push(isJavelin
          ? { kind: 'javelinHit', x: target.x, y: target.y, faction: target.faction }
          : { kind: 'meleeHit',   x: target.x, y: target.y, faction: target.faction }
        );
      }
      if (target.hp <= 0) {
        target.alive = false;
        target.state = 'idle';
        target.deathTimer = 1.0;
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

  /**
   * 炸弹爆炸：在 (x,y) radius 圆内对所有 alive 敌方 unit + 未摧毁敌方 camp 各扣 dmg。
   * 盾兵仍走 shieldBlock（身份压过武器）；普通 unit 走 bombHit。
   * 每次调用推一个 bombExplosion 事件（用于爆炸特效，与命中数无关）。
   */
  static applyAOE(
    x: number, y: number, dmg: number,
    attackerFaction: Faction, gs: CombatGSView, radius = 50,
  ): void {
    const r2 = radius * radius;
    for (const u of gs.units.values()) {
      if (!u.alive || u.faction === attackerFaction) continue;
      const dx = u.x - x; const dy = u.y - y;
      if (dx * dx + dy * dy > r2) continue;
      CombatSystem.applyDamage(u, dmg, gs, { source: 'ranged', weaponKind: 'bomb' });
    }
    for (const c of gs.camps.values()) {
      if (c.destroyed || c.faction === attackerFaction) continue;
      const dx = c.x - x; const dy = c.y - y;
      if (dx * dx + dy * dy > r2) continue;
      CombatSystem.applyDamage(c, dmg, gs, { source: 'ranged' });
    }
    gs.events.push({ kind: 'bombExplosion', x, y, faction: attackerFaction });
  }

  /** 治疗目标：恢复 hp（不超过 maxHp），推 healHit 事件 */
  static applyHeal(target: Unit | Camp, amount: number, gs: CombatGSView): void {
    target.hp = Math.min(target.maxHp, target.hp + amount);
    gs.events.push({ kind: 'healHit', x: target.x, y: target.y, faction: target.faction });
  }

  static step(gs: CombatGSView, dt: number): void {
    // 弹道推进/命中
    const survived: Projectile[] = [];
    for (const p of gs.projectiles) {
      p.elapsed += dt;
      if (p.elapsed >= p.maxTime) continue;

      const target = gs.units.get(p.targetId) ?? gs.camps.get(p.targetId);
      if (!target) {
        // 炸弹：目标已死 → 原地爆炸（不消失）
        if (p.kind === 'bomb') {
          CombatSystem.applyAOE(p.x, p.y, p.damage, p.faction, gs);
        }
        continue;
      }

      const tgt = target as { x: number; y: number };
      const dx = tgt.x - p.x; const dy = tgt.y - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 12) {
        if (p.kind === 'heal') {
          CombatSystem.applyHeal(target as Unit | Camp, p.damage, gs);
          continue;
        }
        if (p.kind === 'bomb') {
          CombatSystem.applyAOE(p.x, p.y, p.damage, p.faction, gs);
        } else {
          CombatSystem.applyDamage(target as Unit | Camp, p.damage, gs, {
            source: 'ranged',
            weaponKind: p.kind,
          });
        }
        continue;
      }

      const step = Math.min(p.speed * dt, dist);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
      survived.push(p);
    }
    gs.projectiles = survived;

    // 死亡计时 + 尸体清理（deathTimer 归零后移除，防止 gs.units 无限增长卡死）
    const toRemove: string[] = [];
    for (const u of gs.units.values()) {
      if (u.alive) continue;
      if (u.deathTimer > 0) u.deathTimer = Math.max(0, u.deathTimer - dt);
      if (u.deathTimer <= 0) toRemove.push(u.id);
    }
    for (const id of toRemove) gs.units.delete(id);
  }
}
