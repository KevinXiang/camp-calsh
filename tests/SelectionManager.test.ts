import { describe, it, expect } from 'vitest';
import { SelectionManager } from '../src/game/managers/SelectionManager';

describe('SelectionManager', () => {
  it('初始无选中', () => {
    const sm = new SelectionManager();
    expect(sm.getSelectedId()).toBeNull();
  });

  it('select 后可取回 id', () => {
    const sm = new SelectionManager();
    sm.select('c1');
    expect(sm.getSelectedId()).toBe('c1');
  });

  it('select 同一 id 不重复触发变化（幂等）', () => {
    const sm = new SelectionManager();
    const changes: (string | null)[] = [];
    sm.onChange((id) => changes.push(id));
    sm.select('c1');
    sm.select('c1');
    expect(changes).toEqual(['c1']);
  });

  it('clear 后回到 null 并触发变化', () => {
    const sm = new SelectionManager();
    sm.select('c1');
    const changes: (string | null)[] = [];
    sm.onChange((id) => changes.push(id));
    sm.clear();
    expect(sm.getSelectedId()).toBeNull();
    expect(changes).toEqual([null]);
  });

  it('clear 空选中不触发变化', () => {
    const sm = new SelectionManager();
    const changes: (string | null)[] = [];
    sm.onChange((id) => changes.push(id));
    sm.clear();
    expect(changes).toEqual([]);
  });
});
