import type { Camp, Unit, Projectile, ProjectileKind, SideStats } from '../types';
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
      if (u.poisonCooldownTimer > 0) u.poisonCooldownTimer = Math.max(0, u.poisonCooldownTimer - dt);
      this.acquireTarget(u);
      this.act(u, dt);
      // 医疗兵毒雾（独立于治疗，每帧检查）
      this.tryPoisonCloud(u);
    }
  }

  /** 医疗兵释放毒雾（独立于治疗逻辑） */
  private tryPoisonCloud(u: Unit): void {
    if (!UNIT_DEFS[u.kind]?.healAmount || !UNIT_DEFS[u.kind]?.poisonDamage) return;
    if (u.poisonCooldownTimer > 0) return;
    const poisonRange = UNIT_DEFS[u.kind]!.poisonRange!;
    let hasEnemy = false;
    for (const e of this.gs.units.values()) {
      if (!e.alive || e.faction === u.faction) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d <= poisonRange) {
        CombatSystem.applyPoison(e, UNIT_DEFS[u.kind]!.poisonDamage!, UNIT_DEFS[u.kind]!.poisonDuration!, this.gs);
        hasEnemy = true;
      }
    }
    for (const c of this.gs.camps.values()) {
      if (c.destroyed || c.faction === u.faction) continue;
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d <= poisonRange) {
        c.hp -= UNIT_DEFS[u.kind]!.poisonDamage! * UNIT_DEFS[u.kind]!.poisonDuration!;
        hasEnemy = true;
        if (c.hp <= 0) {
          c.destroyed = true;
          const killerFaction = c.faction === 'red' ? 'blue' : 'red';
          this.gs.stats[killerFaction].campsDestroyed++;
          this.gs.events.push({ kind: 'campDestroyed', campId: c.id, x: c.x, y: c.y, faction: c.faction });
        }
      }
    }
    if (hasEnemy) {
      u.poisonCooldownTimer = UNIT_DEFS[u.kind]!.poisonCooldown!;
      this.gs.events.push({ kind: 'poisonCloud', x: u.x, y: u.y, faction: u.faction });
    }
  }

  private acquireTarget(u: Unit): void {
    // 医疗兵：搜索同阵营 alive unit + 未摧毁 camp 中 HP% 最低的
    if (UNIT_DEFS[u.kind]?.healAmount) {
      const range = UNIT_DEFS[u.kind]!.healSearchRange ?? UNIT_DEFS[u.kind]!.attackRange;
      const friendlies: { id: string; hp: number; maxHp: number; d: number }[] = [];
      for (const f of this.gs.units.values()) {
        if (!f.alive || f.faction !== u.faction || f.hp >= f.maxHp) continue;
        const d = Math.hypot(f.x - u.x, f.y - u.y);
        if (d > range) continue;
        friendlies.push({ id: f.id, hp: f.hp, maxHp: f.maxHp, d });
      }
      for (const c of this.gs.camps.values()) {
        if (c.destroyed || c.faction !== u.faction || c.hp >= c.maxHp) continue;
        const d = Math.hypot(c.x - u.x, c.y - u.y);
        if (d > range) continue;
        friendlies.push({ id: c.id, hp: c.hp, maxHp: c.maxHp, d });
      }
      friendlies.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
      u.targetId = friendlies[0]?.id ?? null;
      return;
    }

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
        if (UNIT_DEFS[u.kind]?.healAmount) {
          // 医疗兵：发治疗弹
          const dx = tx - u.x; const dy = ty - u.y; const d = Math.hypot(dx, dy) || 1;
          this.gs.projectiles.push({
            id: crypto.randomUUID(), kind: 'heal',
            x: u.x, y: u.y, targetId: u.targetId!,
            speed: 200, damage: UNIT_DEFS[u.kind]!.healAmount!,
            faction: u.faction, elapsed: 0, maxTime: 2,
          });
        } else if (u.kind === 'artillery') {
          // 火炮兵：抛物线炮弹
          this.gs.projectiles.push({
            id: crypto.randomUUID(), kind: 'artillery',
            x: u.x, y: u.y, targetId: u.targetId!,
            speed: 180, damage: UNIT_DEFS[u.kind]!.attack,
            faction: u.faction, elapsed: 0, maxTime: 2.5,
          });
        } else if (UNIT_DEFS[u.kind]?.attackType === 'ranged') {
          const dx = tx - u.x; const dy = ty - u.y; const d = Math.hypot(dx, dy) || 1;
          const projKind: ProjectileKind =
            u.kind === 'javelin' ? 'javelin' :
            u.kind === 'bomb'    ? 'bomb'    : 'arrow';
          this.gs.projectiles.push({
            id: crypto.randomUUID(), kind: projKind,
            x: u.x, y: u.y, targetId: u.targetId!,
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
