# 阶段 1：基础地图与放置 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家可在无限画布上拖拽/缩放视角，选择红/蓝阵营与 4 种军营，放置（含合法性预览）、选中、删除军营。

**Architecture:** 三层 —— 框架无关的纯 TS 逻辑层（types / GameState / 放置校验 / 选中）+ Phaser 渲染与输入层（BattleScene / Camera / PlacementController）+ 原生 DOM UI 层（UiBridge / BuildPanel / InfoPanel）。模拟主循环在后续阶段引入，本阶段只做静态放置。

**Tech Stack:** Phaser 3 · TypeScript · Vite · Vitest

**依据 Spec:** [docs/superpowers/specs/2026-06-13-camp-clash-mvp-design.md](../specs/2026-06-13-camp-clash-mvp-design.md)

**本阶段范围（PRD 25.1）：** 可拖动/缩放画布、红蓝阵营选择、4 军营放置、选中/删除。**不含：** 产兵、小兵、战斗、升级、模拟控制、统计（后续阶段）。

---

## 文件结构

```
camp-clash/
  package.json                 # 依赖与脚本
  tsconfig.json                # TS 严格配置
  vite.config.ts               # Vite + Vitest 配置
  index.html                   # 入口 HTML（挂载点 + UI 容器）
  src/
    main.ts                    # 入口：创建 Phaser.Game + 挂载 DOM UI
    config/
      camps.ts                 # 4 种军营定义（纯数据）
      colors.ts                # 阵营色 / 选中色 / 预览合法色
    game/
      types.ts                 # 所有类型（Faction/CampKind/Camp/UpgradeType 等）
      GameState.ts             # 可变状态：camps Map + 增删查
      placement.ts             # canPlaceCamp 纯函数（合法性校验）
      BattleScene.ts           # 主场景：camera/地面/渲染/输入集成
      BootScene.ts             # 占位启动场景
      campRenderer.ts          # 单军营绘制函数
      managers/
        SelectionManager.ts    # 选中状态（selectedId + select/clear）
        PlacementController.ts # Phaser 输入 → 预览 + 放置（调用 canPlaceCamp）
        SelectionInput.ts      # 点击军营选中 + Delete 键
    ui/
      UiBridge.ts              # UI ↔ 逻辑层边界（命令 + 订阅）
      BuildPanel.ts            # 左侧：阵营 + 4 军营按钮
      InfoPanel.ts             # 右侧：选中军营信息 + 删除按钮
      ui.css                   # 布局与响应式
  tests/
    camps.test.ts
    GameState.test.ts
    placement.test.ts
    SelectionManager.test.ts
```

**职责边界：**
- 逻辑层（`game/types.ts` `GameState.ts` `placement.ts` `managers/SelectionManager.ts` 的状态部分）**不依赖 Phaser**，可单测。
- Phaser 层只渲染 + 捕获输入，调用逻辑层。
- DOM UI 永远是 `GameState` 的只读视图，通过 `UiBridge` 通信。

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`（占位）

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "camp-clash",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "phaser": "^3.80.1"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: 创建 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"],
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: 创建 `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 4: 创建 `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
    <title>军营大作战</title>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: 创建占位 `src/main.ts`**

```ts
console.log('camp-clash bootstrapping');
```

- [ ] **Step 6: 安装依赖并验证**

Run: `npm install`
Run: `npm test`
Expected: vitest 报告 "No test files found"（非错误退出码即正常，脚手架就绪）

Run: `npm run dev`
Expected: Vite 启动本地服务，浏览器控制台输出 `camp-clash bootstrapping`，页面空白。Ctrl+C 停止。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts
git commit -m "chore: 搭建 Vite + TS + Phaser + Vitest 脚手架"
```

---

## Task 2: 核心类型与军营配置表（TDD）

**Files:**
- Create: `src/game/types.ts`, `src/config/camps.ts`, `src/config/colors.ts`, `tests/camps.test.ts`

- [ ] **Step 1: 写失败测试 `tests/camps.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { CAMP_DEFS } from '../src/config/camps';
import type { CampKind } from '../src/game/types';

describe('CAMP_DEFS', () => {
  it('包含 4 种军营', () => {
    const kinds: CampKind[] = ['sword', 'shield', 'archer', 'javelin'];
    for (const k of kinds) {
      expect(CAMP_DEFS[k]).toBeDefined();
    }
  });

  it('剑兵营数值符合 PRD 8.4', () => {
    expect(CAMP_DEFS.sword).toMatchObject({
      produces: 'sword',
      maxHp: 500,
      spawnInterval: 4,
      unitCap: 20,
    });
  });

  it('盾兵营数值 600/5', () => {
    expect(CAMP_DEFS.shield).toMatchObject({ maxHp: 600, spawnInterval: 5 });
  });

  it('弓兵营数值 450/5', () => {
    expect(CAMP_DEFS.archer).toMatchObject({ maxHp: 450, spawnInterval: 5 });
  });

  it('投矛营数值 450/6', () => {
    expect(CAMP_DEFS.javelin).toMatchObject({ maxHp: 450, spawnInterval: 6 });
  });

  it('所有军营 unitCap 为 20', () => {
    for (const def of Object.values(CAMP_DEFS)) {
      expect(def.unitCap).toBe(20);
    }
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/config/camps'`

- [ ] **Step 3: 创建 `src/game/types.ts`**

```ts
export type Faction = 'red' | 'blue';

export type CampKind = 'sword' | 'shield' | 'archer' | 'javelin';

export type UnitKind = CampKind;

export type AttackType = 'melee' | 'ranged';

export type UpgradeType = 'production' | 'health' | 'weapon';

export interface CampDef {
  kind: CampKind;
  produces: UnitKind;
  maxHp: number;
  spawnInterval: number; // 秒
  unitCap: number;
}

export interface Camp {
  id: string;
  faction: Faction;
  kind: CampKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  spawnTimer: number;
  upgrades: Record<UpgradeType, number>;
  aliveUnits: number;
  destroyed: boolean;
}
```

- [ ] **Step 4: 创建 `src/config/camps.ts`**

```ts
import type { CampDef, CampKind } from '../game/types';

export const CAMP_DEFS: Record<CampKind, CampDef> = {
  sword:   { kind: 'sword',   produces: 'sword',   maxHp: 500, spawnInterval: 4, unitCap: 20 },
  shield:  { kind: 'shield',  produces: 'shield',  maxHp: 600, spawnInterval: 5, unitCap: 20 },
  archer:  { kind: 'archer',  produces: 'archer',  maxHp: 450, spawnInterval: 5, unitCap: 20 },
  javelin: { kind: 'javelin', produces: 'javelin', maxHp: 450, spawnInterval: 6, unitCap: 20 },
};

/** 军营之间最小放置间距（世界坐标 px） */
export const CAMP_MIN_DISTANCE = 90;
```

- [ ] **Step 5: 创建 `src/config/colors.ts`**

```ts
import type { Faction } from '../game/types';

export const FACTION_COLORS: Record<Faction, number> = {
  red: 0xe53935,
  blue: 0x1e88e5,
};

export const PREVIEW_OK_COLOR = 0x43a047;   // 绿：可放置
export const PREVIEW_BAD_COLOR = 0xe53935;  // 红：不可放置
export const SELECTION_COLOR = 0xffeb3b;    // 选中框黄
```

- [ ] **Step 6: 运行测试验证通过**

Run: `npm test`
Expected: PASS（全部 camps 测试通过）

- [ ] **Step 7: Commit**

```bash
git add src/game/types.ts src/config/camps.ts src/config/colors.ts tests/camps.test.ts
git commit -m "feat(types): 添加核心类型与 4 种军营配置表"
```

---

## Task 3: GameState 军营管理（TDD）

**Files:**
- Create: `src/game/GameState.ts`, `tests/GameState.test.ts`

- [ ] **Step 1: 写失败测试 `tests/GameState.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { GameState } from '../src/game/GameState';
import type { Camp } from '../src/game/types';

function makeCamp(id: string, x = 0, y = 0): Camp {
  return {
    id, faction: 'red', kind: 'sword', x, y,
    hp: 500, maxHp: 500, spawnTimer: 0,
    upgrades: { production: 1, health: 1, weapon: 1 },
    aliveUnits: 0, destroyed: false,
  };
}

describe('GameState', () => {
  it('addCamp 后可通过 getCamp 取回', () => {
    const gs = new GameState();
    const c = makeCamp('c1');
    gs.addCamp(c);
    expect(gs.getCamp('c1')).toBe(c);
  });

  it('addCamp 后 camps 列表包含该军营', () => {
    const gs = new GameState();
    gs.addCamp(makeCamp('c1'));
    expect(gs.camps.size).toBe(1);
  });

  it('removeCamp 后 getCamp 返回 undefined', () => {
    const gs = new GameState();
    gs.addCamp(makeCamp('c1'));
    gs.removeCamp('c1');
    expect(gs.getCamp('c1')).toBeUndefined();
    expect(gs.camps.size).toBe(0);
  });

  it('removeCamp 不存在的 id 不报错', () => {
    const gs = new GameState();
    expect(() => gs.removeCamp('nope')).not.toThrow();
  });

  it('allCamps 返回所有军营数组', () => {
    const gs = new GameState();
    gs.addCamp(makeCamp('c1', 0, 0));
    gs.addCamp(makeCamp('c2', 100, 0));
    expect(gs.allCamps().map((c) => c.id).sort()).toEqual(['c1', 'c2']);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/game/GameState'`

- [ ] **Step 3: 创建 `src/game/GameState.ts`**

```ts
import type { Camp } from './types';

export class GameState {
  readonly camps = new Map<string, Camp>();

  addCamp(camp: Camp): void {
    this.camps.set(camp.id, camp);
  }

  removeCamp(id: string): void {
    this.camps.delete(id);
  }

  getCamp(id: string): Camp | undefined {
    return this.camps.get(id);
  }

  allCamps(): Camp[] {
    return [...this.camps.values()];
  }
}
```

> 说明：本阶段 `GameState` 只含军营集合。后续阶段会在同一类上追加 `units` / `projectiles` / `stats` / `sim` 字段（见 spec 5.5）。

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/GameState.ts tests/GameState.test.ts
git commit -m "feat(game): GameState 管理军营集合"
```

---

## Task 4: 放置合法性校验纯函数（TDD）

**Files:**
- Create: `src/game/placement.ts`, `tests/placement.test.ts`

- [ ] **Step 1: 写失败测试 `tests/placement.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { canPlaceCamp } from '../src/game/placement';
import { CAMP_MIN_DISTANCE } from '../src/config/camps';
import type { Camp } from '../src/game/types';

function makeCamp(id: string, x: number, y: number): Camp {
  return {
    id, faction: 'red', kind: 'sword', x, y,
    hp: 500, maxHp: 500, spawnTimer: 0,
    upgrades: { production: 1, health: 1, weapon: 1 },
    aliveUnits: 0, destroyed: false,
  };
}

describe('canPlaceCamp', () => {
  it('空战场任意位置可放置', () => {
    expect(canPlaceCamp([], 0, 0, CAMP_MIN_DISTANCE)).toBe(true);
  });

  it('与现有军营距离小于最小间距时不可放置', () => {
    const existing = [makeCamp('a', 0, 0)];
    // 距离 = 50 < 90
    expect(canPlaceCamp(existing, 50, 0, CAMP_MIN_DISTANCE)).toBe(false);
  });

  it('与现有军营距离等于最小间距时可放置（边界）', () => {
    const existing = [makeCamp('a', 0, 0)];
    expect(canPlaceCamp(existing, CAMP_MIN_DISTANCE, 0, CAMP_MIN_DISTANCE)).toBe(true);
  });

  it('距离大于最小间距时可放置', () => {
    const existing = [makeCamp('a', 0, 0)];
    expect(canPlaceCamp(existing, 200, 0, CAMP_MIN_DISTANCE)).toBe(true);
  });

  it('多军营场景：与任一过近即不可放置', () => {
    const existing = [makeCamp('a', 0, 0), makeCamp('b', 300, 0)];
    // 离 a 远，离 b=300 距离 70 < 90
    expect(canPlaceCamp(existing, 230, 0, CAMP_MIN_DISTANCE)).toBe(false);
  });

  it('忽略已摧毁的军营（不阻挡放置）', () => {
    const dead = makeCamp('a', 0, 0);
    dead.destroyed = true;
    expect(canPlaceCamp([dead], 10, 0, CAMP_MIN_DISTANCE)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/game/placement'`

- [ ] **Step 3: 创建 `src/game/placement.ts`**

```ts
import type { Camp } from './types';

/** 判断在 (x,y) 放置军营是否合法：与所有未摧毁军营距离 ≥ minDistance */
export function canPlaceCamp(
  existing: Camp[],
  x: number,
  y: number,
  minDistance: number,
): boolean {
  for (const c of existing) {
    if (c.destroyed) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    if (Math.hypot(dx, dy) < minDistance) return false;
  }
  return true;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/placement.ts tests/placement.test.ts
git commit -m "feat(game): 放置合法性校验纯函数 canPlaceCamp"
```

---

## Task 5: SelectionManager 选中逻辑（TDD）

**Files:**
- Create: `src/game/managers/SelectionManager.ts`, `tests/SelectionManager.test.ts`

- [ ] **Step 1: 写失败测试 `tests/SelectionManager.test.ts`**

```ts
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
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/game/managers/SelectionManager'`

- [ ] **Step 3: 创建 `src/game/managers/SelectionManager.ts`**

```ts
type SelectionListener = (id: string | null) => void;

export class SelectionManager {
  private selectedId: string | null = null;
  private listeners = new Set<SelectionListener>();

  getSelectedId(): string | null {
    return this.selectedId;
  }

  select(id: string): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit();
  }

  clear(): void {
    if (this.selectedId === null) return;
    this.selectedId = null;
    this.emit();
  }

  onChange(cb: SelectionListener): void {
    this.listeners.add(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.selectedId);
  }
}
```

> 说明：本阶段选中态实际由 `UiBridge.selectedCampId` 承载（见 Task 9）。`SelectionManager` 作为框架无关的纯选中逻辑保留，供后续阶段或单测使用；阶段 1 的 UI 选中走 bridge。

- [ ] **Step 4: 运行测试验证通过**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/managers/SelectionManager.ts tests/SelectionManager.test.ts
git commit -m "feat(game): SelectionManager 选中状态管理"
```

---

## Task 6: Phaser 骨架与无限画布

**Files:**
- Create: `src/game/BootScene.ts`, `src/game/BattleScene.ts`, 修改 `src/main.ts`

> 本任务为 Phaser 渲染/输入，难以单测，以手动验收为准。

- [ ] **Step 1: 创建 `src/game/BootScene.ts`**

```ts
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.scene.start('BattleScene');
  }
}
```

- [ ] **Step 2: 创建 `src/game/BattleScene.ts`（camera + 地面，先不含军营渲染）**

```ts
import Phaser from 'phaser';

export class BattleScene extends Phaser.Scene {
  private ground!: Phaser.GameObjects.TileSprite;
  private isPanning = false;

  readonly MIN_ZOOM = 0.3;
  readonly MAX_ZOOM = 2.5;

  constructor() {
    super('BattleScene');
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    // 地面：草地色 TileSprite 平铺，随 camera 平移
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillGradientStyle(0x7cb342, 0x7cb342, 0x689f38, 0x689f38, 1);
    g.fillRect(0, 0, 64, 64);
    g.generateTexture('ground', 64, 64);
    g.destroy();

    this.ground = this.add.tileSprite(0, 0, width, height, 'ground').setOrigin(0, 0);

    this.cameras.main.setZoom(1);

    this.setupInput();
    this.scale.on('resize', this.onResize, this);
  }

  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) this.isPanning = true;
    });
    this.input.on('pointerup', () => {
      this.isPanning = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isPanning) return;
      const cam = this.cameras.main;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });

    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const next = Phaser.Math.Clamp(cam.zoom - dy * 0.001, this.MIN_ZOOM, this.MAX_ZOOM);
      cam.setZoom(next);
    });

    this.input.mouse?.disableContextMenu();
  }

  private onResize(gameSize: Phaser.Structs.Size): void {
    const { width, height } = gameSize;
    this.ground.setSize(width, height);
  }

  update(): void {
    const cam = this.cameras.main;
    this.ground.tilePositionX = cam.scrollX;
    this.ground.tilePositionY = cam.scrollY;
  }
}
```

> 说明：`UiBridge` 通过 `game.registry` 在 Task 8 注入，BattleScene 在 `create()` 中从 registry 取得。本任务 BattleScene 保持无参构造，main.ts 用 `scene: [BootScene, BattleScene]`（类）。

- [ ] **Step 3: 修改 `src/main.ts` 创建游戏**

```ts
import Phaser from 'phaser';
import { BootScene } from './game/BootScene';
import { BattleScene } from './game/BattleScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#7cb342',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, BattleScene],
});
```

- [ ] **Step 4: 手动验收**

Run: `npm run dev`
Expected:
- 页面显示绿色草地铺满
- 按住**右键拖动** → 画布平移，地面纹理随之滚动（无限感）
- **滚轮** → 缩放，钳制在 0.3x–2.5x
- 右键不弹出浏览器菜单

Ctrl+C 停止。

- [ ] **Step 5: Commit**

```bash
git add src/game/BootScene.ts src/game/BattleScene.ts src/main.ts
git commit -m "feat(game): Phaser 骨架 + 无限画布（拖拽/缩放）"
```

---

## Task 7: 军营渲染同步

**Files:**
- Create: `src/game/campRenderer.ts`；Modify: `src/game/BattleScene.ts`

- [ ] **Step 1: 创建 `src/game/campRenderer.ts`**

```ts
import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Camp, CampKind } from './types';

// 兵种标识：占位图形须区分兵种（spec 7.4），sword/shield 不可都用 'S'
const KIND_LABEL: Record<CampKind, string> = {
  sword: 'S', shield: 'Sh', archer: 'A', javelin: 'J',
};

/** 绘制一个军营显示对象（积木块 + 旗帜 + 落影），返回容器。视觉规范见 spec 7.4 */
export function drawCamp(scene: Phaser.Scene, camp: Camp): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[camp.faction];
  // 落影：2.5D 阴影立体感（spec 7.4），置于容器最底层
  const shadow = scene.add.ellipse(0, 38, 72, 20, 0x000000, 0.25).setOrigin(0.5);
  const body = scene.add.rectangle(0, 0, 60, 60, color).setOrigin(0.5);
  body.setStrokeStyle(2, 0x000000, 0.4);
  const flag = scene.add.triangle(0, -42, -8, 8, 8, 8, -8, -8, color).setOrigin(0.5);
  const pole = scene.add.rectangle(0, -42, 2, 16, 0x5d4037).setOrigin(0.5);
  const label = scene.add.text(0, 0, KIND_LABEL[camp.kind], {
    fontSize: '18px', color: '#ffffff',
  }).setOrigin(0.5);

  return scene.add.container(camp.x, camp.y, [shadow, body, flag, pole, label]);
}
```

- [ ] **Step 2: 在 `BattleScene` 接入 GameState 与渲染同步**

修改 `src/game/BattleScene.ts`：
- 顶部 import 追加：`import { GameState } from './GameState';`、`import { drawCamp } from './campRenderer';`、`import type { Camp } from './types';`
- 类内新增字段：

```ts
private gameState = new GameState();
private campViews = new Map<string, Phaser.GameObjects.Container>();
```

- `create()` 末尾（`setupInput()` 之后、`scale.on` 之前）追加：`this.syncCampViews();`
- 新增方法：

```ts
private syncCampViews(): void {
  const seen = new Set<string>();
  for (const camp of this.gameState.allCamps()) {
    seen.add(camp.id);
    let view = this.campViews.get(camp.id);
    if (!view) {
      view = drawCamp(this, camp);
      this.campViews.set(camp.id, view);
    } else {
      view.setPosition(camp.x, camp.y);
    }
  }
  for (const [id, view] of this.campViews) {
    if (!seen.has(id)) {
      view.destroy();
      this.campViews.delete(id);
    }
  }
}

exposeGameState(): GameState {
  return this.gameState;
}

refreshViews(): void {
  this.syncCampViews();
}
```

- [ ] **Step 3: 临时手动验证渲染（验收后删除）**

临时在 `create()` 的 `this.syncCampViews()` 之前插入：

```ts
this.gameState.addCamp({
  id: 'test', faction: 'red', kind: 'sword', x: 0, y: 0,
  hp: 500, maxHp: 500, spawnTimer: 0,
  upgrades: { production: 1, health: 1, weapon: 1 },
  aliveUnits: 0, destroyed: false,
});
```

- [ ] **Step 4: 手动验收**

Run: `npm run dev`
Expected: 画布中央（世界 0,0）出现红色方块 + 旗帜 + "S" 字样 + 方块下方半透明落影。

验收后**删除** Step 3 的临时代码并保存。

- [ ] **Step 5: Commit**

```bash
git add src/game/campRenderer.ts src/game/BattleScene.ts
git commit -m "feat(game): 军营渲染与 GameState 同步"
```

---

## Task 8: 放置交互与放置控制器

**Files:**
- Create: `src/ui/UiBridge.ts`, `src/game/managers/PlacementController.ts`；Modify: `src/game/BattleScene.ts`

- [ ] **Step 1: 创建 `src/ui/UiBridge.ts`**

```ts
import type { Faction, CampKind } from '../game/types';
import type { GameState } from '../game/GameState';

export interface PlacementSelection {
  faction: Faction;
  kind: CampKind | null;
}

type EventName = 'placementChanged' | 'selectionChanged';

export class UiBridge {
  private listeners: Record<EventName, Set<() => void>> = {
    placementChanged: new Set(),
    selectionChanged: new Set(),
  };
  private selection: PlacementSelection = { faction: 'red', kind: null };
  private selectedCampId: string | null = null;

  // —— 放置选择 ——
  getSelection(): PlacementSelection {
    return this.selection;
  }

  selectFaction(f: Faction): void {
    this.selection.faction = f;
    this.emit('placementChanged');
  }

  selectCampKind(k: CampKind | null): void {
    this.selection.kind = k;
    this.emit('placementChanged');
  }

  // —— 选中军营 ——
  getSelectedCampId(): string | null {
    return this.selectedCampId;
  }

  selectCamp(id: string | null): void {
    this.selectedCampId = id;
    this.emit('selectionChanged');
  }

  // —— 删除选中 ——
  deleteSelected(scene: { exposeGameState(): GameState; refreshViews(): void }): void {
    if (this.selectedCampId) {
      scene.exposeGameState().removeCamp(this.selectedCampId);
      scene.refreshViews();
      this.selectedCampId = null;
      this.emit('selectionChanged');
    }
  }

  // —— 订阅 ——
  on(event: EventName, cb: () => void): void {
    this.listeners[event].add(cb);
  }

  emit(event: EventName): void {
    for (const cb of this.listeners[event]) cb();
  }
}
```

- [ ] **Step 2: 创建 `src/game/managers/PlacementController.ts`**

```ts
import Phaser from 'phaser';
import type { BattleScene } from '../BattleScene';
import { canPlaceCamp } from '../placement';
import { CAMP_DEFS, CAMP_MIN_DISTANCE } from '../../config/camps';
import { PREVIEW_OK_COLOR, PREVIEW_BAD_COLOR } from '../../config/colors';
import type { Camp, CampKind, Faction } from '../types';
import type { UiBridge } from '../../ui/UiBridge';

export class PlacementController {
  private preview: Phaser.GameObjects.Arc;
  private faction: Faction = 'red';
  private kind: CampKind | null = null;
  private dragStart: Phaser.Math.Vector2 | null = null;

  constructor(
    private scene: BattleScene,
    private bridge: UiBridge,
  ) {
    this.preview = scene.add.circle(0, 0, 32, PREVIEW_OK_COLOR, 0.4)
      .setStrokeStyle(2, PREVIEW_OK_COLOR)
      .setVisible(false);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));

    bridge.on('placementChanged', () => this.refreshFromBridge());
    this.refreshFromBridge();
  }

  private refreshFromBridge(): void {
    const sel = this.bridge.getSelection();
    this.faction = sel.faction;
    this.kind = sel.kind;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!p.leftButtonDown() || this.kind === null) return;
    this.dragStart = new Phaser.Math.Vector2(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.kind === null) {
      this.preview.setVisible(false);
      return;
    }
    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const gs = this.scene.exposeGameState();
    const ok = canPlaceCamp(gs.allCamps(), wp.x, wp.y, CAMP_MIN_DISTANCE);
    this.preview.setPosition(wp.x, wp.y);
    this.preview.setFillStyle(ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR, 0.4);
    this.preview.setStrokeStyle(2, ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR);
    this.preview.setVisible(true);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const start = this.dragStart;
    this.dragStart = null;
    if (!start || this.kind === null) return;

    // 拖动距离过大 → 视为平移，不放置
    const moved = Phaser.Math.Distance.Between(start.x, start.y, p.x, p.y);
    if (moved > 6) return;

    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const gs = this.scene.exposeGameState();
    if (!canPlaceCamp(gs.allCamps(), wp.x, wp.y, CAMP_MIN_DISTANCE)) return;

    const def = CAMP_DEFS[this.kind];
    const camp: Camp = {
      id: crypto.randomUUID(),
      faction: this.faction,
      kind: this.kind,
      x: wp.x,
      y: wp.y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      spawnTimer: 0,
      upgrades: { production: 1, health: 1, weapon: 1 },
      aliveUnits: 0,
      destroyed: false,
    };
    gs.addCamp(camp);
    this.scene.refreshViews();
    this.preview.setVisible(false);
  }
}
```

- [ ] **Step 3: 在 `BattleScene` 接入 PlacementController 与 bridge**

修改 `src/game/BattleScene.ts`：
- 顶部 import 追加：`import { PlacementController } from './managers/PlacementController';`、`import { UiBridge } from '../ui/UiBridge';`
- 类内字段追加：

```ts
private placement!: PlacementController;
```

- `create()` 末尾（`this.syncCampViews()` 之后）追加：

```ts
// bridge 由 main.ts 注入（Task 10）；此处通过 game.registry 取得
const bridge = this.game.registry.get('bridge') as UiBridge;
this.placement = new PlacementController(this, bridge);
```

> 注：Task 10 会改用构造注入；当前用 `registry` 临时传递 bridge，避免本任务改动 main.ts 的 scene 注册方式。

- [ ] **Step 4: 在 `main.ts` 注入 bridge 到 registry**

修改 `src/main.ts`：

```ts
import Phaser from 'phaser';
import { BootScene } from './game/BootScene';
import { BattleScene } from './game/BattleScene';
import { UiBridge } from './ui/UiBridge';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#7cb342',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, BattleScene],
});

game.registry.add('bridge', new UiBridge());
```

> 放置顺序：`scene` 在构造期不会立即 create（create 在首次 update 循环触发），故 registry.add 在 new Phaser.Game 之后是安全的。若遇时序问题，改为在 `BattleScene.preload` 里从 registry 取（Phaser 保证 registry 先就绪）。

- [ ] **Step 5: 手动验收（临时启用兵种选择）**

Run: `npm run dev`
临时在浏览器控制台无法触达 bridge，故在 `BattleScene.create` 末尾临时加：

```ts
(this.game.registry.get('bridge') as UiBridge).selectCampKind('sword');
```

Expected:
- 鼠标移动显示绿色/红色预览圆
- 空地左键点击 → 出现红色军营方块
- 靠近已有军营（<90px）→ 预览变红，点击无效
- 右键拖动 → 平移，不放置

验收后**删除**该临时代码。

- [ ] **Step 6: Commit**

```bash
git add src/ui/UiBridge.ts src/game/managers/PlacementController.ts src/game/BattleScene.ts src/main.ts
git commit -m "feat(game): 放置控制器（预览 + 合法性 + 点击放置）与 UiBridge"
```

---

## Task 9: 选中与删除

**Files:**
- Create: `src/game/managers/SelectionInput.ts`；Modify: `src/game/BattleScene.ts`

> 选中态由 `UiBridge.selectedCampId` 承载（Task 8 已加好 `selectCamp` / `getSelectedCampId` / `deleteSelected`）。

- [ ] **Step 1: 创建 `src/game/managers/SelectionInput.ts`**

```ts
import Phaser from 'phaser';
import type { BattleScene } from '../BattleScene';
import type { UiBridge } from '../../ui/UiBridge';

export class SelectionInput {
  constructor(
    private scene: BattleScene,
    private bridge: UiBridge,
  ) {
    // 左键点击：仅在非放置模式（未选兵种）时选中军营
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      if (bridge.getSelection().kind !== null) return; // 放置模式优先
      const camp = this.pickCamp(p.worldX, p.worldY);
      bridge.selectCamp(camp ?? null);
    });

    scene.input.keyboard?.on('keydown-DELETE', () => {
      bridge.deleteSelected(scene);
    });
  }

  private pickCamp(wx: number, wy: number): string | null {
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

- [ ] **Step 2: 在 `BattleScene` 接入 SelectionInput 与选中高亮**

修改 `src/game/BattleScene.ts`：
- 顶部 import 追加：`import { SelectionInput } from './managers/SelectionInput';`、`import { SELECTION_COLOR } from '../config/colors';`、`import type { UiBridge } from '../ui/UiBridge';`
- 字段追加：

```ts
private selectionInput!: SelectionInput;
private selectionRing!: Phaser.GameObjects.Arc;
```

- 在 `create()` 中已有的 `const bridge = this.game.registry.get('bridge') as UiBridge;` 之后追加：

```ts
this.selectionRing = this.add.circle(0, 0, 40)
  .setStrokeStyle(3, SELECTION_COLOR)
  .setVisible(false);
this.selectionInput = new SelectionInput(this, bridge);
bridge.on('selectionChanged', () => this.updateSelectionRing());
this.updateSelectionRing();
```

- 新增方法：

```ts
private updateSelectionRing(): void {
  const id = (this.game.registry.get('bridge') as UiBridge).getSelectedCampId();
  if (id === null) {
    this.selectionRing.setVisible(false);
    return;
  }
  const camp = this.gameState.getCamp(id);
  if (!camp) {
    this.selectionRing.setVisible(false);
    return;
  }
  this.selectionRing.setPosition(camp.x, camp.y).setVisible(true);
}
```

- [ ] **Step 3: 手动验收**

Run: `npm run dev`
临时在 `create` 末尾加 `(this.game.registry.get('bridge') as UiBridge).selectCampKind('sword');`，放置 2–3 个军营后，注释掉该行（恢复非放置模式）。

Expected:
- 非放置模式下，左键点击军营 → 出现黄色选中圈
- 点击空地 → 取消选中（圈消失）
- 选中后按 `Delete` → 军营消失，圈消失

验收后删除临时代码。

- [ ] **Step 4: Commit**

```bash
git add src/game/managers/SelectionInput.ts src/game/BattleScene.ts
git commit -m "feat(game): 军营选中（点击高亮）与 Delete 删除"
```

---

## Task 10: DOM UI（BuildPanel + InfoPanel + 快捷键）

**Files:**
- Create: `src/ui/BuildPanel.ts`, `src/ui/InfoPanel.ts`, `src/ui/ui.css`；Modify: `src/main.ts`

- [ ] **Step 1: 创建 `src/ui/ui.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #game { width: 100%; height: 100%; overflow: hidden; }
#game canvas { display: block; }

.ui { position: absolute; pointer-events: none; font-family: system-ui, sans-serif; }
.ui > * { pointer-events: auto; }

#build-panel { top: 60px; left: 12px; display: flex; flex-direction: column; gap: 8px;
  background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; color: #fff; }
#build-panel .row { display: flex; gap: 6px; }
#build-panel button { padding: 8px 10px; border: 0; border-radius: 6px; cursor: pointer; font-size: 14px; }
#build-panel button.active { outline: 3px solid #ffeb3b; }
.f-red { background: #e53935; color: #fff; }
.f-blue { background: #1e88e5; color: #fff; }

#info-panel { top: 60px; right: 12px; width: 200px; background: rgba(0,0,0,0.5);
  padding: 10px; border-radius: 8px; color: #fff; font-size: 13px; }
#info-panel button { margin-top: 6px; padding: 6px; width: 100%; border: 0; border-radius: 6px; cursor: pointer; }
#info-panel .danger { background: #e53935; color: #fff; }

#hint { top: 8px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 12px;
  background: rgba(0,0,0,0.4); padding: 4px 10px; border-radius: 6px; }

@media (pointer: coarse) {
  #build-panel button, #info-panel button { padding: 12px 14px; font-size: 16px; }
}
```

- [ ] **Step 2: 创建 `src/ui/BuildPanel.ts`**

```ts
import type { UiBridge } from './UiBridge';
import type { CampKind, Faction } from '../game/types';

const KINDS: { key: CampKind; label: string }[] = [
  { key: 'sword', label: '剑兵营 Q' },
  { key: 'shield', label: '盾兵营 W' },
  { key: 'archer', label: '弓兵营 E' },
  { key: 'javelin', label: '投矛营 R' },
];

export class BuildPanel {
  private buttons = new Map<CampKind, HTMLButtonElement>();

  constructor(private bridge: UiBridge) {
    const root = document.createElement('div');
    root.id = 'build-panel';
    root.className = 'ui';

    const factionRow = document.createElement('div');
    factionRow.className = 'row';
    factionRow.append(this.factionBtn('红方', 'red'), this.factionBtn('蓝方', 'blue'));

    const campCol = document.createElement('div');
    campCol.className = 'row';
    campCol.style.flexDirection = 'column';
    for (const k of KINDS) {
      const b = document.createElement('button');
      b.textContent = k.label;
      b.onclick = () => bridge.selectCampKind(k.key);
      campCol.append(b);
      this.buttons.set(k.key, b);
    }

    root.append(factionRow, campCol);
    document.body.append(root);

    bridge.on('placementChanged', () => this.render());
    this.bindHotkeys();
    this.render();
  }

  private factionBtn(label: string, f: Faction): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = f === 'red' ? 'f-red' : 'f-blue';
    b.onclick = () => this.bridge.selectFaction(f);
    return b;
  }

  private bindHotkeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === '1') this.bridge.selectFaction('red');
      else if (e.key === '2') this.bridge.selectFaction('blue');
      const map: Record<string, CampKind> = { q: 'sword', w: 'shield', e: 'archer', r: 'javelin' };
      if (map[e.key]) this.bridge.selectCampKind(map[e.key]);
    });
  }

  private render(): void {
    const sel = this.bridge.getSelection();
    for (const [kind, btn] of this.buttons) {
      btn.classList.toggle('active', sel.kind === kind);
    }
  }
}
```

- [ ] **Step 3: 创建 `src/ui/InfoPanel.ts`**

```ts
import type { UiBridge } from './UiBridge';
import type { BattleScene } from '../game/BattleScene';

const KIND_LABEL: Record<string, string> = {
  sword: '剑兵营', shield: '盾兵营', archer: '弓兵营', javelin: '投矛营',
};

export class InfoPanel {
  private body: HTMLDivElement;

  constructor(private bridge: UiBridge, private scene: BattleScene) {
    const el = document.createElement('div');
    el.id = 'info-panel';
    el.className = 'ui';
    this.body = document.createElement('div');
    const del = document.createElement('button');
    del.textContent = '删除军营';
    del.className = 'danger';
    del.onclick = () => bridge.deleteSelected(scene);
    el.append(this.body, del);
    document.body.append(el);

    bridge.on('selectionChanged', () => this.render());
    this.render();
  }

  private render(): void {
    const id = this.bridge.getSelectedCampId();
    const camp = id ? this.scene.exposeGameState().getCamp(id) : undefined;
    if (!camp) {
      this.body.innerHTML = '<div>未选中</div>';
      return;
    }
    const factionLabel = camp.faction === 'red' ? '红方' : '蓝方';
    this.body.innerHTML = `
      <div><b>${factionLabel} ${KIND_LABEL[camp.kind]}</b></div>
      <div>生命值：${camp.hp} / ${camp.maxHp}</div>
      <div>位置：(${Math.round(camp.x)}, ${Math.round(camp.y)})</div>
    `;
  }
}
```

- [ ] **Step 4: 修改 `src/main.ts` 挂载 DOM UI**

```ts
import Phaser from 'phaser';
import { BootScene } from './game/BootScene';
import { BattleScene } from './game/BattleScene';
import { UiBridge } from './ui/UiBridge';
import { BuildPanel } from './ui/BuildPanel';
import { InfoPanel } from './ui/InfoPanel';
import './ui/ui.css';

const bridge = new UiBridge();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#7cb342',
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, BattleScene],
});

game.registry.add('bridge', bridge);

// BattleScene 由 BootScene 启动；UI 在启动后绑定 scene 引用
game.events.once('ready', () => {
  const battle = game.scene.getScene('BattleScene') as BattleScene;
  new BuildPanel(bridge);
  new InfoPanel(bridge, battle);
});
```

- [ ] **Step 5: 手动验收**

Run: `npm run dev`
Expected:
- 顶部提示文字、左侧建造面板（红方/蓝方 + 4 军营按钮）、右侧信息面板显示
- 点「红方」→ 红方高亮；点「剑兵营 Q」→ 该按钮高亮，鼠标移动显示预览
- 左键空地放置红方军营
- 键盘 `2` 切蓝方、`W` 切盾兵营，放置蓝方盾兵营
- 未选军营类型时，点击军营 → 选中（黄圈 + 右侧信息）
- 「删除军营」按钮 或 `Delete` 键删除选中

Ctrl+C 停止。

- [ ] **Step 6: Commit**

```bash
git add src/ui/BuildPanel.ts src/ui/InfoPanel.ts src/ui/ui.css src/main.ts
git commit -m "feat(ui): DOM 建造面板 + 信息面板 + 键盘快捷键"
```

---

## Task 11: 阶段 1 集成验收

**Files:** 无新增，对照 PRD 23.1 / 23.6

- [ ] **Step 1: 跑全部单元测试**

Run: `npm test`
Expected: 全部 PASS（camps / GameState / placement / SelectionManager）

- [ ] **Step 2: 对照 PRD 23.1（基础放置）手动验收**

| 验收项 | 操作 | 期望 |
| ---- | ---- | ---- |
| 可选择红方 | 点「红方」/ 按 `1` | 高亮 |
| 可选择蓝方 | 点「蓝方」/ 按 `2` | 高亮 |
| 可选择 4 种军营 | 点按钮 / `Q W E R` | 对应高亮 |
| 可放置军营 | 选类型后左键空地 | 出现对应军营 |
| 不允许重叠 | 在已有军营 90px 内点击 | 预览变红，不放置 |
| 放置预览 | 移动鼠标 | 半透明圆（绿/红） |

- [ ] **Step 3: 对照 PRD 23.6（无限画布）手动验收**

| 验收项 | 操作 | 期望 |
| ---- | ---- | ---- |
| 可拖动 | 右键拖拽 | 画布平移 |
| 可缩放 | 滚轮 | 缩放 0.3x–2.5x |
| 放置坐标正确 | 缩放/拖动后放置 | 军营落在点击的世界位置 |
| 选中可跨视角 | 拖动后点击远处军营 | 正常选中 |

- [ ] **Step 4: 修复发现的问题（若有）并补充 commit**

```bash
# 仅在有修复时
git add -A
git commit -m "fix: 阶段1验收修复"
```

- [ ] **Step 5: 标记阶段 1 完成**

至此阶段 1（基础地图与放置）完成。下一份计划：阶段 2 — 产兵与基础小兵。

---

## 阶段 1 完成后

产出可工作、可测试的最小放置沙盒。后续阶段计划（各自一份 plan）：
- 阶段 2：产兵与基础小兵（CampManager / Unit 数据与渲染 / 血条 / 移动）
- 阶段 3：自动战斗（UnitManager 寻敌 / SpatialGrid / CombatSystem / 军营摧毁）
- 阶段 4：沙盒控制与统计（SimulationClock / ControlBar / StatsTracker / HudController）
- 阶段 5：升级系统与完整 MVP（InfoPanel 升级 / 升级同步 / 响应式 / 性能）
