import Phaser from 'phaser';
import type { BattleScene } from '../BattleScene';
import type { UiBridge } from '../../ui/UiBridge';

export class SelectionInput {
  constructor(
    private scene: BattleScene,
    private bridge: UiBridge,
  ) {
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      if (bridge.getSelection().kind !== null) return;
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
