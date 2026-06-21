export const HOVER_DELAY_MS = 2000;

export interface HoverState {
  /** 当前累计停留毫秒（仅当 hoveredId !== null 时有意义） */
  accumMs: number;
  /** 当前悬停的军营 id */
  hoveredId: string | null;
  /** tooltip 是否已显示（避免重复 show） */
  shown: boolean;
}

export type HoverAction =
  | { type: 'none' }
  | { type: 'show'; campId: string }
  | { type: 'clear' };

export interface HoverStepResult {
  state: HoverState;
  action: HoverAction;
}

export function createHoverState(): HoverState {
  return { accumMs: 0, hoveredId: null, shown: false };
}

/**
 * 推进一步悬停状态。
 *
 * 三类转换：
 *  - 进入（null → camp）：本帧 delta 计入累计，并立即检查阈值。
 *  - 切换（campA → campB）：若已显示则先 clear，重置累计为 0（鼠标在两营之间
 *    移动，本帧不算停留），不在本帧检查阈值。
 *  - 离开（camp → null）：若已显示则 clear，重置累计。
 *
 * 持续命中同一军营时累加 delta，首次达阈值触发 show（之后不重复）。
 */
export function stepHover(state: HoverState, hitId: string | null, deltaMs: number): HoverStepResult {
  // 持续命中同一目标（含持续未命中）
  if (hitId === state.hoveredId) {
    if (hitId === null) {
      return { state, action: { type: 'none' } };
    }
    const accumMs = state.accumMs + deltaMs;
    if (!state.shown && accumMs >= HOVER_DELAY_MS) {
      return {
        state: { accumMs, hoveredId: hitId, shown: true },
        action: { type: 'show', campId: hitId },
      };
    }
    return { state: { ...state, accumMs }, action: { type: 'none' } };
  }

  // 命中目标发生变化
  if (hitId === null) {
    // 离开：已显示则 clear，重置
    const wasShown = state.shown;
    return {
      state: createHoverState(),
      action: wasShown ? { type: 'clear' } : { type: 'none' },
    };
  }

  if (state.hoveredId === null) {
    // 进入：本帧 delta 计入累计
    const accumMs = deltaMs;
    if (accumMs >= HOVER_DELAY_MS) {
      return {
        state: { accumMs, hoveredId: hitId, shown: true },
        action: { type: 'show', campId: hitId },
      };
    }
    return {
      state: { accumMs, hoveredId: hitId, shown: false },
      action: { type: 'none' },
    };
  }

  // 切换：已显示则 clear，重置累计为 0（本帧不计入），不检查阈值
  const wasShown = state.shown;
  return {
    state: { accumMs: 0, hoveredId: hitId, shown: false },
    action: wasShown ? { type: 'clear' } : { type: 'none' },
  };
}
