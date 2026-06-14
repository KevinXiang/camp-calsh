# 爆破营 + 算术题解锁机制 — 设计文档

**日期**：2026-06-14
**作者**：brainstorming session
**状态**：待实现

## 目标

向项目引入两个相互独立但同时落地的子系统：

1. **新兵种：爆破营（炸弹兵）** — 远程扔 TNT 木箱，落地 AOE（50px 圆，同伤害）。第一次出现真正的 AOE 攻击和"打军营"的 AOE 拆建。
2. **算术题解锁机制** — 投矛营和爆破营默认锁定，玩家点击/拖拽这两类按钮时弹出 10 以内加减题，答对后**全局解锁 60 秒**（红蓝双方 + 投矛/爆破共享一个倒计时），暂停时倒计时不流逝。

不在范围内：
- 改其它兵种（剑/盾/弓）的数据或视觉
- 真实"挡攻击"等抗伤机制（盾兵被炸该死还是死）
- 爆破营的 sprite 重绘后续美术润色（先用红色 TNT 矩形示意）
- 算术题的难度自适应、连答连击奖励等扩展（YAGNI）
- 多语言 UI 文案

## 核心设计原则

**两个子系统正交解耦**：
- 算术题模块完全不知道战斗系统的存在（`MathQuizModal` 只关心题目生成 + 答对/答错）
- 战斗系统完全不知道解锁状态的存在（`CombatSystem.applyAOE` / `UnitManager` 不读 `unlockTimer`）
- 只有 `BuildPanel` 和 `PlacementController` 这两个**入口**层关心解锁状态
- 中间通过 `GameState.sim.unlockTimer` 这个简单 number 字段做契约

**game state 的最小扩展**：只加一个 `unlockTimer: number`，不加复杂 reducer、不加事件总线扩展。

**暂停与倒计时**：`unlockTimer` 只在 `BattleScene.update` 的 fixed-step 循环里递减（即 `SimulationClock.consume` 已经判断过 `sim.running` 并产出 dt 步数）。暂停时 fixed-step 不进，timer 自动不流逝。

## 数据契约

### 类型扩展（[src/game/types.ts](../../../src/game/types.ts)）

```ts
export type CampKind = 'sword' | 'shield' | 'archer' | 'javelin' | 'bomb';
export type ProjectileKind = 'arrow' | 'javelin' | 'bomb';
```

`UnitKind = CampKind` 自动联动新增 `bomb`。

### GameState（[src/game/GameState.ts](../../../src/game/GameState.ts)）

`SimState` 加：

```ts
/**
 * 投矛/爆破营解锁倒计时（秒）。> 0 时这两类营无需答题；每个 sim step 减 dt。
 * 仅 sim.running 时流逝（暂停冻结）。初始 0（首次必须先答题）。
 */
unlockTimer: number;
```

`GameState` 构造默认 `unlockTimer: 0`。

### 配置（[src/config/units.ts](../../../src/config/units.ts) / [src/config/camps.ts](../../../src/config/camps.ts)）

```ts
// units.ts
bomb: { kind: 'bomb', attackType: 'ranged', maxHp: 50, attack: 15, attackRange: 120, attackInterval: 2.5, moveSpeed: 35 },
```

```ts
// camps.ts
bomb: { kind: 'bomb', produces: 'bomb', maxHp: 400, spawnInterval: 7, unitCap: 12 },
```

`unitCap=12` 显著低于其它兵种 20 — AOE 强、群兵多了卡顿且失衡。

### CombatEvent 加两类（[src/game/effects/types.ts](../../../src/game/effects/types.ts)）

```ts
| { kind: 'bombHit'; x: number; y: number; faction: Faction }
| { kind: 'bombExplosion'; x: number; y: number; faction: Faction }
```

- `bombHit` — 单位被 AOE 命中（仅用于触发受击闪白；不产生独立特效）
- `bombExplosion` — 每次爆炸 push 一次（用于显示爆炸视觉），与命中目标数无关

### DamageOpts.weaponKind 加 bomb（[src/game/managers/CombatSystem.ts](../../../src/game/managers/CombatSystem.ts)）

```ts
weaponKind?: 'arrow' | 'javelin' | 'bomb';
```

## 算术题模块

### 题目生成（纯函数，可单测）

新建 [src/ui/mathQuiz.ts](../../../src/ui/mathQuiz.ts)：

```ts
export interface Problem { a: number; b: number; op: '+' | '-'; answer: number; }

export function generateProblem(rng: () => number = Math.random): Problem {
  const op = rng() < 0.5 ? '+' : '-';
  if (op === '+') {
    const sum = Math.floor(rng() * 11);            // 0..10
    const a = Math.floor(rng() * (sum + 1));       // 0..sum
    return { a, b: sum - a, op: '+', answer: sum };
  } else {
    const a = Math.floor(rng() * 10);              // 0..9
    const b = Math.floor(rng() * (a + 1));         // 0..a
    return { a, b, op: '-', answer: a - b };
  }
}
```

不变量：
- `op === '+'` → `a + b === answer && answer ≤ 10`
- `op === '-'` → `a - b === answer && answer ≥ 0`
- `answer` 始终在 `[0, 10]`

### 弹窗组件

新建 [src/ui/MathQuizModal.ts](../../../src/ui/MathQuizModal.ts)：

```ts
export class MathQuizModal {
  private el: HTMLDivElement;
  private current: Problem | null = null;
  private resolveFn: (() => void) | null = null;
  private inputBuf = '';

  constructor() { /* 创建 DOM 但保持隐藏 */ }

  /** 打开弹窗、生成新题。Promise 仅在用户答对时 resolve（无 reject）。 */
  open(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.current = generateProblem();
      this.inputBuf = '';
      this.render();
      this.el.classList.remove('hidden');
    });
  }

  private onDigit(d: number): void {
    // 数字键盘：拼接输入；最多 2 位；点同一数字两次 → "00" 不合法但不阻
    this.inputBuf = (this.inputBuf + d.toString()).slice(-2);
    this.refreshDisplay();
  }

  private onClear(): void { this.inputBuf = ''; this.refreshDisplay(); }

  private onSubmit(): void {
    if (this.inputBuf === '') return;       // 空输入忽略
    const guess = parseInt(this.inputBuf, 10);
    if (guess === this.current!.answer) {
      // 答对 → 短闪绿、关闭、resolve
      this.flash('correct');
      setTimeout(() => {
        this.el.classList.add('hidden');
        this.resolveFn?.();
        this.resolveFn = null;
      }, 250);
    } else {
      // 答错 → 抖动 + "再想想"提示 + 换新题
      this.flash('wrong');
      this.current = generateProblem();
      this.inputBuf = '';
      setTimeout(() => this.render(), 350);
    }
  }
}
```

UI 结构（CSS 类，不写完整样式）：

```
.math-quiz-overlay      // 全屏 0.55 黑遮罩，z-index 高于战场，低于 victory
  .math-quiz-card       // 居中卡片
    .math-quiz-title    // "🔓 解锁投矛 / 爆破（60s）"
    .math-quiz-formula  // "3 + 4 = ?"
    .math-quiz-display  // 当前输入显示
    .math-quiz-hint     // "再想想..." 错答时显示
    .math-quiz-keypad   // 数字键盘 0-9, 10, 清空, 确认
```

**键盘事件**：监听 `keydown`，`0-9`/`Enter`/`Backspace`/`Escape` 都映射到对应按钮。Escape 不关闭弹窗（题没答对就锁着）。

**z-index 处理**：

| 层级 | 用途 |
|---|---|
| game canvas | 最底层 |
| `#hud` / `#build-panel-*` / `#info-panel` / `#control-bar` | 普通 UI |
| `.math-quiz-overlay` | 答题弹窗（盖住所有普通 UI） |
| `#victory-overlay` | 胜利覆盖（最顶） |

### UiBridge 解锁 API（[src/ui/UiBridge.ts](../../../src/ui/UiBridge.ts)）

```ts
/** 答对算术题 → 解锁 60 秒 */
unlockGate(gs: GameState, seconds = 60): void {
  gs.sim.unlockTimer = seconds;
  this.emit('simChanged');
}

/** 当前是否在解锁窗口内 */
isUnlocked(gs: GameState): boolean {
  return gs.sim.unlockTimer > 0;
}
```

### unlockTimer 推进（[src/game/BattleScene.ts](../../../src/game/BattleScene.ts)）

[src/game/BattleScene.ts:106-111](../../../src/game/BattleScene.ts#L106-L111) 的 fixed-step 循环加 3 行：

```ts
for (let i = 0; i < steps; i++) {
  this.campManager.step(dt);
  this.unitManager.step(dt);
  CombatSystem.step(this.gameState, dt);
  this.gameState.sim.timeMs += dt * 1000;
  if (this.gameState.sim.unlockTimer > 0) {
    this.gameState.sim.unlockTimer = Math.max(0, this.gameState.sim.unlockTimer - dt);
  }
}
```

由于只在已经被 `SimulationClock.consume` 过滤过 `sim.running` 的 step 内递减 → 暂停时自动不流逝。

### BuildPanel 拦截（[src/ui/BuildPanel.ts](../../../src/ui/BuildPanel.ts)）

按钮表加 `gated` 标记和 bomb：

```ts
const KINDS = [
  { key: 'sword',   label: '剑兵营', icon: '⚔️' },
  { key: 'shield',  label: '盾兵营', icon: '🛡️' },
  { key: 'archer',  label: '弓兵营', icon: '🏹' },
  { key: 'javelin', label: '投矛营', icon: '🔱', gated: true },
  { key: 'bomb',    label: '爆破营', icon: '💣', gated: true },
];
const HOTKEY_MAP = { q: 'sword', w: 'shield', e: 'archer', r: 'javelin', t: 'bomb' };
```

`BuildPanel` 构造时持有一个 `MathQuizModal` 实例（红蓝双方共用一个）。点击逻辑：

```ts
b.onclick = async () => {
  if (k.gated && !this.bridge.isUnlocked(this.gs())) {
    await this.modal.open();              // 答对才 resolve
    this.bridge.unlockGate(this.gs());
  }
  this.bridge.selectFaction(faction);
  this.bridge.selectCampKind(k.key);
};
```

拖拽逻辑：

```ts
b.addEventListener('dragstart', async (e) => {
  if (k.gated && !this.bridge.isUnlocked(this.gs())) {
    e.preventDefault();                   // 取消本次拖拽
    await this.modal.open();
    this.bridge.unlockGate(this.gs());
    // 用户需要重新拖（拖拽事件无法"暂停 → 等待 → 继续"）
    return;
  }
  e.dataTransfer!.setData('application/x-camp-faction', faction);
  e.dataTransfer!.setData('application/x-camp-kind', k.key);
  e.dataTransfer!.effectAllowed = 'copy';
});
```

**已知 UX 限制**：HTML5 拖拽事件无法在中间插入异步等待。锁定状态下用户拖拽 gated 按钮 → 拖拽立即被取消、弹出题、答对后用户**需要重新拉一次**。这是浏览器拖拽 API 的硬限制，spec 接受这个行为。

热键拦截（[src/ui/BuildPanel.ts:125](../../../src/ui/BuildPanel.ts#L125) `bindHotkeys`）也要走同样的门控分支：

```ts
private async onHotkey(kind: CampKind): Promise<void> {
  const def = KINDS.find(k => k.key === kind);
  if (def?.gated && !this.bridge.isUnlocked(this.gs())) {
    await this.modal.open();
    this.bridge.unlockGate(this.gs());
  }
  const sel = this.bridge.getSelection();
  this.bridge.selectCampKind(sel.kind === kind ? null : kind);
}
```

按钮态渲染（`render()` 扩展）：

- 未解锁：gated 按钮加 `.locked` 样式，icon 上叠加 🔒
- 已解锁：gated 按钮加 `.unlocked` 样式（绿色边框）

需在 `simChanged` 事件订阅里调用 render（已有，复用）。

### UI 顶部解锁倒计时（[src/ui/HudController.ts](../../../src/ui/HudController.ts)）

`render()` 末尾追加倒计时显示：

```ts
const unlock = s.sim.unlockTimer;
const unlockHtml = unlock > 0
  ? `<span class="hud-unlock">🔓 投矛/爆破已解锁 ${Math.ceil(unlock)}s</span>`
  : `<span class="hud-locked">🔒 投矛/爆破锁定</span>`;
```

`HudController` 已经在每帧 `statsChanged` 事件里 render，倒计时跟着自动更新（每帧 60Hz，看到的整数秒每秒变一次足够）。

### PlacementController 兜底（[src/game/managers/PlacementController.ts:83](../../../src/game/managers/PlacementController.ts#L83)）

```ts
private placeCamp(x, y, faction, kind) {
  const gs = this.scene.exposeGameState();
  // 兜底：gated 兵种 + 锁定 → 拒绝（防拖拽事件绕过 BuildPanel 的拦截，
  // 以及"答题时倒计时归零"边界）
  if ((kind === 'javelin' || kind === 'bomb') && gs.sim.unlockTimer <= 0) return;
  if (!canPlaceCamp(gs.allCamps(), x, y, CAMP_MIN_DISTANCE)) return;
  // ...原逻辑
}
```

## 战斗 AOE

### CombatSystem.applyAOE 新方法

[src/game/managers/CombatSystem.ts](../../../src/game/managers/CombatSystem.ts) 加：

```ts
import type { Faction } from '../types';

/** 炸弹爆炸：在 (x,y) radius 圆内对所有 alive 敌方 unit + 未摧毁敌方 camp 各扣 dmg */
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

**遍历策略**：当前 unit/camp 数量都是 50 量级，全表线性扫描 + r² 过滤足够快。如果将来到 1000 量级再考虑用 SpatialGrid。

### applyDamage 加 bombHit 分支

[src/game/managers/CombatSystem.ts:21-31](../../../src/game/managers/CombatSystem.ts#L21-L31) 单位分支扩展为：

```ts
if ('alive' in target) {
  if (target.kind === 'shield') {
    // 盾兵身份压过武器（包括炸弹）
    gs.events.push({ kind: 'shieldBlock', x: target.x, y: target.y, faction: target.faction });
  } else if (opts.weaponKind === 'bomb') {
    gs.events.push({ kind: 'bombHit', x: target.x, y: target.y, faction: target.faction });
  } else {
    const isJavelin = opts.source === 'ranged' && opts.weaponKind === 'javelin';
    gs.events.push(isJavelin
      ? { kind: 'javelinHit', x: target.x, y: target.y, faction: target.faction }
      : { kind: 'meleeHit',   x: target.x, y: target.y, faction: target.faction }
    );
  }
  if (target.hp <= 0) { /* 死亡分支不变 */ }
}
```

### CombatSystem.step 弹道命中分发

[src/game/managers/CombatSystem.ts:60-63](../../../src/game/managers/CombatSystem.ts#L60-L63)：

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

### UnitManager 推炸弹（[src/game/managers/UnitManager.ts:73-78](../../../src/game/managers/UnitManager.ts#L73-L78)）

```ts
if (UNIT_DEFS[u.kind]?.attackType === 'ranged') {
  const projKind: ProjectileKind =
    u.kind === 'javelin' ? 'javelin' :
    u.kind === 'bomb'    ? 'bomb'    : 'arrow';
  this.gs.projectiles.push({
    id: crypto.randomUUID(), kind: projKind,
    x: u.x, y: u.y, targetId: u.targetId!,
    speed: 200, damage: u.attack, faction: u.faction, elapsed: 0, maxTime: 2,
  });
}
```

## 视觉

### projectileRenderer — 加 bomb 分支（[src/game/projectileRenderer.ts](../../../src/game/projectileRenderer.ts)）

```ts
const BOMB_MAX_H = 35;
const BOMB_EXPECTED_DIST = 120;  // 与 bomb attackRange 同步

export function drawProjectile(scene, p) {
  if (p.kind === 'javelin') return drawJavelin(scene, p);
  if (p.kind === 'bomb')    return drawBomb(scene, p);
  return drawArrow(scene, p);
}
```

`drawBomb` / `updateBomb` **复用 javelin 的抛物线算法**（traveled / EXPECTED_DIST），sprite 改为：

```ts
function drawBomb(scene, p) {
  const shadow = scene.add.ellipse(0, 0, 12, 4, 0x000000, 0.4);
  const shaft = scene.add.graphics();
  shaft.fillStyle(0xc62828, 1);
  shaft.fillRect(-6, -5, 12, 10);                    // 红色 TNT 木箱主体
  shaft.lineStyle(0.8, 0xffffff, 0.9);
  shaft.lineBetween(-5, -2, 5, -2);                  // 一道白横纹示意 TNT 字
  // 引信小火光
  shaft.fillStyle(0xff7043, 1);
  shaft.fillCircle(0, -7, 1.3);

  const root = scene.add.container(p.x, p.y, [shadow, shaft]);
  root.setData('startX', p.x);
  root.setData('startY', p.y);
  root.setData('shadow', shadow);
  root.setData('shaft', shaft);
  return root;
}
```

`updateBomb` 与 `updateJavelin` 几乎一样，只把常量换成 `BOMB_MAX_H` / `BOMB_EXPECTED_DIST`，旋转幅度可以小一点（炸弹是矩形不是矛尖，过分旋转难看）：

```ts
shaft.setRotation((t - 0.5) * Math.PI * 0.3);   // ±27° 而非 javelin 的 ±45°
```

### EffectManager — bombExplosion 特效（[src/game/effects/EffectManager.ts](../../../src/game/effects/EffectManager.ts)）

dispatch 加 case：

```ts
case 'bombHit':       break;                                   // 仅闪白，无独立特效（在 BattleScene 处理）
case 'bombExplosion': this.spawnBombExplosion(ev.x, ev.y); break;
```

`spawnBombExplosion(x, y)`：

```ts
private spawnBombExplosion(x: number, y: number): void {
  if (!this.budget.tryAdd()) return;
  const root = this.scene.add.container(x, y);

  // 8 角黄星几何爆炸：用 graphics.beginPath + 8 顶点 polygon
  const star = this.scene.add.graphics();
  star.fillStyle(0xffeb3b, 1);
  star.lineStyle(2, 0xff6f00, 1);
  star.beginPath();
  for (let i = 0; i < 16; i++) {                  // 8 角 → 16 个交替顶点（外/内）
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

  // 烟雾环
  const smoke = this.scene.add.circle(0, 0, 20, 0, 0).setStrokeStyle(2, 0x666666, 0.8);
  root.add(smoke);
  this.scene.tweens.add({
    targets: smoke,
    radius: { from: 20, to: 50 },
    alpha: { from: 0.8, to: 0 },
    duration: 600,
    ease: 'Cubic.easeOut',
  });

  // 5 颗火星
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

> 注：Phaser `Graphics` 没有直接的 `radius` tween 属性。烟雾环用 `Phaser.GameObjects.Arc` (`scene.add.circle`) 创建，tween 它的 `scale` 来近似（半径 20→50 等价于 scale 1→2.5 当原始 radius=20），实施时按这个调整：

```ts
const smoke = this.scene.add.circle(0, 0, 20, 0, 0).setStrokeStyle(2, 0x666666, 0.8);
this.scene.tweens.add({ targets: smoke, scale: { from: 1, to: 2.5 }, alpha: { from: 0.8, to: 0 }, duration: 600 });
```

### unitRenderer — 炸弹兵 sprite + 投掷动作（[src/game/unitRenderer.ts](../../../src/game/unitRenderer.ts)）

`drawWeapon` 加 case：

```ts
case 'bomb': {
  // 持物手臂
  g.lineStyle(BODY_W - 0.3, color, 1);
  g.lineBetween(0, -5, 8, -8);
  // 红色 TNT 小木箱
  g.fillStyle(0xc62828, 1);
  g.fillRect(8, -12, 8, 7);
  g.lineStyle(0.8, 0xffffff, 0.9);
  g.lineBetween(8, -10, 16, -10);
  // 引信
  g.fillStyle(0xff7043, 1);
  g.fillCircle(12, -13, 1);
  break;
}
```

`maybeTriggerAttackAnim` 的 switch 加：

```ts
case 'bomb': playBombThrowAnim(body); break;
```

新增 `playBombThrowAnim`（结构同 javelin 三段式，参数偏向"扔重物"）：

```ts
function playBombThrowAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：举高蓄力 0.25s（双手举起 TNT，向后倾）
  body.scene.tweens.add({
    targets: body, rotation: 0.3, y: -3, duration: 250, ease: 'Cubic.easeOut',
  });
  // 段 2：投出 0.18s（前甩）
  body.scene.tweens.add({
    targets: body, rotation: -0.2, y: 0, duration: 180, ease: 'Cubic.easeIn', delay: 250,
  });
  // 段 3：归零 0.2s
  body.scene.tweens.add({
    targets: body, rotation: 0, y: 0, duration: 200, ease: 'Sine.easeOut', delay: 430,
  });
}
```

### campRenderer — 爆破营建筑（[src/game/campRenderer.ts](../../../src/game/campRenderer.ts)）

颜色映射加 bomb：

```ts
sword: 0xffd54f, shield: 0x90a4ae, archer: 0x66bb6a, javelin: 0xff8a65, bomb: 0xc62828,
```

switch 加 case：

```ts
case 'bomb': drawBombCamp(g, color, accent); break;
```

新增 `drawBombCamp` — 红色基底 + 顶部小烟囱形 + 一个白色 "TNT" 字示意（参考 sword 营外形改红色再加白横纹）。具体形状由实施者参考其它 4 个 `drawXxxCamp` 函数自行设计，保持简笔风格一致即可。

### BattleScene 闪白扩展（[src/game/BattleScene.ts:117](../../../src/game/BattleScene.ts#L117)）

```ts
if (
  ev.kind === 'meleeHit' || ev.kind === 'javelinHit' ||
  ev.kind === 'shieldBlock' || ev.kind === 'bombHit'
) {
```

## 数据流（完整路径）

### 解锁流程

```
1. 用户点击"投矛营 / 爆破营"按钮
   └─ BuildPanel.onclick async:
        if !isUnlocked: await modal.open()  ← Promise 等用户答对
        bridge.unlockGate(gs, 60)            ← gs.sim.unlockTimer = 60
        bridge.selectCampKind(...)           ← 进入 placement 选中态

2. 用户点地图 → PlacementController.placeCamp
   ├─ 兜底检查: gated && unlockTimer<=0 → 拒绝
   └─ 创建 camp 进 game state

3. 每帧 BattleScene.update:
   for each fixed step (sim.running=true 时):
     sim.unlockTimer = max(0, unlockTimer - dt)
   bridge.emit('statsChanged') → HudController 重渲倒计时

4. unlockTimer 归 0 后：
   按钮自动加 .locked 样式
   下次再点 gated 按钮 → 重新弹题
```

### 炸弹爆炸流程

```
1. 炸弹兵 attack：
   UnitManager.act → projectiles.push({ kind:'bomb', ... })
   unitRenderer.maybeTriggerAttackAnim → playBombThrowAnim 三段式

2. 后续帧 CombatSystem.step:
   推进 projectile.x,y（直线运动，与 javelin 同算法）
   dist < 12:
     CombatSystem.applyAOE(p.x, p.y, dmg, p.faction, gs)
     ├─ 半径内每个敌方 unit: applyDamage(weaponKind:'bomb')
     │    ├─ 盾兵 → push shieldBlock
     │    └─ 普通 → push bombHit
     ├─ 半径内每个敌方 camp: applyDamage（沿用 camp 受击/摧毁分支）
     └─ push bombExplosion 事件

   特殊情况：目标已死（gs.units.get(p.targetId) → undefined）时，
   炸弹原地爆炸，仍走 applyAOE。详见 §错误处理。

3. (同帧后段) BattleScene.update events 排空:
   ├─ shieldBlock / bombHit → triggerHitFlash + 各自特效
   └─ bombExplosion → EffectManager.spawnBombExplosion (8 角黄星 + 烟雾环 + 5 火星)
```

## 错误处理

| 情况 | 处理 |
|---|---|
| 答题时游戏倒计时刚归零 | 弹窗仍 open，答对后正常解锁 60s（不会出现"答完了反而锁着"） |
| 拖拽 gated 按钮且锁定 | dragstart 立即 preventDefault + 弹题；用户答完需重拉 |
| 答题中游戏被暂停 | 倒计时不流逝；答完恢复 sim.running 后才开始 60s 倒计时 |
| 炸弹兵在飞行中目标已死 | sourceTarget 空：CombatSystem.step 现有逻辑 `gs.units.get(p.targetId)` 返回 undefined → continue。**炸弹应当继续飞到原 (tx,ty) 然后爆炸**，不是空中消失 |
| 炸弹同帧炸死多个目标 | applyAOE 内 `for` 顺序处理；事件队列里 bombExplosion + N 个 bombHit/shieldBlock，正确 dispatch |
| 多个炸弹同帧爆炸 | 每个推一个 bombExplosion；EffectBudget 软上限 50 兜底（满了跳过新特效） |
| 炸弹爆炸圈内同时有炸弹兵和盾兵 | 按 applyAOE 内遍历顺序处理，各推各的事件，无冲突 |

**关于"炸弹目标已死时仍要爆炸"**：现有 `CombatSystem.step` 第 53-54 行 `const target = gs.units.get(p.targetId) ?? gs.camps.get(p.targetId); if (!target) continue;` 会让 javelin/arrow 直接消失。**炸弹的语义不同 — 抛出去的炸弹应该落地**。需要在 step 中改为：

```ts
const target = gs.units.get(p.targetId) ?? gs.camps.get(p.targetId);
if (!target) {
  if (p.kind === 'bomb') {
    // 炸弹：目标死了仍按原飞行方向继续到 maxTime 再爆。
    // 简化处理：原地爆炸。视觉上炸弹悬空一帧后炸，玩家可接受。
    CombatSystem.applyAOE(p.x, p.y, p.damage, p.faction, gs);
    continue;
  }
  continue;
}
```

简化为"目标死了 → 炸弹原地爆"。这避免引入"无目标弹道"概念。

## 测试策略

### 新增 / 修改的单测

| 文件 | 修改 |
|---|---|
| **新建** [tests/mathQuiz.test.ts](../../../tests/mathQuiz.test.ts) | 题目生成器纯函数测试：加法 sum ≤ 10、减法 a-b ≥ 0、答案 ∈ [0,10]、`+` 和 `-` 两类都生成 |
| **新建** [tests/CombatSystem.aoe.test.ts](../../../tests/CombatSystem.aoe.test.ts) | applyAOE 单测：圈内多 unit 都受伤、圈外 unit 不受伤、不打自己人、也打敌方 camp、推 bombExplosion 事件 |
| `tests/CombatSystem.events.test.ts` | +1 条："炸弹命中普通 unit 推 bombHit 而非 meleeHit"；+1 条："炸弹命中盾兵仍走 shieldBlock（盾兵身份压过武器）" |
| `tests/CombatSystem.test.ts` | +1 条："弹道 kind=bomb 触发 AOE 而非单兵 applyDamage" |
| `tests/camps.test.ts` | 既有"5 个兵种全配置"等断言可能要扩展（看现有测试如何枚举） |
| `tests/units.test.ts` | 同上 |
| `tests/CampManager.test.ts` | 添加 fixture：放炸弹营、产炸弹兵 |

### 不写

- `MathQuizModal` UI 单测（DOM 操作密集，jsdom 也勉强；靠目测）
- `BuildPanel` 拦截逻辑（async/dragstart 难测；目测）
- `EffectManager.spawnBombExplosion` 视觉测试（涉及 Phaser scene；目测）
- `unitRenderer.playBombThrowAnim` 时序测试（同上）
- `projectileRenderer` `drawBomb` / `updateBomb` 视觉测试（同上）

### 目测验收清单

- [ ] 首次打开游戏，HUD 显示"🔒 投矛/爆破锁定"
- [ ] 投矛营、爆破营按钮上叠 🔒，可见但视觉为锁定态
- [ ] 点击"投矛营"按钮 → 弹算术题（10 以内加/减）
- [ ] 数字键盘点 0-9 / 10，输入显示框正确累计两位
- [ ] 输入正确 → 短闪绿、关闭弹窗、HUD 显示"🔓 投矛/爆破已解锁 60s"
- [ ] 60s 倒计时实时递减，按钮变绿色已解锁态
- [ ] 此期间再点投矛/爆破不再弹题
- [ ] 输入错误 → 卡片抖动、显示"再想想..."、自动换新题、弹窗保持开启
- [ ] 暂停游戏（▶/⏸）后倒计时停止；恢复后继续
- [ ] 60s 归零 → HUD 切回锁定文案、按钮变锁定态、再点投矛/爆破又要答题
- [ ] 拖拽锁定状态的投矛/爆破按钮 → 弹题（不会拖出去）
- [ ] 爆破营建筑可见、与其它 4 兵营外形可区分（红色为主）
- [ ] 炸弹兵开火时投出 TNT 木箱、抛物线飞行、自身做举手→投出→归零三段动作
- [ ] 炸弹落到目标点 → 8 角黄星爆炸 + 烟雾环 + 5 颗火星散开
- [ ] 50px 圈内多个敌方小兵同时受伤、有受击闪白
- [ ] 炸弹也能炸到敌方军营、有"campHit"震屏效果
- [ ] 炸弹炸到盾兵时盾兵位置出火花、并非大爆炸覆盖（两者并存正常）
- [ ] 控制台无新报错（已有 [CampManager] 诊断 warn 不算）

## 风险与权衡

| 选择 | 替代 | 为什么这样 |
|---|---|---|
| 全局一个 unlockTimer | 红蓝双方独立倒计时 | 跨双方时间分割逻辑复杂，UI 显示也要拆，YAGNI |
| 错答不解锁、换新题 | 错答仍解锁、提示答案 | 用户最终决策为"训练"导向，强制答对才能用奖励 |
| 全屏 modal overlay | 在按钮旁弹小气泡 | 全屏强制聚焦避免误点其它兵种，z-index 简单 |
| 数字键盘 0-10 | 文本输入框 | 触屏友好；避免键盘弹起遮挡视野 |
| `CombatSystem.applyAOE` 新方法 | 改 applyDamage 接受目标列表 | 契约更清晰：单体 vs 范围语义不同 |
| 炸弹也命中军营 | 仅命中小兵 | 增加战术深度（炸弹兵专门拆建筑） |
| `bombHit` 单独事件 | 复用 meleeHit 或 javelinHit | AOE 同帧产生 N 个 hit，复用其它会触发其它特效（黄星 / 大星）干扰；新事件最干净 |
| 盾兵被炸仍走 shieldBlock | 炸弹不能被盾挡（盾兵照常 bombHit） | 盾兵身份原则保持一致；视觉上爆炸 + 火花叠加是正常的 |
| 拖拽锁定按钮取消拖拽 | 拦截 drop 时再弹题 | drop 那时已经在地图上，弹题打断更突兀 |
| TNT 木箱外形（矩形 + 白横纹） | 真实 TNT 字 | 9px 高画 "TNT" 字基本不可读；横纹示意更省事 |
| 单一 unitCap=12 | 与其它一致的 20 | AOE 强、群兵多了视觉爆炸刷屏 + 平衡破坏 |

## 实施顺序

1. **数据契约层**：types.ts (CampKind/ProjectileKind/CombatEvent) → DamageOpts.weaponKind 加 'bomb' → GameState.SimState.unlockTimer。编译会指出所有要改的点。
2. **配置层**：units.ts / camps.ts 加 bomb 项。
3. **算术题纯函数**：mathQuiz.ts + 新单测（TDD）。
4. **MathQuizModal 组件**：DOM 创建 + 键盘交互 + 答对/答错流程。
5. **UiBridge.unlockGate / isUnlocked**：简单方法 + simChanged 事件触发。
6. **BattleScene unlockTimer 推进**：fixed-step 加 3 行。
7. **HudController 倒计时显示**：render 末尾追加。
8. **BuildPanel 拦截**：按钮表加 gated/bomb，onclick/dragstart/onHotkey async + modal.open。
9. **PlacementController 兜底**：placeCamp 头部加防呆。
10. **CombatSystem.applyAOE + bombHit 分支 + step 分发**：先写测试再写实现。
11. **UnitManager 推炸弹**：projKind 选 bomb。
12. **EffectManager.spawnBombExplosion + dispatch case**。
13. **BattleScene 闪白扩展加 bombHit**。
14. **projectileRenderer drawBomb / updateBomb**：复用 javelin 算法。
15. **unitRenderer drawWeapon case bomb + playBombThrowAnim + maybeTriggerAttackAnim case**。
16. **campRenderer drawBombCamp + 颜色映射**。
17. **测试 fixture 修复**（CampManager.test.ts 等如有需要）。
18. **`npm test && npm run build`**。
19. **目测验收**。
20. **push。**
