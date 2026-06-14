import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialGrid } from '../src/game/spatial/SpatialGrid';
describe('SpatialGrid', () => {
    let grid;
    beforeEach(() => { grid = new SpatialGrid(80); });
    it('空网格查不到', () => {
        expect(grid.queryCircle(0, 0, 100)).toEqual([]);
    });
    it('insert 后可查到', () => {
        const e = { id: 'a', x: 50, y: 50 };
        grid.insert(e);
        expect(grid.queryCircle(0, 0, 100)).toEqual([e]);
    });
    it('范围外查不到', () => {
        grid.insert({ id: 'a', x: 0, y: 0 });
        expect(grid.queryCircle(200, 200, 10)).toEqual([]);
    });
    it('跨 cell 查询', () => {
        const ents = [
            { id: 'a', x: 10, y: 10 }, { id: 'b', x: 100, y: 10 },
            { id: 'c', x: 10, y: 100 }, { id: 'd', x: 200, y: 200 },
        ];
        for (const e of ents)
            grid.insert(e);
        const ids = grid.queryCircle(10, 10, 120).map(e => e.id).sort();
        expect(ids).toEqual(['a', 'b', 'c']);
    });
    it('rebuild 替换全部', () => {
        grid.insert({ id: 'a', x: 10, y: 10 });
        grid.rebuild([{ id: 'b', x: 100, y: 100 }]);
        expect(grid.queryCircle(100, 100, 10).map(e => e.id)).toEqual(['b']);
        expect(grid.queryCircle(10, 10, 10)).toEqual([]);
    });
});
