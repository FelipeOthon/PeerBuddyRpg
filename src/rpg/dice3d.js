/**
 * Dados Virtuais 3D leves em Canvas 2D com projeção perspectiva (zero dependências externas).
 */

const OCTAHEDRON_VERTS = [
  [0, 1.2, 0],
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
  [0, 0, -1],
  [0, -1.2, 0],
];

const OCTAHEDRON_FACES = [
  [0, 1, 2],
  [0, 2, 3],
  [0, 3, 4],
  [0, 4, 1],
  [5, 2, 1],
  [5, 3, 2],
  [5, 4, 3],
  [5, 1, 4],
];

export class Dice3DOverlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.activeRoll = null;
    this.raf = null;
  }

  trigger(total, label = 'd20') {
    this.activeRoll = {
      total,
      label,
      startTime: performance.now(),
      duration: 1350,
      rx: Math.random() * Math.PI,
      ry: Math.random() * Math.PI,
      vx: 7 + Math.random() * 5,
      vy: 9 + Math.random() * 5,
    };
    this.canvas.style.display = 'block';
    if (!this.raf) this.#loop();
  }

  #loop() {
    const now = performance.now();
    const r = this.activeRoll;
    if (!r) {
      this.canvas.style.display = 'none';
      this.raf = null;
      return;
    }

    const elapsed = now - r.startTime;
    const t = Math.min(1, elapsed / r.duration);
    if (elapsed > r.duration + 900) {
      this.activeRoll = null;
      this.canvas.style.display = 'none';
      this.raf = null;
      return;
    }

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Desaceleração + quique vertical
    const ease = 1 - Math.pow(1 - t, 3);
    const angleX = r.rx + ease * r.vx;
    const angleY = r.ry + ease * r.vy;
    const bounce = Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * 45;
    const cx = w / 2;
    const cy = h / 2 - bounce;
    const scale = 42;

    const proj = OCTAHEDRON_VERTS.map(([x, y, z]) => {
      // Rotação Y
      const x1 = x * Math.cos(angleY) - z * Math.sin(angleY);
      const z1 = x * Math.sin(angleY) + z * Math.cos(angleY);
      // Rotação X
      const y2 = y * Math.cos(angleX) - z1 * Math.sin(angleX);
      const z2 = y * Math.sin(angleX) + z1 * Math.cos(angleX);
      const persp = 4 / (4 - z2 * 0.6);
      return { x: cx + x1 * scale * persp, y: cy + y2 * scale * persp, z: z2 };
    });

    // Ordenar faces por profundidade (painter's algorithm)
    const sortedFaces = OCTAHEDRON_FACES.map((f, idx) => ({
      f,
      idx,
      depth: (proj[f[0]].z + proj[f[1]].z + proj[f[2]].z) / 3,
    })).sort((a, b) => a.depth - b.depth);

    for (const { f, idx } of sortedFaces) {
      const p0 = proj[f[0]];
      const p1 = proj[f[1]];
      const p2 = proj[f[2]];
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.closePath();

      const shade = 40 + (idx % 4) * 18;
      ctx.fillStyle = `rgb(${shade}, ${shade + 45}, 210)`;
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Número final estampado ao pousar
    if (t >= 0.72) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 20px Tahoma, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(r.total), cx, cy);
      ctx.restore();
    }

    this.raf = requestAnimationFrame(() => this.#loop());
  }
}
