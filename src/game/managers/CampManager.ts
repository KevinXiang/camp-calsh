import type { Camp, Unit, Faction } from '../types';
import { CAMP_DEFS } from '../../config/camps';
import { UNIT_DEFS } from '../../config/units';

export interface GameStateView {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
  sim: { spawnMultiplier: { red: number; blue: number } };
  addUnit(u: Unit): void;
}

export class CampManager {
  /** 诊断：每个 camp 最近一次 cap-mismatch 告警的时间戳（ms）。节流到 1Hz，避免刷屏。 */
  private lastDiagAt = new Map<string, number>();

  constructor(private gs: GameStateView) {}

  step(dt: number): void {
    for (const c of this.gs.camps.values()) {
      if (c.destroyed) continue;
      const cap = CAMP_DEFS[c.kind]?.unitCap ?? 20;
      if (c.aliveUnits >= cap) {
        this.diagCapMismatch(c, cap);
        continue;
      }
      // 玩家可调倍率（>1 加快），下限 0.01 防 div-zero
      const mult = Math.max(0.01, this.gs.sim.spawnMultiplier[c.faction as Faction] ?? 1);
      c.spawnTimer -= dt * mult;
      if (c.spawnTimer <= 0) {
        const def = CAMP_DEFS[c.kind];
        const udef = UNIT_DEFS[c.kind];
        const factor = [1, 0.85, 0.70][c.upgrades.production - 1] ?? 1;
        c.spawnTimer += def.spawnInterval * factor;
        const unit: Unit = {
          id: crypto.randomUUID(), faction: c.faction, kind: c.kind, campId: c.id,
          x: c.x + (Math.random() - 0.5) * 30, y: c.y + (Math.random() - 0.5) * 30,
          hp: udef.maxHp, maxHp: udef.maxHp, attack: udef.attack,
          attackRange: udef.attackRange, attackInterval: udef.attackInterval, moveSpeed: udef.moveSpeed,
          attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0,
        };
        this.gs.addUnit(unit);
        c.aliveUnits++;
      }
    }
  }

  /**
   * 诊断「该兵营被 cap 拦住，但实际仍归属它的存活 unit < aliveUnits」——
   * 即 spawn 计数偏大、不变量被破坏的可观测点。1Hz 节流，正常情况下永不打印。
   */
  private diagCapMismatch(c: { id: string; kind: string; faction: string; aliveUnits: number }, cap: number): void {
    // 测试 fixture 经常构造 aliveUnits=N 但 units 为空的场景；那种"假失配"无意义，跳过。
    if (this.gs.units.size === 0) return;
    let real = 0;
    for (const u of this.gs.units.values()) {
      if (u.alive && u.campId === c.id) real++;
    }
    if (real >= c.aliveUnits) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : 0);
    const last = this.lastDiagAt.get(c.id) ?? 0;
    if (now - last < 1000) return;
    this.lastDiagAt.set(c.id, now);
    // eslint-disable-next-line no-console
    console.warn(
      `[CampManager] aliveUnits 失配：camp=${c.id.slice(0, 8)} ${c.faction}/${c.kind} ` +
      `aliveUnits=${c.aliveUnits} real=${real} cap=${cap} → 该兵营会被卡住不产兵`
    );
  }
}
