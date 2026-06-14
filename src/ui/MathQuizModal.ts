import { generateProblem, type Problem } from './mathQuiz';

export class MathQuizModal {
  private overlay: HTMLDivElement;
  private el: HTMLDivElement;
  private formulaEl!: HTMLDivElement;
  private displayEl!: HTMLDivElement;
  private hintEl!: HTMLDivElement;
  private current: Problem | null = null;
  private inputBuf = '';
  private resolveFn: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'math-quiz-overlay math-quiz-hidden';
    this.el = document.createElement('div');
    this.el.className = 'math-quiz-card';
    this.overlay.append(this.el);
    document.body.append(this.overlay);
    this.buildCard();
  }

  private buildCard(): void {
    const title = document.createElement('div');
    title.className = 'math-quiz-title';
    title.textContent = '🔓 解锁投矛 / 爆破';
    this.el.append(title);

    this.formulaEl = document.createElement('div');
    this.formulaEl.className = 'math-quiz-formula';
    this.el.append(this.formulaEl);

    this.displayEl = document.createElement('div');
    this.displayEl.className = 'math-quiz-display';
    this.displayEl.textContent = '_';
    this.el.append(this.displayEl);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'math-quiz-hint';
    this.el.append(this.hintEl);

    const keypad = document.createElement('div');
    keypad.className = 'math-quiz-keypad';
    for (let d = 0; d <= 9; d++) {
      keypad.append(this.makeKey(d.toString(), () => this.onDigit(d)));
    }
    keypad.append(this.makeKey('10', () => this.onDigit(10)));
    keypad.append(this.makeKey('清', () => this.onClear(), 'math-quiz-key-op'));
    keypad.append(this.makeKey('✓', () => this.onSubmit(), 'math-quiz-key-ok'));
    this.el.append(keypad);
  }

  private makeKey(label: string, fn: () => void, extraClass = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = ('math-quiz-key ' + extraClass).trim();
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  open(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.current = generateProblem();
      this.inputBuf = '';
      this.hintEl.textContent = '';
      this.renderProblem();
      this.overlay.classList.remove('math-quiz-hidden');
      this.keyHandler = (e: KeyboardEvent) => this.onKey(e);
      window.addEventListener('keydown', this.keyHandler);
    });
  }

  private close(): void {
    this.overlay.classList.add('math-quiz-hidden');
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.resolveFn?.();
    this.resolveFn = null;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key >= '0' && e.key <= '9') {
      this.onDigit(parseInt(e.key, 10));
    } else if (e.key === 'Enter') {
      this.onSubmit();
    } else if (e.key === 'Backspace') {
      this.onClear();
    }
  }

  private onDigit(d: number): void {
    if (this.inputBuf === '' && d === 10) {
      this.inputBuf = '10';
    } else if (this.inputBuf.length < 2 && d < 10) {
      this.inputBuf += d.toString();
    }
    this.refreshDisplay();
  }

  private onClear(): void {
    this.inputBuf = '';
    this.refreshDisplay();
  }

  private onSubmit(): void {
    if (this.inputBuf === '' || !this.current) return;
    const guess = parseInt(this.inputBuf, 10);
    if (guess === this.current.answer) {
      this.el.classList.add('math-quiz-correct');
      setTimeout(() => {
        this.el.classList.remove('math-quiz-correct');
        this.close();
      }, 250);
    } else {
      this.el.classList.add('math-quiz-wrong');
      this.hintEl.textContent = '再想想...';
      setTimeout(() => {
        this.el.classList.remove('math-quiz-wrong');
        this.current = generateProblem();
        this.inputBuf = '';
        this.renderProblem();
      }, 350);
    }
  }

  private renderProblem(): void {
    const p = this.current!;
    this.formulaEl.textContent = p.a + ' ' + p.op + ' ' + p.b + ' = ?';
    this.refreshDisplay();
  }

  private refreshDisplay(): void {
    this.displayEl.textContent = this.inputBuf === '' ? '_' : this.inputBuf;
  }
}
