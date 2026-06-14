export type Faction = 'red' | 'blue';

export type CampKind = 'sword' | 'shield' | 'archer' | 'javelin';

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

export type ProjectileKind = 'arrow' | 'javelin';

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
