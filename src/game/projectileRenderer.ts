import Phaser from 'phaser';
import { FACTION_COLORS } from '../config/colors';
import type { Projectile } from './types';

export function drawProjectile(scene: Phaser.Scene, p: Projectile): Phaser.GameObjects.Container {
  const color = FACTION_COLORS[p.faction];
  const g = scene.add.graphics();
  g.fillStyle(color, 0.9);
  g.fillCircle(0, 0, 3);
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(0, 0, 1.5);
  return scene.add.container(p.x, p.y, [g]);
}

export function updateProjectileView(view: Phaser.GameObjects.Container, p: Projectile): void {
  view.setPosition(p.x, p.y);
}
