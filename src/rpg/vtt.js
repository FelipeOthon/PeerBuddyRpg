/**
 * Mesa / Grid VTT Leve em Canvas 2D com Paredes, Iluminação e Visão Dinâmica.
 */

export function raySegmentIntersect(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qpx = x1 - ox;
  const qpy = y1 - oy;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * dy - qpy * dx) / denom;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return null;
}

export function computeVisibilityPolygon(ox, oy, radius, walls, rayCount = 96) {
  const pts = [];
  for (let i = 0; i < rayCount; i++) {
    const angle = (i / rayCount) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let minT = radius;
    for (const w of walls) {
      const t = raySegmentIntersect(ox, oy, dx, dy, w.x1, w.y1, w.x2, w.y2);
      if (t !== null && t < minT) minT = t;
    }
    pts.push({ x: ox + dx * minT, y: oy + dy * minT });
  }
  return pts;
}

export class VttBoard {
  constructor(canvas, { onTokenMove, onFogChange, onWallChange, onPing } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTokenMove = onTokenMove || (() => {});
    this.onFogChange = onFogChange || (() => {});
    this.onWallChange = onWallChange || (() => {});
    this.onPing = onPing || (() => {});

    this.role = 'gm';
    this.tool = 'select'; // 'select' | 'ruler' | 'fog-reveal' | 'fog-hide' | 'wall' | 'ping'
    this.gridSize = 50;
    this.showGrid = true;
    this.snapToGrid = true;
    this.fogEnabled = false;
    this.lightingEnabled = false;
    this.fogCells = new Set();
    this.walls = []; // { id, x1, y1, x2, y2 }

    this.mapAssetId = null;
    this.mapImg = null;
    this.mapObjectUrl = null;
    this.mapWidth = 1200;
    this.mapHeight = 800;

    this.tokens = new Map();
    this.pings = [];

    this.camX = 0;
    this.camY = 0;
    this.zoom = 1;

    this.draggingTokenId = null;
    this.panning = false;
    this.panStart = { x: 0, y: 0 };
    this.rulerStart = null;
    this.rulerEnd = null;
    this.wallDraft = null;
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
    this.wallDraft = null;
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
      lightingEnabled: this.lightingEnabled,
      fogCells: Array.from(this.fogCells),
      walls: this.walls.map((w) => ({ ...w })),
      tokens: Array.from(this.tokens.values()),
    };
  }

  applyState(state) {
    if (!state) return;
    if (state.gridSize) this.gridSize = Number(state.gridSize) || 50;
    if (typeof state.showGrid === 'boolean') this.showGrid = state.showGrid;
    if (typeof state.snapToGrid === 'boolean') this.snapToGrid = state.snapToGrid;
    if (typeof state.fogEnabled === 'boolean') this.fogEnabled = state.fogEnabled;
    if (typeof state.lightingEnabled === 'boolean') this.lightingEnabled = state.lightingEnabled;
    if (Array.isArray(state.fogCells)) this.fogCells = new Set(state.fogCells);
    if (Array.isArray(state.walls)) this.walls = state.walls.map((w) => ({ ...w }));
    if (Array.isArray(state.tokens)) {
      this.tokens.clear();
      state.tokens.forEach((t) => this.tokens.set(t.id, t));
    }
  }

  upsertToken(token) {
    this.tokens.set(token.id, { visionRadius: 280, ...token });
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

  applyWallUpdate({ op, wall }) {
    if (op === 'clear') {
      this.walls = [];
    } else if (op === 'add' && wall) {
      this.walls.push({ ...wall });
    }
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

      if (this.tool === 'wall' && this.role === 'gm') {
        this.wallDraft = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
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
      if (this.wallDraft && this.tool === 'wall') {
        this.wallDraft.x2 = world.x;
        this.wallDraft.y2 = world.y;
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
      if (this.wallDraft) {
        const len = Math.hypot(this.wallDraft.x2 - this.wallDraft.x1, this.wallDraft.y2 - this.wallDraft.y1);
        if (len > 10) {
          const wall = { id: `wall-${Date.now().toString(36)}`, ...this.wallDraft };
          this.walls.push(wall);
          this.onWallChange({ op: 'add', wall });
        }
        this.wallDraft = null;
      }
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
      ctx.fillText((t.name || '?').slice(0, 3).toUpperCase(), t.x, t.y);

      ctx.font = 'bold 11px Tahoma, sans-serif';
      ctx.fillText(t.name || '', t.x, t.y + r + 11);
      ctx.restore();
    }

    // Iluminação & Visão Dinâmica (Raycasting contra paredes)
    if (this.lightingEnabled && this.tokens.size > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.mapWidth, this.mapHeight);
      for (const t of this.tokens.values()) {
        if (t.hidden) continue;
        const poly = computeVisibilityPolygon(t.x, t.y, t.visionRadius || 280, this.walls, 96);
        if (poly.length > 2) {
          ctx.moveTo(poly[0].x, poly[0].y);
          for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
          ctx.closePath();
        }
      }
      ctx.fillStyle = this.role === 'gm' ? 'rgba(0, 0, 0, 0.48)' : 'rgba(5, 7, 11, 0.94)';
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Fog of War manual
    if (this.fogEnabled && this.fogCells.size > 0) {
      ctx.fillStyle = this.role === 'gm' ? 'rgba(0, 0, 0, 0.52)' : 'rgba(5, 7, 11, 0.98)';
      for (const key of this.fogCells) {
        const [col, row] = key.split(',').map(Number);
        ctx.fillRect(col * this.gridSize, row * this.gridSize, this.gridSize + 0.5, this.gridSize + 0.5);
      }
    }

    // Paredes (visíveis para o Mestre)
    if (this.role === 'gm') {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 3 / this.zoom;
      for (const wl of this.walls) {
        ctx.beginPath();
        ctx.moveTo(wl.x1, wl.y1);
        ctx.lineTo(wl.x2, wl.y2);
        ctx.stroke();
      }
      if (this.wallDraft) {
        ctx.strokeStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(this.wallDraft.x1, this.wallDraft.y1);
        ctx.lineTo(this.wallDraft.x2, this.wallDraft.y2);
        ctx.stroke();
      }
    }

    // Régua
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
