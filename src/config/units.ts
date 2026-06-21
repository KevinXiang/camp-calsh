import type { UnitDef, UnitKind } from '../game/types';

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  // 剑兵：基础推进线，快速铺线，不强化单体
  sword:   { kind: 'sword',   attackType: 'melee',  maxHp: 100, attack: 10, attackRange: 35,  attackInterval: 1.0, moveSpeed: 60 },
  // 盾兵：明确前排，生命最高，产能略慢
  shield:  { kind: 'shield',  attackType: 'melee',  maxHp: 180, attack: 7,  attackRange: 35,  attackInterval: 1.3, moveSpeed: 42 },
  // 弓兵：最通用远程，持续输出，不高爆发
  archer:  { kind: 'archer',  attackType: 'ranged', maxHp: 60,  attack: 8,  attackRange: 180, attackInterval: 1.1, moveSpeed: 45 },
  // 投矛：高单发低频率，点杀高价值目标（高血量/后排）
  javelin: { kind: 'javelin', attackType: 'ranged', maxHp: 70,  attack: 22, attackRange: 160, attackInterval: 2.2, moveSpeed: 40, preferredTarget: 'highestHp' },
  // 爆破：反密集，AOE 价值高于单点；低上限
  bomb:    { kind: 'bomb',    attackType: 'ranged', maxHp: 50,  attack: 14, attackRange: 120, attackInterval: 2.6, moveSpeed: 35, preferredTarget: 'clustered' },
  // 医疗：纯治疗支援，无攻击
  medic:     { kind: 'medic',     attackType: 'ranged', maxHp: 110, attack: 0,  attackRange: 150, attackInterval: 1.8, moveSpeed: 50, healAmount: 14, healSearchRange: 300 },
  // 火炮：最远射程，攻城优先，近身有最小射程弱点
  artillery: { kind: 'artillery', attackType: 'ranged', maxHp: 70,  attack: 14, attackRange: 280, attackInterval: 3.0, moveSpeed: 32, preferredTarget: 'campFirst', minimumAttackRange: 80 },
};
