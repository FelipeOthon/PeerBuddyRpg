/**
 * Gerenciador de Múltiplos Mapas & Cenas da Campanha.
 */

export function createEmptyScene(name = 'Cena Principal') {
  return {
    id: `scene-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name,
    mapAssetId: null,
    gridSize: 50,
    scaleMeters: 1.5,
    gridColor: 'rgba(255, 255, 255, 0.16)',
    showGrid: true,
    snapToGrid: true,
    fogEnabled: false,
    lightingEnabled: false,
    fogCells: [],
    walls: [],
    drawings: [],
    tokens: [],
  };
}

export class SceneManager {
  constructor() {
    this.scenes = new Map();
    this.activeSceneId = null;
    const def = createEmptyScene('Mapa Inicial');
    this.scenes.set(def.id, def);
    this.activeSceneId = def.id;
  }

  getActive() {
    return this.scenes.get(this.activeSceneId) || this.scenes.values().next().value || null;
  }

  list() {
    return Array.from(this.scenes.values());
  }

  createScene(name, mapAssetId = null) {
    const scene = createEmptyScene(name || `Mapa ${this.scenes.size + 1}`);
    scene.mapAssetId = mapAssetId;
    this.scenes.set(scene.id, scene);
    return scene;
  }

  switchScene(sceneId) {
    if (!this.scenes.has(sceneId)) return null;
    this.activeSceneId = sceneId;
    return this.getActive();
  }

  updateActiveFromVtt(vttState) {
    const active = this.getActive();
    if (!active || !vttState) return;
    Object.assign(active, vttState);
  }

  clearSceneMap(sceneId = this.activeSceneId) {
    const scene = this.scenes.get(sceneId);
    if (!scene) return null;
    scene.mapAssetId = null;
    return scene;
  }

  removeScene(sceneId) {
    if (this.scenes.size <= 1) return false;
    const deleted = this.scenes.delete(sceneId);
    if (deleted && this.activeSceneId === sceneId) {
      this.activeSceneId = this.scenes.keys().next().value;
    }
    return deleted;
  }

  serialize() {
    return {
      activeSceneId: this.activeSceneId,
      scenes: this.list(),
    };
  }

  restore(data) {
    if (!data || !Array.isArray(data.scenes) || data.scenes.length === 0) return;
    this.scenes.clear();
    data.scenes.forEach((s) => this.scenes.set(s.id, s));
    this.activeSceneId = this.scenes.has(data.activeSceneId)
      ? data.activeSceneId
      : this.scenes.keys().next().value;
  }
}
