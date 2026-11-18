/**
 * Gerenciamento de microfone local, Voice Changer em tempo real (Web Audio),
 * medidor de nível e mixer de voz para o hub do Mestre.
 */

function makeDistortionCurve(amount = 40) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export class VoiceController {
  constructor({ micSelect, speakerSelect, micMeter, rawAudioToggle, onStatus }) {
    this.micSelect = micSelect;
    this.speakerSelect = speakerSelect;
    this.micMeter = micMeter;
    this.rawAudioToggle = rawAudioToggle;
    this.onStatus = onStatus || (() => {});

    this.rawMicStream = null;
    this.localStream = null; // Stream já processado pelo Voice Changer (ou raw se normal)
    this.voiceEffect = 'normal'; // 'normal' | 'dragon' | 'demon' | 'robot' | 'cave' | 'radio'
    this.localMonitor = false;

    this.isMuted = false;
    this.meterRaf = null;
    this.fxCtx = null;
    this.fxDest = null;
    this.fxNodes = [];

    // Mixer para o Mestre retransmitir vozes dos jogadores sem eco do próprio emissor
    this.mixerCtx = null;
    this.peerMixers = new Map();
    this.remoteVoiceStreams = new Map();
  }

  async loadDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const prevMic = this.micSelect.value;
    const prevSpk = this.speakerSelect.value;
    this.micSelect.innerHTML = '';
    this.speakerSelect.innerHTML = '';

    devices.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `${d.kind} (${d.deviceId.slice(0, 6)})`;
      if (d.kind === 'audioinput') this.micSelect.appendChild(opt);
      if (d.kind === 'audiooutput') this.speakerSelect.appendChild(opt);
    });

    if (prevMic) this.micSelect.value = prevMic;
    if (prevSpk) this.speakerSelect.value = prevSpk;
  }

  async startMicrophone() {
    if (this.rawMicStream) this.rawMicStream.getTracks().forEach((t) => t.stop());
    const raw = this.rawAudioToggle.checked;
    this.rawMicStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: this.micSelect.value ? { exact: this.micSelect.value } : undefined,
        echoCancellation: !raw,
        noiseSuppression: !raw,
        autoGainControl: !raw,
        latency: 0.02,
      },
      video: false,
    });
    await this.loadDevices();
    this.#rebuildFxGraph();
    this.isMuted = false;
    this.onStatus(
      raw
        ? 'Microfone ativo em Modo Ultra-Baixa Latência (prioridade baixa na rede).'
        : 'Microfone ativo com cancelamento de eco/ruído (prioridade baixa na rede).'
    );
    return this.localStream;
  }

  setVoiceEffect(effect) {
    this.voiceEffect = effect || 'normal';
    if (this.rawMicStream) {
      this.#rebuildFxGraph();
    }
    return this.localStream;
  }

  setLocalMonitor(enabled) {
    this.localMonitor = Boolean(enabled);
    if (this.rawMicStream) {
      this.#rebuildFxGraph();
    }
  }

  #rebuildFxGraph() {
    if (this.meterRaf) cancelAnimationFrame(this.meterRaf);
    this.fxNodes.forEach((n) => {
      try {
        if (typeof n.stop === 'function') n.stop();
        n.disconnect();
      } catch {
        // Ignora
      }
    });
    this.fxNodes = [];

    if (!this.fxCtx) this.fxCtx = new AudioContext();
    if (this.fxCtx.state === 'suspended') this.fxCtx.resume().catch(() => {});
    if (!this.fxDest) this.fxDest = this.fxCtx.createMediaStreamDestination();

    const ctx = this.fxCtx;
    const src = ctx.createMediaStreamSource(this.rawMicStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    this.fxNodes.push(src, analyser);

    let tail = src;

    if (this.voiceEffect === 'dragon') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowshelf';
      lp.frequency.value = 260;
      lp.gain.value = 14;
      const lpCut = ctx.createBiquadFilter();
      lpCut.type = 'lowpass';
      lpCut.frequency.value = 1350;
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(18);
      tail.connect(lp);
      lp.connect(lpCut);
      lpCut.connect(shaper);
      tail = shaper;
      this.fxNodes.push(lp, lpCut, shaper);
    } else if (this.voiceEffect === 'demon') {
      const modGain = ctx.createGain();
      modGain.gain.value = 0.7;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 32;
      const oscDepth = ctx.createGain();
      oscDepth.gain.value = 0.35;
      osc.connect(oscDepth);
      oscDepth.connect(modGain.gain);
      osc.start();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;
      tail.connect(modGain);
      modGain.connect(lp);
      tail = lp;
      this.fxNodes.push(modGain, osc, oscDepth, lp);
    } else if (this.voiceEffect === 'robot') {
      const modGain = ctx.createGain();
      modGain.gain.value = 0.5;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 55;
      const oscDepth = ctx.createGain();
      oscDepth.gain.value = 0.5;
      osc.connect(oscDepth);
      oscDepth.connect(modGain.gain);
      osc.start();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 1.2;
      tail.connect(modGain);
      modGain.connect(bp);
      tail = bp;
      this.fxNodes.push(modGain, osc, oscDepth, bp);
    } else if (this.voiceEffect === 'cave') {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.22;
      const fb = ctx.createGain();
      fb.gain.value = 0.42;
      const mix = ctx.createGain();
      mix.gain.value = 1.0;
      tail.connect(mix);
      tail.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(mix);
      tail = mix;
      this.fxNodes.push(delay, fb, mix);
    } else if (this.voiceEffect === 'radio') {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 1.6;
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(28);
      tail.connect(bp);
      bp.connect(shaper);
      tail = shaper;
      this.fxNodes.push(bp, shaper);
    }

    tail.connect(analyser);
    tail.connect(this.fxDest);
    if (this.localMonitor) {
      tail.connect(ctx.destination);
    }

    this.localStream = this.fxDest.stream;
    this.localStream.getAudioTracks().forEach((t) => {
      t.enabled = !this.isMuted;
    });

    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const pct = Math.min(100, (sum / data.length / 90) * 100);
      this.micMeter.style.width = (this.isMuted ? 0 : pct) + '%';
      this.meterRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  toggleMute() {
    if (!this.localStream) return this.isMuted;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((t) => {
      t.enabled = !this.isMuted;
    });
    return this.isMuted;
  }

  getMixedTrackForPeer(targetPeerId) {
    if (!this.mixerCtx) this.mixerCtx = new AudioContext();
    if (this.mixerCtx.state === 'suspended') this.mixerCtx.resume().catch(() => {});

    let entry = this.peerMixers.get(targetPeerId);
    if (!entry) {
      const dest = this.mixerCtx.createMediaStreamDestination();
      entry = { dest, sources: new Map() };
      this.peerMixers.set(targetPeerId, entry);
      this.#rebuildPeerMix(targetPeerId);
    }
    return entry.dest.stream.getAudioTracks()[0];
  }

  registerRemoteVoice(fromPeerId, stream) {
    this.remoteVoiceStreams.set(fromPeerId, stream);
    for (const targetId of this.peerMixers.keys()) {
      this.#rebuildPeerMix(targetId);
    }
  }

  unregisterRemoteVoice(fromPeerId) {
    this.remoteVoiceStreams.delete(fromPeerId);
    const targetEntry = this.peerMixers.get(fromPeerId);
    if (targetEntry) {
      targetEntry.sources.forEach((src) => src.disconnect());
      this.peerMixers.delete(fromPeerId);
    }
    for (const targetId of this.peerMixers.keys()) {
      this.#rebuildPeerMix(targetId);
    }
  }

  refreshLocalMicInMixers() {
    for (const targetId of this.peerMixers.keys()) {
      this.#rebuildPeerMix(targetId);
    }
  }

  #rebuildPeerMix(targetPeerId) {
    const entry = this.peerMixers.get(targetPeerId);
    if (!entry || !this.mixerCtx) return;

    entry.sources.forEach((src) => src.disconnect());
    entry.sources.clear();

    if (this.localStream) {
      const localSrc = this.mixerCtx.createMediaStreamSource(this.localStream);
      localSrc.connect(entry.dest);
      entry.sources.set('__gm__', localSrc);
    }

    for (const [otherId, stream] of this.remoteVoiceStreams.entries()) {
      if (otherId === targetPeerId) continue;
      if (stream.getAudioTracks().length > 0) {
        const src = this.mixerCtx.createMediaStreamSource(stream);
        src.connect(entry.dest);
        entry.sources.set(otherId, src);
      }
    }
  }

  disposeMixers() {
    this.peerMixers.forEach((entry) => entry.sources.forEach((s) => s.disconnect()));
    this.peerMixers.clear();
    this.remoteVoiceStreams.clear();
    if (this.mixerCtx) {
      this.mixerCtx.close().catch(() => {});
      this.mixerCtx = null;
    }
  }
}
