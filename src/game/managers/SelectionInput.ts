import Phaser from 'phaser';
import type { BattleScene } from '../BattleScene';
import type { UiBridge } from '../../ui/UiBridge';
import { createHoverState, stepHover } from './hoverStateMachine';

export class SelectionInput {
  private hoverState = createHoverState();
  private currentHitId: string | null = null;

  constructor(
    private scene: BattleScene,
    private bridge: UiBridge,
  ) {
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown()) return;
      if (bridge.getSelection().kind !== null) return;
      const camp = this.pickCampAt(p.worldX, p.worldY);
      bridge.selectCamp(camp ?? null);
    });

    scene.input.keyboard?.on('keydown-DELETE', () => {
      bridge.deleteSelected(scene);
    });

    // 悬停检测：每次移动更新当前命中军营，实际计时在 update() 中推进
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.currentHitId = this.pickCampAt(p.worldX, p.worldY);
    });
  }

  /** 每帧由场景调用，推进悬停计时（自然时间，不受暂停/倍速影响） */
  update(deltaMs: number): void {
    const r = stepHover(this.hoverState, this.currentHitId, deltaMs);
    this.hoverState = r.state;
    if (r.action.type === 'show') {
      const camp = this.scene.exposeGameState().getCamp(r.action.campId);
      this.bridge.hoverCamp(camp ? camp.kind : null);
    } else if (r.action.type === 'clear') {
      this.bridge.hoverCamp(null);
    }
  }

  private pickCampAt(wx: number, wy: number): string | null {
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
