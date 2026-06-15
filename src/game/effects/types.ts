import type { Faction } from '../types';

export type CombatEvent =
  | { kind: 'meleeHit'; x: number; y: number; faction: Faction }
  | { kind: 'javelinHit'; x: number; y: number; faction: Faction }
  | { kind: 'shieldBlock'; x: number; y: number; faction: Faction }
  | { kind: 'bombHit'; x: number; y: number; faction: Faction }
  | { kind: 'bombExplosion'; x: number; y: number; faction: Faction }
  | { kind: 'artilleryExplosion'; x: number; y: number; faction: Faction }
  | { kind: 'healHit'; x: number; y: number; faction: Faction }
  | { kind: 'poisonCloud'; x: number; y: number; faction: Faction }
  | { kind: 'poisonApplied'; x: number; y: number; faction: Faction }
  | { kind: 'unitDeath'; unitId: string; x: number; y: number; faction: Faction }
  | { kind: 'campHit'; campId: string; x: number; y: number }
  | { kind: 'campDestroyed'; campId: string; x: number; y: number; faction: Faction };
