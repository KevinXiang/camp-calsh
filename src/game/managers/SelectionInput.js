import Phaser from 'phaser';
export class SelectionInput {
    constructor(scene, bridge) {
        this.scene = scene;
        this.bridge = bridge;
        scene.input.on('pointerdown', (p) => {
            if (!p.leftButtonDown())
                return;
            if (bridge.getSelection().kind !== null)
                return;
            const camp = this.pickCamp(p.worldX, p.worldY);
            bridge.selectCamp(camp ?? null);
        });
        scene.input.keyboard?.on('keydown-DELETE', () => {
            bridge.deleteSelected(scene);
        });
    }
    pickCamp(wx, wy) {
        const gs = this.scene.exposeGameState();
        let best = null;
        for (const c of gs.allCamps()) {
            const d = Phaser.Math.Distance.Between(wx, wy, c.x, c.y);
            if (d < 40 && (best === null || d < best.d)) {
                best = { id: c.id, d };
            }
        }
        return best?.id ?? null;
    }
}
