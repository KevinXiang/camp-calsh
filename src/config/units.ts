import type { UnitDef, UnitKind } from '../game/types';

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  sword:   { kind: 'sword',   attackType: 'melee',  maxHp: 100, attack: 10, attackRange: 35,  attackInterval: 1.0, moveSpeed: 60 },
  shield:  { kind: 'shield',  attackType: 'melee',  maxHp: 160, attack: 7,  attackRange: 35,  attackInterval: 1.2, moveSpeed: 45 },
  archer:  { kind: 'archer',  attackType: 'ranged', maxHp: 60,  attack: 8,  attackRange: 180, attackInterval: 1.2, moveSpeed: 45 },
  javelin: { kind: 'javelin', attackType: 'ranged', maxHp: 70,  attack: 18, attackRange: 150, attackInterval: 2.0, moveSpeed: 40 },
  bomb:    { kind: 'bomb',    attackType: 'ranged', maxHp: 50,  attack: 15, attackRange: 120, attackInterval: 2.5, moveSpeed: 35 },
  medic:     { kind: 'medic',     attackType: 'ranged', maxHp: 120, attack: 0,  attackRange: 150, attackInterval: 2.0, moveSpeed: 50, healAmount: 12, healSearchRange: 300, poisonDamage: 8, poisonDuration: 2, poisonRange: 120, poisonCooldown: 3 },
  artillery: { kind: 'artillery', attackType: 'ranged', maxHp: 70, attack: 12, attackRange: 250, attackInterval: 2.8, moveSpeed: 35 },
};
