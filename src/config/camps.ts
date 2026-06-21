import type { CampDef, CampKind } from '../game/types';

export const CAMP_DEFS: Record<CampKind, CampDef> = {
  // 剑兵：最快出兵节奏
  sword:     { kind: 'sword',     produces: 'sword',     maxHp: 500, spawnInterval: 3.5, unitCap: 20 },
  // 盾兵：高营地血量，略慢产兵
  shield:    { kind: 'shield',    produces: 'shield',    maxHp: 650, spawnInterval: 5.5, unitCap: 18 },
  // 弓兵：标准产兵
  archer:    { kind: 'archer',    produces: 'archer',    maxHp: 450, spawnInterval: 5,   unitCap: 20 },
  // 投矛：战术点杀
  javelin:   { kind: 'javelin',   produces: 'javelin',   maxHp: 450, spawnInterval: 6.5, unitCap: 16 },
  // 爆破：反密集，低上限
  bomb:      { kind: 'bomb',      produces: 'bomb',      maxHp: 400, spawnInterval: 7.5, unitCap: 10 },
  // 医疗：纯支援，最低上限
  medic:     { kind: 'medic',     produces: 'medic',     maxHp: 350, spawnInterval: 7,   unitCap: 8 },
  // 火炮：攻城专用，最慢最低上限
  artillery: { kind: 'artillery', produces: 'artillery', maxHp: 420, spawnInterval: 9,   unitCap: 6 },
};

/** 军营之间最小放置间距（世界坐标 px） */
export const CAMP_MIN_DISTANCE = 90;
