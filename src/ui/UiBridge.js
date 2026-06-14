export class UiBridge {
    constructor() {
        this.listeners = {
            placementChanged: new Set(),
            selectionChanged: new Set(),
            simChanged: new Set(),
            statsChanged: new Set(),
            gameOver: new Set(),
        };
        this.selection = { faction: 'red', kind: null };
        this.selectedCampId = null;
        this.gameOverFaction = null;
    }
    getSelection() {
        return this.selection;
    }
    selectFaction(f) {
        this.selection.faction = f;
        this.emit('placementChanged');
    }
    selectCampKind(k) {
        this.selection.kind = k;
        this.emit('placementChanged');
    }
    getSelectedCampId() {
        return this.selectedCampId;
    }
    selectCamp(id) {
        this.selectedCampId = id;
        this.emit('selectionChanged');
    }
    deleteSelected(scene) {
        if (this.selectedCampId) {
            scene.exposeGameState().removeCamp(this.selectedCampId);
            scene.refreshViews();
            this.selectedCampId = null;
            this.emit('selectionChanged');
        }
    }
    setRunning(b, gs) {
        gs.sim.running = b;
        this.emit('simChanged');
    }
    setSpeed(s, gs) {
        gs.sim.speed = s;
        this.emit('simChanged');
    }
    /** 宣布胜方：停止模拟并触发胜利界面 */
    declareGameOver(winner, gs) {
        if (this.gameOverFaction !== null)
            return; // 只宣布一次
        this.gameOverFaction = winner;
        gs.sim.running = false;
        this.emit('simChanged');
        this.emit('gameOver');
    }
    getGameOver() {
        return this.gameOverFaction;
    }
    on(event, cb) {
        this.listeners[event].add(cb);
    }
    emit(event) {
        for (const cb of this.listeners[event])
            cb();
    }
}
