import type { UiBridge } from './UiBridge';
import type { BattleScene } from '../game/BattleScene';

const KIND_LABEL: Record<string, string> = {
  sword: '剑兵营', shield: '盾兵营', archer: '弓兵营', javelin: '投矛营',
};

export class InfoPanel {
  private body: HTMLDivElement;

  constructor(private bridge: UiBridge, private scene: BattleScene) {
    const el = document.createElement('div');
    el.id = 'info-panel';
    el.className = 'ui';
    this.body = document.createElement('div');
    el.append(this.body);
    document.body.append(el);

    bridge.on('selectionChanged', () => this.render());
    this.render();
  }

  private render(): void {
    const id = this.bridge.getSelectedCampId();
    const camp = id ? this.scene.exposeGameState().getCamp(id) : undefined;
    if (!camp) {
      this.body.parentElement!.style.display = 'none';
      return;
    }
    this.body.parentElement!.style.display = '';
    const factionLabel = camp.faction === 'red' ? '红方' : '蓝方';
    this.body.innerHTML =
      '<div><b>' + factionLabel + ' ' + KIND_LABEL[camp.kind] + '</b></div>' +
      '<div>生命值：' + camp.hp + ' / ' + camp.maxHp + '</div>' +
      '<div>位置：(' + Math.round(camp.x) + ', ' + Math.round(camp.y) + ')</div>';
  }
}
