/**
 * Gerenciador de iniciativa e ordem de turnos sincronizável.
 */

export class InitiativeTracker {
  constructor() {
    this.round = 1;
    this.activeIndex = 0;
    this.entries = [];
  }

  getState() {
    return {
      round: this.round,
      activeIndex: this.activeIndex,
      entries: this.entries.map((e) => ({ ...e })),
    };
  }

  setState(state) {
    if (!state) return;
    this.round = Math.max(1, Number(state.round) || 1);
    this.entries = Array.isArray(state.entries) ? state.entries.map((e) => ({ ...e })) : [];
    this.activeIndex =
      this.entries.length > 0
        ? Math.max(0, Math.min(this.entries.length - 1, Number(state.activeIndex) || 0))
        : 0;
  }

  add(name, initValue, isNpc = false) {
    const entry = {
      id: `init-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || 'Combatente').trim(),
      init: Number(initValue) || 0,
      isNpc: Boolean(isNpc),
    };
    const preserve = this.round > 1 || this.activeIndex > 0;
    this.entries.push(entry);
    this.sort(preserve);
    return entry;
  }

  remove(id) {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx === -1) return;
    this.entries.splice(idx, 1);
    if (this.entries.length === 0) {
      this.activeIndex = 0;
    } else if (this.activeIndex >= this.entries.length) {
      this.activeIndex = 0;
    }
  }

  sort(preserveCurrent = true) {
    const currentId = preserveCurrent ? this.entries[this.activeIndex]?.id : null;
    this.entries.sort((a, b) => b.init - a.init);
    if (currentId) {
      const nextIdx = this.entries.findIndex((e) => e.id === currentId);
      this.activeIndex = nextIdx >= 0 ? nextIdx : 0;
    } else {
      this.activeIndex = 0;
    }
  }

  nextTurn() {
    if (this.entries.length === 0) return;
    this.activeIndex += 1;
    if (this.activeIndex >= this.entries.length) {
      this.activeIndex = 0;
      this.round += 1;
    }
  }

  reset() {
    this.round = 1;
    this.activeIndex = 0;
    this.entries = [];
  }
}
