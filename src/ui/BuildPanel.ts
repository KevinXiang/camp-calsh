import type { UiBridge } from './UiBridge';
import type { CampKind, Faction } from '../game/types';

const KINDS: { key: CampKind; label: string }[] = [
  { key: 'sword', label: '剑兵营 Q' },
  { key: 'shield', label: '盾兵营 W' },
  { key: 'archer', label: '弓兵营 E' },
  { key: 'javelin', label: '投矛营 R' },
];

export class BuildPanel {
  private buttons = new Map<CampKind, HTMLButtonElement>();

  constructor(private bridge: UiBridge) {
    const root = document.createElement('div');
    root.id = 'build-panel';
    root.className = 'ui';

    const factionRow = document.createElement('div');
    factionRow.className = 'row';
    factionRow.append(this.factionBtn('红方', 'red'), this.factionBtn('蓝方', 'blue'));

    const campCol = document.createElement('div');
    campCol.className = 'row';
    campCol.style.flexDirection = 'column';
    for (const k of KINDS) {
      const b = document.createElement('button');
      b.textContent = k.label;
      b.onclick = () => bridge.selectCampKind(k.key);
      campCol.append(b);
      this.buttons.set(k.key, b);
    }

    root.append(factionRow, campCol);
    document.body.append(root);

    bridge.on('placementChanged', () => this.render());
    this.bindHotkeys();
    this.render();
  }

  private factionBtn(label: string, f: Faction): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = f === 'red' ? 'f-red' : 'f-blue';
    b.onclick = () => this.bridge.selectFaction(f);
    return b;
  }

  private bindHotkeys(): void {
    window.addEventListener('keydown', (e) => {
      if (e.key === '1') this.bridge.selectFaction('red');
      else if (e.key === '2') this.bridge.selectFaction('blue');
      const map: Record<string, CampKind> = { q: 'sword', w: 'shield', e: 'archer', r: 'javelin' };
      if (map[e.key]) this.bridge.selectCampKind(map[e.key]);
    });
  }

  private render(): void {
    const sel = this.bridge.getSelection();
    for (const [kind, btn] of this.buttons) {
      btn.classList.toggle('active', sel.kind === kind);
    }
  }
}
