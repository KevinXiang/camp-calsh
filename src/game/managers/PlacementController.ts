import Phaser from 'phaser';
import type { BattleScene } from '../BattleScene';
import { PREVIEW_OK_COLOR, PREVIEW_BAD_COLOR } from '../../config/colors';
import type { CampKind, Faction } from '../types';
import type { UiBridge } from '../../ui/UiBridge';
import { CampPlacementService } from './CampPlacementService';

export class PlacementController {
  private preview: Phaser.GameObjects.Arc;
  private placementService: CampPlacementService;
  private faction: Faction = 'red';
  private kind: CampKind | null = null;

  constructor(
    private scene: BattleScene,
    private bridge: UiBridge,
    placementService?: CampPlacementService,
  ) {
    this.placementService =
      placementService ?? new CampPlacementService(scene.exposeGameState());
    this.preview = scene.add.circle(0, 0, 32, PREVIEW_OK_COLOR, 0.4)
      .setStrokeStyle(2, PREVIEW_OK_COLOR)
      .setVisible(false);

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));

    bridge.on('placementChanged', () => this.refreshFromBridge());
    this.refreshFromBridge();

    this.setupDragDrop();
  }

  private refreshFromBridge(): void {
    const sel = this.bridge.getSelection();
    this.faction = sel.faction;
    this.kind = sel.kind;
  }

  private setupDragDrop(): void {
    const canvas = this.scene.game.canvas;
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    });
    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const faction = e.dataTransfer!.getData('application/x-camp-faction') as Faction;
      const kind = e.dataTransfer!.getData('application/x-camp-kind') as CampKind;
      if (!faction || !kind) return;
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / rect.width * canvas.width;
      const sy = (e.clientY - rect.top) / rect.height * canvas.height;
      const wp = this.scene.cameras.main.getWorldPoint(sx, sy);
      this.placeCamp(wp.x, wp.y, faction, kind);
    });
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!p.leftButtonDown() || this.kind === null) return;
    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    this.placeCamp(wp.x, wp.y, this.faction, this.kind);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.kind === null) {
      this.preview.setVisible(false);
      return;
    }
    const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
    const ok = this.placementService.validate({
      actor: 'player',
      faction: this.faction,
      kind: this.kind,
      x: wp.x,
      y: wp.y,
    }) === null;
    this.preview.setPosition(wp.x, wp.y);
    this.preview.setFillStyle(ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR, 0.4);
    this.preview.setStrokeStyle(2, ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR);
    this.preview.setVisible(true);
  }

  private onUp(_p: Phaser.Input.Pointer): void {
    // Placement happens on pointerdown with click-to-place
  }

  private placeCamp(x: number, y: number, faction: Faction, kind: CampKind): void {
    const gs = this.scene.exposeGameState();
    // 门控临时关闭（与 src/ui/BuildPanel.ts KINDS 的 gated:false 同步）——投矛/爆破可自由放置。
    // 恢复解锁门控时：取消下行注释，并把 BuildPanel 的 javelin/bomb gated 改回 true。
    // // 兜底：gated 兵种 + 锁定 → 拒绝
    // if ((kind === 'javelin' || kind === 'bomb') && gs.sim.unlockTimer <= 0) return;
    const result = this.placementService.place({
      actor: 'player',
      faction,
      kind,
      x,
      y,
    });
    if (!result.ok) {
      this.bridge.reportPlacementFailure(result.reason);
      return;
    }

    // 红蓝双方都有军营 → 自动开始战斗
    if (!gs.sim.running && this.bridge.getGameOver() === null) {
      const all = gs.allCamps();
      if (all.some(c => c.faction === 'red') && all.some(c => c.faction === 'blue')) {
        this.bridge.setRunning(true, gs);
      }
    }

    this.scene.refreshViews();
    this.preview.setVisible(false);
    this.bridge.selectCampKind(null);
  }
}
