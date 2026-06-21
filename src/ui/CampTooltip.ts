import type { UiBridge } from './UiBridge';
import { CAMP_DEFS } from '../config/camps';
import { UNIT_DEFS } from '../config/units';
import { computeUnitMetrics } from './campTooltipData';
import type { CampKind, UnitDef } from '../game/types';

const KIND_META: Record<CampKind, { icon: string; campName: string; unitName: string }> = {
  sword:     { icon: '⚔️', campName: '剑兵营', unitName: '剑兵' },
  shield:    { icon: '🛡️', campName: '盾兵营', unitName: '盾兵' },
  archer:    { icon: '🏹', campName: '弓兵营', unitName: '弓兵' },
  javelin:   { icon: '🔱', campName: '投矛营', unitName: '投矛兵' },
  bomb:      { icon: '💣', campName: '爆破营', unitName: '炸弹兵' },
  medic:     { icon: '🏥', campName: '医疗营', unitName: '医疗兵' },
  artillery: { icon: '💥', campName: '火炮营', unitName: '炮兵' },
};

const ATTACK_TYPE_LABEL: Record<UnitDef['attackType'], string> = {
  melee: '近战',
  ranged: '远程',
};

export class CampTooltip {
  private root: HTMLDivElement;

  constructor(private bridge: UiBridge) {
    const el = document.createElement('div');
    el.id = 'camp-tooltip';
    el.className = 'ui';
    el.style.display = 'none';
    this.root = el;
    document.body.append(el);

    bridge.on('hoverChanged', () => this.render());
    this.render();
  }

  private render(): void {
    const kind = this.bridge.getHoveredCampKind();
    if (!kind) {
      this.root.style.display = 'none';
      return;
    }
    this.root.innerHTML = this.buildHtml(kind);
    this.root.style.display = '';
  }

  private buildHtml(kind: CampKind): string {
    const meta = KIND_META[kind];
    const camp = CAMP_DEFS[kind];
    const unit = UNIT_DEFS[kind];
    const m = computeUnitMetrics(unit);

    const rows: string[] = [];
    rows.push(`<div class="tooltip-header">${meta.icon} ${meta.campName}</div>`);
    rows.push(this.section('军营'));
    rows.push(this.row('生命值', String(camp.maxHp)));
    rows.push(this.row('生产间隔', `${camp.spawnInterval.toFixed(1)}s`));
    rows.push(this.row('兵力上限', String(camp.unitCap)));

    rows.push(this.section(`兵种 ${meta.unitName}`));
    rows.push(this.row('类型', ATTACK_TYPE_LABEL[unit.attackType]));
    rows.push(this.row('生命', String(unit.maxHp)));
    rows.push(this.row('攻击', String(unit.attack)));
    rows.push(this.row('射程', `${unit.attackRange} (${m.rangeClass})`));
    rows.push(this.row('攻速', `${unit.attackInterval.toFixed(1)}s`));
    rows.push(this.row('移速', String(unit.moveSpeed)));
    rows.push(this.row('DPS', m.dps.toFixed(1)));

    // 医疗兵特殊属性（有则显示）
    if (unit.healAmount !== undefined || unit.poisonDamage !== undefined) {
      rows.push(this.section('医疗兵'));
      if (unit.healAmount !== undefined) rows.push(this.row('治疗量', `${unit.healAmount} / 次`));
      if (unit.healSearchRange !== undefined) rows.push(this.row('治疗范围', String(unit.healSearchRange)));
      if (unit.poisonDamage !== undefined) rows.push(this.row('毒伤', `${unit.poisonDamage} / 秒`));
      if (unit.poisonDuration !== undefined) rows.push(this.row('毒雾持续', `${unit.poisonDuration.toFixed(1)}s`));
      if (unit.poisonRange !== undefined) rows.push(this.row('毒雾范围', String(unit.poisonRange)));
      if (unit.poisonCooldown !== undefined) rows.push(this.row('毒雾冷却', `${unit.poisonCooldown.toFixed(1)}s`));
    }

    return rows.join('');
  }

  private section(title: string): string {
    return `<div class="tooltip-section">${title}</div>`;
  }

  private row(label: string, val: string): string {
    return `<div class="tooltip-row"><span class="tooltip-label">${label}</span><span class="tooltip-val">${val}</span></div>`;
  }
}
