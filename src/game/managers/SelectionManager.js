export class SelectionManager {
    constructor() {
        this.selectedId = null;
        this.listeners = new Set();
    }
    getSelectedId() {
        return this.selectedId;
    }
    select(id) {
        if (this.selectedId === id)
            return;
        this.selectedId = id;
        this.emit();
    }
    clear() {
        if (this.selectedId === null)
            return;
        this.selectedId = null;
        this.emit();
    }
    onChange(cb) {
        this.listeners.add(cb);
    }
    emit() {
        for (const cb of this.listeners)
            cb(this.selectedId);
    }
}
