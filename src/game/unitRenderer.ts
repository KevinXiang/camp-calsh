import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Unit, UnitKind, Faction } from './types';

const SKIN = 0xffcc80;
const BODY_W = 2.5;
const CORPSE_COLOR = 0x777777;

/**
 * View 数据约定（存于 container.data）：
 *   body:  Phaser.GameObjects.Container — 装 graphics + 武器，可独立 tween
 *   anim:  动作状态（相位 / 兵种 / 受击时间 / 上一次 attackTimer）
 */
interface AnimState {
  walkPhaseOffset: number;  // 每个单位独立相位（0..1），防止齐步走
  kind: UnitKind;
  hitFlashUntil: number;    // 受击闪白结束时间（performance.now ms）
  prevAttackTimer: number;  // 检测攻击触发用
}

function drawStickFigure(g: Phaser.GameObjects.Graphics, faction: Faction, kind: UnitKind): void {
  const color = FACTION_COLORS[faction];

  // 落影
  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(0, 16, 22, 7);

  // 腿
  g.lineStyle(BODY_W, color, 1);
  g.lineBetween(0, 3, -6, 14);
  g.lineBetween(0, 3, 6, 14);

  // 身体
  g.lineStyle(BODY_W + 0.5, color, 1);
  g.lineBetween(0, -8, 0, 3);

  // 头
  g.fillStyle(SKIN, 1);
  g.fillCircle(0, -15, 7);
  g.lineStyle(1.2, 0x000000, 0.2);
  g.strokeCircle(0, -15, 7);

  // 眼睛
  g.fillStyle(0x000000, 0.7);
  g.fillCircle(-2.5, -15, 1.2);
  g.fillCircle(2.5, -15, 1.2);

  // 嘴
  g.lineStyle(1, 0x000000, 0.4);
  g.beginPath();
  g.arc(0, -12, 3, 0.2, Math.PI - 0.2);
  g.strokePath();

  drawWeapon(g, kind, color);
}

function drawWeapon(g: Phaser.GameObjects.Graphics, kind: UnitKind, color: number): void {
  switch (kind) {
    case 'sword': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -9, 1);
      g.lineBetween(0, -5, 10, -2);
      g.lineStyle(3, 0xffd54f, 1);
      g.lineBetween(10, -2, 17, -10);
      g.lineStyle(1.5, 0xfff176, 0.7);
      g.lineBetween(11, -2, 7, 3);
      break;
    }
    case 'shield': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, 9, 2);
      g.lineBetween(0, -5, -9, 1);
      g.fillStyle(0xb0bec5, 0.85);
      g.fillCircle(-11, 2, 7);
      g.lineStyle(2, 0x78909c, 0.8);
      g.strokeCircle(-11, 2, 7);
      g.fillStyle(0xcfd8dc, 0.7);
      g.fillCircle(-11, 2, 3.5);
      break;
    }
    case 'archer': {
      g.lineStyle(BODY_W - 0.3, color, 1);
      g.lineBetween(0, -5, -3, 0);
      g.lineBetween(0, -5, -3, 6);
      g.lineStyle(2.5, 0x66bb6a, 1);
      const bx = -8, by = -4;
      g.beginPath();
      g.moveTo(bx, by);
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const px = bx + Math.sin(t * Math.PI) * 5;
        const py = by + t * 16;
        g.lineTo(px, py);
      }
      g.strokePath();
      g.lineStyle(2.5, 0xffd54f, 1);
      g.lineBetween(-8, 6, 9, 6);
      g.fillStyle(0xff7043, 1);
      g.fillTriangle(9, 6, 5, 3, 5, 9);
      break;
    }
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
  }
}

export function drawUnit(scene: Phaser.Scene, unit: Unit): Phaser.GameObjects.Container {
  // body 子容器：装 graphics，承担弹跳/旋转/闪白
  const body = scene.add.container(0, 0);
  const g = scene.add.graphics();
  drawStickFigure(g, unit.faction, unit.kind);
  body.add(g);

  // 血条（不参与 body 变换）
  const hpBg = scene.add.rectangle(0, -26, 22, 3.5, 0x000000, 0.5).setOrigin(0.5);
  const ratio = Math.max(0, unit.hp / unit.maxHp);
  const hpC = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
  const hpFill = scene.add.rectangle(-11, -26, 22 * ratio, 3, hpC).setOrigin(0, 0.5);

  const root = scene.add.container(unit.x, unit.y, [body, hpBg, hpFill]);

  const anim: AnimState = {
    walkPhaseOffset: (simpleHash(unit.id) % 1000) / 1000,
    kind: unit.kind,
    hitFlashUntil: 0,
    prevAttackTimer: unit.attackTimer,
  };
  root.setData('anim', anim);
  root.setData('body', body);
  return root;
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function updateUnitView(view: Phaser.GameObjects.Container, unit: Unit): void {
  view.setPosition(unit.x, unit.y);

  // 死亡处理：只在第一帧切换为尸体并锁定
  if (!unit.alive) {
    if (view.getData('corpse') !== true) {
      // 第一次进入死亡：先播倒下旋转 → 再切尸体
      const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
      if (body) {
        view.scene.tweens.add({
          targets: body,
          rotation: Math.PI / 2,
          duration: 250,
          ease: 'Cubic.easeIn',
        });
      }
      view.setData('corpse', true);
      view.scene.time.delayedCall(280, () => {
        if (!view.scene) return;
        view.removeAll(true);
        const g = view.scene.add.graphics();
        drawCorpse(g);
        view.add(g);
      });
    }
    view.setAlpha(Math.max(0.4, unit.deathTimer / 1.0));
    return;
  }

  const anim = view.getData('anim') as AnimState | undefined;
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!anim || !body) return;

  // 走路弹跳：仅 state==='moving' 时 body 上下浮动 + 摇摆。
  // 关键：attacking 状态下绝不触碰 body 变换，否则会覆盖 Task 6 的攻击 tween。
  if (unit.state === 'moving') {
    const t = (performance.now() / 400) + anim.walkPhaseOffset;
    const phase = (t % 1) * Math.PI * 2;
    body.y = -Math.abs(Math.sin(phase)) * 4;  // 0..-4 弹跳
    body.rotation = Math.sin(phase) * 0.05;   // ±3° 摇摆
  } else if (unit.state === 'idle') {
    // 仅 idle（无目标）时归零；attacking 时交给攻击 tween
    body.y = 0;
    body.rotation = 0;
  }
  // attacking：不改 body（攻击 tween 拥有控制权，结束后归零）

  // 血条更新（child[1]=bg, child[2]=fill）
  const hpFill = view.getAt(2) as Phaser.GameObjects.Rectangle;
  if (hpFill) {
    const ratio = Math.max(0, unit.hp / unit.maxHp);
    hpFill.setSize(22 * ratio, 3);
    const c = ratio > 0.5 ? 0x4caf50 : ratio > 0.25 ? 0xffc107 : 0xf44336;
    hpFill.setFillStyle(c);
  }
}

function drawCorpse(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x000000, 0.1);
  g.fillEllipse(0, 4, 28, 9);
  g.lineStyle(BODY_W + 0.5, CORPSE_COLOR, 0.8);
  g.lineBetween(-12, 0, 10, 0);
  g.lineStyle(BODY_W, CORPSE_COLOR, 0.7);
  g.lineBetween(-6, 0, -12, 8);
  g.lineBetween(-6, 0, -2, 9);
  g.fillStyle(CORPSE_COLOR, 0.8);
  g.fillCircle(12, -1, 5.5);
  g.lineStyle(1, 0x555555, 0.5);
  g.strokeCircle(12, -1, 5.5);
  g.lineStyle(1.2, 0x555555, 0.7);
  g.lineBetween(10, -3, 14, 1);
  g.lineBetween(14, -3, 10, 1);
  g.lineStyle(BODY_W - 0.3, CORPSE_COLOR, 0.6);
  g.lineBetween(4, 0, 10, 8);
  g.lineBetween(2, 0, -4, 7);
}

/**
 * 检测 attackTimer 从低被重置为高（即刚开火）→ 触发对应动作。
 * 由 BattleScene 在 sync 时调用。
 */
export function maybeTriggerAttackAnim(
  view: Phaser.GameObjects.Container,
  unit: Unit
): void {
  const anim = view.getData('anim') as AnimState | undefined;
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!anim || !body || !unit.alive) return;

  // attackTimer 刚从 ≤0.05 跳回到 ≥interval*0.9 → 视为开火
  const justFired = anim.prevAttackTimer <= 0.05 && unit.attackTimer >= unit.attackInterval * 0.9;
  anim.prevAttackTimer = unit.attackTimer;
  if (!justFired) return;

  switch (anim.kind) {
    case 'sword':   playSlashAnim(body); break;
    case 'shield':  playBashAnim(body); break;
    case 'archer':  playBowAnim(body); break;
    case 'javelin': playJavelinAnim(body); break;
  }
}

/** 剑兵挥砍：body 旋转挥砍（yoyo 回到 0，不与 walk 冲突） */
function playSlashAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({
    targets: body,
    rotation: { from: 0, to: 0.5 },
    y: 0,           // 顺手把竖直位置归零（可能停在 walk 半程）
    duration: 120,
    yoyo: true,
    ease: 'Cubic.easeOut',
  });
}

/** 盾兵猛击：body 前推 + 回弹 */
function playBashAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({
    targets: body,
    x: { from: 0, to: 4 },
    y: 0,
    duration: 180,
    yoyo: true,
    ease: 'Sine.easeInOut',
  });
}

/** 弓兵射箭：body 短促后缩（模拟拉弦回收） */
function playBowAnim(body: Phaser.GameObjects.Container): void {
  body.scene.tweens.add({
    targets: body,
    x: { from: 0, to: -3 },
    y: 0,
    duration: 100,
    yoyo: true,
    ease: 'Quad.easeOut',
  });
}

/** 投矛三段式：蓄力 0.3s（后仰）→ 出手 0.15s（前甩）→ 归零 0.2s */
function playJavelinAnim(body: Phaser.GameObjects.Container): void {
  // 段 1：蓄力（身体后仰 ≈23°、轻微下压）
  body.scene.tweens.add({
    targets: body,
    rotation: 0.4,
    y: -2,
    duration: 300,
    ease: 'Cubic.easeOut',
  });
  // 段 2：出手（快速前甩到 -14°）
  body.scene.tweens.add({
    targets: body,
    rotation: -0.25,
    y: 0,
    duration: 150,
    ease: 'Cubic.easeIn',
    delay: 300,
  });
  // 段 3：归零
  body.scene.tweens.add({
    targets: body,
    rotation: 0,
    y: 0,
    duration: 200,
    ease: 'Sine.easeOut',
    delay: 450,
  });
}

/**
 * 受击闪白：覆盖一层白色 graphics 0.15s 淡出 + body 抖动。
 */
export function triggerHitFlash(view: Phaser.GameObjects.Container): void {
  const body = view.getData('body') as Phaser.GameObjects.Container | undefined;
  if (!body) return;

  const flash = body.scene.add.graphics();
  flash.fillStyle(0xffffff, 0.7);
  flash.fillCircle(0, -10, 14);  // 覆盖头+身体范围
  body.add(flash);

  body.scene.tweens.add({
    targets: flash,
    alpha: { from: 0.7, to: 0 },
    duration: 150,
    onComplete: () => flash.destroy(),
  });

  body.scene.tweens.add({
    targets: body,
    x: { from: -2, to: 2 },
    duration: 60,
    yoyo: true,
    repeat: 1,
    ease: 'Sine.easeInOut',
  });
}
