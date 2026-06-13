# 《军营大作战》MVP 技术设计 Spec

## 元信息

| 项目 | 内容 |
| ---- | ---- |
| 文档 | 《军营大作战》MVP 技术设计 Spec |
| 版本 | v0.1 |
| 日期 | 2026-06-13 |
| 依据 | [docs/PRD/camp-calsh-prd-v0.1.md](../../PRD/camp-calsh-prd-v0.1.md) |
| 状态 | 设计已评审，待转入实现计划 |
| 项目阶段 | greenfield，尚无代码 |

---

## 1. 概述与范围

本游戏是运行在 Web 浏览器的 **2.5D 红蓝军营放置对战沙盒模拟器**：玩家在无限画布上放置红/蓝军营，军营自动产兵，小兵自动寻敌战斗，玩家通过暂停/加速/升级/清场反复实验战局。

本 Spec 覆盖 **MVP 全部功能**（PRD 第 21 节），技术架构一次性设计到位；实现按 PRD 第 25 节的 5 个阶段分批落地（见第 13 节）。

**非目标（MVP 不做，PRD 21.2）**：复杂地形阻挡、资源经济系统、关卡/剧情模式、英雄单位、联机对战、存档分享、地图编辑器、高级兵种、复杂科技树、天气环境系统、阵型指挥。

---

## 2. 技术栈

| 维度 | 选型 | 说明 |
| ---- | ---- | ---- |
| 渲染/游戏框架 | **Phaser 3** | 完整游戏框架，渲染/输入/资源加载开箱即用 |
| 语言 | **TypeScript** | PRD 数据模型复杂（兵种/升级/统计），类型安全必要 |
| 构建 | **Vite** | 原生 TS、HMR 快、零配置 |
| 实体架构 | **Phaser 原生 GameObject + 配置表** | 顺 Phaser 范式，逻辑层框架无关 |
| UI 层 | **原生 DOM + CSS** | 结构化 HUD/面板；画布内即时反馈用 Phaser |

**纯前端，无后端、无存档（MVP）。**

---

## 3. 总体架构

### 3.1 分层

```
┌─────────────────────────────────────────────┐
│  DOM UI 层 (原生 TS + CSS)                    │   结构化 UI：统计栏/面板/控制栏
│  HudController / BuildPanel / InfoPanel / ... │   通过 UiBridge 与逻辑层双向同步
├─────────────────────────────────────────────┤
│  游戏逻辑层 (框架无关纯 TS，可单元测试)          │
│  GameState + 6 个 Manager                     │   核心：模拟、寻敌、战斗、统计
├─────────────────────────────────────────────┤
│  Phaser 层 (渲染 / 输入 / 资源加载)             │
│  BootScene → BattleScene                      │   仅 2 个 Scene，UI 不走 Phaser
└─────────────────────────────────────────────┘
```

**核心原则**：游戏逻辑层是**框架无关的纯 TypeScript**（`GameState` + Manager），不依赖 Phaser API。Phaser 只负责把逻辑层状态画出来 + 捕获输入。这样模拟逻辑可脱离渲染做确定性单元测试。

### 3.2 Scene 划分

仅两个 Phaser Scene：
- `BootScene` — 加载资源（MVP 占位图形可无外部资源）
- `BattleScene` — 主战场，持有各 Manager，驱动模拟主循环

UI 不走 Phaser，用 DOM 叠加在 canvas 之上。

### 3.3 目录结构（建议）

```
src/
  main.ts                      # 入口：创建 Phaser.Game + 挂载 DOM UI
  config/                      # 数据驱动配置表（纯数据）
    camps.ts                   # 4 种军营定义
    units.ts                   # 4 种小兵定义
    upgrades.ts                # 3 类升级系数
    colors.ts                  # 阵营色、血条色
  game/
    types.ts                   # Faction/Camp/Unit/Upgrade 等类型
    GameState.ts               # 共享可变状态
    BattleScene.ts             # 主场景：持有各 Manager，驱动主循环
    SimulationClock.ts         # 暂停/加速/固定步进调度
    managers/
      CampManager.ts           # 军营数据 + 自动产兵
      UnitManager.ts           # 小兵更新 + 空间分区寻敌
      CombatSystem.ts          # 伤害结算 + 军营摧毁
      SelectionManager.ts      # 选中对象
      StatsTracker.ts          # 战局统计
      PlacementController.ts   # 放置预览 + 合法性校验
    spatial/
      SpatialGrid.ts           # 均匀网格空间分区
  ui/                          # 纯 DOM UI
    UiBridge.ts                # UI 与逻辑层唯一边界
    HudController.ts
    BuildPanel.ts
    InfoPanel.ts
    ControlBar.ts
    ui.css
```

---

## 4. 模拟主循环与时间控制

```text
BattleScene.update(time, deltaMs):
  steps = SimulationClock.consume(deltaMs)
        // 暂停 → 0 步
        // 1x   → floor(累积余数 / FIXED_DT)
        // 2x   → ×2，4x → ×4
        // 余数跨帧累积，避免抖动
        // 单帧 steps 钳制 ≤ MAX_STEPS(10)，防 tab 切回卡死
  for i in steps:
    CampManager.step(FIXED_DT)
    UnitManager.step(FIXED_DT)
    CombatSystem.step(FIXED_DT)
  StatsTracker 在变更点即时累加；DOM HUD 节流刷新
  // 渲染：Phaser 自动按当前 GameState 绘制
```

- `FIXED_DT ≈ 16.67ms`（60Hz）固定不变。
- **加速靠「每帧多跑几步」而非缩短 dt** → 2x/4x 下战斗结果与 1x 完全一致，仅更快。
- 暂停时三个 Manager 不 step，但 `PlacementController` / `SelectionManager` 照常工作（满足 PRD「暂停可放置/删除/升级」）。
- `MAX_STEPS` 钳制：缺失的时间在后续帧逐步补齐，避免单帧卡死。

---

## 5. 数据模型与配置表

### 5.1 核心类型（`game/types.ts`）

```ts
type Faction = 'red' | 'blue';
type CampKind = 'sword' | 'shield' | 'archer' | 'javelin';  // 军营 4 种，与兵种一一对应
type UnitKind = CampKind;
type AttackType = 'melee' | 'ranged';
type UpgradeType = 'production' | 'health' | 'weapon';
```

### 5.2 配置表（`config/`，PRD 数值照搬）

**小兵 `units.ts`**（PRD 9.3）—— `UnitDef { kind, attackType, maxHp, attack, attackRange, attackInterval, moveSpeed }`：

| UnitKind | 类型 | 生命 | 攻击 | 攻击距离 | 攻击间隔(s) | 移速(px/s) |
| ---- | ---- | --: | --: | --: | --: | --: |
| sword    | melee  | 100 | 10 | 35  | 1.0 | 60 |
| shield   | melee  | 160 | 7  | 35  | 1.2 | 45 |
| archer   | ranged | 60  | 8  | 180 | 1.2 | 45 |
| javelin  | ranged | 70  | 18 | 150 | 2.0 | 40 |

**军营 `camps.ts`**（PRD 8.4）—— `CampDef { kind, produces, maxHp, spawnInterval, unitCap }`，`unitCap = 20`：

| CampKind | 生命 | 产兵间隔(s) | 产出 |
| ---- | --: | --: | ---- |
| sword    | 500 | 4 | sword |
| shield   | 600 | 5 | shield |
| archer   | 450 | 5 | archer |
| javelin  | 450 | 6 | javelin |

**升级 `upgrades.ts`**（PRD 12.4，最高 Lv.3）：

| UpgradeType | Lv.2 | Lv.3 |
| ---- | ---- | ---- |
| production | 产兵间隔 ×0.85 | ×0.70 |
| health | 军营+小兵 maxHp ×1.15 | ×1.30 |
| weapon | 小兵攻击力 ×1.15 | ×1.30 |

### 5.3 运行时实体

```ts
interface Camp {
  id: string;
  faction: Faction;
  kind: CampKind;
  x: number; y: number;            // 世界坐标
  hp: number; maxHp: number;
  spawnTimer: number;              // 距下次产兵剩余秒
  upgrades: Record<UpgradeType, number>;  // 各类当前等级 1-3
  aliveUnits: number;              // 当前存活产出小兵数（≤ unitCap）
  destroyed: boolean;
}

interface Unit {
  id: string;
  faction: Faction;
  kind: UnitKind;
  campId: string;                  // 所属军营
  x: number; y: number;
  hp: number; maxHp: number;
  attack: number;                  // 已含 weapon 升级
  attackRange: number;
  attackInterval: number;
  moveSpeed: number;
  attackTimer: number;             // 距下次可攻击剩余秒
  targetId: string | null;         // 目标 unit/camp id
  state: 'moving' | 'attacking' | 'idle';
  alive: boolean;
  deathTimer: number;              // alive=false 后的淡出倒计时
}
```

> 渲染解耦：逻辑层实体**不持有 Phaser 对象**。`BattleScene` 维护 `id → Phaser.GameObjects` 映射，每帧根据 `GameState` 同步显示对象位置/血条/状态。

### 5.4 升级对存活小兵的同步（PRD 12.3.3）

升级军营时回溯更新该军营**所有存活小兵**（PRD 建议同步，便于理解）：

- `weapon` ↑：小兵 `attack *= 该级系数`
- `health` ↑：军营自身 `maxHp`、`hp` 与所属小兵 `maxHp`、`hp` **等比**上调（满血单位保持满血，避免比例错乱）
- `production` ↑：**仅**影响该军营 `spawnTimer` 间隔，与小兵无关

新生产小兵的属性按军营当前升级快照计算。

### 5.5 GameState

```ts
interface GameState {
  camps: Map<string, Camp>;
  units: Map<string, Unit>;
  projectiles: Projectile[];                 // 远程弹道
  stats: { red: SideStats; blue: SideStats };
  sim: { running: boolean; speed: 1 | 2 | 4; timeMs: number };
}

interface SideStats {
  unitsAlive: number;
  campsAlive: number;
  kills: number;            // 累计击杀
  campsDestroyed: number;   // 摧毁敌方军营数
}

interface Projectile {
  x: number; y: number;
  targetId: string;
  speed: number;
  damage: number;
  faction: Faction;
}
```

---

## 6. 核心模拟子系统

### 6.1 CampManager（产兵）

```text
CampManager.step(dt):
  for c in camps where not destroyed:
    if c.aliveUnits >= unitCap(20): continue
    c.spawnTimer -= dt
    if c.spawnTimer <= 0:
      spawnUnit(c)     // 位置 = 军营周围随机偏移，避免堆叠
      c.aliveUnits++
      c.spawnTimer = def.spawnInterval × productionFactor(c)
```

军营被摧毁（`destroyed=true`）后停止产兵。

### 6.2 UnitManager（寻敌 + 移动 + 攻击发起）

```text
UnitManager.step(dt):
  grid.rebuild(allUnits)                 // 每 step 重建均匀网格
  for unit where alive:
    acquireTarget(unit, grid)
    act(unit, dt, grid)

acquireTarget(unit, grid):               // PRD 10.2 优先级
  if unit.targetId 存在且目标存活 → 保持（避免抖动切换）
  else:
    cands = grid.queryCircle(unit.x, unit.y, SIGHT)
    inRange = cands 中在 attackRange 内的敌方小兵(最近)
    target = inRange ?? 最近敌方小兵 ?? 最近敌方军营

act(unit, dt, grid):
  if 目标在 attackRange 内:
    unit.state = attacking
    unit.attackTimer -= dt
    到 0 → 发起攻击(近战即时伤害 / 远程生成弹道); 重置 attackTimer = attackInterval
  elif 有目标:
    unit.state = moving; 朝目标移动 moveSpeed×dt
  elif 存在敌方军营:
    unit.state = moving; 朝最近敌方军营方向推进（兵线，PRD 24.3）
  else:
    unit.state = idle        // 无任何敌方目标（如对方已全灭）
  separation(unit, grid)                 // 同阵营轻量排斥，防重叠/卡住
```

远程单位保持距离（PRD 10.4.4）：MVP 简化为「射程内即停住攻击，不主动后撤」。`SIGHT` 为感知半径，取值大于最大攻击距离。

### 6.3 SpatialGrid（空间分区，PRD 19.3.5 / 24.1）

均匀网格哈希，`cellSize ≈ 80px`。提供 `rebuild()` / `queryCircle(x,y,r)`。500 单位每 step 重建成本可忽略，彻底消除「每帧全量扫描」。

### 6.4 CombatSystem（伤害 / 死亡 / 军营摧毁）

```text
CombatSystem.step(dt):
  for p in projectiles:
    推进位置
    命中(到达目标距离内且目标仍存活) → applyDamage 后移除
    超时或目标已死 → 直接移除（落空）

applyDamage(target, dmg, byFaction):
  target.hp -= dmg
  if target 是 Unit 且 hp <= 0:
    unit.alive = false; unit.deathTimer = 0.3s   // 淡出，逻辑上立即退出战斗
    unit.camp.aliveUnits--
    stats[byFaction].kills++
  if target 是 Camp 且 hp <= 0:
    camp.destroyed = true                        // 停止产兵
    stats[byFaction].campsDestroyed++
    stats[camp.faction].campsAlive--
    // 所属存活小兵继续战斗，不处理 (PRD 10.5.5)
```

远程弹道若目标中途死亡则落空（命中时不结算）。`alive=false` 的小兵立即退出寻敌与战斗，淡出 ~0.3s 后从 `units` Map 移除。

### 6.5 StatsTracker

**变更点即时累加**（非每帧扫描）：小兵出生 `unitsAlive+1`、死亡 `-1`；军营放置/摧毁维护 `campsAlive`。DOM HUD 刷新节流 ~100ms，合并多次写入。

---

## 7. 渲染、视觉与无限画布

### 7.1 渲染层职责

`BattleScene` 每帧渲染回调中根据最新 `GameState` 同步显示对象（位置/血条/状态）。加速多步时取最终状态（MVP 不做插值，视觉跳跃可接受）。

| 实体 | 占位渲染（MVP 可无美术） | 后续替换 |
| ---- | ---- | ---- |
| 小兵 | Graphics 圆点 + 阵营色 + 头顶血条 | Q版玩具士兵 Sprite |
| 军营 | Graphics 积木块 + 红蓝旗帜 | 积木建筑 Sprite |
| 弹道 | 线段/小圆点 | 玩具箭/软矛 Sprite |
| 死亡 | `alive=false` 单位 alpha 渐淡 ~0.3s 后销毁 | 晕倒/星星动画 |

### 7.2 无限画布（PRD 6）

- **Camera**：不设固定 `worldBounds`（或设极大值）。右键拖拽 → `camera.scrollBy`；滚轮 → `camera.zoom`（钳制 min/max，如 0.3x–2.5x）。
- **地面**：TileSprite 重复草地纹理跟随 camera 平移，实现无缝无限地面；网格辅助线为可开关的 Graphics（随 camera 平铺）。
- **坐标**：屏幕 → 世界用 `camera.getWorldPoint()`，保证缩放/拖拽后放置坐标正确（PRD 23.6）。

### 7.3 LOD 与视野外降频（PRD 11.3 / 19.3 / 6.2.4）

```text
视野外单位：渲染层 cull（不绘制屏幕外），但逻辑层照常 step（PRD：视野外继续战斗）
血条按缩放/状态分层：
  zoom 近 + 选中/受击 → 完整血条
  zoom 中             → 简化血条
  zoom 远             → 仅军营/选中血条，普通小兵隐藏
低血单位 → 可高亮（PRD 11.3）
```

### 7.4 视觉与表现设计

**整体风格（PRD 16.1）**：Q版玩具 + 低暴力 + 伪 2.5D + 明亮轻松。小兵头大身小、动作夸张可爱；武器像玩具，不强调真实杀伤；无血液/残肢/伤口。

**小兵造型与武器（PRD 9.3 / 16.2）**：

| 兵种 | 造型 | 武器 |
| ---- | ---- | ---- |
| sword 剑兵 | Q版玩具士兵 | 玩具剑 |
| shield 盾兵 | Q版士兵，盾朝前 | 圆盾 |
| archer 弓箭手 | Q版士兵 | 软头玩具弓 |
| javelin 投矛兵 | Q版士兵 | 橡胶玩具矛 |

- 阵营区分：身体主色（红/蓝）+ 臂章/旗帜色 + 血条边框色
- **占位渲染（阶段 2）**：Graphics 圆点 + 阵营色 + 兵种字母标识（S/Sh/A/J）+ 脚底阴影；玩法验收后替换为正式 sprite

**动作表现（PRD 9.1 / 10.6）**：

| 状态 | 表现 |
| ---- | ---- |
| moving | 朝目标方向移动，轻微弹跳 |
| attacking（近战） | 挥砍动画 |
| attacking（远程） | 拉弓 / 扬手 → 发射弹道 |
| idle | 待机轻微摇摆 |
| death | 晕倒 / 冒星星 / 变玩具零件 / 淡出（~0.3s，无血腥） |

**武器与攻击特效（PRD 10.3 / 10.4 / 16.4）**：
- 近战命中：星星碰撞 + 目标闪白 / 轻微弹跳
- 远程弹道：玩具箭 / 软矛 / 泡泡弹图形飞向目标；命中轻碰撞 / 小弹花
- 军营受击：轻微晃动；摧毁：积木散落 + 烟圈 + 废墟
- 特效密度设上限（见第 10 节性能策略），溢出合并 / 丢弃

**血条样式（PRD 11）**：
- 小兵：头顶细血条，满血绿 / 中黄 / 低红，受击短暂闪烁，死亡消失
- 军营：仅在选中 / 受击 / 悬停时显示
- LOD 与 7.3 缩放分层一致（远距仅军营与选中血条）

**军营外观（PRD 16.3）**：
- 积木建筑 + 红蓝旗帜 + 阴影立体感；4 种类型外观可区分
- **占位渲染（阶段 1）**：方块 + 旗帜 + 兵种首字母（见阶段 1 plan Task 7）
- 摧毁 → 积木废墟表现

**2.5D 表现（PRD 6.1 / 16）**：俯视 2D 逻辑 + 伪 2.5D 美术 —— 建筑带立体感与落影、小兵带脚底阴影，增强纵深。

**美术资源策略**：MVP 全程先用 Graphics 占位图形（零外部资源依赖），各阶段验收玩法后再替换为正式 sprite / 动画。占位图形的硬性要求：能清晰区分**阵营**与**兵种**。

---

## 8. 输入交互

### 8.1 操作（PRD 15）

**电脑**：左键点地图 = 放置 / 点对象 = 选中；右键拖拽 = 平移；滚轮 = 缩放。键盘：`Space` 暂停/播放、`1/2` 切换红蓝、`Q/W/E/R` 选 4 种军营、`Delete` 删除选中。

**平板**：单指点地图 = 放置 / 点对象 = 选中；单指拖空白 = 平移；双指 = 缩放；长按 = 快捷菜单。

### 8.2 操作冲突处理（PRD 15.3）

放置模式点空白优先放置；未选军营类型点空白无操作；**拖动距离超阈值则视为平移、不触发放置**；DOM 面板点击 `stopPropagation` 不穿透到 canvas。

### 8.3 放置预览（PRD 8.5）

选中军营类型后，指针移动显示半透明预览；合法性校验：与现有军营距离 < 最小间距 → 红（不可放置），否则绿。左键合法位置放置。

### 8.4 输入路由

DOM UI（按钮/面板）事件不进入 Phaser；canvas 内 pointer（点击/拖拽/滚轮）由 `PlacementController` / `SelectionManager` 转成世界坐标后调用逻辑层校验、修改 `GameState`，再由事件驱动 `InfoPanel` 刷新。

---

## 9. UI / DOM 层

### 9.1 布局（PRD 14，DOM 绝对定位 overlay 在 canvas 之上）

```
┌──────────────────────────────────────────────┐
│  顶部 HudController  战局统计栏                  │
├────────┬─────────────────────────────┬───────┤
│ 左侧   │                             │ 右侧  │
│ Build  │        Phaser Canvas         │ Info  │
│ Panel  │      （战场，pointer 交互）   │ Panel │
│ 阵营+  │                             │ 选中  │
│ 4军营  │                             │ 信息  │
├────────┴─────────────────────────────┴───────┤
│  底部 ControlBar  暂停/播放 1x 2x 4x 清小兵 清空 重置 │
└──────────────────────────────────────────────┘
```

- **HudController**（顶部）：红蓝士兵数/军营数/击杀数/模拟时间/速度（PRD 14.2）
- **BuildPanel**（左侧）：阵营选择 + 4 种军营按钮（PRD 14.3）
- **InfoPanel**（右侧）：选中军营信息 + 3 类升级/删除按钮，或选中小兵信息（PRD 14.5）
- **ControlBar**（底部）：暂停/播放、1x/2x/4x、清除小兵、清空战场、重置统计（PRD 14.4）

### 9.2 UiBridge（UI 与逻辑层唯一边界）

引入定向 `UiBridge`（类型安全的命令 + 订阅），而非全局 EventBus —— 与管理器架构一致、可控：

```ts
interface UiBridge {
  // UI → 逻辑（命令）
  selectFaction(f: Faction): void;
  selectCampKind(k: CampKind): void;
  upgrade(type: UpgradeType): void;
  deleteSelected(): void;
  setRunning(b: boolean): void;
  setSpeed(s: 1 | 2 | 4): void;
  clearUnits(): void;        // 清除小兵，保留军营
  clearAll(): void;          // 清空战场
  resetStats(): void;
  // 逻辑 → UI（订阅）
  on(event: 'selectionChanged' | 'statsChanged' | 'placementChanged' | 'simChanged', cb: () => void): void;
}
```

- UI 组件订阅事件刷新 DOM；按钮 `click` 调 bridge 命令 → 逻辑层改 `GameState`。
- 统计刷新节流 ~100ms；信息面板在选中变化时刷新。
- UI 永远是 `GameState` 的**只读视图**，不持有游戏状态。

### 9.3 当前态指示

- BuildPanel：当前阵营 + 军营类型高亮（对应键盘 `1/2` + `Q/W/E/R`）
- ControlBar：暂停/播放图标反映状态，当前速度按钮高亮

### 9.4 二次确认（PRD 14.4）

清除小兵 / 清空战场 → DOM 自定义确认弹窗（非原生 `confirm`，样式可控、平板友好），防误触。

### 9.5 响应式适配（PRD 20）

CSS 媒体查询 + 触控检测（`matchMedia('(pointer: coarse)')`）：

| 屏幕 | 策略 |
| ---- | ---- |
| 大屏电脑 | 四区域全显 |
| 小屏电脑 | 右侧 InfoPanel 可折叠 |
| 平板横屏 | 左/底优先，右侧弹出式 |
| 平板竖屏 | 提示「横屏体验更佳」 |
| 触控模式 | 按钮 hit-area 放大，禁用 hover 依赖 |

---

## 10. 性能策略（PRD 19）

| 策略 | 说明 |
| ---- | ---- |
| 空间分区寻敌 | SpatialGrid，杜绝每帧全量扫描 |
| 视野外渲染裁剪 | 屏幕外不绘制，逻辑仍 step（PRD 6.2.4） |
| 血条 LOD | 按缩放/选中分层显示 |
| 单位软上限 | 单军营 20 / 总量 300(电脑)·150(平板)，超限提示不崩溃 |
| 弹道特效上限 | 同屏弹道/特效数封顶，溢出丢弃或合并 |
| 对象池 | 小兵/弹道显示对象复用，避免 500 单位频繁生死带来的 GC 抖动 |

性能目标（PRD 19.1）：小规模稳定 60 FPS；普通电脑 300 小兵流畅；中等平板 150 小兵基本流畅；大规模允许降级但不能卡死。

---

## 11. 边界处理

遵守 CLAUDE.md「只处理真实边界，不为不可能场景做错误处理」：

- 放置重叠 → 合法性校验拦截（绿/红预览），不产生重叠
- 单位超限 → 软限制 + UI 提示，停止产兵但不崩
- 已摧毁军营 → 不可升级/选中升级，UI 禁用入口
- tab 切回巨量 delta → `SimulationClock` 钳制单帧最大步数
- 清空战场 / 重置 → 清空 `camps` / `units` / `projectiles`、归零 stats、重置 sim

---

## 12. 测试策略

逻辑层框架无关 → 可脱离 Phaser 单元测试，这是分层架构的核心回报。

**工具**：Vitest（Vite 原生、启动快）。

**单元测试重点（`game/` 逻辑层）**：

| 模块 | 关键用例 |
| ---- | ---- |
| SimulationClock | 固定步进、2x/4x 多步、暂停=0 步、大 delta 钳制 |
| CombatSystem | applyDamage 扣血、hp≤0 死亡判定、军营摧毁、击杀/摧毁统计累加 |
| UnitManager.acquireTarget | 优先级（范围内 > 最近小兵 > 军营）、目标保持不抖动、无目标推进 |
| SpatialGrid | insert/queryCircle 正确性、跨 cell 边界 |
| CampManager | 产兵间隔、上限 20、摧毁停止产兵、升级系数生效 |
| 升级同步 | health/weapon 回溯已存活小兵、production 仅影响间隔、满血等比保持 |

**集成/验收**：Phaser 场景单测成本高，MVP 以逻辑层单测为主；PRD 第 23 节验收标准作为手动验收清单，后续可补 Playwright E2E。

**覆盖目标**：逻辑层 `game/` 高覆盖；渲染/`ui/` DOM 层以手动验收为主。

---

## 13. 实现阶段映射（PRD 第 25 节 → 模块）

| 阶段 | 目标 | 主要落点模块 |
| ---- | ---- | ---- |
| 1. 基础地图与放置 | 可拖动/缩放画布、红蓝阵营选择、4 军营放置、选中/删除 | Camera/无限画布、BuildPanel、PlacementController、SelectionManager、Camp 数据与渲染 |
| 2. 产兵与基础小兵 | 军营按间隔产兵、剑兵+弓箭手、血条、移动 | CampManager、Unit 数据与渲染、血条、UnitManager 移动 |
| 3. 自动战斗 | 自动寻敌、近战/远程弹道、扣血死亡、军营摧毁 | UnitManager 寻敌/攻击、SpatialGrid、CombatSystem |
| 4. 沙盒控制与统计 | 暂停/播放、1x/2x/4x、清场、基础统计 | SimulationClock、ControlBar、StatsTracker、HudController |
| 5. 升级系统与完整 MVP | 军营信息面板、3 类升级、补齐盾兵+投矛兵、适配 | InfoPanel、升级同步、响应式适配、对象池等性能优化 |

每阶段独立 commit（CLAUDE.md git 规范），粒度细、可独立回滚。

---

## 14. 验收标准

以 PRD 第 23 节为准，涵盖：基础放置（23.1）、产兵（23.2）、战斗（23.3）、升级（23.4）、沙盒控制（23.5）、无限画布（23.6）。各模块单元测试 + 阶段验收对照该清单执行。

---

## 15. 后续版本（非 MVP）

PRD 第 22 节规划的 v0.2+（表现增强、沙盒能力增强、策略扩展、v1.0 完整沙盒）与本 Spec 无关，届时另行设计。本 Spec 严格遵守非目标边界（第 1 节）。
