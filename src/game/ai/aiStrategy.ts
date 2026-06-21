import { CAMP_ROLE_DEFS } from '../../config/campRoles';
import type { Camp, CampKind } from '../types';

const TIE_BREAK_ORDER = {
  sword: 0,
  shield: 1,
  archer: 2,
  javelin: 3,
  bomb: 4,
  medic: 5,
  artillery: 6,
} satisfies Record<CampKind, number>;

const ORDER = (Object.keys(TIE_BREAK_ORDER) as CampKind[])
  .sort((a, b) => TIE_BREAK_ORDER[a] - TIE_BREAK_ORDER[b]);

const FRONTLINE = new Set<CampKind>(['sword', 'shield']);
const SPECIAL_OR_SUPPORT = new Set<CampKind>([
  'javelin',
  'bomb',
  'medic',
  'artillery',
]);

export function chooseAiCampKind(
  blueCamps: Camp[],
  redCamps: Camp[],
): CampKind {
  const blueKinds = blueCamps
    .filter(camp => !camp.destroyed)
    .map(camp => camp.kind);
  const redKinds = redCamps
    .filter(camp => !camp.destroyed)
    .map(camp => camp.kind);

  if (!blueKinds.some(kind => FRONTLINE.has(kind))) return 'sword';
  if (!blueKinds.includes('archer')) return 'archer';
  if (!blueKinds.some(kind => SPECIAL_OR_SUPPORT.has(kind))) return 'medic';

  const blueCounts = countKinds(blueKinds);
  const redCounts = countKinds(redKinds);
  let bestKind = ORDER[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of ORDER) {
    const role = CAMP_ROLE_DEFS[candidate];
    let score = (blueCounts.get(candidate) ?? 0) * -4;

    for (const enemy of redKinds) {
      if (role.bestAgainst.includes(enemy)) score += 12;
      if (role.weakAgainst.includes(enemy)) score -= 8;
    }

    if (
      role.role === 'aoe-ranged'
      && Array.from(redCounts.values()).some(count => count >= 2)
    ) {
      score += 6;
    }

    if (score > bestScore) {
      bestKind = candidate;
      bestScore = score;
    }
  }

  return bestKind;
}

function countKinds(kinds: CampKind[]): Map<CampKind, number> {
  const counts = new Map<CampKind, number>();
  for (const kind of kinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return counts;
}
