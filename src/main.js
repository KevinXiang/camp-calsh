import Phaser from 'phaser';
import { BootScene } from './game/BootScene';
import { BattleScene } from './game/BattleScene';
import { UiBridge } from './ui/UiBridge';
import { BuildPanel } from './ui/BuildPanel';
import { InfoPanel } from './ui/InfoPanel';
import { HudController } from './ui/HudController';
import { ControlBar } from './ui/ControlBar';
import { VictoryOverlay } from './ui/VictoryOverlay';
import './ui/ui.css';
const bridge = new UiBridge();
const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#7cb342',
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, BattleScene],
});
game.registry.set('bridge', bridge);
game.events.once('ready', () => {
    const battle = game.scene.getScene('BattleScene');
    new BuildPanel(bridge);
    new InfoPanel(bridge, battle);
    new HudController(bridge, () => battle.exposeGameState());
    new ControlBar(bridge, () => battle.exposeGameState());
    new VictoryOverlay(bridge);
});
