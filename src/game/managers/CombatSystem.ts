import type { Camp, Unit, Projectile, Faction } from '../types';
import type { CombatEvent } from '../effects/types';
import { SpatialGrid } from '../spatial/SpatialGrid';

export interface CombatGSView {
  units: Map<string, Unit>;
  camps: Map<string, Camp>;
  projectiles: Projectile[];
  events: CombatEvent[];
  stats: { red: { unitsAlive: number; campsAlive: number; kills: number; campsDestroyed: number }; blue: { unitsAlive: number; campsAlive: number; kills: number; campsDestroyed: number } };
}

export interface DamageOpts {
  source: 'melee' | 'ranged';
  /** 仅 source==='ranged' 时有意义；用于命中特效分发。 */
  weaponKind?: 'arrow' | 'javelin' | 'bomb' | 'artillery';
  /** 命中事件种类，'none' 表示不派发命中事件（例如持续毒伤）。 */
  hitEvent?: HitEventKind | 'none';
}

type HitEventKind = 'meleeHit' | 'arrowHit' | 'javelinHit' | 'shieldBlock' | 'bombHit';

export class CombatSystem {
  /**
   * 公共入口：对单位或营地造成伤害，并根据 opts 派发命中事件。
   * 保留原签名语义，方便调用方；内部委托给 damageUnit / damageCamp。
   */
  static applyDamage(target: Unit | Camp, dmg: number, gs: CombatGSView, opts: DamageOpts): void {
    if ('alive' in target) {
      CombatSystem.damageUnit(target, dmg, gs, CombatSystem.resolveHitEvent(target, opts));
    } else {
      CombatSystem.damageCamp(target, dmg, gs, true);
    }
  }

  /** 根据目标/武器选择命中事件种类（包含盾兵身份压过武器的规则） */
  private static resolveHitEvent(target: Unit, opts: DamageOpts): HitEventKind {
    if (target.kind === 'shield') return 'shieldBlock';
    if (opts.weaponKind === 'bomb') return 'bombHit';
    if (opts.source === 'ranged' && opts.weaponKind === 'arrow') return 'arrowHit';
    if (opts.source === 'ranged' && opts.weaponKind === 'javelin') return 'javelinHit';
    return 'meleeHit';
  }

  /** 统一单位伤害结算：扣血 → 可选命中事件 → 死亡处理 */
  private static damageUnit(target: Unit, dmg: number, gs: CombatGSView, hitKind: HitEventKind | 'none'): void {
    target.hp -= dmg;
    if (hitKind !== 'none') {
      gs.events.push({ kind: hitKind, unitId: target.id, x: target.x, y: target.y, faction: target.faction } as CombatEvent);
    }
    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      target.state = 'idle';
      target.deathTimer = 1.0;
      const camp = gs.camps.get(target.campId);
      if (camp) camp.aliveUnits = Math.max(0, camp.aliveUnits - 1);
      const killerFaction: Faction = target.faction === 'red' ? 'blue' : 'red';
      gs.stats[killerFaction].kills++;
      gs.events.push({ kind: 'unitDeath', unitId: target.id, x: target.x, y: target.y, faction: target.faction });
    }
  }

  /** 统一营地伤害结算：扣血 → campHit / campDestroyed */
  private static damageCamp(target: Camp, dmg: number, gs: CombatGSView, emitHit: boolean): void {
    if (target.destroyed) return;
    target.hp -= dmg;
    if (target.hp <= 0) {
      target.destroyed = true;
      const killerFaction: Faction = target.faction === 'red' ? 'blue' : 'red';
      gs.stats[killerFaction].campsDestroyed++;
      gs.events.push({ kind: 'campDestroyed', campId: target.id, x: target.x, y: target.y, faction: target.faction });
    } else if (emitHit) {
      gs.events.push({ kind: 'campHit', campId: target.id, x: target.x, y: target.y });
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
    unitGrid?: SpatialGrid<Unit>,
  ): void {
    const r2 = radius * radius;
    const unitTargets = unitGrid ? unitGrid.queryCircle(x, y, radius) : [...gs.units.values()];
    for (const u of unitTargets) {
      if (!u.alive || u.faction === attackerFaction) continue;
      if (!unitGrid) {
        const dx = u.x - x; const dy = u.y - y;
        if (dx * dx + dy * dy > r2) continue;
      }
      CombatSystem.damageUnit(u, dmg, gs, u.kind === 'shield' ? 'shieldBlock' : 'bombHit');
    }
    for (const c of gs.camps.values()) {
      if (c.destroyed || c.faction === attackerFaction) continue;
      const dx = c.x - x; const dy = c.y - y;
      if (dx * dx + dy * dy > r2) continue;
      CombatSystem.damageCamp(c, dmg, gs, true);
    }
    gs.events.push({ kind: 'bombExplosion', x, y, faction: attackerFaction });
  }

  /** 火炮溅射：在 (x,y) radius 圆内对所有 alive 敌方 unit + 未摧毁敌方 camp 各扣 dmg，camp 额外享受 campMultiplier */
  static applyArtillerySplash(
    x: number, y: number, dmg: number,
    attackerFaction: Faction, gs: CombatGSView, radius: number, campMultiplier: number,
    unitGrid?: SpatialGrid<Unit>,
  ): void {
    const r2 = radius * radius;
    const unitTargets = unitGrid ? unitGrid.queryCircle(x, y, radius) : [...gs.units.values()];
    for (const u of unitTargets) {
      if (!u.alive || u.faction === attackerFaction) continue;
      if (!unitGrid) {
        const dx = u.x - x; const dy = u.y - y;
        if (dx * dx + dy * dy > r2) continue;
      }
      CombatSystem.damageUnit(u, dmg, gs, u.kind === 'shield' ? 'shieldBlock' : 'javelinHit');
    }
    for (const c of gs.camps.values()) {
      if (c.destroyed || c.faction === attackerFaction) continue;
      const dx = c.x - x; const dy = c.y - y;
      if (dx * dx + dy * dy > r2) continue;
      CombatSystem.damageCamp(c, dmg * campMultiplier, gs, true);
    }
    gs.events.push({ kind: 'artilleryExplosion', x, y, faction: attackerFaction });
  }

  /** 治疗目标：恢复 hp（不超过 maxHp），推 healHit 事件 */
  static applyHeal(target: Unit | Camp, amount: number, gs: CombatGSView): void {
    target.hp = Math.min(target.maxHp, target.hp + amount);
    gs.events.push({ kind: 'healHit', x: target.x, y: target.y, faction: target.faction });
  }

  /** 施加中毒状态 */
  static applyPoison(target: Unit, dps: number, duration: number, gs: CombatGSView): void {
    target.poisonTimer = duration;
    target.poisonDps = dps;
    gs.events.push({ kind: 'poisonApplied', x: target.x, y: target.y, faction: target.faction });
  }

  /** 毒素 tick：每帧调用，扣除中毒伤害（不派发命中事件） */
  static tickPoison(target: Unit, dt: number, gs: CombatGSView): void {
    if (target.poisonTimer <= 0) return;
    const effectiveDt = Math.min(dt, target.poisonTimer);
    const tickDamage = target.poisonDps * effectiveDt;
    target.poisonTimer = Math.max(0, target.poisonTimer - dt);
    if (target.poisonTimer <= 0) {
      target.poisonDps = 0;
    }
    CombatSystem.damageUnit(target, tickDamage, gs, 'none');
  }

  static step(gs: CombatGSView, dt: number): void {
    // 在结算前为单位构建空间索引（本 step 内复用，给 AOE/毒雾/火炮使用）
    const aliveUnits: Unit[] = [];
    for (const u of gs.units.values()) {
      if (u.alive) aliveUnits.push(u);
    }
    let unitGrid: SpatialGrid<Unit> | null = null;
    const getGrid = (): SpatialGrid<Unit> => {
      if (!unitGrid) {
        unitGrid = new SpatialGrid<Unit>(80);
        unitGrid.rebuild(aliveUnits);
      }
      return unitGrid;
    };

    // 弹道推进/命中
    const survived: Projectile[] = [];
    for (const p of gs.projectiles) {
      p.elapsed += dt;
      if (p.elapsed >= p.maxTime) continue;

      const target = gs.units.get(p.targetId) ?? gs.camps.get(p.targetId);
      if (!target) {
        // 炸弹：目标已死 → 原地爆炸（不消失）
        if (p.kind === 'bomb') {
          CombatSystem.applyAOE(p.x, p.y, p.damage, p.faction, gs, 50, getGrid());
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
        if (p.kind === 'artillery') {
          CombatSystem.applyArtillerySplash(p.x, p.y, p.damage, p.faction, gs, 80, 2, getGrid());
          continue;
        }
        if (p.kind === 'poison') {
          // 毒瓶命中：对范围内敌方施加中毒（单位走空间网格，营地仍全量）
          const poisonRange = 300; // 与 medic.poisonRange 一致
          const grid = getGrid();
          for (const e of grid.queryCircle(p.x, p.y, poisonRange)) {
            if (!e.alive || e.faction === p.faction) continue;
            CombatSystem.applyPoison(e, p.damage, 2, gs);
          }
          for (const c of gs.camps.values()) {
            if (c.destroyed || c.faction === p.faction) continue;
            const d = Math.hypot(c.x - p.x, c.y - p.y);
            if (d <= poisonRange) {
              CombatSystem.damageCamp(c, p.damage * 2, gs, false);
            }
          }
          gs.events.push({ kind: 'poisonCloud', x: p.x, y: p.y, faction: p.faction });
          continue;
        }
        if (p.kind === 'bomb') {
          CombatSystem.applyAOE(p.x, p.y, p.damage, p.faction, gs, 50, getGrid());
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
