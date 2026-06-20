# 军营悬停提示框（Camp Tooltip）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鼠标悬停军营 2 秒后弹出固定位置 DOM 提示框，展示该军营与所产兵种的详细属性（含派生指标）。

**Architecture:** 遵循现有分层：`SelectionInput`（输入层）做悬停检测与 2 秒自然时间计时 → 通过 `UiBridge` 新增的 `hoverCamp`/`hoverChanged` 通信 → `CampTooltip`（DOM UI 层）读取静态 `CAMP_DEFS`/`UNIT_DEFS` 渲染。派生指标与计时逻辑抽成纯函数/纯状态机，便于在 node 环境下 TDD（项目测试环境为 `environment: 'node'`，DOM 渲染按现有惯例手动验证）。

**Tech Stack:** TypeScript、Phaser 3（输入/场景）、原生 DOM、Vitest。

**Spec:** `docs/superpowers/specs/2026-06-20-camp-tooltip-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/ui/campTooltipData.ts` | 新增 | 纯函数 `computeUnitMetrics(def)` + 军营/兵种显示文本常量 |
| `src/ui/CampTooltip.ts` | 新增 | DOM 提示框组件（监听 `hoverChanged`，渲染） |
| `src/ui/UiBridge.ts` | 修改 | 加 `hoveredKind` 状态、`hoverCamp`/`getHoveredCampKind`、`hoverChanged` 事件 |
| `src/game/managers/SelectionInput.ts` | 修改 | 抽 `pickCampAt`、加 `pointermove` 悬停检测 + `update(deltaMs)` 计时 |
| `src/game/managers/hoverStateMachine.ts` | 新增 | 纯状态机 `stepHover(state, hitId, deltaMs)` → 返回新状态与是否应触发 hover/clear |
| `src/game/BattleScene.ts` | 修改 | 在 `update` 中调用 `this.selectionInput.update(deltaMs)` |
| `src/ui/ui.css` | 修改 | `#camp-tooltip` 及子元素样式 |
| `src/main.ts` | 修改 | 实例化 `CampTooltip(bridge)` |
| `tests/campTooltipData.test.ts` | 新增 | 测 `computeUnitMetrics` |
| `tests/hoverStateMachine.test.ts` | 新增 | 测悬停计时状态机 |

---

## Task 1: 派生指标纯函数 `computeUnitMetrics`

**Files:**
- Create: `src/ui/campTooltipData.ts`
- Test: `tests/campTooltipData.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// tests/campTooltipData.test.ts
import { describe, it, expect } from 'vitest';
import { computeUnitMetrics } from '../src/ui/campTooltipData';
import { UNIT_DEFS } from '../src/config/units';

describe('computeUnitMetrics', () => {
  it('剑兵: DPS=10，近战档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.sword);
    expect(m.dps).toBeCloseTo(10, 2); // 10 / 1.0
    expect(m.rangeClass).toBe('近战'); // range 35 < 60
  });

  it('弓兵: DPS≈6.67，远程档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.archer);
    expect(m.dps).toBeCloseTo(6.67, 1); // 8 / 1.2
    expect(m.rangeClass).toBe('远程'); // range 180 > 150
  });

  it('炸弹兵: DPS=6，中程档（range 120）', () => {
    const m = computeUnitMetrics(UNIT_DEFS.bomb);
    expect(m.dps).toBeCloseTo(6, 2); // 15 / 2.5
    expect(m.rangeClass).toBe('中程'); // 60 <= 120 <= 150
  });

  it('医疗兵: attack=0 → DPS=0，range=150 属中程档', () => {
    const m = computeUnitMetrics(UNIT_DEFS.medic);
    expect(m.dps).toBe(0);
    expect(m.rangeClass).toBe('中程'); // range 150，按 60<=range<=150 规则属"中程"
  });

  it('盾兵 range=35 属近战档', () => {
    expect(computeUnitMetrics(UNIT_DEFS.shield).rangeClass).toBe('近战');
  });

  it('标枪 range=150 属中程档（边界含右端）', () => {
    expect(computeUnitMetrics(UNIT_DEFS.javelin).rangeClass).toBe('中程');
  });

  it('火炮 range=250 属远程档', () => {
    expect(computeUnitMetrics(UNIT_DEFS.artillery).rangeClass).toBe('远程');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/campTooltipData.test.ts`
Expected: FAIL（模块不存在 / 函数未定义）

- [ ] **Step 3: 实现纯函数**

```typescript
// src/ui/campTooltipData.ts
import type { UnitDef } from '../game/types';

/** 射程分档边界（含两端）：<60 近战，60..150 中程，>150 远程 */
function classifyRange(range: number): '近战' | '中程' | '远程' {
  if (range < 60) return '近战';
  if (range <= 150) return '中程';
  return '远程';
}

export interface UnitMetrics {
  /** 每秒伤害 = attack / attackInterval；attack 为 0 时为 0 */
  dps: number;
  /** 射程分档标签 */
  rangeClass: '近战' | '中程' | '远程';
}

export function computeUnitMetrics(def: UnitDef): UnitMetrics {
  const dps = def.attackInterval > 0 ? def.attack / def.attackInterval : 0;
  return { dps, rangeClass: classifyRange(def.attackRange) };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/campTooltipData.test.ts`
Expected: PASS（全部通过）

- [ ] **Step 5: 提交**

```bash
git add src/ui/campTooltipData.ts tests/campTooltipData.test.ts
git commit -m "feat(camp-tooltip): 派生指标纯函数 computeUnitMetrics"
```

---

## Task 2: 悬停计时状态机 `stepHover`

**Files:**
- Create: `src/game/managers/hoverStateMachine.ts`
- Test: `tests/hoverStateMachine.test.ts`

把"命中军营 id + 自然时间 deltaMs"映射为状态变更与对外动作。纯函数，无 Phaser 依赖，可单测。

- [ ] **Step 1: 写失败测试**

```typescript
// tests/hoverStateMachine.test.ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/hoverStateMachine.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现状态机**

```typescript
// src/game/managers/hoverStateMachine.ts
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
 * @param state 当前状态
 * @param hitId 本帧鼠标命中的军营 id（null 表示未命中任何军营）
 * @param deltaMs 自然时间增量（毫秒）
 * @returns 新状态与应执行的动作
 */
export function stepHover(state: HoverState, hitId: string | null, deltaMs: number): HoverStepResult {
  // 命中目标变化：先清算（若已 shown 则 clear），再重置为新目标
  if (hitId !== state.hoveredId) {
    const wasShown = state.shown;
    const next: HoverState = { accumMs: 0, hoveredId: hitId, shown: false };
    return { state: next, action: wasShown ? { type: 'clear' } : { type: 'none' } };
  }

  // 命中目标不变
  if (hitId === null) {
    // 持续未命中：无事可做
    return { state, action: { type: 'none' } };
  }

  // 持续命中同一军营：累计时间
  const accumMs = state.accumMs + deltaMs;
  if (!state.shown && accumMs >= HOVER_DELAY_MS) {
    const next: HoverState = { accumMs, hoveredId: hitId, shown: true };
    return { state: next, action: { type: 'show', campId: hitId } };
  }

  // 尚未达阈值，或已 shown 继续停留
  return { state: { ...state, accumMs }, action: { type: 'none' } };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/hoverStateMachine.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/game/managers/hoverStateMachine.ts tests/hoverStateMachine.test.ts
git commit -m "feat(camp-tooltip): 悬停计时状态机 stepHover"
```

---

## Task 3: UiBridge 新增 hover 状态与事件

**Files:**
- Modify: `src/ui/UiBridge.ts`

- [ ] **Step 1: 在 `EventName` 联合类型中加入 `hoverChanged`**

把 `src/ui/UiBridge.ts:9` 的类型改为：

```typescript
type EventName = 'placementChanged' | 'selectionChanged' | 'simChanged' | 'statsChanged' | 'gameOver' | 'hoverChanged';
```

- [ ] **Step 2: 在 `listeners` 初始化对象中加入 `hoverChanged`**

把 `src/ui/UiBridge.ts:12-18` 的 `listeners` 字段改为：

```typescript
  private listeners: Record<EventName, Set<() => void>> = {
    placementChanged: new Set(),
    selectionChanged: new Set(),
    simChanged: new Set(),
    statsChanged: new Set(),
    gameOver: new Set(),
    hoverChanged: new Set(),
  };
```

- [ ] **Step 3: 加入 hover 状态字段与公开方法**

在 `src/ui/UiBridge.ts:19-21`（`selection` 等字段附近）加入字段：

```typescript
  private hoveredKind: CampKind | null = null;
```

> 注意：文件顶部已 `import type { Faction, CampKind }`，无需新增 import。

在 `getSelectedCampId()` 方法附近（约 `src/ui/UiBridge.ts:37` 之后）加入方法：

```typescript
  getHoveredCampKind(): CampKind | null {
    return this.hoveredKind;
  }

  hoverCamp(kind: CampKind | null): void {
    if (this.hoveredKind === kind) return;
    this.hoveredKind = kind;
    this.emit('hoverChanged');
  }
```

- [ ] **Step 4: 运行现有测试确认未破坏**

Run: `npx vitest run`
Expected: 所有现有测试 PASS（UiBridge 无直接单测，但应不引入编译错误）

- [ ] **Step 5: 提交**

```bash
git add src/ui/UiBridge.ts
git commit -m "feat(camp-tooltip): UiBridge 新增 hoverCamp 状态与 hoverChanged 事件"
```

---

## Task 4: `CampTooltip` DOM 组件

**Files:**
- Create: `src/ui/CampTooltip.ts`
- Modify: `src/ui/ui.css`
- Modify: `src/main.ts`

> 此任务为 DOM 渲染层，按项目惯例（测试环境为 node，DOM 组件无单测）手动验证。

- [ ] **Step 1: 实现 `CampTooltip` 组件**

```typescript
// src/ui/CampTooltip.ts
import type { UiBridge } from './UiBridge';
import { CAMP_DEFS } from '../config/camps';
import { UNIT_DEFS } from '../config/units';
import { computeUnitMetrics } from './campTooltipData';
import type { CampKind, UnitDef } from '../game/types';

const KIND_META: Record<CampKind, { icon: string; campName: string; unitName: string }> = {
  sword:     { icon: '⚔️', campName: '剑兵营', unitName: '剑兵' },
  shield:    { icon: '🛡️', campName: '盾兵营', unitName: '盾兵' },
  archer:    { icon: '🏹', campName: '弓兵营', unitName: '弓兵' },
  javelin:   { icon: '🔱', campName: '投矛营', unitName: '投矛兵' },
  bomb:      { icon: '💣', campName: '爆破营', unitName: '炸弹兵' },
  medic:     { icon: '🏥', campName: '医疗营', unitName: '医疗兵' },
  artillery: { icon: '💥', campName: '火炮营', unitName: '炮兵' },
};

const ATTACK_TYPE_LABEL: Record<UnitDef['attackType'], string> = {
  melee: '近战',
  ranged: '远程',
};

export class CampTooltip {
  private root: HTMLDivElement;

  constructor(private bridge: UiBridge) {
    const el = document.createElement('div');
    el.id = 'camp-tooltip';
    el.className = 'ui';
    el.style.display = 'none';
    this.root = el;
    document.body.append(el);

    bridge.on('hoverChanged', () => this.render());
    this.render();
  }

  private render(): void {
    const kind = this.bridge.getHoveredCampKind();
    if (!kind) {
      this.root.style.display = 'none';
      return;
    }
    this.root.innerHTML = this.buildHtml(kind);
    this.root.style.display = '';
  }

  private buildHtml(kind: CampKind): string {
    const meta = KIND_META[kind];
    const camp = CAMP_DEFS[kind];
    const unit = UNIT_DEFS[kind];
    const m = computeUnitMetrics(unit);

    const rows: string[] = [];
    rows.push(`<div class="tooltip-header">${meta.icon} ${meta.campName}</div>`);
    rows.push(this.section('军营'));
    rows.push(this.row('生命值', String(camp.maxHp)));
    rows.push(this.row('生产间隔', `${camp.spawnInterval.toFixed(1)}s`));
    rows.push(this.row('兵力上限', String(camp.unitCap)));

    rows.push(this.section(`兵种 ${meta.unitName}`));
    rows.push(this.row('类型', ATTACK_TYPE_LABEL[unit.attackType]));
    rows.push(this.row('生命', String(unit.maxHp)));
    rows.push(this.row('攻击', String(unit.attack)));
    rows.push(this.row('射程', `${unit.attackRange} (${m.rangeClass})`));
    rows.push(this.row('攻速', `${unit.attackInterval.toFixed(1)}s`));
    rows.push(this.row('移速', String(unit.moveSpeed)));
    rows.push(this.row('DPS', m.dps.toFixed(1)));

    // 医疗兵特殊属性（有则显示）
    if (unit.healAmount !== undefined || unit.poisonDamage !== undefined) {
      rows.push(this.section('医疗兵'));
      if (unit.healAmount !== undefined) rows.push(this.row('治疗量', `${unit.healAmount} / 次`));
      if (unit.healSearchRange !== undefined) rows.push(this.row('治疗范围', String(unit.healSearchRange)));
      if (unit.poisonDamage !== undefined) rows.push(this.row('毒伤', `${unit.poisonDamage} / 秒`));
      if (unit.poisonDuration !== undefined) rows.push(this.row('毒雾持续', `${unit.poisonDuration.toFixed(1)}s`));
      if (unit.poisonRange !== undefined) rows.push(this.row('毒雾范围', String(unit.poisonRange)));
      if (unit.poisonCooldown !== undefined) rows.push(this.row('毒雾冷却', `${unit.poisonCooldown.toFixed(1)}s`));
    }

    return rows.join('');
  }

  private section(title: string): string {
    return `<div class="tooltip-section">${title}</div>`;
  }

  private row(label: string, val: string): string {
    return `<div class="tooltip-row"><span class="tooltip-label">${label}</span><span class="tooltip-val">${val}</span></div>`;
  }
}
```

- [ ] **Step 2: 在 `src/ui/ui.css` 末尾追加样式**

```css
/* ===== 军营悬停提示框 ===== */
#camp-tooltip {
  top: 360px; right: 12px; width: 220px;
  background: rgba(0,0,0,0.5); padding: 10px 12px;
  border-radius: 8px; color: #fff; font-size: 13px;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}
#camp-tooltip .tooltip-header {
  font-size: 15px; font-weight: bold; margin-bottom: 6px;
  padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.25);
}
#camp-tooltip .tooltip-section {
  font-size: 12px; color: #ffeb3b; margin-top: 8px; margin-bottom: 2px;
  letter-spacing: 0.5px;
}
#camp-tooltip .tooltip-row {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 1px 0;
}
#camp-tooltip .tooltip-label { color: rgba(255,255,255,0.65); }
#camp-tooltip .tooltip-val { color: #fff; font-weight: bold; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: 在 `src/main.ts` 实例化 `CampTooltip`**

在 `src/main.ts:9`（import 区）加入：

```typescript
import { CampTooltip } from './ui/CampTooltip';
```

在 `src/main.ts:32`（`new VictoryOverlay(bridge);` 之前）加入：

```typescript
  new CampTooltip(bridge);
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npx tsc -b --noEmit`
Expected: 无错误（如 tsc 项目配置用了 `tsc -b`，可改跑 `npm run build` 的前半部分；若报错需修正类型）

- [ ] **Step 5: 提交**

```bash
git add src/ui/CampTooltip.ts src/ui/ui.css src/main.ts
git commit -m "feat(camp-tooltip): DOM 提示框组件 CampTooltip"
```

---

## Task 5: `SelectionInput` 悬停检测集成

**Files:**
- Modify: `src/game/managers/SelectionInput.ts`
- Modify: `src/game/BattleScene.ts`

把 `pickCamp` 抽为 `pickCampAt`，接入 `pointermove` + 状态机 + `update(deltaMs)`，并把 kind 通过 `bridge.hoverCamp` 推给 UI。

- [ ] **Step 1: 重构 `SelectionInput`，接入状态机与悬停检测**

把整个 `src/game/managers/SelectionInput.ts` 替换为：

```typescript
import Phaser from 'phaser';
import type { BattleScene } from '../BattleScene';
import type { UiBridge } from '../../ui/UiBridge';
import { createHoverState, stepHover } from './hoverStateMachine';

export class SelectionInput {
  private hoverState = createHoverState();
  private currentHitId: string | null = null;

  constructor(
    private scene: BattleScene,
    private bridge: UiBridge,
  ) {
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      if (bridge.getSelection().kind !== null) return;
      const camp = this.pickCampAt(p.worldX, p.worldY);
      bridge.selectCamp(camp ?? null);
    });

    scene.input.keyboard?.on('keydown-DELETE', () => {
      bridge.deleteSelected(scene);
    });

    // 悬停检测：每次移动更新当前命中军营，实际计时在 update() 中推进
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.currentHitId = this.pickCampAt(p.worldX, p.worldY);
    });
  }

  /** 每帧由场景调用，推进悬停计时（自然时间，不受暂停/倍速影响） */
  update(deltaMs: number): void {
    const r = stepHover(this.hoverState, this.currentHitId, deltaMs);
    this.hoverState = r.state;
    if (r.action.type === 'show') {
      const camp = this.scene.exposeGameState().getCamp(r.action.campId);
      this.bridge.hoverCamp(camp ? camp.kind : null);
    } else if (r.action.type === 'clear') {
      this.bridge.hoverCamp(null);
    }
  }

  private pickCampAt(wx: number, wy: number): string | null {
    const gs = this.scene.exposeGameState();
    let best: { id: string; d: number } | null = null;
    for (const c of gs.allCamps()) {
      const d = Phaser.Math.Distance.Between(wx, wy, c.x, c.y);
      if (d < 40 && (best === null || d < best.d)) {
        best = { id: c.id, d };
      }
    }
    return best?.id ?? null;
  }
}
```

- [ ] **Step 2: 在 `BattleScene.update` 中调用 `selectionInput.update`**

在 `src/game/BattleScene.ts:99` 的 `update(_time: number, deltaMs: number)` 方法开头（`const cam = this.cameras.main;` 之前或之后均可）加入一行：

```typescript
    this.selectionInput.update(deltaMs);
```

完整上下文（`update` 方法开头应类似）：

```typescript
  update(_time: number, deltaMs: number): void {
    this.selectionInput.update(deltaMs);
    const cam = this.cameras.main;
    this.ground.tilePositionX = cam.scrollX;
    // ...其余不变
```

- [ ] **Step 3: 类型检查 + 全量测试**

Run: `npx tsc -b --noEmit && npx vitest run`
Expected: 无类型错误，全部测试 PASS

- [ ] **Step 4: 提交**

```bash
git add src/game/managers/SelectionInput.ts src/game/BattleScene.ts
git commit -m "feat(camp-tooltip): SelectionInput 悬停检测与 2s 计时集成"
```

---

## Task 6: 手动验证与收尾

**Files:** 无（验证为主）

- [ ] **Step 1: 启动 dev server 手动验证**

Run: `npm run dev`
打开浏览器，验证以下场景：
1. 鼠标停在某个军营上不动 → 约 2 秒后右侧（InfoPanel 下方）弹出提示框，内容含军营与兵种属性、DPS、射程分档。
2. 鼠标移开军营 → 提示框立即消失。
3. 在两个军营间快速移动 → 不应误弹；停下 2 秒才弹。
4. 悬停医疗营 → 出现"医疗兵"区块（治疗量/毒伤等）。
5. 悬停已摧毁军营 → 仍能显示其属性（静态定义）。
6. 拖拽建造过程中（选中兵种后）悬停军营 → 提示框仍正常显示，不冲突。
7. 右键拖拽平移地图时 → 不影响（平移仅 isPanning 时生效）。
8. 暂停游戏（空格）后悬停 → 约 2 秒仍弹（自然时间，不受暂停影响）。

- [ ] **Step 2: 修正发现的问题（如有）**

记录并修复手动验证中发现的任何问题，再次验证。

- [ ] **Step 3: 最终全量测试 + 提交（如有改动）**

Run: `npx vitest run`
Expected: 全部 PASS

若有改动：
```bash
git add -A
git commit -m "fix(camp-tooltip): 手动验证修正"
```

---

## 完成标准

- [ ] `computeUnitMetrics` 与 `stepHover` 纯函数测试全部通过
- [ ] `tsc -b --noEmit` 无错误
- [ ] `npx vitest run` 全部通过（含原有测试）
- [ ] 手动验证 8 个场景全部符合预期
- [ ] 所有改动已分任务提交（6 个 commit）
