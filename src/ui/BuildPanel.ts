import type { CampKind, Faction } from '../game/types';
import type { GameState } from '../game/GameState';
import type { UiBridge } from './UiBridge';
import { MathQuizModal } from './MathQuizModal';

const KINDS: { key: CampKind; label: string; icon: string; gated?: boolean }[] = [
  { key: 'sword', label: '剑兵营', icon: '⚔️' },
  { key: 'shield', label: '盾兵营', icon: '🛡️' },
  { key: 'archer', label: '弓兵营', icon: '🏹' },
  { key: 'javelin', label: '投矛营', icon: '🔱', gated: true },
  { key: 'bomb', label: '爆破营', icon: '💣', gated: true },
];

const HOTKEY_MAP: Record<string, CampKind> = { q: 'sword', w: 'shield', e: 'archer', r: 'javelin', t: 'bomb' };

// slider 离散档位（线性 0..N → 0.25x .. 10x），便于显示与拖动手感
const SPAWN_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const DEFAULT_STEP_INDEX = SPAWN_STEPS.indexOf(1);

interface SpawnSliderRefs {
  input: HTMLInputElement;
  label: HTMLSpanElement;
}

export class BuildPanel {
  private leftButtons = new Map<CampKind, HTMLButtonElement>();
  private rightButtons = new Map<CampKind, HTMLButtonElement>();
  private spawnSliders: Record<Faction, SpawnSliderRefs | null> = { red: null, blue: null };
  private modal = new MathQuizModal();

  constructor(private bridge: UiBridge, private gs: () => GameState) {
    this.createPanel('red', 'left', this.leftButtons);
    this.createPanel('blue', 'right', this.rightButtons);
    this.bindHotkeys();
    bridge.on('placementChanged', () => this.render());
    bridge.on('simChanged', () => { this.syncSliders(); this.render(); });
    this.render();
  }

  private createPanel(faction: Faction, side: 'left' | 'right', store: Map<CampKind, HTMLButtonElement>): void {
    const root = document.createElement('div');
    root.id = `build-panel-${side}`;
    root.className = 'ui';

    const title = document.createElement('div');
    title.className = 'build-panel-title';
    title.textContent = faction === 'red' ? '🔴 红方' : '🔵 蓝方';
    root.append(title);

    for (const k of KINDS) {
      const b = document.createElement('button');
      b.className = 'camp-btn';
      b.innerHTML = `<span class="icon">${k.icon}</span>${k.label}`;
      b.draggable = true;

      b.addEventListener('dragstart', async (e) => {
        if (k.gated && !this.bridge.isUnlocked(this.gs())) {
          e.preventDefault();
          await this.modal.open();
          this.bridge.unlockGate(this.gs());
          return;
        }
        e.dataTransfer!.setData('application/x-camp-faction', faction);
        e.dataTransfer!.setData('application/x-camp-kind', k.key);
        e.dataTransfer!.effectAllowed = 'copy';
      });

      b.addEventListener('dragend', () => {
        this.bridge.selectCampKind(null);
      });

      b.onclick = async () => {
        if (k.gated && !this.bridge.isUnlocked(this.gs())) {
          await this.modal.open();
          this.bridge.unlockGate(this.gs());
        }
        this.bridge.selectFaction(faction);
        this.bridge.selectCampKind(k.key);
      };

      root.append(b);
      store.set(k.key, b);
    }

    // 产兵速度 slider（实时调整）
    root.append(this.createSpawnSlider(faction));

    document.body.append(root);
  }

  private createSpawnSlider(faction: Faction): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = `spawn-slider spawn-slider-${faction}`;

    const head = document.createElement('div');
    head.className = 'spawn-slider-head';
    const title = document.createElement('span');
    title.className = 'spawn-slider-title';
    title.textContent = '⚙ 产兵速度';
    const valueLabel = document.createElement('span');
    valueLabel.className = 'spawn-slider-value';
    valueLabel.textContent = '1.0×';
    head.append(title, valueLabel);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = String(SPAWN_STEPS.length - 1);
    input.step = '1';
    input.value = String(DEFAULT_STEP_INDEX);
    input.className = 'spawn-slider-input';

    input.addEventListener('input', () => {
      const idx = Math.max(0, Math.min(SPAWN_STEPS.length - 1, parseInt(input.value, 10)));
      const mult = SPAWN_STEPS[idx];
      valueLabel.textContent = formatMult(mult);
      this.bridge.setSpawnMultiplier(faction, mult, this.gs());
    });

    wrap.append(head, input);
    this.spawnSliders[faction] = { input, label: valueLabel };
    return wrap;
  }

  private syncSliders(): void {
    // 防止外部（如重置）改了 sim.spawnMultiplier 后 slider 显示不一致
    const gs = this.gs();
    for (const f of ['red', 'blue'] as const) {
      const ref = this.spawnSliders[f];
      if (!ref) continue;
      const cur = gs.sim.spawnMultiplier[f];
      const idx = nearestStepIndex(cur);
      if (parseInt(ref.input.value, 10) !== idx) ref.input.value = String(idx);
      ref.label.textContent = formatMult(cur);
    }
  }

  private bindHotkeys(): void {
    window.addEventListener('keydown', async (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const kind = HOTKEY_MAP[e.key.toLowerCase()];
      if (!kind) return;
      const kdef = KINDS.find(k => k.key === kind);
      if (kdef?.gated && !this.bridge.isUnlocked(this.gs())) {
        await this.modal.open();
        this.bridge.unlockGate(this.gs());
      }
      const sel = this.bridge.getSelection();
      this.bridge.selectCampKind(sel.kind === kind ? null : kind);
    });
  }

  private render(): void {
    const sel = this.bridge.getSelection();
    const unlocked = this.bridge.isUnlocked(this.gs());
    for (const [kind, btn] of this.leftButtons) {
      const kdef = KINDS.find(k => k.key === kind);
      btn.classList.toggle('active', sel.faction === 'red' && sel.kind === kind);
      btn.classList.toggle('locked', !!kdef?.gated && !unlocked);
    }
    for (const [kind, btn] of this.rightButtons) {
      const kdef = KINDS.find(k => k.key === kind);
      btn.classList.toggle('active', sel.faction === 'blue' && sel.kind === kind);
      btn.classList.toggle('locked', !!kdef?.gated && !unlocked);
    }
  }
}

function formatMult(m: number): string {
  if (m === 1) return '1.0×';
  return `${m.toFixed(2).replace(/\.?0+$/, '')}×`;
}

function nearestStepIndex(m: number): number {
  let best = 0, bestDiff = Infinity;
  for (let i = 0; i < SPAWN_STEPS.length; i++) {
    const d = Math.abs(SPAWN_STEPS[i] - m);
    if (d < bestDiff) { bestDiff = d; best = i; }
  }
  return best;
}
