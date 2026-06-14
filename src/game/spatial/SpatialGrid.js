export class SpatialGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    insert(e) {
        const k = this.cellKey(e.x, e.y);
        const arr = this.cells.get(k) ?? [];
        arr.push(e);
        this.cells.set(k, arr);
    }
    rebuild(entities) {
        this.cells.clear();
        for (const e of entities)
            this.insert(e);
    }
    queryCircle(x, y, radius) {
        const sqrR = radius * radius;
        const result = [];
        const minCX = Math.floor((x - radius) / this.cellSize);
        const maxCX = Math.floor((x + radius) / this.cellSize);
        const minCY = Math.floor((y - radius) / this.cellSize);
        const maxCY = Math.floor((y + radius) / this.cellSize);
        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cy = minCY; cy <= maxCY; cy++) {
                const k = cx * 1000003 + cy;
                for (const e of this.cells.get(k) ?? []) {
                    const dx = e.x - x;
                    const dy = e.y - y;
                    if (dx * dx + dy * dy <= sqrR)
                        result.push(e);
                }
            }
        }
        return result;
    }
    cellKey(x, y) {
        return Math.floor(x / this.cellSize) * 1000003 + Math.floor(y / this.cellSize);
    }
}
