import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Projectile } from './types';

/** 投矛抛物线峰值高度（世界坐标 px） */
const JAVELIN_MAX_H = 40;

/**
 * 投矛预期飞行距离（世界坐标 px）。与 config/units.ts 中 javelin.attackRange=150 同步。
 * 用 traveled / EXPECTED_DIST 而非 elapsed / maxTime 算 t —— maxTime=2.0s 是超时上限，
 * 远大于实际飞行时长（≈0.75s），用 elapsed/maxTime 会让 t 始终 < 0.5、矛永远到不了峰值。
 */
const JAVELIN_EXPECTED_DIST = 150;

export function drawProjectile(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  if (p.kind === 'javelin') return drawJavelin(scene, p);
  return drawArrow(scene, p);
}

export function updateProjectileView(view: Phaser.GameObjects.Container, p: Projectile): void {
  if (p.kind === 'javelin') return updateJavelin(view, p);
  return updateArrow(view, p);
}

/* ───── 箭矢（沿用现状） ───── */

function drawArrow(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[p.faction];
  const trail = scene.add.graphics();
  trail.fillStyle(color, 0.4);
  trail.fillRect(-12, -1.5, 12, 3);

  const head = scene.add.graphics();
  head.fillStyle(color, 0.95);
  head.fillCircle(0, 0, 3);
  head.fillStyle(0xffffff, 0.6);
  head.fillCircle(0, 0, 1.5);

  const root = scene.add.container(p.x, p.y, [trail, head]);
  root.setData('prevX', p.x);
  root.setData('prevY', p.y);
  return root;
}

function updateArrow(view: Phaser.GameObjects.Container, p: Projectile): void {
  const prevX = view.getData('prevX') as number;
  const prevY = view.getData('prevY') as number;
  const dx = p.x - prevX;
  const dy = p.y - prevY;
  view.setPosition(p.x, p.y);
  if (dx !== 0 || dy !== 0) {
    view.setRotation(Math.atan2(dy, dx));
  }
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
