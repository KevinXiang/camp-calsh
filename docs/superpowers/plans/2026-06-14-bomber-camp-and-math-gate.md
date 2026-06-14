# 爆破营 + 算术题解锁机制 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增爆破营（远程 TNT 抛物线 + 50px AOE，含敌军营），并给投矛/爆破营加算术题门控（10 以内加减法，答对全局解锁 60s，暂停时不流逝）。

**Architecture:** 两个正交子系统通过 `GameState.sim.unlockTimer` 单一字段解耦。算术题模块（纯函数 `generateProblem` + `MathQuizModal` DOM 组件）完全独立于战斗；战斗 AOE 通过新方法 `CombatSystem.applyAOE` 实现，命中走新 `bombHit` 事件（盾兵仍优先走 `shieldBlock`）。视觉沿用 javelin/shield 特效已建立的模式。

**Tech Stack:** TypeScript + Phaser 3 + vitest。

**Spec：** [docs/superpowers/specs/2026-06-14-bomber-camp-and-math-gate-design.md](../specs/2026-06-14-bomber-camp-and-math-gate-design.md)

---

## File Structure

| File | 改动类型 | 责任 |
|---|---|---|
| `src/game/types.ts` | 修改 | CampKind/ProjectileKind 加 bomb；CombatEvent 加 bombHit/bombExplosion |
| `src/game/GameState.ts` | 修改 | SimState 加 unlockTimer |
| `src/config/units.ts` | 修改 | 加 bomb 兵种数值 |
| `src/config/camps.ts` | 修改 | 加 bomb 营数值 |
| `src/game/managers/CombatSystem.ts` | 修改 | DamageOpts.weaponKind 加 bomb；applyAOE 新方法；applyDamage bombHit 分支；step 弹道分发 |
| `src/game/managers/UnitManager.ts` | 修改 | 推炸弹时 kind=bomb |
| `src/game/effects/types.ts` | 修改 | CombatEvent 加 bombHit/bombExplosion |
| `src/game/effects/EffectManager.ts` | 修改 | dispatch 加 case；spawnBombExplosion |
| `src/game/BattleScene.ts` | 修改 | unlockTimer 推进；闪白白名单加 bombHit |
| `src/game/projectileRenderer.ts` | 修改 | drawBomb/updateBomb（抛物线 + TNT 木箱） |
| `src/game/unitRenderer.ts` | 修改 | drawWeapon case bomb；playBombThrowAnim；maybeTriggerAttackAnim case |
| `src/game/campRenderer.ts` | 修改 | 颜色映射加 bomb；drawBombCamp |
| `src/ui/mathQuiz.ts` | **新建** | generateProblem 纯函数 |
| `src/ui/MathQuizModal.ts` | **新建** | 弹窗 DOM 组件 |
| `src/ui/UiBridge.ts` | 修改 | unlockGate/isUnlocked |
| `src/ui/BuildPanel.ts` | 修改 | KINDS 加 bomb + gated；onclick/dragstart/hotkey 拦截 |
| `src/ui/HudController.ts` | 修改 | 倒计时显示 |
| `src/game/managers/PlacementController.ts` | 修改 | placeCamp 兜底 |
| `tests/mathQuiz.test.ts` | **新建** | 题目生成器测试 |
| `tests/CombatSystem.aoe.test.ts` | **新建** | applyAOE 测试 |
| `tests/CombatSystem.events.test.ts` | 修改 | 加 bombHit 测试 |
| `tests/CombatSystem.test.ts` | 修改 | 加"弹道 kind=bomb 触发 AOE"测试 |
| `tests/camps.test.ts` | 修改 | 4 种→5 种；unitCap 断言修正 |
| `tests/units.test.ts` | 修改 | 4 种→5 种；加 bomb 数值断言 |

---

## Task 1: 数据契约层 — 类型扩展

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/effects/types.ts`
- Modify: `src/game/GameState.ts`

- [ ] **Step 1: types.ts — CampKind / ProjectileKind 加 bomb**

修改 [src/game/types.ts:3](../../../src/game/types.ts#L3) 和 [src/game/types.ts:63](../../../src/game/types.ts#L63)：

```ts
export type CampKind = 'sword' | 'shield' | 'archer' | 'javelin' | 'bomb';
```

```ts
export type ProjectileKind = 'arrow' | 'javelin' | 'bomb';
```

- [ ] **Step 2: effects/types.ts — CombatEvent 加 bombHit / bombExplosion**

修改 [src/game/effects/types.ts](../../../src/game/effects/types.ts)：

```ts
import type { Faction } from '../types';

export type CombatEvent =
  | { kind: 'meleeHit'; x: number; y: number; faction: Faction }
  | { kind: 'javelinHit'; x: number; y: number; faction: Faction }
  | { kind: 'shieldBlock'; x: number; y: number; faction: Faction }
  | { kind: 'bombHit'; x: number; y: number; faction: Faction }
  | { kind: 'bombExplosion'; x: number; y: number; faction: Faction }
  | { kind: 'unitDeath'; unitId: string; x: number; y: number; faction: Faction }
  | { kind: 'campHit'; campId: string; x: number; y: number }
  | { kind: 'campDestroyed'; campId: string; x: number; y: number; faction: Faction };
```

- [ ] **Step 3: GameState.ts — SimState 加 unlockTimer**

修改 [src/game/GameState.ts:4-10](../../../src/game/GameState.ts#L4-L10) 的 `SimState`：

```ts
export interface SimState {
  running: boolean;
  speed: 1 | 2 | 4 | 8 | 10;
  timeMs: number;
  /** 每阵营独立的产兵速度倍率（1=默认，>1 加快，<1 减慢）。玩家可在战斗中实时调整。 */
  spawnMultiplier: { red: number; blue: number };
  /**
   * 投矛/爆破营解锁倒计时（秒）。> 0 时这两类营无需答题；每个 sim step 减 dt。
   * 仅 sim.running 时流逝（暂停冻结）。初始 0（首次必须先答题）。
   */
  unlockTimer: number;
}
```

修改 [src/game/GameState.ts:17](../../../src/game/GameState.ts#L17) 的默认值：

```ts
  sim: SimState = { running: false, speed: 1, timeMs: 0, spawnMultiplier: { red: 1, blue: 1 }, unlockTimer: 0 };
```

- [ ] **Step 4: 验证编译（会有错误指向未覆盖的 switch case 和缺配置，正常）**

```bash
cd e:/0-projects/ai-games/camp-clash && npm run build 2>&1 | head -30
```

期望：TS 报告 `CampKind` 缺 `bomb` 配置（units.ts/camps.ts）、`switch` 未覆盖 `bomb`（campRenderer/BuildPanel 等）。这是预期的，后续 task 修。本 task **不 commit**。

---

## Task 2: 配置层 — 爆破营 + 炸弹兵数值

**Files:**
- Modify: `src/config/units.ts`
- Modify: `src/config/camps.ts`
- Modify: `tests/camps.test.ts`
- Modify: `tests/units.test.ts`

- [ ] **Step 1: units.ts 加 bomb**

修改 [src/config/units.ts](../../../src/config/units.ts)：

```ts
import type { UnitDef, UnitKind } from '../game/types';

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  sword:   { kind: 'sword',   attackType: 'melee',  maxHp: 100, attack: 10, attackRange: 35,  attackInterval: 1.0, moveSpeed: 60 },
  shield:  { kind: 'shield',  attackType: 'melee',  maxHp: 160, attack: 7,  attackRange: 35,  attackInterval: 1.2, moveSpeed: 45 },
  archer:  { kind: 'archer',  attackType: 'ranged', maxHp: 60,  attack: 8,  attackRange: 180, attackInterval: 1.2, moveSpeed: 45 },
  javelin: { kind: 'javelin', attackType: 'ranged', maxHp: 70,  attack: 18, attackRange: 150, attackInterval: 2.0, moveSpeed: 40 },
  bomb:    { kind: 'bomb',    attackType: 'ranged', maxHp: 50,  attack: 15, attackRange: 120, attackInterval: 2.5, moveSpeed: 35 },
};
```

- [ ] **Step 2: camps.ts 加 bomb**

修改 [src/config/camps.ts](../../../src/config/camps.ts)：

```ts
import type { CampDef, CampKind } from '../game/types';

export const CAMP_DEFS: Record<CampKind, CampDef> = {
  sword:   { kind: 'sword',   produces: 'sword',   maxHp: 500, spawnInterval: 4, unitCap: 20 },
  shield:  { kind: 'shield',  produces: 'shield',  maxHp: 600, spawnInterval: 5, unitCap: 20 },
  archer:  { kind: 'archer',  produces: 'archer',  maxHp: 450, spawnInterval: 5, unitCap: 20 },
  javelin: { kind: 'javelin', produces: 'javelin', maxHp: 450, spawnInterval: 6, unitCap: 20 },
  bomb:    { kind: 'bomb',    produces: 'bomb',    maxHp: 400, spawnInterval: 7, unitCap: 12 },
};

/** 军营之间最小放置间距（世界坐标 px） */
export const CAMP_MIN_DISTANCE = 90;
```

- [ ] **Step 3: 修测试 fixture — camps.test.ts**

修改 [tests/camps.test.ts](../../../tests/camps.test.ts)：

```ts
import { describe, it, expect } from 'vitest';
import { CAMP_DEFS } from '../src/config/camps';
import type { CampKind } from '../src/game/types';

describe('CAMP_DEFS', () => {
  it('包含 5 种军营', () => {
    const kinds: CampKind[] = ['sword', 'shield', 'archer', 'javelin', 'bomb'];
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

  it('爆破营数值 400/7/12', () => {
    expect(CAMP_DEFS.bomb).toMatchObject({ maxHp: 400, spawnInterval: 7, unitCap: 12 });
  });

  it('非爆破军营 unitCap 为 20，爆破营为 12', () => {
    expect(CAMP_DEFS.sword.unitCap).toBe(20);
    expect(CAMP_DEFS.shield.unitCap).toBe(20);
    expect(CAMP_DEFS.archer.unitCap).toBe(20);
    expect(CAMP_DEFS.javelin.unitCap).toBe(20);
    expect(CAMP_DEFS.bomb.unitCap).toBe(12);
  });
});
```

- [ ] **Step 4: 修测试 fixture — units.test.ts**

修改 [tests/units.test.ts](../../../tests/units.test.ts)：

```ts
import { describe, it, expect } from 'vitest';
import { UNIT_DEFS } from '../src/config/units';
import type { UnitKind } from '../src/game/types';

describe('UNIT_DEFS', () => {
  it('包含 5 种小兵', () => {
    const kinds: UnitKind[] = ['sword', 'shield', 'archer', 'javelin', 'bomb'];
    for (const k of kinds) expect(UNIT_DEFS[k]).toBeDefined();
  });
  it('剑兵数值符合 PRD 9.3', () => {
    expect(UNIT_DEFS.sword).toMatchObject({ attackType: 'melee', maxHp: 100, attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60 });
  });
  it('盾兵数值', () => {
    expect(UNIT_DEFS.shield).toMatchObject({ attackType: 'melee', maxHp: 160, attack: 7 });
  });
  it('弓兵数值', () => {
    expect(UNIT_DEFS.archer).toMatchObject({ attackType: 'ranged', maxHp: 60, attack: 8, attackRange: 180 });
  });
  it('投矛兵数值', () => {
    expect(UNIT_DEFS.javelin).toMatchObject({ attackType: 'ranged', maxHp: 70, attack: 18, attackInterval: 2.0 });
  });
  it('炸弹兵数值', () => {
    expect(UNIT_DEFS.bomb).toMatchObject({ attackType: 'ranged', maxHp: 50, attack: 15, attackRange: 120, attackInterval: 2.5, moveSpeed: 35 });
  });
});
```

- [ ] **Step 5: 跑测试 + 构建确认数据层就绪**

```bash
npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -5
```

期望：camps/units 测试通过；构建仍可能因 `CampKind` switch 未覆盖报错（campRenderer/BuildPanel），后续 task 修。

- [ ] **Step 6: Commit Task 1+2（数据契约 + 配置）**

```bash
git add src/game/types.ts src/game/effects/types.ts src/game/GameState.ts \
        src/config/units.ts src/config/camps.ts \
        tests/camps.test.ts tests/units.test.ts
git commit -m "feat(types): 爆破营数据契约 — CampKind/ProjectileKind 加 bomb + unlockTimer 字段

- CampKind/UnitKind 加 'bomb'；ProjectileKind 加 'bomb'
- CombatEvent 加 bombHit / bombExplosion
- SimState 加 unlockTimer（投矛/爆破解锁倒计时，初始 0）
- UNIT_DEFS / CAMP_DEFS 加 bomb 配置（HP50/攻15/范围120；营 400/7s/cap12）
- 测试 fixture 同步：5 兵种、bomb unitCap=12"
```

---

## Task 3: 算术题纯函数 generateProblem (TDD)

**Files:**
- Create: `tests/mathQuiz.test.ts`
- Create: `src/ui/mathQuiz.ts`

- [ ] **Step 1: 写失败测试**

创建 [tests/mathQuiz.test.ts](../../../tests/mathQuiz.test.ts)：

```ts
import { describe, it, expect } from 'vitest';
import { generateProblem } from '../src/ui/mathQuiz';

// 用确定性 rng 便于断言具体输出
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('generateProblem', () => {
  it('加法题：a + b === answer，且 answer ≤ 10', () => {
    // rng() < 0.5 → '+'；sum = floor(rng()*11)；a = floor(rng()*(sum+1))
    // values: [0.0(+), 0.5(sum=5), 0.4(a=2)] → a=2 b=3 answer=5
    const p = generateProblem(seqRng([0.0, 0.5, 0.4]));
    expect(p.op).toBe('+');
    expect(p.a).toBe(2);
    expect(p.b).toBe(3);
    expect(p.answer).toBe(5);
  });

  it('减法题：a - b === answer，且 answer ≥ 0', () => {
    // rng() >= 0.5 → '-'；a = floor(rng()*10)；b = floor(rng()*(a+1))
    // values: [0.6(-), 0.7(a=7), 0.3(b=2)] → a=7 b=2 answer=5
    const p = generateProblem(seqRng([0.6, 0.7, 0.3]));
    expect(p.op).toBe('-');
    expect(p.a).toBe(7);
    expect(p.b).toBe(2);
    expect(p.answer).toBe(5);
  });

  it('答案始终在 [0, 10] 区间（随机采样 1000 次）', () => {
    let sawPlus = false, sawMinus = false;
    for (let i = 0; i < 1000; i++) {
      const p = generateProblem();
      expect(p.answer).toBeGreaterThanOrEqual(0);
      expect(p.answer).toBeLessThanOrEqual(10);
      expect(p.a).toBeGreaterThanOrEqual(0);
      expect(p.b).toBeGreaterThanOrEqual(0);
      if (p.op === '+') {
        sawPlus = true;
        expect(p.a + p.b).toBe(p.answer);
      } else {
        sawMinus = true;
        expect(p.a - p.b).toBe(p.answer);
      }
    }
    expect(sawPlus).toBe(true);
    expect(sawMinus).toBe(true);
  });

  it('减法保证 a >= b（不出负数结果）', () => {
    for (let i = 0; i < 500; i++) {
      const p = generateProblem();
      if (p.op === '-') {
        expect(p.a).toBeGreaterThanOrEqual(p.b);
      }
    }
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npx vitest run tests/mathQuiz.test.ts 2>&1 | tail -10
```

期望：FAIL，报 `Cannot find module '../src/ui/mathQuiz'`。

- [ ] **Step 3: 实现 generateProblem**

创建 [src/ui/mathQuiz.ts](../../../src/ui/mathQuiz.ts)：

```ts
export interface Problem {
  a: number;
  b: number;
  op: '+' | '-';
  answer: number;
}

/**
 * 生成一道 10 以内加减法。
 * - 加法：a + b ≤ 10
 * - 减法：a - b ≥ 0（即 a ≥ b）
 * 答案始终在 [0, 10]。rng 可注入便于测试。
 */
export function generateProblem(rng: () => number = Math.random): Problem {
  const op: '+' | '-' = rng() < 0.5 ? '+' : '-';
  if (op === '+') {
    const sum = Math.floor(rng() * 11);          // 0..10
    const a = Math.floor(rng() * (sum + 1));     // 0..sum
    return { a, b: sum - a, op: '+', answer: sum };
  } else {
    const a = Math.floor(rng() * 10);            // 0..9
    const b = Math.floor(rng() * (a + 1));       // 0..a
    return { a, b, op: '-', answer: a - b };
  }
}
```

- [ ] **Step 4: 验证测试通过**

```bash
npx vitest run tests/mathQuiz.test.ts 2>&1 | tail -8
```

期望：4 tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/ui/mathQuiz.ts tests/mathQuiz.test.ts
git commit -m "feat(math): 10 以内加减法题目生成器

generateProblem 纯函数：加法 a+b≤10、减法 a-b≥0、答案∈[0,10]。
rng 可注入便于确定性测试。为算术题门控铺基础。"
```

---

## Task 4: CombatSystem.applyAOE + bombHit 分发 (TDD)

**Files:**
- Modify: `src/game/managers/CombatSystem.ts`
- Create: `tests/CombatSystem.aoe.test.ts`
- Modify: `tests/CombatSystem.events.test.ts`
- Modify: `tests/CombatSystem.test.ts`

- [ ] **Step 1: DamageOpts.weaponKind 加 bomb**

修改 [src/game/managers/CombatSystem.ts:12-16](../../../src/game/managers/CombatSystem.ts#L12-L16)：

```ts
export interface DamageOpts {
  source: 'melee' | 'ranged';
  /** 仅 source==='ranged' 时有意义；用于命中特效分发。 */
  weaponKind?: 'arrow' | 'javelin' | 'bomb';
}
```

- [ ] **Step 2: applyDamage 单位分支加 bombHit**

修改 [src/game/managers/CombatSystem.ts:21-35](../../../src/game/managers/CombatSystem.ts#L21-L35)（在 shieldBlock 分支后、else 分支内加 bomb 判断）：

```ts
    if ('alive' in target) {
      // 盾兵被打：所有命中（近战/弓/矛/炸弹）走 shieldBlock 火花。
      if (target.kind === 'shield') {
        gs.events.push({ kind: 'shieldBlock', x: target.x, y: target.y, faction: target.faction });
      } else if (opts.weaponKind === 'bomb') {
        // 炸弹 AOE 命中普通单位：独立 bombHit（仅触发闪白，无独立特效）
        gs.events.push({ kind: 'bombHit', x: target.x, y: target.y, faction: target.faction });
      } else {
        const isJavelin = opts.source === 'ranged' && opts.weaponKind === 'javelin';
        gs.events.push(isJavelin
          ? { kind: 'javelinHit', x: target.x, y: target.y, faction: target.faction }
          : { kind: 'meleeHit',   x: target.x, y: target.y, faction: target.faction }
        );
      }
      if (target.hp <= 0) {
```

- [ ] **Step 3: 写 applyAOE 失败测试**

创建 [tests/CombatSystem.aoe.test.ts](../../../tests/CombatSystem.aoe.test.ts)：

```ts
import { describe, it, expect } from 'vitest';
import { CombatSystem, type CombatGSView } from '../src/game/managers/CombatSystem';
import type { Camp, Unit } from '../src/game/types';

function mkCamp(o: Partial<Camp> = {}): Camp {
  return { id: 'c1', faction: 'blue', kind: 'sword', x: 0, y: 0, hp: 500, maxHp: 500,
    spawnTimer: 0, upgrades: { production: 1, health: 1, weapon: 1 }, aliveUnits: 1, destroyed: false, ...o };
}
function mkUnit(o: Partial<Unit> = {}): Unit {
  return { id: 'u1', faction: 'blue', kind: 'sword', campId: 'c1', x: 0, y: 0, hp: 100, maxHp: 100,
    attack: 10, attackRange: 35, attackInterval: 1.0, moveSpeed: 60,
    attackTimer: 0, targetId: null, state: 'moving', alive: true, deathTimer: 0, ...o };
}
function mkGS(overrides: Partial<CombatGSView> = {}): CombatGSView {
  return {
    units: new Map(), camps: new Map(), projectiles: [], events: [],
    stats: { red: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 },
             blue: { unitsAlive: 0, campsAlive: 0, kills: 0, campsDestroyed: 0 } },
    ...overrides,
  };
}

describe('CombatSystem.applyAOE', () => {
  it('半径内所有敌方 unit 受伤', () => {
    const u1 = mkUnit({ id: 'u1', x: 10, y: 0, hp: 100 });
    const u2 = mkUnit({ id: 'u2', x: 40, y: 0, hp: 100 });   // dist=40 < 50
    const u3 = mkUnit({ id: 'u3', x: 60, y: 0, hp: 100 });   // dist=60 > 50
    const gs = mkGS({ units: new Map([[u1.id, u1], [u2.id, u2], [u3.id, u3]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(u1.hp).toBe(80);
    expect(u2.hp).toBe(80);
    expect(u3.hp).toBe(100);
  });

  it('不打自己人（同阵营跳过）', () => {
    const enemy = mkUnit({ id: 'e', faction: 'blue', x: 10, y: 0, hp: 100 });
    const ally = mkUnit({ id: 'a', faction: 'red', x: 10, y: 0, hp: 100 });
    const gs = mkGS({ units: new Map([[enemy.id, enemy], [ally.id, ally]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(enemy.hp).toBe(80);
    expect(ally.hp).toBe(100);
  });

  it('半径内敌方 camp 也受伤', () => {
    const c = mkCamp({ id: 'camp1', faction: 'blue', x: 30, y: 0, hp: 500 });
    const gs = mkGS({ camps: new Map([[c.id, c]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(c.hp).toBe(480);
  });

  it('每次爆炸推一个 bombExplosion 事件', () => {
    const gs = mkGS();
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(gs.events.filter(ev => ev.kind === 'bombExplosion')).toHaveLength(1);
  });

  it('圈内盾兵走 shieldBlock（盾兵身份压过 bomb）', () => {
    const shield = mkUnit({ id: 's', faction: 'blue', kind: 'shield', x: 10, y: 0, hp: 160 });
    const gs = mkGS({ units: new Map([[shield.id, shield]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(gs.events.some(ev => ev.kind === 'shieldBlock')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'bombHit')).toBe(false);
    expect(shield.hp).toBe(140);   // 仍受伤害
  });

  it('圈内普通 unit 走 bombHit', () => {
    const u = mkUnit({ id: 'u', faction: 'blue', kind: 'sword', x: 10, y: 0, hp: 100 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyAOE(0, 0, 20, 'red', gs, 50);
    expect(gs.events.some(ev => ev.kind === 'bombHit')).toBe(true);
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });
});
```

- [ ] **Step 4: 运行测试验证失败**

```bash
npx vitest run tests/CombatSystem.aoe.test.ts 2>&1 | tail -10
```

期望：FAIL，报 `CombatSystem.applyAOE is not a function`。

- [ ] **Step 5: 实现 applyAOE**

在 [src/game/managers/CombatSystem.ts](../../../src/game/managers/CombatSystem.ts) 的 `applyDamage` 方法之后、`step` 方法之前插入。先确认文件顶部 import 含 `Faction`：

```ts
import type { Camp, Unit, Projectile, SideStats, Faction } from '../types';
```

然后插入方法：

```ts
  /**
   * 炸弹爆炸：在 (x,y) radius 圆内对所有 alive 敌方 unit + 未摧毁敌方 camp 各扣 dmg。
   * 盾兵仍走 shieldBlock（身份压过武器）；普通 unit 走 bombHit。
   * 每次调用推一个 bombExplosion 事件（用于爆炸特效，与命中数无关）。
   */
  static applyAOE(
    x: number, y: number, dmg: number,
    attackerFaction: Faction, gs: CombatGSView, radius = 50,
  ): void {
    const r2 = radius * radius;
    for (const u of gs.units.values()) {
      if (!u.alive || u.faction === attackerFaction) continue;
      const dx = u.x - x; const dy = u.y - y;
      if (dx * dx + dy * dy > r2) continue;
      CombatSystem.applyDamage(u, dmg, gs, { source: 'ranged', weaponKind: 'bomb' });
    }
    for (const c of gs.camps.values()) {
      if (c.destroyed || c.faction === attackerFaction) continue;
      const dx = c.x - x; const dy = c.y - y;
      if (dx * dx + dy * dy > r2) continue;
      CombatSystem.applyDamage(c, dmg, gs, { source: 'ranged' });
    }
    gs.events.push({ kind: 'bombExplosion', x, y, faction: attackerFaction });
  }
```

- [ ] **Step 6: 验证 applyAOE 测试通过**

```bash
npx vitest run tests/CombatSystem.aoe.test.ts 2>&1 | tail -8
```

期望：6 tests passed。

- [ ] **Step 7: CombatSystem.step 弹道命中分发 bomb**

修改 [src/game/managers/CombatSystem.ts:60-65](../../../src/game/managers/CombatSystem.ts#L60-L65)（dist < 12 分支）：

```ts
      if (dist < 12) {
        if (p.kind === 'bomb') {
          CombatSystem.applyAOE(p.x, p.y, p.damage, p.faction, gs);
        } else {
          CombatSystem.applyDamage(target as Unit | Camp, p.damage, gs, {
            source: 'ranged',
            weaponKind: p.kind,
          });
        }
        continue;
      }
```

目标已死时炸弹仍要爆炸 — 修改 [src/game/managers/CombatSystem.ts:53-55](../../../src/game/managers/CombatSystem.ts#L53-L55) 的 `if (!target)` 分支：

```ts
      const target = gs.units.get(p.targetId) ?? gs.camps.get(p.targetId);
      if (!target) {
        if (p.kind === 'bomb') {
          CombatSystem.applyAOE(p.x, p.y, p.damage, p.faction, gs);
        }
        continue;
      }
```

- [ ] **Step 8: CombatSystem.test.ts 加"弹道 kind=bomb 触发 AOE"测试**

在 [tests/CombatSystem.test.ts](../../../tests/CombatSystem.test.ts) 末尾 `describe` 闭合前加：

```ts
  it('弹道 kind=bomb 命中触发 AOE（范围内多目标受伤）', () => {
    const u1 = mkUnit({ id: 't1', faction: 'red', hp: 100, x: 200, y: 0 });
    const u2 = mkUnit({ id: 't2', faction: 'red', hp: 100, x: 220, y: 0 });   // 距 u1=20 < 50
    const p: Projectile = { id: 'p1', kind: 'bomb', x: 195, y: 0, targetId: 't1', speed: 200, damage: 20, faction: 'blue', elapsed: 0, maxTime: 2 };
    const gs = mkGS({ units: new Map([[u1.id, u1], [u2.id, u2]]), projectiles: [p] });
    CombatSystem.step(gs, 1);
    expect(u1.hp).toBe(80);
    expect(u2.hp).toBe(80);   // AOE 命中圈外附近的兵
    expect(gs.events.some(ev => ev.kind === 'bombExplosion')).toBe(true);
  });
```

- [ ] **Step 9: CombatSystem.events.test.ts 加 bombHit 测试**

在 [tests/CombatSystem.events.test.ts](../../../tests/CombatSystem.events.test.ts) 末尾 `describe` 闭合前加：

```ts
  it('炸弹命中普通单位推 bombHit 而非 meleeHit', () => {
    const u = mkUnit({ kind: 'sword', x: 20, y: 30 });
    const gs = mkGS({ units: new Map([[u.id, u]]) });
    CombatSystem.applyDamage(u, 15, gs, { source: 'ranged', weaponKind: 'bomb' });
    const e = gs.events.find(ev => ev.kind === 'bombHit') as Extract<CombatEvent, { kind: 'bombHit' }>;
    expect(e).toBeDefined();
    expect(e.x).toBe(20);
    expect(e.y).toBe(30);
    expect(gs.events.some(ev => ev.kind === 'meleeHit')).toBe(false);
  });
```

- [ ] **Step 10: 跑全部测试 + 构建确认**

```bash
npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -3
```

期望：全部通过（原 81 + aoe 6 + combat 1 + events 1 = 89）；构建成功。

- [ ] **Step 11: Commit**

```bash
git add src/game/managers/CombatSystem.ts tests/CombatSystem.aoe.test.ts \
        tests/CombatSystem.test.ts tests/CombatSystem.events.test.ts
git commit -m "feat(combat): CombatSystem.applyAOE 炸弹范围伤害 + bombHit 事件

- applyAOE：50px 圈内敌方 unit + camp 各扣 dmg，推 bombExplosion 事件
- applyDamage 加 bombHit 分支（盾兵仍优先 shieldBlock）
- step 弹道命中按 p.kind 分发：bomb → AOE，其它 → 单体 applyDamage
- 目标已死时炸弹原地爆炸（不消失）
- DamageOpts.weaponKind 加 'bomb'"
```

---

## Task 5: UnitManager 推炸弹

**Files:**
- Modify: `src/game/managers/UnitManager.ts`

- [ ] **Step 1: 改 ranged 分支按兵种选 projectile kind**

修改 [src/game/managers/UnitManager.ts:1](../../../src/game/managers/UnitManager.ts#L1) import 加 ProjectileKind：

```ts
import type { Camp, Unit, Projectile, ProjectileKind, SideStats } from '../types';
```

修改 [src/game/managers/UnitManager.ts:73-79](../../../src/game/managers/UnitManager.ts#L73-L79)：

```ts
        if (UNIT_DEFS[u.kind]?.attackType === 'ranged') {
          const dx = tx - u.x; const dy = ty - u.y; const d = Math.hypot(dx, dy) || 1;
          const projKind: ProjectileKind =
            u.kind === 'javelin' ? 'javelin' :
            u.kind === 'bomb'    ? 'bomb'    : 'arrow';
          this.gs.projectiles.push({
            id: crypto.randomUUID(), kind: projKind,
            x: u.x, y: u.y, targetId: u.targetId!,
            speed: 200, damage: u.attack, faction: u.faction, elapsed: 0, maxTime: 2,
          });
        } else {
```

- [ ] **Step 2: 验证构建 + 测试**

```bash
npm run build 2>&1 | tail -3 && npm test 2>&1 | tail -4
```

期望：构建成功、测试全 pass。

- [ ] **Step 3: Commit**

```bash
git add src/game/managers/UnitManager.ts
git commit -m "feat(combat): 炸弹兵开火推 kind=bomb 的 projectile

ranged 分支按 u.kind 选 projectile kind：javelin/bomb/arrow。"
```

---

## Task 6: EffectManager 爆炸特效

**Files:**
- Modify: `src/game/effects/EffectManager.ts`

- [ ] **Step 1: dispatch 加 bombHit / bombExplosion case**

修改 [src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts) 的 `dispatch` switch：

```ts
  /** 排干一批事件（由 BattleScene 每帧调用） */
  dispatch(events: CombatEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case 'meleeHit':      this.spawnMeleeStars(ev.x, ev.y); break;
        case 'javelinHit':    this.spawnJavelinHit(ev.x, ev.y); break;
        case 'shieldBlock':   this.spawnShieldSpark(ev.x, ev.y); break;
        case 'bombHit':       break;   // 仅触发受击闪白（BattleScene 处理），无独立特效
        case 'bombExplosion': this.spawnBombExplosion(ev.x, ev.y); break;
        case 'unitDeath':     this.spawnDeathStars(ev.x, ev.y); break;
        case 'campHit':       this.shakeCamera(); break;
        case 'campDestroyed': this.spawnCampDestroy(ev.x, ev.y); break;
      }
    }
  }
```

- [ ] **Step 2: 加 spawnBombExplosion 方法**

在 [src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts) 的 `spawnShieldSpark` 方法之后插入：

```ts
  /** 炸弹爆炸：8 角黄星几何形 + 烟雾环扩散 + 5 颗火星（0.65s 生命） */
  private spawnBombExplosion(x: number, y: number): void {
    if (!this.budget.tryAdd()) return;
    const root = this.scene.add.container(x, y);

    // 8 角黄星：graphics 16 顶点交替外内半径
    const star = this.scene.add.graphics();
    star.fillStyle(0xffeb3b, 1);
    star.lineStyle(2, 0xff6f00, 1);
    star.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = i % 2 === 0 ? 25 : 10;
      const a = (i / 16) * Math.PI * 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) star.moveTo(px, py); else star.lineTo(px, py);
    }
    star.closePath();
    star.fillPath();
    star.strokePath();
    star.setScale(0.3);
    root.add(star);
    this.scene.tweens.add({
      targets: star,
      scale: { from: 0.3, to: 1.5 },
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Cubic.easeOut',
    });

    // 烟雾环：circle 初始 radius=20，tween scale 1→2.5 近似半径 20→50
    const smoke = this.scene.add.circle(0, 0, 20, 0, 0).setStrokeStyle(2, 0x666666, 0.8);
    root.add(smoke);
    this.scene.tweens.add({
      targets: smoke,
      scale: { from: 1, to: 2.5 },
      alpha: { from: 0.8, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
    });

    // 5 颗火星向外飞散
    const sparkOff: [number, number][] = [[28, -8], [22, 18], [-26, 4], [-12, -22], [10, 26]];
    for (const [tx, ty] of sparkOff) {
      const c = this.scene.add.circle(0, 0, 2, 0xff7043, 1);
      root.add(c);
      this.scene.tweens.add({
        targets: c,
        x: tx, y: ty,
        alpha: { from: 1, to: 0 },
        duration: 500,
        ease: 'Cubic.easeOut',
      });
    }

    this.scene.time.delayedCall(650, () => {
      root.destroy();
      this.budget.release();
    });
  }
```

- [ ] **Step 3: 验证构建**

```bash
npm run build 2>&1 | tail -3
```

期望：构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/game/effects/EffectManager.ts
git commit -m "feat(effects): 炸弹爆炸特效 — 8 角黄星 + 烟雾环 + 5 火星

dispatch 加 bombHit（无独立特效）/ bombExplosion case。
spawnBombExplosion：8 角黄星缩放 0.3→1.5（0.5s）+ 烟雾环扩散
（0.6s）+ 5 颗火星飞散（0.5s）。总寿命 0.65s。"
```

---

## Task 7: projectileRenderer 炸弹抛物线

**Files:**
- Modify: `src/game/projectileRenderer.ts`

- [ ] **Step 1: 加 bomb 常量 + 路由**

修改 [src/game/projectileRenderer.ts](../../../src/game/projectileRenderer.ts) 顶部常量区，在 `JAVELIN_EXPECTED_DIST` 之后加：

```ts
/** 炸弹抛物线峰值高度（世界坐标 px） */
const BOMB_MAX_H = 35;
/** 炸弹预期飞行距离，与 config/units.ts 中 bomb.attackRange=120 同步 */
const BOMB_EXPECTED_DIST = 120;
```

修改 `drawProjectile` 和 `updateProjectileView` 路由：

```ts
export function drawProjectile(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  if (p.kind === 'javelin') return drawJavelin(scene, p);
  if (p.kind === 'bomb')    return drawBomb(scene, p);
  return drawArrow(scene, p);
}

export function updateProjectileView(view: Phaser.GameObjects.Container, p: Projectile): void {
  if (p.kind === 'javelin') return updateJavelin(view, p);
  if (p.kind === 'bomb')    return updateBomb(view, p);
  return updateArrow(view, p);
}
```

- [ ] **Step 2: 加 drawBomb / updateBomb 函数**

在 [src/game/projectileRenderer.ts](../../../src/game/projectileRenderer.ts) 末尾（`updateJavelin` 之后）加：

```ts
/* ───── 炸弹：抛物线 + 影子（复用 javelin 算法，sprite 换 TNT 木箱） ───── */

function drawBomb(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  // 影子
  const shadow = scene.add.ellipse(0, 0, 12, 4, 0x000000, 0.4);

  // 炸弹体：红色 TNT 木箱 + 白横纹 + 引信火光
  const shaft = scene.add.graphics();
  shaft.fillStyle(0xc62828, 1);
  shaft.fillRect(-6, -5, 12, 10);
  shaft.lineStyle(0.8, 0xffffff, 0.9);
  shaft.lineBetween(-5, -2, 5, -2);
  shaft.fillStyle(0xff7043, 1);
  shaft.fillCircle(0, -7, 1.3);

  const root = scene.add.container(p.x, p.y, [shadow, shaft]);
  root.setData('startX', p.x);
  root.setData('startY', p.y);
  root.setData('shadow', shadow);
  root.setData('shaft', shaft);
  return root;
}

function updateBomb(view: Phaser.GameObjects.Container, p: Projectile): void {
  const shadow = view.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
  const shaft = view.getData('shaft') as Phaser.GameObjects.Graphics | undefined;
  const startX = view.getData('startX');
  const startY = view.getData('startY');
  if (!shadow || !shaft || !Number.isFinite(startX) || !Number.isFinite(startY)) {
    view.setPosition(p.x, p.y);
    return;
  }

  view.setPosition(p.x, p.y);

  const traveled = Math.hypot(p.x - (startX as number), p.y - (startY as number));
  const t = Math.min(1, traveled / BOMB_EXPECTED_DIST);
  const visualHeight = 4 * BOMB_MAX_H * t * (1 - t);
  const heightRatio = visualHeight / BOMB_MAX_H;

  // 炸弹是矩形不是矛尖，旋转幅度比 javelin 小（±27° 而非 ±45°）
  shaft.setPosition(0, -visualHeight);
  shaft.setRotation((t - 0.5) * Math.PI * 0.3);

  shadow.setPosition(0, 0);
  shadow.setScale(1 - 0.6 * heightRatio);
  shadow.setAlpha(0.4 - 0.25 * heightRatio);
}
```

- [ ] **Step 3: 验证构建 + 测试**

```bash
npm run build 2>&1 | tail -3 && npm test 2>&1 | tail -4
```

期望：构建成功、测试全 pass。

- [ ] **Step 4: Commit**

```bash
git add src/game/projectileRenderer.ts
git commit -m "feat(visual): 炸弹抛物线飞行 + TNT 木箱 sprite

drawBomb/updateBomb 复用 javelin 抛物线算法（峰值 35px、
EXPECTED_DIST=120），sprite 为红色 TNT 木箱 + 白横纹 + 引信火光。
旋转幅度 ±27°（矩形不适合大旋转）。"
```

---

## Task 8: unitRenderer 炸弹兵 sprite + 投掷动作

**Files:**
- Modify: `src/game/unitRenderer.ts`

- [ ] **Step 1: drawWeapon 加 bomb case**

修改 [src/game/unitRenderer.ts:102-112](../../../src/game/unitRenderer.ts#L102-L112)（`drawWeapon` 的 javelin case 之后加 bomb case，在闭合 `}` 前）：

```ts
    case 'javelin': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -8, 4);
      g.lineBetween(0, -5, 6, -10);
      g.lineStyle(2.8, 0xff8a65, 1);
      g.lineBetween(6, -10, 16, -20);
      g.fillStyle(0xffab91, 1);
      g.fillCircle(16, -20, 3);
      break;
    }
    case 'bomb': {
      // 持物手臂
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, 8, -8);
      // 红色 TNT 小木箱
      g.fillStyle(0xc62828, 1);
      g.fillRect(8, -12, 8, 7);
      g.lineStyle(0.8, 0xffffff, 0.9);
      g.lineBetween(8, -10, 16, -10);
      // 引信火光
      g.fillStyle(0xff7043, 1);
      g.fillCircle(12, -13, 1);
      break;
    }
  }
}
```

- [ ] **Step 2: maybeTriggerAttackAnim 加 bomb case**

修改 [src/game/unitRenderer.ts:241-247](../../../src/game/unitRenderer.ts#L241-L247) 的 switch：

```ts
  switch (anim.kind) {
    case 'sword':   playSlashAnim(body); break;
    case 'shield':  playBashAnim(body); break;
    case 'archer':  playBowAnim(body); break;
    case 'javelin': playJavelinAnim(body); break;
    case 'bomb':    playBombThrowAnim(body); break;
  }
```

- [ ] **Step 3: 加 playBombThrowAnim 函数**

在 [src/game/unitRenderer.ts](../../../src/game/unitRenderer.ts) 的 `playJavelinAnim` 函数之后加：

```ts
/** 炸弹投掷：举高蓄力 0.25s → 投出 0.18s → 归零 0.2s。总 0.63s。 */
function playBombThrowAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：举高蓄力（双手举起 TNT，向后倾）
  body.scene.tweens.add({
    targets: body,
    rotation: 0.3,
    y: -3,
    duration: 250,
    ease: 'Cubic.easeOut',
  });
  // 段 2：投出（快速前甩）
  body.scene.tweens.add({
    targets: body,
    rotation: -0.2,
    y: 0,
    duration: 180,
    ease: 'Cubic.easeIn',
    delay: 250,
  });
  // 段 3：归零
  body.scene.tweens.add({
    targets: body,
    rotation: 0,
    y: 0,
    duration: 200,
    ease: 'Sine.easeOut',
    delay: 430,
  });
}
```

- [ ] **Step 4: 验证构建 + 测试**

```bash
npm run build 2>&1 | tail -3 && npm test 2>&1 | tail -4
```

期望：构建成功、测试全 pass。

- [ ] **Step 5: Commit**

```bash
git add src/game/unitRenderer.ts
git commit -m "feat(visual): 炸弹兵 sprite + 三段式投掷动作

drawWeapon 加 bomb case（红色 TNT 小木箱 + 白横纹 + 引信）。
playBombThrowAnim：举高蓄力 0.25s → 投出 0.18s → 归零 0.2s。"
```

---

## Task 9: campRenderer 爆破营建筑

**Files:**
- Modify: `src/game/campRenderer.ts`

- [ ] **Step 1: 读现有 campRenderer 结构**

```bash
cat src/game/campRenderer.ts
```

了解现有 4 个 `drawXxxCamp` 函数的签名和绘制风格，保持一致。

- [ ] **Step 2: 颜色映射加 bomb + switch 加 case**

修改 [src/game/campRenderer.ts:6](../../../src/game/campRenderer.ts#L6)：

```ts
sword: 0xffd54f, shield: 0x90a4ae, archer: 0x66bb6a, javelin: 0xff8a65, bomb: 0xc62828,
```

修改 [src/game/campRenderer.ts:16](../../../src/game/campRenderer.ts#L16) 附近的 switch：

```ts
    case 'bomb':    drawBombCamp(g, color, accent);  break;
```

- [ ] **Step 3: 加 drawBombCamp 函数**

在 [src/game/campRenderer.ts](../../../src/game/campRenderer.ts) 末尾加（参考现有 `drawSwordCamp` 等的简笔风格）：

```ts
/**
 * 爆破营：红色圆形基座 + 中央 TNT 木箱图标 + 引信火光。
 * 风格与其它 4 个 drawXxxCamp 保持简笔一致。
 */
function drawBombCamp(g: Phaser.GameObjects.Graphics, color: number, _accent: number): void {
  // 落影
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0, 8, 60, 18);

  // 红色圆形基座（color=0xc62828）
  g.fillStyle(color, 0.9);
  g.fillCircle(0, 0, 24);
  g.lineStyle(3, 0x000000, 0.3);
  g.strokeCircle(0, 0, 24);

  // 中央 TNT 木箱（深红 + 白横纹）
  g.fillStyle(0x8e0000, 1);
  g.fillRect(-10, -7, 20, 14);
  g.lineStyle(1.5, 0xffffff, 0.9);
  g.lineBetween(-10, -2, 10, -2);
  g.lineBetween(-10, 3, 10, 3);

  // 引信火光（顶部）
  g.fillStyle(0xff7043, 1);
  g.fillCircle(0, -10, 2.5);
  g.fillStyle(0xffeb3b, 0.8);
  g.fillCircle(0, -11, 1.2);
}
```

> 注：`_accent` 参数为保持与其它 `drawXxxCamp` 签名一致而保留，未使用时加下划线前缀避免 lint 警告。

- [ ] **Step 4: 验证构建**

```bash
npm run build 2>&1 | tail -3
```

期望：构建成功。

- [ ] **Step 5: Commit**

```bash
git add src/game/campRenderer.ts
git commit -m "feat(visual): 爆破营建筑 — 红色基座 + TNT 木箱图标

颜色映射加 bomb=0xc62828；drawBombCamp 画红色圆形基座 +
中央深红 TNT 木箱 + 白横纹 + 引信火光。"
```

---

## Task 10: BattleScene unlockTimer 推进 + 闪白扩展

**Files:**
- Modify: `src/game/BattleScene.ts`

- [ ] **Step 1: fixed-step 循环加 unlockTimer 递减**

修改 [src/game/BattleScene.ts:106-111](../../../src/game/BattleScene.ts#L106-L111)：

```ts
    for (let i = 0; i < steps; i++) {
      this.campManager.step(dt);
      this.unitManager.step(dt);
      CombatSystem.step(this.gameState, dt);
      this.gameState.sim.timeMs += dt * 1000;
      // 解锁倒计时：仅 sim.running（即 SimulationClock 已推进 dt 时）流逝
      if (this.gameState.sim.unlockTimer > 0) {
        this.gameState.sim.unlockTimer = Math.max(0, this.gameState.sim.unlockTimer - dt);
      }
    }
```

- [ ] **Step 2: 闪白白名单加 bombHit**

修改 [src/game/BattleScene.ts:117](../../../src/game/BattleScene.ts#L117)：

```ts
        if (
          ev.kind === 'meleeHit' || ev.kind === 'javelinHit' ||
          ev.kind === 'shieldBlock' || ev.kind === 'bombHit'
        ) {
```

- [ ] **Step 3: 验证构建**

```bash
npm run build 2>&1 | tail -3
```

期望：构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/game/BattleScene.ts
git commit -m "feat(scene): unlockTimer 推进 + 炸弹命中触发闪白

fixed-step 循环每步递减 unlockTimer（暂停时 step 不进 → 自动冻结）。
受击闪白事件白名单加 bombHit。"
```

---

## Task 11: MathQuizModal 弹窗组件

**Files:**
- Create: `src/ui/MathQuizModal.ts`

- [ ] **Step 1: 创建 MathQuizModal**

创建 [src/ui/MathQuizModal.ts](../../../src/ui/MathQuizModal.ts)：

```ts
import { generateProblem, type Problem } from './mathQuiz';

/**
 * 算术题弹窗：全屏遮罩 + 数字键盘。
 * open() 返回 Promise，仅当用户答对时 resolve（无 reject）。
 * 答错：卡片抖动 + 换新题，弹窗保持开启。
 */
export class MathQuizModal {
  private overlay: HTMLDivElement;
  private el: HTMLDivElement;
  private formulaEl: HTMLDivElement;
  private displayEl: HTMLDivElement;
  private hintEl: HTMLDivElement;
  private current: Problem | null = null;
  private inputBuf = '';
  private resolveFn: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'math-quiz-overlay math-quiz-hidden';
    this.el = document.createElement('div');
    this.el.className = 'math-quiz-card';
    this.overlay.append(this.el);
    document.body.append(this.overlay);
    this.buildCard();
  }

  private buildCard(): void {
    const title = document.createElement('div');
    title.className = 'math-quiz-title';
    title.textContent = '🔓 解锁投矛 / 爆破（60s）';
    this.el.append(title);

    this.formulaEl = document.createElement('div');
    this.formulaEl.className = 'math-quiz-formula';
    this.el.append(this.formulaEl);

    this.displayEl = document.createElement('div');
    this.displayEl.className = 'math-quiz-display';
    this.displayEl.textContent = '_';
    this.el.append(this.displayEl);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'math-quiz-hint';
    this.el.append(this.hintEl);

    const keypad = document.createElement('div');
    keypad.className = 'math-quiz-keypad';
    for (let d = 0; d <= 9; d++) {
      keypad.append(this.makeKey(d.toString(), () => this.onDigit(d)));
    }
    keypad.append(this.makeKey('10', () => this.onDigit(10)));
    keypad.append(this.makeKey('清', () => this.onClear(), 'math-quiz-key-op'));
    keypad.append(this.makeKey('✓', () => this.onSubmit(), 'math-quiz-key-ok'));
    this.el.append(keypad);
  }

  private makeKey(label: string, fn: () => void, extraClass = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `math-quiz-key ${extraClass}`.trim();
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  /** 打开弹窗、生成新题。Promise 仅在答对时 resolve。 */
  open(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.current = generateProblem();
      this.inputBuf = '';
      this.hintEl.textContent = '';
      this.renderProblem();
      this.overlay.classList.remove('math-quiz-hidden');
      this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
      window.addEventListener('keydown', this.keyHandler);
    });
  }

  private close(): void {
    this.overlay.classList.add('math-quiz-hidden');
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.resolveFn?.();
    this.resolveFn = null;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key >= '0' && e.key <= '9') {
      this.onDigit(parseInt(e.key, 10));
    } else if (e.key === 'Enter') {
      this.onSubmit();
    } else if (e.key === 'Backspace') {
      this.onClear();
    }
    // Escape 不关闭（必须答对）
  }

  private onDigit(d: number): void {
    if (this.inputBuf === '' && d === 10) {
      this.inputBuf = '10';
    } else if (this.inputBuf.length < 2 && d < 10) {
      this.inputBuf += d.toString();
    }
    this.refreshDisplay();
  }

  private onClear(): void {
    this.inputBuf = '';
    this.refreshDisplay();
  }

  private onSubmit(): void {
    if (this.inputBuf === '' || !this.current) return;
    const guess = parseInt(this.inputBuf, 10);
    if (guess === this.current.answer) {
      this.el.classList.add('math-quiz-correct');
      setTimeout(() => {
        this.el.classList.remove('math-quiz-correct');
        this.close();
      }, 250);
    } else {
      this.el.classList.add('math-quiz-wrong');
      this.hintEl.textContent = '再想想...';
      setTimeout(() => {
        this.el.classList.remove('math-quiz-wrong');
        this.current = generateProblem();
        this.inputBuf = '';
        this.renderProblem();
      }, 350);
    }
  }

  private renderProblem(): void {
    const p = this.current!;
    this.formulaEl.textContent = `${p.a} ${p.op} ${p.b} = ?`;
    this.refreshDisplay();
  }

  private refreshDisplay(): void {
    this.displayEl.textContent = this.inputBuf === '' ? '_' : this.inputBuf;
  }
}
```

- [ ] **Step 2: 定位并追加 CSS**

```bash
ls src/*.css 2>/dev/null; grep -rln "victory-overlay\|build-panel" src/ index.html 2>/dev/null | head -3
```

把以下 CSS 追加到主样式文件（实施时根据上一步输出确认是 `src/style.css` 还是 `index.html` 内联 `<style>`）：

```css
.math-quiz-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center;
}
.math-quiz-hidden { display: none; }
.math-quiz-card {
  background: #1e1e1e; padding: 24px 28px; border-radius: 12px;
  border: 2px solid #555; min-width: 280px; text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.math-quiz-title { color: #fff; font-size: 1.05em; margin-bottom: 14px; font-weight: 600; }
.math-quiz-formula { color: #fff; font-size: 2em; font-weight: bold; margin-bottom: 12px; letter-spacing: 0.05em; }
.math-quiz-display {
  display: inline-block; min-width: 50px; padding: 6px 14px;
  background: #2a2a2a; border: 1px solid #888; border-radius: 6px;
  color: #fff; font-size: 1.5em; font-weight: bold; margin-bottom: 14px;
}
.math-quiz-hint { color: #ef5350; font-size: 0.9em; min-height: 1.2em; margin-bottom: 8px; }
.math-quiz-keypad {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
}
.math-quiz-key {
  padding: 12px 0; background: #455a64; color: #fff;
  font-size: 1.3em; font-weight: bold; border: none; border-radius: 6px;
  cursor: pointer; transition: background 0.1s;
}
.math-quiz-key:hover { background: #546e7a; }
.math-quiz-key-op { background: #5d4037; }
.math-quiz-key-op:hover { background: #6d4c41; }
.math-quiz-key-ok { background: #2e7d32; }
.math-quiz-key-ok:hover { background: #388e3c; }
.math-quiz-correct { border-color: #4caf50; animation: quiz-pop 0.25s; }
.math-quiz-wrong { animation: quiz-shake 0.35s; }
@keyframes quiz-pop { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes quiz-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-8px); } 75% { transform: translateX(8px); } }
```

- [ ] **Step 3: 验证构建**

```bash
npm run build 2>&1 | tail -3
```

期望：构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/ui/MathQuizModal.ts
# CSS 文件如改动也 add（根据 step 2 实际位置）
git commit -m "feat(ui): MathQuizModal 算术题弹窗组件

全屏遮罩 + 卡片：题目 a±b=? + 数字键盘 0-9/10/清/确认。
open() 返回 Promise 仅在答对时 resolve；答错抖动换新题不关闭。
支持物理键盘 0-9/Enter/Backspace。"
```

---

## Task 12: UiBridge 解锁 API + HudController 倒计时

**Files:**
- Modify: `src/ui/UiBridge.ts`
- Modify: `src/ui/HudController.ts`

- [ ] **Step 1: UiBridge 加 unlockGate / isUnlocked**

修改 [src/ui/UiBridge.ts](../../../src/ui/UiBridge.ts)，在 `getSpawnMultiplier` 之后加：

```ts
  /** 答对算术题 → 解锁投矛/爆破 60 秒 */
  unlockGate(gs: GameState, seconds = 60): void {
    gs.sim.unlockTimer = seconds;
    this.emit('simChanged');
  }

  /** 当前是否在解锁窗口内 */
  isUnlocked(gs: GameState): boolean {
    return gs.sim.unlockTimer > 0;
  }
```

- [ ] **Step 2: HudController render 加倒计时显示**

修改 [src/ui/HudController.ts:17-55](../../../src/ui/HudController.ts#L17-L55) 的 `render()`，在 `speedLabel` 之后、`this.el.innerHTML` 之前加解锁状态变量：

```ts
    const unlock = s.sim.unlockTimer;
    const unlockHtml = unlock > 0
      ? `<span class="hud-section"><span class="hud-icon">🔓</span><span class="hud-num">${Math.ceil(unlock)}</span><span class="hud-sublabel">s 解锁</span></span>`
      : `<span class="hud-section"><span class="hud-icon">🔒</span><span class="hud-sublabel">投矛/爆破锁定</span></span>`;
```

在 `this.el.innerHTML` 模板末尾（`<span class="hud-speed">` 之后）插入 `${unlockHtml}`：

```ts
    this.el.innerHTML = `
      <span class="hud-section">
        <span class="hud-icon">🔴</span>
        <span class="hud-num">${redTotal}</span>
        <span class="hud-sublabel">总</span>
        <span class="hud-num hud-alive">${redAlive}</span>
        <span class="hud-sublabel">活</span>
      </span>
      <span class="hud-divider"></span>
      <span class="hud-section">
        <span class="hud-icon">🔵</span>
        <span class="hud-num">${blueTotal}</span>
        <span class="hud-sublabel">总</span>
        <span class="hud-num hud-alive">${blueAlive}</span>
        <span class="hud-sublabel">活</span>
      </span>
      <span class="hud-divider"></span>
      <span class="hud-section">
        <span class="hud-icon">👥</span>
        <span class="hud-num">${total}</span>
        <span class="hud-sublabel">总计</span>
      </span>
      <span class="hud-winner">${winner}</span>
      <span class="hud-speed">${speedLabel}</span>
      ${unlockHtml}
    `;
```

> `HudController` 已在每帧 `statsChanged` 事件重渲，倒计时跟着每秒变。

- [ ] **Step 3: 验证构建**

```bash
npm run build 2>&1 | tail -3
```

期望：构建成功。

- [ ] **Step 4: Commit**

```bash
git add src/ui/UiBridge.ts src/ui/HudController.ts
git commit -m "feat(ui): 解锁 API + HUD 倒计时显示

UiBridge.unlockGate(60)/isUnlocked；HudController 末尾显示
🔓 Ns 解锁 / 🔒 投矛爆破锁定，随 statsChanged 每帧刷新。"
```

---

## Task 13: BuildPanel 拦截 + 按钮

**Files:**
- Modify: `src/ui/BuildPanel.ts`

- [ ] **Step 1: KINDS 加 bomb + gated 标记**

修改 [src/ui/BuildPanel.ts:1-12](../../../src/ui/BuildPanel.ts#L1-L12)，顶部 import 加 MathQuizModal：

```ts
import type { CampKind, Faction } from '../game/types';
import type { GameState } from '../game/GameState';
import type { UiBridge } from './UiBridge';
import { MathQuizModal } from './MathQuizModal';

const KINDS: { key: CampKind; label: string; icon: string; gated?: boolean }[] = [
  { key: 'sword',   label: '剑兵营', icon: '⚔️' },
  { key: 'shield',  label: '盾兵营', icon: '🛡️' },
  { key: 'archer',  label: '弓兵营', icon: '🏹' },
  { key: 'javelin', label: '投矛营', icon: '🔱', gated: true },
  { key: 'bomb',    label: '爆破营', icon: '💣', gated: true },
];

const HOTKEY_MAP: Record<string, CampKind> = { q: 'sword', w: 'shield', e: 'archer', r: 'javelin', t: 'bomb' };
```

- [ ] **Step 2: BuildPanel 持有 MathQuizModal 实例**

修改 [src/ui/BuildPanel.ts:23-26](../../../src/ui/BuildPanel.ts#L23-L26)：

```ts
export class BuildPanel {
  private leftButtons = new Map<CampKind, HTMLButtonElement>();
  private rightButtons = new Map<CampKind, HTMLButtonElement>();
  private spawnSliders: Record<Faction, SpawnSliderRefs | null> = { red: null, blue: null };
  private modal = new MathQuizModal();
```

- [ ] **Step 3: simChanged 订阅加 render 调用**

修改 [src/ui/BuildPanel.ts:32-34](../../../src/ui/BuildPanel.ts#L32-L34)：

```ts
    bridge.on('placementChanged', () => this.render());
    bridge.on('simChanged', () => { this.syncSliders(); this.render(); });
```

- [ ] **Step 4: 抽出 ensureUnlocked 辅助方法**

在 BuildPanel 类内（`bindHotkeys` 之前）加：

```ts
  /** gated 兵种需先答题解锁；已解锁则立即返回。 */
  private async ensureUnlocked(gated: boolean | undefined): Promise<void> {
    if (!gated) return;
    if (this.bridge.isUnlocked(this.gs())) return;
    await this.modal.open();              // 仅答对才 resolve
    this.bridge.unlockGate(this.gs());    // 解锁 60s
  }
```

- [ ] **Step 5: onclick 加门控**

修改 [src/ui/BuildPanel.ts:63-66](../../../src/ui/BuildPanel.ts#L63-L66)：

```ts
      b.onclick = async () => {
        await this.ensureUnlocked(k.gated);
        this.bridge.selectFaction(faction);
        this.bridge.selectCampKind(k.key);
      };
```

- [ ] **Step 6: dragstart 加门控**

修改 [src/ui/BuildPanel.ts:53-57](../../../src/ui/BuildPanel.ts#L53-L57)：

```ts
      b.addEventListener('dragstart', async (e) => {
        if (k.gated && !this.bridge.isUnlocked(this.gs())) {
          e.preventDefault();             // 取消本次拖拽
          await this.modal.open();
          this.bridge.unlockGate(this.gs());
          // 用户需重新拖（HTML5 拖拽无法暂停等待）
          return;
        }
        e.dataTransfer!.setData('application/x-camp-faction', faction);
        e.dataTransfer!.setData('application/x-camp-kind', k.key);
        e.dataTransfer!.effectAllowed = 'copy';
      });
```

- [ ] **Step 7: bindHotkeys 改 async + 门控**

修改 [src/ui/BuildPanel.ts:125-135](../../../src/ui/BuildPanel.ts#L125-L135)：

```ts
  private bindHotkeys(): void {
    window.addEventListener('keydown', async (e) => {
      // 输入控件聚焦时不触发热键
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const def = HOTKEY_MAP[e.key.toLowerCase()];
      if (!def) return;
      const kdef = KINDS.find(k => k.key === def);
      await this.ensureUnlocked(kdef?.gated);
      const sel = this.bridge.getSelection();
      this.bridge.selectCampKind(sel.kind === def ? null : def);
    });
  }
```

- [ ] **Step 8: render 加按钮锁定态**

修改 [src/ui/BuildPanel.ts:137-145](../../../src/ui/BuildPanel.ts#L137-L145)：

```ts
  private render(): void {
    const sel = this.bridge.getSelection();
    const unlocked = this.bridge.isUnlocked(this.gs());
    for (const [kind, btn] of this.leftButtons) {
      const kdef = KINDS.find(k => k.key === kind);
      btn.classList.toggle('active', sel.faction === 'red' && sel.kind === kind);
      btn.classList.toggle('locked', !!kdef?.gated && !unlocked);
    }
    for (const [kind, btn] of this.rightButtons) {
      const kdef = KINDS.find(k => k.key === kind);
      btn.classList.toggle('active', sel.faction === 'blue' && sel.kind === kind);
      btn.classList.toggle('locked', !!kdef?.gated && !unlocked);
    }
  }
```

- [ ] **Step 9: CSS 加 locked 样式**

在主样式文件（与 Task 11 同位置）加：

```css
.camp-btn.locked { opacity: 0.55; position: relative; }
.camp-btn.locked::after { content: '🔒'; position: absolute; top: 2px; right: 4px; font-size: 0.8em; }
```

- [ ] **Step 10: 验证构建**

```bash
npm run build 2>&1 | tail -3
```

期望：构建成功。

- [ ] **Step 11: Commit**

```bash
git add src/ui/BuildPanel.ts
git commit -m "feat(ui): 投矛/爆破营按钮加算术题门控

KINDS 加 bomb(T) + gated 标记。onclick/dragstart/hotkey 走
ensureUnlocked：锁定时弹 MathQuizModal，答对 unlockGate(60)。
render 按 isUnlocked 切 .locked 样式。dragstart 锁定时
preventDefault（用户需重新拖）。"
```

---

## Task 14: PlacementController 兜底

**Files:**
- Modify: `src/game/managers/PlacementController.ts`

- [ ] **Step 1: placeCamp 头部加防呆**

修改 [src/game/managers/PlacementController.ts:83-85](../../../src/game/managers/PlacementController.ts#L83-L85)：

```ts
  private placeCamp(x: number, y: number, faction: Faction, kind: CampKind): void {
    const gs = this.scene.exposeGameState();
    // 兜底：gated 兵种 + 锁定 → 拒绝（防拖拽绕过 BuildPanel，及答题中倒计时归零边界）
    if ((kind === 'javelin' || kind === 'bomb') && gs.sim.unlockTimer <= 0) return;
    if (!canPlaceCamp(gs.allCamps(), x, y, CAMP_MIN_DISTANCE)) return;
```

- [ ] **Step 2: 验证构建 + 测试**

```bash
npm run build 2>&1 | tail -3 && npm test 2>&1 | tail -4
```

期望：构建成功、测试全 pass。

- [ ] **Step 3: Commit**

```bash
git add src/game/managers/PlacementController.ts
git commit -m "feat(scene): PlacementController 兜底 gated 兵种锁定检查

placeCamp 头部拒绝 javelin/bomb 在 unlockTimer<=0 时放置。
防拖拽事件绕过 BuildPanel 拦截 + 答题中倒计时归零边界。"
```

---

## Task 15: 端到端目测验收

**Files:** （仅运行）

- [ ] **Step 1: 全套测试 + 构建**

```bash
cd e:/0-projects/ai-games/camp-clash && npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -3
```

期望：全部测试通过（原 81 + mathQuiz 4 + aoe 6 + combat 1 + events 1 = 93），构建成功。

- [ ] **Step 2: 启动 dev 或 push 看 Pages**

本地：

```bash
npm run dev
```

打开 http://localhost:5173；或 push 后看 https://kevinxiang.github.io/camp-calsh/。

- [ ] **Step 3: 按 spec 验收清单逐条核对**

**算术题门控**：
- [ ] 首次打开，HUD 显示"🔒 投矛/爆破锁定"
- [ ] 投矛营、爆破营按钮叠 🔒
- [ ] 点"投矛营" → 弹算术题（10 以内加/减）
- [ ] 数字键盘 0-9/10 输入正确累计
- [ ] 输入正确 → 闪绿、关闭、HUD 显示"🔓 Ns 解锁"
- [ ] 60s 倒计时实时递减、按钮变已解锁态
- [ ] 期间再点投矛/爆破不弹题
- [ ] 输入错误 → 抖动、"再想想..."、换新题、弹窗保持
- [ ] 暂停游戏后倒计时停止；恢复后继续
- [ ] 60s 归零 → 切回锁定、再点又要答题
- [ ] 拖拽锁定按钮 → 弹题（不拖出去），答对后需重拉

**爆破营战斗**：
- [ ] 爆破营建筑可见、红色为主、与其它 4 兵营可区分
- [ ] 炸弹兵开火投 TNT 木箱、抛物线飞行、举手→投出→归零三段动作
- [ ] 炸弹落地 → 8 角黄星爆炸 + 烟雾环 + 5 火星
- [ ] 50px 圈内多个敌方小兵同时受伤、有闪白
- [ ] 炸弹能炸到敌方军营、震屏
- [ ] 炸弹炸盾兵时盾位出火花（与爆炸并存）
- [ ] 控制台无新报错

- [ ] **Step 4: 问题定位表**

| 现象 | 可能 task |
|---|---|
| 投矛/爆破按钮点不弹题 | Task 13（BuildPanel ensureUnlocked） |
| 弹窗数字键盘无响应 | Task 11（MathQuizModal onDigit/onKey） |
| 答对不解锁 | Task 12（unlockGate）/ Task 13（ensureUnlocked 调用） |
| 倒计时不减 | Task 10（BattleScene fixed-step） |
| 暂停时倒计时仍流逝 | Task 10（检查是否在 step 循环内） |
| 炸弹直线不抛物线 | Task 7（projectileRenderer drawBomb） |
| 炸弹不爆炸/无 AOE | Task 4（applyAOE）/ Task 5（UnitManager kind=bomb）/ Task 4 step 分发 |
| 爆炸无视觉 | Task 6（spawnBombExplosion）/ dispatch case |
| 炸弹兵无投掷动作 | Task 8（playBombThrowAnim） |
| 爆破营建筑不可见 | Task 9（drawBombCamp） |

- [ ] **Step 5: 验收通过后 push**

```bash
git push origin main
```

---

## Out-of-Scope（不做）

| 项目 | 原因 |
|---|---|
| 算术题难度自适应 | YAGNI |
| 按钮自身一圈进度环 | YAGNI（HUD 倒计时已够） |
| MathQuizModal / BuildPanel 拦截单测 | DOM/async 难测，靠目测 |
| EffectManager.spawnBombExplosion 视觉单测 | 涉及 Phaser scene |
| 红蓝双方独立倒计时 | spec 明确全局一个 |
| 错答惩罚（减 HP / 减时间） | 用户决定错了换新题不惩罚 |
| TNT 字样精确绘制（9px 画不出） | 用白横纹示意 |
