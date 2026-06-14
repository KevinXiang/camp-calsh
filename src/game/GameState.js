export class GameState {
    constructor() {
        this.camps = new Map();
        this.units = new Map();
        this.projectiles = [];
        this.events = [];
        this.sim = { running: false, speed: 1, timeMs: 0 };
        this.stats = {
            red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
            blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
        };
    }
    addCamp(camp) { this.camps.set(camp.id, camp); }
    removeCamp(id) { this.camps.delete(id); }
    getCamp(id) { return this.camps.get(id); }
    allCamps() { return [...this.camps.values()]; }
    addUnit(unit) { this.units.set(unit.id, unit); }
    removeUnit(id) { this.units.delete(id); }
    getUnit(id) { return this.units.get(id); }
    allUnits() { return [...this.units.values()]; }
}
