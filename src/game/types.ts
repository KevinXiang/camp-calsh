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
