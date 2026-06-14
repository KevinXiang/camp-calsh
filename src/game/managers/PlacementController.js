import { canPlaceCamp } from '../placement';
import { CAMP_DEFS, CAMP_MIN_DISTANCE } from '../../config/camps';
import { PREVIEW_OK_COLOR, PREVIEW_BAD_COLOR } from '../../config/colors';
export class PlacementController {
    constructor(scene, bridge) {
        this.scene = scene;
        this.bridge = bridge;
        this.faction = 'red';
        this.kind = null;
        this.preview = scene.add.circle(0, 0, 32, PREVIEW_OK_COLOR, 0.4)
            .setStrokeStyle(2, PREVIEW_OK_COLOR)
            .setVisible(false);
        scene.input.on('pointerdown', (p) => this.onDown(p));
        scene.input.on('pointermove', (p) => this.onMove(p));
        scene.input.on('pointerup', (p) => this.onUp(p));
        bridge.on('placementChanged', () => this.refreshFromBridge());
        this.refreshFromBridge();
        this.setupDragDrop();
    }
    refreshFromBridge() {
        const sel = this.bridge.getSelection();
        this.faction = sel.faction;
        this.kind = sel.kind;
    }
    setupDragDrop() {
        const canvas = this.scene.game.canvas;
        canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });
        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const faction = e.dataTransfer.getData('application/x-camp-faction');
            const kind = e.dataTransfer.getData('application/x-camp-kind');
            if (!faction || !kind)
                return;
            const rect = canvas.getBoundingClientRect();
            const sx = (e.clientX - rect.left) / rect.width * canvas.width;
            const sy = (e.clientY - rect.top) / rect.height * canvas.height;
            const wp = this.scene.cameras.main.getWorldPoint(sx, sy);
            this.placeCamp(wp.x, wp.y, faction, kind);
        });
    }
    onDown(p) {
        if (!p.leftButtonDown() || this.kind === null)
            return;
        const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
        const gs = this.scene.exposeGameState();
        if (!canPlaceCamp(gs.allCamps(), wp.x, wp.y, CAMP_MIN_DISTANCE))
            return;
        this.placeCamp(wp.x, wp.y, this.faction, this.kind);
    }
    onMove(p) {
        if (this.kind === null) {
            this.preview.setVisible(false);
            return;
        }
        const wp = this.scene.cameras.main.getWorldPoint(p.x, p.y);
        const gs = this.scene.exposeGameState();
        const ok = canPlaceCamp(gs.allCamps(), wp.x, wp.y, CAMP_MIN_DISTANCE);
        this.preview.setPosition(wp.x, wp.y);
        this.preview.setFillStyle(ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR, 0.4);
        this.preview.setStrokeStyle(2, ok ? PREVIEW_OK_COLOR : PREVIEW_BAD_COLOR);
        this.preview.setVisible(true);
    }
    onUp(_p) {
        // Placement happens on pointerdown with click-to-place
    }
    placeCamp(x, y, faction, kind) {
        const gs = this.scene.exposeGameState();
        if (!canPlaceCamp(gs.allCamps(), x, y, CAMP_MIN_DISTANCE))
            return;
        const def = CAMP_DEFS[kind];
        const camp = {
            id: crypto.randomUUID(),
            faction,
            kind,
            x,
            y,
            hp: def.maxHp,
            maxHp: def.maxHp,
            spawnTimer: 0,
            upgrades: { production: 1, health: 1, weapon: 1 },
            aliveUnits: 0,
            destroyed: false,
        };
        gs.addCamp(camp);
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
