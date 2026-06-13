import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Projectile } from './types';

export function drawProjectile(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
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

export function updateProjectileView(view: Phaser.GameObjects.Container, p: Projectile): void {
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
