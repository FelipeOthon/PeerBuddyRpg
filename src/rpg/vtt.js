/**
 * Mesa / Grid VTT Leve em Canvas 2D.
 * Suporta pan/zoom, imagem de mapa (blob URL), grid configurável, tokens arrastáveis,
 * Fog of War (revelar/esconder células), régua de distância e pings.
 */

export class VttBoard {
  constructor(canvas, { onTokenMove, onFogChange, onPing } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTokenMove = onTokenMove || (() => {});
    this.onFogChange = onFogChange || (() => {});
    this.onPing = onPing || (() => {});

    this.role = 'gm';
    this.tool = 'select'; // 'select' | 'ruler' | 'fog-reveal' | 'fog-hide' | 'ping'
    this.gridSize = 50;
    this.showGrid = true;
    this.snapToGrid = true;
    this.fogEnabled = false;
    this.fogCells = new Set(); // "col,row" escondidas

    this.mapAssetId = null;
    this.mapImg = null;
    this.mapObjectUrl = null;
    this.mapWidth = 1200;
    this.mapHeight = 800;

    this.tokens = new Map(); // id -> { id, name, x, y, size, color, hidden }
    this.pings = []; // { x, y, color, expiresAt }

    // Câmera
    this.camX = 0;
    this.camY = 0;
    this.zoom = 1;

    // Interação
    this.draggingTokenId = null;
    this.panning = false;
    this.panStart = { x: 0, y: 0 };
    this.rulerStart = null;
    this.rulerEnd = null;
    this.paintingFog = false;

    this.#bindEvents();
    this.resize();
    this.#loop();
  }

  setRole(role) {
    this.role = role === 'player' ? 'player' : 'gm';
  }

  setTool(tool) {
    this.tool = tool;
    this.rulerStart = null;
    this.rulerEnd = null;
  }

  resize() {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    this.canvas.width = Math.max(320, Math.floor(rect.width));
    this.canvas.height = Math.max(240, Math.floor(rect.height));
  }

  setMapBlob(assetId, mime, bytes) {
    if (this.mapObjectUrl) URL.revokeObjectURL(this.mapObjectUrl);
    const blob = new Blob([bytes], { type: mime || 'image/webp' });
    this.mapObjectUrl = URL.createObjectURL(blob);
    this.mapAssetId = assetId;
    const img = new Image();
    img.onload = () => {
      this.mapImg = img;
      this.mapWidth = img.naturalWidth || 1200;
      this.mapHeight = img.naturalHeight || 800;
    };
    img.src = this.mapObjectUrl;
  }

  getState() {
    return {
      mapAssetId: this.mapAssetId,
      gridSize: this.gridSize,
      showGrid: this.showGrid,
      snapToGrid: this.snapToGrid,
      fogEnabled: this.fogEnabled,
      fogCells: Array.from(this.fogCells),
      tokens: Array.from(this.tokens.values()),
    };
  }

  applyState(state) {
    if (!state) return;
    if (state.gridSize) this.gridSize = Number(state.gridSize) || 50;
    if (typeof state.showGrid === 'boolean') this.showGrid = state.showGrid;
    if (typeof state.snapToGrid === 'boolean') this.snapToGrid = state.snapToGrid;
    if (typeof state.fogEnabled === 'boolean') this.fogEnabled = state.fogEnabled;
    if (Array.isArray(state.fogCells)) this.fogCells = new Set(state.fogCells);
    if (Array.isArray(state.tokens)) {
      this.tokens.clear();
      state.tokens.forEach((t) => this.tokens.set(t.id, t));
    }
  }

  upsertToken(token) {
    this.tokens.set(token.id, { ...token });
  }

  moveToken(id, x, y) {
    const t = this.tokens.get(id);
    if (!t) return;
    t.x = x;
    t.y = y;
  }

  removeToken(id) {
    this.tokens.delete(id);
  }

  applyFogUpdate({ op, cells }) {
    if (op === 'reset') {
      this.fogCells.clear();
      return;
    }
    if (op === 'cover-all') {
      const cols = Math.ceil(this.mapWidth / this.gridSize);
      const rows = Math.ceil(this.mapHeight / this.gridSize);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) this.fogCells.add(`${c},${r}`);
      }
      return;
    }
    if (!Array.isArray(cells)) return;
    for (const key of cells) {
      if (op === 'hide') this.fogCells.add(key);
      else if (op === 'reveal') this.fogCells.delete(key);
    }
  }

  addPing(x, y, color = '#facc15') {
    this.pings.push({ x, y, color, expiresAt: performance.now() + 2000 });
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.camX) / this.zoom,
      y: (sy - this.camY) / this.zoom,
    };
  }

  #findTokenAt(wx, wy) {
    const list = Array.from(this.tokens.values()).reverse();
    for (const t of list) {
      if (this.role === 'player' && t.hidden) continue;
      const radius = ((t.size || 1) * this.gridSize) / 2;
      const dx = wx - t.x;
      const dy = wy - t.y;
      if (dx * dx + dy * dy <= radius * radius) return t;
    }
    return null;
  }

  #bindEvents() {
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);

      if (e.button === 1 || e.button === 2) {
        this.panning = true;
        this.panStart = { x: sx - this.camX, y: sy - this.camY };
        return;
      }

      if (this.tool === 'ping') {
        this.addPing(world.x, world.y);
        this.onPing(world.x, world.y);
        return;
      }

      if (this.tool === 'ruler') {
        this.rulerStart = world;
        this.rulerEnd = world;
        return;
      }

      if ((this.tool === 'fog-reveal' || this.tool === 'fog-hide') && this.role === 'gm') {
        this.paintingFog = true;
        this.#paintFogAt(world.x, world.y);
        return;
      }

      const hit = this.#findTokenAt(world.x, world.y);
      if (hit) {
        this.draggingTokenId = hit.id;
      } else {
        this.panning = true;
        this.panStart = { x: sx - this.camX, y: sy - this.camY };
      }
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);

      if (this.panning) {
        this.camX = sx - this.panStart.x;
        this.camY = sy - this.panStart.y;
        return;
      }
      if (this.rulerStart && this.tool === 'ruler') {
        this.rulerEnd = world;
        return;
      }
      if (this.paintingFog) {
        this.#paintFogAt(world.x, world.y);
        return;
      }
      if (this.draggingTokenId) {
        const t = this.tokens.get(this.draggingTokenId);
        if (t) {
          t.x = world.x;
          t.y = world.y;
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.draggingTokenId) {
        const t = this.tokens.get(this.draggingTokenId);
        if (t) {
          if (this.snapToGrid) {
            const half = this.gridSize / 2;
            t.x = Math.floor(t.x / this.gridSize) * this.gridSize + half;
            t.y = Math.floor(t.y / this.gridSize) * this.gridSize + half;
          }
          this.onTokenMove(t.id, t.x, t.y);
        }
      }
      this.draggingTokenId = null;
      this.panning = false;
      this.paintingFog = false;
      this.rulerStart = null;
      this.rulerEnd = null;
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const nextZoom = Math.max(0.25, Math.min(3.5, this.zoom * factor));
        this.camX = sx - ((sx - this.camX) * nextZoom) / this.zoom;
        this.camY = sy - ((sy - this.camY) * nextZoom) / this.zoom;
        this.zoom = nextZoom;
      },
      { passive: false }
    );
  }

  #paintFogAt(wx, wy) {
    const col = Math.floor(wx / this.gridSize);
    const row = Math.floor(wy / this.gridSize);
    const key = `${col},${row}`;
    const op = this.tool === 'fog-reveal' ? 'reveal' : 'hide';
    this.applyFogUpdate({ op, cells: [key] });
    this.onFogChange({ op, cells: [key] });
  }

  #loop() {
    this.#render();
    requestAnimationFrame(() => this.#loop());
  }

  #render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#14171f';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(this.camX, this.camY);
    ctx.scale(this.zoom, this.zoom);

    // Fundo / Mapa
    if (this.mapImg) {
      ctx.drawImage(this.mapImg, 0, 0);
    } else {
      ctx.fillStyle = '#1f2430';
      ctx.fillRect(0, 0, this.mapWidth, this.mapHeight);
      ctx.strokeStyle = '#334155';
      ctx.strokeRect(0, 0, this.mapWidth, this.mapHeight);
    }

    // Grid
    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1 / this.zoom;
      ctx.beginPath();
      for (let x = 0; x <= this.mapWidth; x += this.gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.mapHeight);
      }
      for (let y = 0; y <= this.mapHeight; y += this.gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(this.mapWidth, y);
      }
      ctx.stroke();
    }

    // Tokens
    for (const t of this.tokens.values()) {
      if (this.role === 'player' && t.hidden) continue;
      const r = ((t.size || 1) * this.gridSize) / 2 - 3;
      ctx.save();
      if (t.hidden) ctx.globalAlpha = 0.45;
      ctx.fillStyle = t.color || '#3b82f6';
      ctx.beginPath();
      ctx.arc(t.x, t.y, Math.max(10, r), 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.max(11, Math.round(r * 0.65))}px Tahoma, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = (t.name || '?').slice(0, 3).toUpperCase();
      ctx.fillText(label, t.x, t.y);

      ctx.font = 'bold 11px Tahoma, sans-serif';
      ctx.fillText(t.name || '', t.x, t.y + r + 11);
      ctx.restore();
    }

    // Fog of War
    if (this.fogEnabled && this.fogCells.size > 0) {
      ctx.fillStyle = this.role === 'gm' ? 'rgba(0, 0, 0, 0.52)' : 'rgba(5, 7, 11, 0.98)';
      for (const key of this.fogCells) {
        const [col, row] = key.split(',').map(Number);
        ctx.fillRect(col * this.gridSize, row * this.gridSize, this.gridSize + 0.5, this.gridSize + 0.5);
      }
    }

    // Régua de distância
    if (this.rulerStart && this.rulerEnd) {
      const dx = this.rulerEnd.x - this.rulerStart.x;
      const dy = this.rulerEnd.y - this.rulerStart.y;
      const cells = Math.hypot(dx, dy) / this.gridSize;
      const meters = (cells * 1.5).toFixed(1);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3 / this.zoom;
      ctx.beginPath();
      ctx.moveTo(this.rulerStart.x, this.rulerStart.y);
      ctx.lineTo(this.rulerEnd.x, this.rulerEnd.y);
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(this.rulerEnd.x + 8, this.rulerEnd.y - 16, 110, 22);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px Tahoma, sans-serif';
      ctx.fillText(`${cells.toFixed(1)}q (${meters} m)`, this.rulerEnd.x + 14, this.rulerEnd.y - 1);
    }

    // Pings
    const now = performance.now();
    this.pings = this.pings.filter((p) => p.expiresAt > now);
    for (const p of this.pings) {
      const progress = 1 - (p.expiresAt - now) / 2000;
      const rad = 12 + progress * 38;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - progress;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}
