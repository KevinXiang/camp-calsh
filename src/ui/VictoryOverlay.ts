import type { UiBridge } from './UiBridge';

/**
 * 胜利庆贺全屏 overlay：监听 bridge 的 gameOver 事件，
 * 一方彻底覆灭时弹出炫酷卡片 + "再来一局"（刷新页面）。
 */
export class VictoryOverlay {
  private el: HTMLDivElement;

  constructor(private bridge: UiBridge) {
    this.el = document.createElement('div');
    this.el.id = 'victory-overlay';
    this.el.className = 'ui victory-hidden';
    document.body.append(this.el);

    bridge.on('gameOver', () => this.render());
  }

  private render(): void {
    const w = this.bridge.getGameOver();
    if (!w) { this.el.classList.add('victory-hidden'); return; }

    const isRed = w === 'red';
    this.el.classList.remove('victory-hidden', 'victory-red', 'victory-blue');
    this.el.classList.add(isRed ? 'victory-red' : 'victory-blue');
    this.el.innerHTML = `
      <div class="victory-card">
        <div class="victory-emoji">🎉</div>
        <div class="victory-title">${isRed ? '红方' : '蓝方'}胜利！</div>
        <div class="victory-sub">${isRed ? '🔴 RED' : '🔵 BLUE'} WINS</div>
        <button class="victory-btn" data-action="restart">再来一局</button>
      </div>
    `;
    this.el.querySelector('[data-action="restart"]')!.addEventListener('click', () => location.reload());
  }
}
