export type Faction = 'red' | 'blue';

export type GameMode = 'sandbox' | 'aiBattle';

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
  paidCost?: number;
}

export type TargetPreference = 'nearest' | 'highestHp' | 'clustered' | 'campFirst';

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
  /** 目标选择偏好；缺省为 'nearest' */
  preferredTarget?: TargetPreference;
  /** 最小攻击距离；目标进入该距离内将不进入攻击分支（用于火炮近身弱点） */
  minimumAttackRange?: number;
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
}

export type ProjectileKind = 'arrow' | 'javelin' | 'bomb' | 'heal' | 'artillery';

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

/**
 * 军营角色元数据。role 供规则型 AI 的阵容/aoe 评分使用，
 * bestAgainst/weakAgainst 供其克制评分使用；
 * slogan/strengths/weaknesses/tier 等仍主要用于 UI/设计表达，不进入战斗模拟。
 */
export interface CampRoleDef {
  /** 一句话定位 */
  slogan: string;
  /** 战场角色类别，供 UI 与规则型 AI 的阵容/aoe 评分使用 */
  role: 'frontline' | 'tank' | 'sustain-ranged' | 'assassin-ranged' | 'aoe-ranged' | 'support' | 'siege';
  /** 主要优势 */
  strengths: string[];
  /** 主要短板 */
  weaknesses: string[];
  /** 擅长对付的军营，供 UI 与规则型 AI 使用 */
  bestAgainst: CampKind[];
  /** 被哪些军营克制，供 UI 与规则型 AI 使用 */
  weakAgainst: CampKind[];
  /** 学习层级：1 基础 / 2 战术 / 3 特殊 */
  tier: 1 | 2 | 3;
}
