import type { Faction } from '../types';

export type CombatEvent =
  | { kind: 'meleeHit'; x: number; y: number; faction: Faction }
  | { kind: 'javelinHit'; x: number; y: number; faction: Faction }
  | { kind: 'shieldBlock'; x: number; y: number; faction: Faction }
  | { kind: 'bombHit'; x: number; y: number; faction: Faction }
  | { kind: 'bombExplosion'; x: number; y: number; faction: Faction }
  | { kind: 'unitDeath'; unitId: string; x: number; y: number; faction: Faction }
  | { kind: 'campHit'; campId: string; x: number; y: number }
  | { kind: 'campDestroyed'; campId: string; x: number; y: number; faction: Faction };
