type SelectionListener = (id: string | null) => void;

export class SelectionManager {
  private selectedId: string | null = null;
  private listeners = new Set<SelectionListener>();

  getSelectedId(): string | null {
    return this.selectedId;
  }

  select(id: string): void {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.emit();
  }

  clear(): void {
    if (this.selectedId === null) return;
    this.selectedId = null;
    this.emit();
  }

  onChange(cb: SelectionListener): void {
    this.listeners.add(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.selectedId);
  }
}
