// UI-22 undo and redo, one stack per editor.

export interface Command {
  label: string;
  apply(): void;
  revert(): void;
}

export class UndoStack {
  private done: Command[] = [];
  private undone: Command[] = [];

  constructor(private limit = 200) {}

  execute(c: Command): void {
    c.apply();
    this.done.push(c);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }

  undo(): string | null {
    const c = this.done.pop();
    if (!c) return null;
    c.revert();
    this.undone.push(c);
    return c.label;
  }

  redo(): string | null {
    const c = this.undone.pop();
    if (!c) return null;
    c.apply();
    this.done.push(c);
    return c.label;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  get undoLabel(): string | null {
    return this.done.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.undone.at(-1)?.label ?? null;
  }

  get history(): string[] {
    return this.done.map((c) => c.label);
  }
}
