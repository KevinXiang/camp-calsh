import type { Camp, Unit, Projectile, ProjectileKind, SideStats, TargetPreference } from '../types';
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

/** 爆破兵 AOE 半径，用于"密集度"评分（与 CombatSystem.applyAOE 默认 radius=50 保持一致） */
const BOMB_AOE_RADIUS = 50;
/** 默认索敌视野 */
const DEFAULT_SIGHT = 250;
/** 投矛兵高价值目标（医疗/火炮）额外优先权重 */
const JAVELIN_HIGH_VALUE_BONUS = 500;

export class UnitManager {
  private grid = new SpatialGrid<Unit>(80);

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
    const def = UNIT_DEFS[u.kind];

    // 医疗兵：搜索同阵营 alive unit + 未摧毁 camp 中 HP% 最低的
    if (def?.healAmount) {
      const range = def.healSearchRange ?? def.attackRange;
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

    const pref: TargetPreference = def?.preferredTarget ?? 'nearest';

    // 当前目标仍是存活敌方【小兵】→ 保持（避免在多个近敌间抖动）
    // 例外：campFirst（火炮）视野内若存在可攻击敌方营地，则优先锁营地
    const cur = u.targetId ? this.gs.units.get(u.targetId) : undefined;
    if (cur && cur.alive && cur.faction !== u.faction) {
      if (pref === 'campFirst') {
        const campTarget = this.pickNearestEnemyCamp(u, Math.max(DEFAULT_SIGHT, def.attackRange));
        if (campTarget) {
          u.targetId = campTarget.id;
          return;
        }
      }
      return;
    }

    // campFirst（火炮）：视野内有敌方营地优先锁营地
    if (pref === 'campFirst') {
      const campRange = Math.max(DEFAULT_SIGHT, def.attackRange);
      const campTarget = this.pickNearestEnemyCamp(u, campRange);
      if (campTarget) {
        u.targetId = campTarget.id;
        return;
      }
    }

    // 敌方小兵候选
    const cands = this.grid.queryCircle(u.x, u.y, DEFAULT_SIGHT);
    const enemies = cands.filter(e => e.faction !== u.faction && e.alive);

    if (enemies.length > 0) {
      u.targetId = this.pickPreferredEnemy(u, enemies, pref).id;
      return;
    }

    // 视野内无敌方小兵：保留或锁定最近敌方兵营
    if (u.targetId) {
      const c = this.gs.camps.get(u.targetId);
      if (c && !c.destroyed) return;
      u.targetId = null;
    }
    // campFirst（火炮）只在有效射程内搜索营地；其他单位无范围限制（继续进军最近营地）
    let camps: Camp[];
    if (pref === 'campFirst') {
      const campSearch = Math.max(DEFAULT_SIGHT, def.attackRange);
      camps = [...this.gs.camps.values()].filter(c => {
        if (c.faction === u.faction || c.destroyed) return false;
        return Math.hypot(c.x - u.x, c.y - u.y) <= campSearch;
      });
    } else {
      camps = [...this.gs.camps.values()].filter(c => c.faction !== u.faction && !c.destroyed);
    }
    if (camps.length > 0) {
      camps.sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
      u.targetId = camps[0].id;
    }
  }

  /** 挑选距离 u 最近的敌方（且在 range 内）未摧毁营地 */
  private pickNearestEnemyCamp(u: Unit, range: number): Camp | null {
    let best: Camp | null = null;
    let bestD = Infinity;
    for (const c of this.gs.camps.values()) {
      if (c.destroyed || c.faction === u.faction) continue;
      const d = Math.hypot(c.x - u.x, c.y - u.y);
      if (d > range) continue;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  /**
   * 按目标偏好从候选敌人中挑一个：分越低越优先。
   * - nearest: 纯距离
   * - highestHp: 距离 - maxHp 权重 - 高价值兵种 bonus
   * - clustered: 距离 - 邻居数 * 权重
   */
  private pickPreferredEnemy(u: Unit, enemies: Unit[], pref: TargetPreference): Unit {
    const dist = (e: Unit) => Math.hypot(e.x - u.x, e.y - u.y);

    let best = enemies[0];
    let bestScore = Infinity;
    for (const e of enemies) {
      let score = dist(e);
      if (pref === 'highestHp') {
        score -= e.maxHp * 1.5;
        if (e.kind === 'medic' || e.kind === 'artillery') score -= JAVELIN_HIGH_VALUE_BONUS;
      } else if (pref === 'clustered') {
        const neighbors = this.grid.queryCircle(e.x, e.y, BOMB_AOE_RADIUS)
          .filter(n => n.alive && n.faction !== u.faction && n.id !== e.id).length;
        score -= neighbors * 80;
      }
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  private act(u: Unit, dt: number): void {
    if (!u.targetId) { u.state = 'idle'; return; }
    const target = this.gs.units.get(u.targetId) ?? this.gs.camps.get(u.targetId);
    if (!target) { u.targetId = null; u.state = 'idle'; return; }
    const def = UNIT_DEFS[u.kind]!;
    const tx = target.x; const ty = target.y;
    const dist = Math.hypot(tx - u.x, ty - u.y);

    const minRange = def.minimumAttackRange ?? 0;
    const tooClose = minRange > 0 && dist < minRange;
    const inAttackRange = dist <= u.attackRange && !tooClose;
    const isCamp = 'produces' in target;

    if (inAttackRange) {
      u.state = 'attacking';
      u.attackTimer -= dt;
      if (u.attackTimer <= 0) {
        u.attackTimer = u.attackInterval;
        this.fire(u, target as Unit | Camp);
      }
    } else {
      u.state = 'moving';
      // 火炮近身弱点：目标是营地且过近时，原地待命不前进（避免贴身无效）
      if (tooClose && isCamp) {
        return;
      }
      const speed = u.moveSpeed * dt;
      const ratio = Math.min(1, speed / dist);
      u.x += (tx - u.x) * ratio;
      u.y += (ty - u.y) * ratio;
    }
  }

  private fire(u: Unit, target: Unit | Camp): void {
    const def = UNIT_DEFS[u.kind]!;
    if (def.healAmount) {
      this.gs.projectiles.push({
        id: crypto.randomUUID(), kind: 'heal',
        x: u.x, y: u.y, targetId: u.targetId!,
        speed: 200, damage: def.healAmount,
        faction: u.faction, elapsed: 0, maxTime: 2,
      });
    } else if (u.kind === 'artillery') {
      this.gs.projectiles.push({
        id: crypto.randomUUID(), kind: 'artillery',
        x: u.x, y: u.y, targetId: u.targetId!,
        speed: 180, damage: def.attack,
        faction: u.faction, elapsed: 0, maxTime: 2.5,
      });
    } else if (def.attackType === 'ranged') {
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
}
