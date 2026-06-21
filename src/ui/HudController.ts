import type { GameState } from '../game/GameState';
import type { UiBridge } from './UiBridge';

export class HudController {
  private el: HTMLDivElement;

  constructor(private bridge: UiBridge, private gs: () => GameState) {
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.className = 'ui';
    document.body.append(this.el);

    bridge.on('statsChanged', () => this.render());
    this.render();
  }

  private render(): void {
    const s = this.gs();
    let redTotal = 0, blueTotal = 0, redAlive = 0, blueAlive = 0;
    let redCamps = 0, blueCamps = 0;
    for (const u of s.units.values()) {
      if (u.faction === 'red') { redTotal++; if (u.alive) redAlive++; }
      else { blueTotal++; if (u.alive) blueAlive++; }
    }
    for (const c of s.camps.values()) {
      if (c.destroyed) continue;
      if (c.faction === 'red') redCamps++; else blueCamps++;
    }
    const total = redAlive + blueAlive;

    // 优势方：综合存活单位 + 存活营地作为战局强度权重
    const redPower = redAlive + redCamps * 5;
    const bluePower = blueAlive + blueCamps * 5;
    const redAdvantage = redPower > bluePower * 1.2 && redPower > 0;
    const blueAdvantage = bluePower > redPower * 1.2 && bluePower > 0;
    const redClass = blueAdvantage ? 'hud-disadvantage' : (redAdvantage ? 'hud-advantage-red' : '');
    const blueClass = redAdvantage ? 'hud-disadvantage' : (blueAdvantage ? 'hud-advantage-blue' : '');

    let status = '';
    if (total > 0 && redAlive === 0 && blueAlive > 0) status = '🔵 蓝方胜';
    else if (total > 0 && blueAlive === 0 && redAlive > 0) status = '🔴 红方胜';
    else if (total > 0) {
      if (redAdvantage) status = '🔴 红方占优';
      else if (blueAdvantage) status = '🔵 蓝方占优';
      else status = '⚔️ 势均力敌';
    }
    const speedLabel = s.sim.running ? `${s.sim.speed}x` : '⏸';

    this.el.innerHTML = `
      <span class="hud-section ${redClass}">
        <span class="hud-icon">🔴</span>
        <span class="hud-num">${redAlive}</span>
        <span class="hud-sublabel">单位</span>
        <span class="hud-num">${redCamps}</span>
        <span class="hud-sublabel">营地</span>
      </span>
      <span class="hud-divider"></span>
      <span class="hud-section ${blueClass}">
        <span class="hud-icon">🔵</span>
        <span class="hud-num">${blueAlive}</span>
        <span class="hud-sublabel">单位</span>
        <span class="hud-num">${blueCamps}</span>
        <span class="hud-sublabel">营地</span>
      </span>
      <span class="hud-divider"></span>
      <span class="hud-section">
        <span class="hud-icon">👥</span>
        <span class="hud-num">${total}</span>
        <span class="hud-sublabel">在场</span>
      </span>
      <span class="hud-winner">${status}</span>
      <span class="hud-speed">${speedLabel}</span>
      ${s.sim.unlockTimer > 0
        ? `<span class="hud-section"><span class="hud-icon">🔓</span><span class="hud-num">${Math.ceil(s.sim.unlockTimer)}</span><span class="hud-sublabel">s</span></span>`
        : `<span class="hud-section"><span class="hud-icon">🔒</span><span class="hud-sublabel">投矛/爆破锁定</span></span>`}
    `;
  }
}
