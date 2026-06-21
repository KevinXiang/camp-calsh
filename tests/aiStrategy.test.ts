import { describe, expect, it } from 'vitest';
import { chooseAiCampKind } from '../src/game/ai/aiStrategy';
import type { Camp, CampKind, Faction } from '../src/game/types';
import { mkCamp } from './test-helpers';

function camps(
  kinds: CampKind[],
  faction: Faction,
  destroyed = false,
): Camp[] {
  return kinds.map((kind, index) => mkCamp({
    id: `${faction}-${kind}-${index}`,
    faction,
    kind,
    destroyed,
  }));
}

describe('chooseAiCampKind', () => {
  it('builds sword when blue has no surviving frontline camp', () => {
    expect(chooseAiCampKind([], [])).toBe('sword');
  });

  it('builds archer after establishing a frontline', () => {
    expect(chooseAiCampKind(camps(['shield'], 'blue'), [])).toBe('archer');
  });

  it('builds medic after establishing frontline and archer camps', () => {
    expect(chooseAiCampKind(camps(['sword', 'archer'], 'blue'), [])).toBe('medic');
  });

  it('chooses bomb against two shield camps', () => {
    const blue = camps(['sword', 'archer', 'medic'], 'blue');
    const red = camps(['shield', 'shield'], 'red');

    expect(chooseAiCampKind(blue, red)).toBe('bomb');
  });

  it('chooses javelin against two artillery camps', () => {
    const blue = camps(['sword', 'archer', 'medic'], 'blue');
    const red = camps(['artillery', 'artillery'], 'red');

    expect(chooseAiCampKind(blue, red)).toBe('javelin');
  });

  it('ignores destroyed blue camps when checking the base structure', () => {
    const blue = [
      ...camps(['sword'], 'blue', true),
      ...camps(['archer', 'medic'], 'blue'),
    ];

    expect(chooseAiCampKind(blue, [])).toBe('sword');
  });

  it('ignores destroyed red camps when scoring counters', () => {
    const blue = camps(['sword', 'archer', 'medic'], 'blue');
    const red = camps(['shield', 'shield'], 'red', true);

    expect(chooseAiCampKind(blue, red)).toBe(chooseAiCampKind(blue, []));
  });

  it('uses fixed order to resolve scoring ties deterministically', () => {
    const blue = camps(['sword', 'archer', 'medic'], 'blue');

    expect(Array.from(
      { length: 10 },
      () => chooseAiCampKind(blue, []),
    )).toEqual(Array(10).fill('shield'));
  });
});
