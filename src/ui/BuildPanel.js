const KINDS = [
    { key: 'sword', label: '剑兵营', icon: '⚔️' },
    { key: 'shield', label: '盾兵营', icon: '🛡️' },
    { key: 'archer', label: '弓兵营', icon: '🏹' },
    { key: 'javelin', label: '投矛营', icon: '🔱' },
];
const HOTKEY_MAP = { q: 'sword', w: 'shield', e: 'archer', r: 'javelin' };
export class BuildPanel {
    constructor(bridge) {
        this.bridge = bridge;
        this.leftButtons = new Map();
        this.rightButtons = new Map();
        this.createPanel('red', 'left', this.leftButtons);
        this.createPanel('blue', 'right', this.rightButtons);
        this.bindHotkeys();
        bridge.on('placementChanged', () => this.render());
        this.render();
    }
    createPanel(faction, side, store) {
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
            b.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/x-camp-faction', faction);
                e.dataTransfer.setData('application/x-camp-kind', k.key);
                e.dataTransfer.effectAllowed = 'copy';
            });
            b.addEventListener('dragend', () => {
                this.bridge.selectCampKind(null);
            });
            b.onclick = () => {
                this.bridge.selectFaction(faction);
                this.bridge.selectCampKind(k.key);
            };
            root.append(b);
            store.set(k.key, b);
        }
        document.body.append(root);
    }
    bindHotkeys() {
        window.addEventListener('keydown', (e) => {
            const kind = HOTKEY_MAP[e.key.toLowerCase()];
            if (!kind)
                return;
            const sel = this.bridge.getSelection();
            this.bridge.selectCampKind(sel.kind === kind ? null : kind);
        });
    }
    render() {
        const sel = this.bridge.getSelection();
        for (const [kind, btn] of this.leftButtons) {
            btn.classList.toggle('active', sel.faction === 'red' && sel.kind === kind);
        }
        for (const [kind, btn] of this.rightButtons) {
            btn.classList.toggle('active', sel.faction === 'blue' && sel.kind === kind);
        }
    }
}
