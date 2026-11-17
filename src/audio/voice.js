/**
 * Gerenciamento de microfone local, medidor Web Audio e mixer de voz para o hub do Mestre.
 */

export class VoiceController {
  constructor({ micSelect, speakerSelect, micMeter, rawAudioToggle, onStatus }) {
    this.micSelect = micSelect;
    this.speakerSelect = speakerSelect;
    this.micMeter = micMeter;
    this.rawAudioToggle = rawAudioToggle;
    this.onStatus = onStatus || (() => {});

    this.localStream = null;
    this.isMuted = false;
    this.meterRaf = null;
    this.meterCtx = null;

    // Mixer para o Mestre retransmitir vozes dos jogadores sem eco do próprio emissor
    this.mixerCtx = null;
    this.peerMixers = new Map(); // targetPeerId -> { dest, sources: Map<fromPeerId, MediaStreamAudioSourceNode> }
    this.remoteVoiceStreams = new Map(); // fromPeerId -> MediaStream
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

  startMicMeter(stream) {
    if (this.meterRaf) cancelAnimationFrame(this.meterRaf);
    if (this.meterCtx) this.meterCtx.close().catch(() => {});
    this.meterCtx = new AudioContext();
    const src = this.meterCtx.createMediaStreamSource(stream);
    const analyser = this.meterCtx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
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

  async startMicrophone() {
    if (this.localStream) this.localStream.getTracks().forEach((t) => t.stop());
    const raw = this.rawAudioToggle.checked;
    this.localStream = await navigator.mediaDevices.getUserMedia({
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
    this.startMicMeter(this.localStream);
    this.isMuted = false;
    this.onStatus(
      raw
        ? 'Microfone ativo em Modo Ultra-Baixa Latência (prioridade baixa na rede).'
        : 'Microfone ativo com cancelamento de eco/ruído (prioridade baixa na rede).'
    );
    return this.localStream;
  }

  toggleMute() {
    if (!this.localStream) return this.isMuted;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((t) => {
      t.enabled = !this.isMuted;
    });
    return this.isMuted;
  }

  /**
   * Cria ou retorna uma faixa de áudio mixada exclusiva para um peer no modo Mestre (Estrela),
   * contendo o microfone do Mestre + voz de todos os outros jogadores (exceto ele mesmo).
   */
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
      if (otherId === targetPeerId) continue; // Nunca devolve a própria voz para evitar eco
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
