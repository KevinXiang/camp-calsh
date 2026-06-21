import type { UiBridge } from './UiBridge';
import type { BattleScene } from '../game/BattleScene';
import { UNIT_DEFS } from '../config/units';
import { CAMP_DEFS } from '../config/camps';
import { CAMP_ROLE_DEFS, ROLE_LABEL, TIER_LABEL } from '../config/campRoles';

const KIND_LABEL: Record<string, string> = {
  sword: '剑兵营',
  shield: '盾兵营',
  archer: '弓兵营',
  javelin: '投矛营',
  bomb: '爆破营',
  medic: '医疗营',
  artillery: '火炮营',
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
    const factionLabel = camp.faction === 'red' ? '🔴 红方' : '🔵 蓝方';
    const name = KIND_LABEL[camp.kind] ?? camp.kind;
    const role = CAMP_ROLE_DEFS[camp.kind];
    const campDef = CAMP_DEFS[camp.kind];
    const unitDef = UNIT_DEFS[camp.kind];
    const hpRatio = camp.maxHp > 0 ? Math.round((camp.hp / camp.maxHp) * 100) : 0;

    this.body.innerHTML =
      `<div class="info-title">${factionLabel} ${name}</div>` +
      `<div class="info-slogan">[${TIER_LABEL[role.tier]} · ${ROLE_LABEL[role.role]}] ${role.slogan}</div>` +
      this.row('生命值', `${camp.hp} / ${camp.maxHp} (${hpRatio}%)`) +
      this.row('存活单位', String(camp.aliveUnits)) +
      this.row('兵力上限', `${campDef.unitCap}`) +
      this.row('产兵间隔', `${campDef.spawnInterval.toFixed(1)}s`) +
      (unitDef.attack > 0 ? this.row('单位 DPS', (unitDef.attack / unitDef.attackInterval).toFixed(1)) : this.row('单位定位', '治疗支援')) +
      this.row('位置', `(${Math.round(camp.x)}, ${Math.round(camp.y)})`);
  }

  private row(label: string, val: string): string {
    return `<div class="info-row"><span class="info-label">${label}</span><span class="info-val">${val}</span></div>`;
  }
}
