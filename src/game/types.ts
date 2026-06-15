export type Faction = 'red' | 'blue';

export type CampKind = 'sword' | 'shield' | 'archer' | 'javelin' | 'bomb' | 'medic' | 'artillery';

export type UnitKind = CampKind;

export type AttackType = 'melee' | 'ranged';

export type UpgradeType = 'production' | 'health' | 'weapon';

export interface CampDef {
  kind: CampKind;
  produces: UnitKind;
  maxHp: number;
  spawnInterval: number; // 秒
  unitCap: number;
}

export interface Camp {
  id: string;
  faction: Faction;
  kind: CampKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spawnTimer: number;
  upgrades: Record<UpgradeType, number>;
  aliveUnits: number;
  destroyed: boolean;
}

export interface UnitDef {
  kind: UnitKind;
  attackType: AttackType;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackInterval: number;
  moveSpeed: number;
  /** 治疗量（> 0 表示医疗兵） */
  healAmount?: number;
  /** 医疗兵搜索受伤队友的范围（独立于 attackRange） */
  healSearchRange?: number;
  /** 毒伤（每秒伤害，> 0 表示有毒攻击） */
  poisonDamage?: number;
  /** 中毒持续秒数 */
  poisonDuration?: number;
  /** 毒雾范围（px） */
  poisonRange?: number;
  /** 毒雾冷却秒数 */
  poisonCooldown?: number;
}

export interface Unit {
  id: string;
  faction: Faction;
  kind: UnitKind;
  campId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  attackRange: number;
  attackInterval: number;
  moveSpeed: number;
  attackTimer: number;
  targetId: string | null;
  state: 'moving' | 'attacking' | 'idle';
  alive: boolean;
  deathTimer: number;
  /** 中毒剩余时间（秒），> 0 表示中毒中 */
  poisonTimer: number;
  /** 中毒每秒伤害 */
  poisonDps: number;
  /** 毒雾冷却剩余秒数 */
  poisonCooldownTimer: number;
}

export type ProjectileKind = 'arrow' | 'javelin' | 'bomb' | 'heal' | 'artillery' | 'poison';

export interface Projectile {
  id: string;
  kind: ProjectileKind;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
  faction: Faction;
  elapsed: number;
  maxTime: number;
}

export interface SideStats {
  unitsAlive: number;
  campsAlive: number;
  kills: number;
  campsDestroyed: number;
}
