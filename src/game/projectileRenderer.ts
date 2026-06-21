import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Projectile } from './types';

/** 弓箭抛物线峰值高度（世界坐标 px）— 低于投矛，保持弓箭的直线感 */
const ARROW_MAX_H = 20;
/** 弓箭预期飞行距离，与 config/units.ts 中 archer.attackRange=180 同步 */
const ARROW_EXPECTED_DIST = 180;

/** 投矛抛物线峰值高度（世界坐标 px） */
const JAVELIN_MAX_H = 40;

/**
 * 投矛预期飞行距离（世界坐标 px）。与 config/units.ts 中 javelin.attackRange=150 同步。
 * 用 traveled / EXPECTED_DIST 而非 elapsed / maxTime 算 t —— maxTime=2.0s 是超时上限，
 * 远大于实际飞行时长（≈0.75s），用 elapsed/maxTime 会让 t 始终 < 0.5、矛永远到不了峰值。
 */
const JAVELIN_EXPECTED_DIST = 150;

/** 炸弹抛物线峰值高度（世界坐标 px） */
const BOMB_MAX_H = 35;
/** 炸弹预期飞行距离，与 config/units.ts 中 bomb.attackRange=120 同步 */
const BOMB_EXPECTED_DIST = 120;

/** 炮弹抛物线峰值高度（世界坐标 px） */
const ARTILLERY_MAX_H = 60;
/** 炮弹预期飞行距离，与 config/units.ts 中 artillery.attackRange=280 同步 */
const ARTILLERY_EXPECTED_DIST = 280;

export function drawProjectile(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  if (p.kind === 'javelin')    return drawJavelin(scene, p);
  if (p.kind === 'bomb')       return drawBomb(scene, p);
  if (p.kind === 'heal')       return drawHeal(scene, p);
  if (p.kind === 'artillery')  return drawArtillery(scene, p);
  return drawArrow(scene, p);
}

export function updateProjectileView(view: Phaser.GameObjects.Container, p: Projectile): void {
  if (p.kind === 'javelin')    return updateJavelin(view, p);
  if (p.kind === 'bomb')       return updateBomb(view, p);
  if (p.kind === 'heal')       return updateHeal(view, p);
  if (p.kind === 'artillery')  return updateArtillery(view, p);
  return updateArrow(view, p);
}

/* ───── 箭矢：低弧抛物线 + 箭羽 + 影子 ───── */

function drawArrow(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  // 影子：地面椭圆（不参与高度变换）
  const shadow = scene.add.ellipse(0, 0, 12, 4, 0x000000, 0.4);

  // 箭体（shaft）：木杆 + 箭头 + 箭羽。承担视觉 y 偏移 + 自身旋转。
  const shaft = scene.add.graphics();
  shaft.lineStyle(2.2, 0x8d6e63, 1);              // 木杆
  shaft.lineBetween(-12, 0, 10, 0);
  shaft.fillStyle(0xff7043, 1);                   // 箭头
  shaft.fillTriangle(10, 0, 6, -2.5, 6, 2.5);
  shaft.fillStyle(0xfff176, 1);                   // 箭羽两片
  shaft.fillTriangle(-12, 0, -16, -2.5, -12, -1);
  shaft.fillTriangle(-12, 0, -16, 2.5, -12, 1);

  const root = scene.add.container(p.x, p.y, [shadow, shaft]);
  root.setData('startX', p.x);
  root.setData('startY', p.y);
  root.setData('shadow', shadow);
  root.setData('shaft', shaft);
  root.setData('prevX', p.x);
  root.setData('prevY', p.y);
  return root;
}

function updateArrow(view: Phaser.GameObjects.Container, p: Projectile): void {
  const shadow = view.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
  const shaft = view.getData('shaft') as Phaser.GameObjects.Graphics | undefined;
  const startX = view.getData('startX');
  const startY = view.getData('startY');
  const prevX = view.getData('prevX') as number;
  const prevY = view.getData('prevY') as number;

  if (!shadow || !shaft || !Number.isFinite(startX) || !Number.isFinite(startY)) {
    view.setPosition(p.x, p.y);
    return;
  }

  // container 自身定位在地面坐标 (p.x, p.y)
  view.setPosition(p.x, p.y);

  // 低弧抛物线高度（复用 javelin 算法，峰值减半）
  const traveled = Math.hypot(p.x - (startX as number), p.y - (startY as number));
  const t = Math.min(1, traveled / ARROW_EXPECTED_DIST);
  const visualHeight = 4 * ARROW_MAX_H * t * (1 - t);
  const heightRatio = visualHeight / ARROW_MAX_H;

  shaft.setPosition(0, -visualHeight);

  // 朝向：沿运动方向旋转（作用于 shaft 子对象）
  const dx = p.x - prevX;
  const dy = p.y - prevY;
  if (dx !== 0 || dy !== 0) {
    shaft.setRotation(Math.atan2(dy, dx));
  }

  // 影子：贴地（container 局部 y=0），按高度缩放淡化
  shadow.setPosition(0, 0);
  shadow.setScale(1 - 0.6 * heightRatio);
  shadow.setAlpha(0.4 - 0.25 * heightRatio);

  view.setData('prevX', p.x);
  view.setData('prevY', p.y);
}

/* ───── 投矛：抛物线 + 影子 ───── */

function drawJavelin(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[p.faction];

  // 影子：地面椭圆（不参与高度变换；位置和缩放在 update 里调）
  const shadow = scene.add.ellipse(0, 0, 14, 5, 0x000000, 0.4);

  // 矛体（shaft）：杆 + 矛头。承担视觉 y 偏移 + 自身旋转。
  const shaft = scene.add.graphics();
  shaft.lineStyle(3.5, 0xa1887f, 1);            // 木杆
  shaft.lineBetween(-15, 0, 15, 0);
  shaft.lineStyle(1, 0xd7ccc8, 0.5);            // 高光
  shaft.lineBetween(-13, -2, 13, -2);
  shaft.fillStyle(0xff7043, 1);                 // 矛头
  shaft.fillTriangle(15, 0, 9, -4, 9, 4);
  // 用 faction 色给矛尾加一抹（让红蓝可分辨）
  shaft.fillStyle(color, 0.9);
  shaft.fillRect(-15, -2, 4, 4);

  const root = scene.add.container(p.x, p.y, [shadow, shaft]);
  root.setData('startX', p.x);
  root.setData('startY', p.y);
  root.setData('shadow', shadow);
  root.setData('shaft', shaft);
  return root;
}

function updateJavelin(view: Phaser.GameObjects.Container, p: Projectile): void {
  const shadow = view.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
  const shaft = view.getData('shaft') as Phaser.GameObjects.Graphics | undefined;
  const startX = view.getData('startX');
  const startY = view.getData('startY');
  if (!shadow || !shaft || !Number.isFinite(startX) || !Number.isFinite(startY)) {
    // 兜底：起点丢失则退化为直线
    view.setPosition(p.x, p.y);
    return;
  }

  // container 自身定位在 (p.x, p.y)（地面坐标）。子对象 shaft 自带 y 偏移代表"高度"。
  view.setPosition(p.x, p.y);

  const traveled = Math.hypot(p.x - (startX as number), p.y - (startY as number));
  const t = Math.min(1, traveled / JAVELIN_EXPECTED_DIST);
  const visualHeight = 4 * JAVELIN_MAX_H * t * (1 - t);
  const heightRatio = visualHeight / JAVELIN_MAX_H;  // 0..1

  // 矛体：往上抬 visualHeight；旋转从 -45° 通过 0° 到 +45°
  shaft.setPosition(0, -visualHeight);
  shaft.setRotation((t - 0.5) * Math.PI * 0.5);

  // 影子：始终贴地（y=0 在 container 局部坐标）；按高度缩放和淡化
  shadow.setPosition(0, 0);
  shadow.setScale(1 - 0.6 * heightRatio);
  shadow.setAlpha(0.4 - 0.25 * heightRatio);
}

/* ───── 炸弹：抛物线 + 影子（复用 javelin 算法，sprite 换 TNT 木箱） ───── */

function drawBomb(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(0, 0, 12, 4, 0x000000, 0.4);

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

  shaft.setPosition(0, -visualHeight);
  shaft.setRotation((t - 0.5) * Math.PI * 0.3);

  shadow.setPosition(0, 0);
  shadow.setScale(1 - 0.6 * heightRatio);
  shadow.setAlpha(0.4 - 0.25 * heightRatio);
}

/* ───── 治疗弹：绿色圆球 + 白色十字 ───── */

function drawHeal(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0x4caf50, 0.9);
  g.fillCircle(0, 0, 5);
  g.fillStyle(0xffffff, 1);
  g.fillRect(-2, -5, 4, 10);
  g.fillRect(-5, -2, 10, 4);
  return scene.add.container(p.x, p.y, [g]);
}

function updateHeal(view: Phaser.GameObjects.Container, p: Projectile): void {
  view.setPosition(p.x, p.y);
}

/* ───── 炮弹：抛物线 + 烟雾尾迹 + 影子 ───── */

function drawArtillery(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const shadow = scene.add.ellipse(0, 0, 16, 6, 0x000000, 0.4);

  const shaft = scene.add.graphics();
  shaft.fillStyle(0x424242, 1);
  shaft.fillCircle(0, 0, 6);
  shaft.fillStyle(0xff6d00, 0.9);
  shaft.fillCircle(-5, 0, 3);
  shaft.fillStyle(0xffab00, 0.7);
  shaft.fillCircle(-7, 0, 2);

  const root = scene.add.container(p.x, p.y, [shadow, shaft]);
  root.setData('startX', p.x);
  root.setData('startY', p.y);
  root.setData('shadow', shadow);
  root.setData('shaft', shaft);
  return root;
}

function updateArtillery(view: Phaser.GameObjects.Container, p: Projectile): void {
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
  const t = Math.min(1, traveled / ARTILLERY_EXPECTED_DIST);
  const visualHeight = 4 * ARTILLERY_MAX_H * t * (1 - t);
  const heightRatio = visualHeight / ARTILLERY_MAX_H;

  shaft.setPosition(0, -visualHeight);
  shaft.setRotation((t - 0.5) * Math.PI * 0.3);

  shadow.setPosition(0, 0);
  shadow.setScale(1 - 0.6 * heightRatio);
  shadow.setAlpha(0.4 - 0.25 * heightRatio);
}
