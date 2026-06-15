import type { CampDef, CampKind } from '../game/types';

export const CAMP_DEFS: Record<CampKind, CampDef> = {
  sword:   { kind: 'sword',   produces: 'sword',   maxHp: 500, spawnInterval: 4, unitCap: 20 },
  shield:  { kind: 'shield',  produces: 'shield',  maxHp: 600, spawnInterval: 5, unitCap: 20 },
  archer:  { kind: 'archer',  produces: 'archer',  maxHp: 450, spawnInterval: 5, unitCap: 20 },
  javelin: { kind: 'javelin', produces: 'javelin', maxHp: 450, spawnInterval: 6, unitCap: 20 },
  bomb:    { kind: 'bomb',    produces: 'bomb',    maxHp: 400, spawnInterval: 7, unitCap: 12 },
  medic:     { kind: 'medic',     produces: 'medic',     maxHp: 350, spawnInterval: 7, unitCap: 10 },
  artillery: { kind: 'artillery', produces: 'artillery', maxHp: 400, spawnInterval: 8, unitCap: 10 },
};

/** 军营之间最小放置间距（世界坐标 px） */
export const CAMP_MIN_DISTANCE = 90;
