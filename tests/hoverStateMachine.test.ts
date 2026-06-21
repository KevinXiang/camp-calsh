import { describe, it, expect } from 'vitest';
import { createHoverState, stepHover } from '../src/game/managers/hoverStateMachine';

const CAMP_A = 'camp-a';
const CAMP_B = 'camp-b';

describe('hoverStateMachine', () => {
  it('初始状态：无动作', () => {
    const s = createHoverState();
    expect(stepHover(s, null, 100).action).toEqual({ type: 'none' });
  });

  it('悬停同一军营 < 2s 不触发', () => {
    const s = createHoverState();
    let r = stepHover(s, CAMP_A, 1000);
    expect(r.action).toEqual({ type: 'none' });
    r = stepHover(r.state, CAMP_A, 500); // 累计 1500ms
    expect(r.action).toEqual({ type: 'none' });
  });

  it('累计达 2000ms 触发 show（带 campId）', () => {
    const s = createHoverState();
    let r = stepHover(s, CAMP_A, 1500);
    expect(r.action.type).toBe('none');
    r = stepHover(r.state, CAMP_A, 500); // 累计 2000ms，首次达阈值
    expect(r.action).toEqual({ type: 'show', campId: CAMP_A });
  });

  it('触发 show 后继续停留不再重复触发', () => {
    const s = createHoverState();
    let r = stepHover(s, CAMP_A, 2000);
    expect(r.action.type).toBe('show');
    r = stepHover(r.state, CAMP_A, 1000);
    expect(r.action).toEqual({ type: 'none' });
  });

  it('切换到另一军营：先 clear（若有已显示），再重置计时', () => {
    const s = createHoverState();
    let r = stepHover(s, CAMP_A, 2000); // show A
    expect(r.action.type).toBe('show');
    r = stepHover(r.state, CAMP_B, 10); // 切到 B
    expect(r.action).toEqual({ type: 'clear' });
    // 之后 B 需重新累计 2s
    r = stepHover(r.state, CAMP_B, 1990);
    expect(r.action.type).toBe('none');
    r = stepHover(r.state, CAMP_B, 20);
    expect(r.action).toEqual({ type: 'show', campId: CAMP_B });
  });

  it('从有命中切到无命中（鼠标移开）：触发 clear 并重置', () => {
    const s = createHoverState();
    let r = stepHover(s, CAMP_A, 2000); // show A
    r = stepHover(r.state, null, 10);   // 移开
    expect(r.action).toEqual({ type: 'clear' });
    // 再次移开不重复 clear
    r = stepHover(r.state, null, 10);
    expect(r.action).toEqual({ type: 'none' });
  });

  it('从未 show 就移开：不触发 clear（无需关闭未打开的框）', () => {
    const s = createHoverState();
    let r = stepHover(s, CAMP_A, 500);  // 还没到 2s
    r = stepHover(r.state, null, 10);   // 移开
    expect(r.action).toEqual({ type: 'none' });
  });

  it('deltaMs 过大单帧也不误触（仅恰好累计到阈值才触发）', () => {
    const s = createHoverState();
    const r = stepHover(s, CAMP_A, 5000); // 一帧跳过阈值
    expect(r.action).toEqual({ type: 'show', campId: CAMP_A });
    expect(r.state.accumMs).toBe(5000);
  });
});
