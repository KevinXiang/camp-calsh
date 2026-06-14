import { CAMP_DEFS } from '../../config/camps';
import { UNIT_DEFS } from '../../config/units';
export class CampManager {
    constructor(gs) {
        this.gs = gs;
    }
    step(dt) {
        for (const c of this.gs.camps.values()) {
            if (c.destroyed)
                continue;
            if (c.aliveUnits >= (CAMP_DEFS[c.kind]?.unitCap ?? 20))
                continue;
            c.spawnTimer -= dt;
            if (c.spawnTimer <= 0) {
                const def = CAMP_DEFS[c.kind];
                const udef = UNIT_DEFS[c.kind];
                const factor = [1, 0.85, 0.70][c.upgrades.production - 1] ?? 1;
                c.spawnTimer += def.spawnInterval * factor;
                const unit = {
                    id: crypto.randomUUID(), faction: c.faction, kind: c.kind, campId: c.id,
                    x: c.x + (Math.random() - 0.5) * 30, y: c.y + (Math.random() - 0.5) * 30,
                    hp: udef.maxHp, maxHp: udef.maxHp, attack: udef.attack,
                    attackRange: udef.attackRange, attackInterval: udef.attackInterval, moveSpeed: udef.moveSpeed,
                    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0,
                };
                this.gs.addUnit(unit);
                c.aliveUnits++;
            }
        }
    }
}
