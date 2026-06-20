# 军营悬停提示框（Camp Tooltip）设计

**日期**：2026-06-20
**状态**：已批准，待实现

## 1. 背景与目标

游戏中军营和兵种的属性分散在 `src/config/camps.ts` 与 `src/config/units.ts`，玩家在对战中无法直观查看，造成理解成本。

**目标**：当鼠标悬停在某个军营上**持续 2 秒**后，弹出一个固定位置的提示框，展示该军营及其所产兵种的详细属性（含派生指标），帮助玩家快速了解。

## 2. 范围

- **包含**：悬停检测、2 秒延迟、DOM 提示框、基础属性 + 派生指标（DPS、射程分档）、医疗兵特殊属性区块、样式、单元测试。
- **不包含**：悬停单位（仅军营）、画布内绘制、跟随鼠标、显示运行时状态（HP/升级等动态值）——提示框只读静态定义。

## 3. 架构

遵循现有分层（Manager 输入层 → UiBridge 通信 → DOM UI 层）：

```
SelectionInput (悬停检测 + 2s 自然时间计时)
        │  bridge.hoverCamp(kind | null)
        ▼
UiBridge (新增 hover 状态 + hoverChanged 事件)
        │  hoverChanged 事件
        ▼
CampTooltip (DOM 组件，监听事件)
        │  读取 CAMP_DEFS + UNIT_DEFS
        ▼
渲染军营与兵种属性
```

## 4. 组件设计

### 4.1 `SelectionInput` 扩展（`src/game/managers/SelectionInput.ts`）

**新增职责**：悬停检测与 2 秒计时。

- **共享拾取逻辑**：抽出私有方法 `pickCampAt(wx, wy): string | null`，原 `pickCamp` 与新悬停逻辑共用（40px 半径，最近军营优先）。
- **`pointermove` 监听**：每次移动调用 `pickCampAt`，得到当前命中军营 id：
  - 若命中军营**变化**（含从有到无、从无到有、从一个到另一个）→ **重置计时器**，更新 `hoveredCampId`。
  - 计时累积在 `update(deltaMs)` 中进行（见下）。
- **`update(deltaMs)` 新方法**：由 `BattleScene.update` 每帧调用，传入自然时间的 `deltaMs`：
  - 若 `hoveredCampId !== null` 且 `hoverAccumMs < HOVER_DELAY(2000)`：累加 `hoverAccumMs += deltaMs`。
  - 当首次达到 `HOVER_DELAY`：查询该军营 kind，调用 `bridge.hoverCamp(kind)`，标记 `hoverFired = true`。
  - 若 `hoveredCampId === null`：重置 `hoverAccumMs = 0`、`hoverFired = false`，并调用 `bridge.hoverCamp(null)`（确保移开即隐藏）。
- **计时用自然时间**：不受游戏暂停/倍速影响（悬停是 UI 行为）。
- **不干扰点击/拖拽**：悬停检测独立于现有 `pointerdown` 点击选择与 `PlacementController` 拖拽建造；拖拽时 tooltip 仍可正常展示（只读）。

### 4.2 `UiBridge` 扩展（`src/ui/UiBridge.ts`）

新增：
- 状态字段 `private hoveredKind: CampKind | null = null`。
- 方法 `hoverCamp(kind: CampKind | null)`：若与当前相同则不触发；否则更新并 `emit('hoverChanged')`。
- 方法 `getHoveredCampKind(): CampKind | null`。
- 事件 `'hoverChanged'` 加入 `EventName` 联合类型与 listeners 注册表。

### 4.3 `CampTooltip` 组件（`src/ui/CampTooltip.ts`，新增）

- **构造**：创建 DOM 元素（id `#camp-tooltip`，class `ui`），监听 `bridge.on('hoverChanged', ...)`。
- **显示/隐藏**：有 kind → `display:block` 并渲染；无 → `display:none`。
- **位置**：屏幕右侧固定，紧贴 InfoPanel 下方（`top: 360px; right: 12px; width: 220px`）。
- **数据来源**：`CAMP_DEFS[kind]` + `UNIT_DEFS[kind]`（纯静态定义）。
- **派生指标**：抽纯函数 `computeUnitMetrics(def: UnitDef)`，返回 `{ dps, rangeClass }`：
  - `dps = attack / attackInterval`（attack 为 0 时为 0）。
  - `rangeClass`：`attackRange < 60` → `'近战'`；`60 ≤ attackRange ≤ 150` → `'中程'`；`> 150` → `'远程'`（辅助标注，显示在射程数值后括号内）。

### 4.4 渲染内容布局

```
🏹 弓兵营
────────────────────
【军营】
生命值    450
生产间隔  5.0s
兵力上限  20
【兵种 弓兵】
类型      远程
生命      60
攻击      8
射程      180 (远程)
攻速      1.2s
移速      45
DPS       6.7
```

医疗兵额外显示（有则显示区块，无则省略）：

```
【医疗兵】
治疗量    12 / 次
治疗范围  300
毒伤      8 / 秒
毒雾持续  2.0s
毒雾范围  300
毒雾冷却  3.0s
```

### 4.5 样式（`src/ui/ui.css`）

沿用 `#info-panel` 风格：`rgba(0,0,0,0.5)` 半透明背景、圆角、白字。新增：
- `#camp-tooltip` 容器样式（定位、宽度、内边距、字号）。
- `.tooltip-section`（区块标题，如"【军营】"，加底色或下划线区分）。
- `.tooltip-row`（flex 行：左标签右数值）。
- `.tooltip-label`（灰色，固定宽度对齐）。
- `.tooltip-val`（白色，粗体）。

## 5. 关键决策与边界

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 位置 | 屏幕右侧固定（top:360px） | 与 InfoPanel 一致，不遮挡战场中央 |
| 技术 | HTML/DOM | 与现有 UI 组件一致，布局灵活 |
| 计时基准 | 自然时间 | 悬停是 UI 行为，不应受暂停/倍速影响 |
| 关闭时机 | 鼠标移开即隐藏 | 简单直接，减少遮挡 |
| 军营被摧毁 | 仍可显示属性 | 只读静态定义，服务于"了解属性"目的 |
| 拖拽建造时 | tooltip 正常工作 | 只读展示，不与放置交互冲突 |
| 快速划过多个军营 | 切换即重置计时器 | 避免误触发 |

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/game/managers/SelectionInput.ts` | 修改 | 抽 `pickCampAt`、加 `pointermove` 悬停检测与 `update(deltaMs)` 计时 |
| `src/game/BattleScene.ts` | 修改 | 在 `update` 中调用 `this.selectionInput.update(deltaMs)` |
| `src/ui/UiBridge.ts` | 修改 | 加 `hoveredKind` 状态、`hoverCamp`/`getHoveredCampKind` 方法、`hoverChanged` 事件 |
| `src/ui/CampTooltip.ts` | 新增 | DOM 提示框组件 + `computeUnitMetrics` 纯函数 |
| `src/ui/ui.css` | 修改 | `#camp-tooltip` 及子元素样式 |
| `src/main.ts` | 修改 | 实例化 `CampTooltip(bridge)` |
| `tests/CampTooltip.test.ts` | 新增 | 测试纯函数与 DOM 渲染 |

## 7. 测试策略

- **纯函数 `computeUnitMetrics`**：
  - 各兵种 DPS 计算正确（如 sword: 10/1.0=10，medic: attack 0 → dps 0）。
  - 射程分档正确（sword 35 → 近战，archer 180 → 远程）。
- **DOM 渲染**（jsdom 环境）：
  - `hoverCamp(null)` 时 `display:none`。
  - `hoverCamp('archer')` 时显示弓兵营 + 弓兵字段，DPS 为 6.7。
  - `hoverCamp('medic')` 时额外显示医疗兵区块。
- **悬停计时逻辑**：若 `SelectionInput` 的计时可抽离为纯逻辑，则测试给定 `deltaMs` 序列下何时触发 hover/取消（否则作为集成测试手动验证）。

## 8. 依赖与风险

- **无新依赖**：复用 Phaser `pointermove`、现有 DOM、现有配置。
- **风险**：`pointermove` 与 `BattleScene.setupInput` 中的地图平移 `pointermove` 共存，需确保两者独立（右键拖拽平移 vs 左键/移动悬停检测），互不干扰。当前平移仅在 `isPanning`（右键按下）时生效，悬停检测读 `pointermove` 不依赖按键状态，无冲突。
