/**
 * Soundboard & Trilha Sonora P2P via Web Audio API.
 * Mixa música ambiente + efeitos sonoros em um MediaStreamAudioDestinationNode
 * para transmissão estéreo dedicada aos jogadores, com monitor local opcional.
 */

export class SoundboardController {
  constructor({ onCueChange } = {}) {
    this.onCueChange = onCueChange || (() => {});
    this.ctx = null;
    this.masterGain = null;
    this.localMonitorGain = null;
    this.remoteDest = null;

    this.musicEl = null;
    this.musicSource = null;
    this.musicGain = null;
    this.musicTitle = 'Nenhuma faixa';
    this.musicObjectUrl = null;

    this.sfxLibrary = new Map(); // id -> { id, name, objectUrl, volume }
    this.masterVolume = 0.7;
    this.localPreview = true;
  }

  ensureGraph() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;

    this.localMonitorGain = this.ctx.createGain();
    this.localMonitorGain.gain.value = this.localPreview ? 1 : 0;

    this.remoteDest = this.ctx.createMediaStreamDestination();

    this.masterGain.connect(this.remoteDest);
    this.masterGain.connect(this.localMonitorGain);
    this.localMonitorGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 1;
    this.musicGain.connect(this.masterGain);
  }

  getStreamTrack() {
    this.ensureGraph();
    return this.remoteDest.stream.getAudioTracks()[0];
  }

  setMasterVolume(val) {
    this.masterVolume = Math.max(0, Math.min(1, Number(val)));
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
  }

  setLocalPreview(enabled) {
    this.localPreview = Boolean(enabled);
    if (this.localMonitorGain) this.localMonitorGain.gain.value = this.localPreview ? 1 : 0;
  }

  loadMusicFile(file) {
    this.ensureGraph();
    if (this.musicObjectUrl) URL.revokeObjectURL(this.musicObjectUrl);
    this.musicObjectUrl = URL.createObjectURL(file);

    if (!this.musicEl) {
      this.musicEl = new Audio();
      this.musicEl.loop = true;
      this.musicEl.crossOrigin = 'anonymous';
      this.musicSource = this.ctx.createMediaElementSource(this.musicEl);
      this.musicSource.connect(this.musicGain);
    }
    this.musicEl.src = this.musicObjectUrl;
    this.musicTitle = file.name.replace(/\.[^.]+$/, '');
    this.onCueChange({ title: this.musicTitle, playing: false, loop: this.musicEl.loop });
  }

  async playMusic() {
    if (!this.musicEl?.src) return;
    this.ensureGraph();
    await this.musicEl.play();
    this.onCueChange({ title: this.musicTitle, playing: true, loop: this.musicEl.loop });
  }

  pauseMusic() {
    if (!this.musicEl) return;
    this.musicEl.pause();
    this.onCueChange({ title: this.musicTitle, playing: false, loop: this.musicEl.loop });
  }

  setMusicLoop(loop) {
    if (this.musicEl) this.musicEl.loop = Boolean(loop);
  }

  addSfxFile(file) {
    const id = `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry = {
      id,
      name: file.name.replace(/\.[^.]+$/, ''),
      objectUrl: URL.createObjectURL(file),
    };
    this.sfxLibrary.set(id, entry);
    return entry;
  }

  async triggerSfx(id) {
    const entry = this.sfxLibrary.get(id);
    if (!entry) return;
    this.ensureGraph();
    const res = await fetch(entry.objectUrl);
    const buf = await res.arrayBuffer();
    const audioBuf = await this.ctx.decodeAudioData(buf);
    const src = this.ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(this.masterGain);
    src.start();
  }

  /**
   * Efeito sonoro sintético embutido (sem precisar de arquivo externo) para testes rápidos.
   */
  triggerBuiltInSfx(kind) {
    this.ensureGraph();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);

    if (kind === 'bell') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(330, now + 0.6);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.start(now);
      osc.stop(now + 0.7);
    } else if (kind === 'crit') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554.37, now + 0.08);
      osc.frequency.setValueAtTime(659.25, now + 0.16);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.55);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.42);
    }
  }
}
