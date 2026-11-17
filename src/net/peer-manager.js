import {
  applySenderPriority,
  computeSasCode,
  decodeSignal,
  encodeSignal,
  preferVideoCodec,
  tuneOpusSdp,
  tuneReceiver,
  waitForIceGathering,
} from './signaling.js';
import { buildAssetTransfer, ChunkAssembler } from './chunker.js';
import { createMessage, MSG, parseMessage } from './protocol.js';

/**
 * Gerenciador Multi-Peer em topologia Estrela (Mestre como Hub autoritativo).
 * Suporta 1..N conexões WebRTC simultâneas, canal 'signal' (renegociação) e canal 'rpg' (eventos + chunks).
 */
export class PeerManager {
  constructor({
    voice,
    soundboard,
    getIceConfig,
    getPtime10,
    onPeersChanged,
    onRpgMessage,
    onAssetReceived,
    onRemoteScreenTrack,
    onRemoteScreenStopped,
    onRemoteAudioTrack,
    onRemoteSoundboardTrack,
    onStats,
  }) {
    this.voice = voice;
    this.soundboard = soundboard;
    this.getIceConfig = getIceConfig;
    this.getPtime10 = getPtime10;
    this.onPeersChanged = onPeersChanged || (() => {});
    this.onRpgMessage = onRpgMessage || (() => {});
    this.onAssetReceived = onAssetReceived || (() => {});
    this.onRemoteScreenTrack = onRemoteScreenTrack || (() => {});
    this.onRemoteScreenStopped = onRemoteScreenStopped || (() => {});
    this.onRemoteAudioTrack = onRemoteAudioTrack || (() => {});
    this.onRemoteSoundboardTrack = onRemoteSoundboardTrack || (() => {});
    this.onStats = onStats || (() => {});

    this.role = 'gm'; // 'gm' | 'player'
    this.peers = new Map(); // peerId -> session
    this.assembler = new ChunkAssembler();

    this.screenStream = null;
    this.statsTimer = null;
    this.prevAudioBytes = 0;
    this.prevVideoBytes = 0;
    this.prevStatsTime = 0;
  }

  setRole(role) {
    this.role = role === 'player' ? 'player' : 'gm';
  }

  getIceServers() {
    const servers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];
    const cfg = this.getIceConfig();
    if (cfg?.turnUrl) {
      servers.push({
        urls: cfg.turnUrl,
        username: cfg.turnUser || '',
        credential: cfg.turnPass || '',
      });
    }
    return servers;
  }

  createSession(peerId, label, polite) {
    if (this.peers.has(peerId)) {
      this.closePeer(peerId);
    }

    const pc = new RTCPeerConnection({ iceServers: this.getIceServers() });
    const session = {
      id: peerId,
      label: label || peerId,
      polite,
      pc,
      signalChannel: null,
      rpgChannel: null,
      makingOffer: false,
      iceState: 'new',
      sasCode: null,
      voiceSender: null,
      soundboardSender: null,
      screenSenders: [],
      audioStreamIds: new Set(),
    };

    // Voz: no modo GM envia mix exclusivo sem eco; no modo Player envia microfone local
    const voiceTrack =
      this.role === 'gm'
        ? this.voice.getMixedTrackForPeer(peerId)
        : this.voice.localStream?.getAudioTracks()[0];

    if (voiceTrack) {
      const stream = new MediaStream([voiceTrack]);
      session.voiceSender = pc.addTrack(voiceTrack, stream);
      applySenderPriority(session.voiceSender, 'low', { maxBitrate: 32_000 });
    }

    // Soundboard: apenas o Mestre envia faixa estéreo dedicada do Soundboard
    if (this.role === 'gm' && this.soundboard) {
      const sbTrack = this.soundboard.getStreamTrack();
      if (sbTrack) {
        const sbStream = new MediaStream([sbTrack]);
        session.soundboardSender = pc.addTrack(sbTrack, sbStream);
        applySenderPriority(session.soundboardSender, 'medium', { maxBitrate: 192_000 });
      }
    }

    // Se já houver tela sendo compartilhada, anexa ao novo peer
    if (this.screenStream) {
      this.#attachScreenToSession(session, this.screenStream, this.lastScreenOpts || {});
    }

    if (!polite) {
      this.#setupSignalChannel(session, pc.createDataChannel('signal'));
      this.#setupRpgChannel(session, pc.createDataChannel('rpg'));
    } else {
      pc.ondatachannel = (ev) => {
        if (ev.channel.label === 'signal') this.#setupSignalChannel(session, ev.channel);
        else if (ev.channel.label === 'rpg') this.#setupRpgChannel(session, ev.channel);
      };
    }

    pc.onnegotiationneeded = async () => {
      if (!session.signalChannel || session.signalChannel.readyState !== 'open') return;
      try {
        session.makingOffer = true;
        const offer = await pc.createOffer();
        offer.sdp = tuneOpusSdp(offer.sdp, this.getPtime10());
        await pc.setLocalDescription(offer);
        session.signalChannel.send(JSON.stringify({ description: pc.localDescription }));
      } finally {
        session.makingOffer = false;
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && session.signalChannel?.readyState === 'open') {
        session.signalChannel.send(JSON.stringify({ candidate: ev.candidate }));
      }
    };

    pc.ontrack = (event) => {
      const track = event.track;
      const stream = event.streams[0] || new MediaStream([track]);
      tuneReceiver(event.receiver, track.kind);

      if (track.kind === 'video') {
        this.onRemoteScreenTrack(session.id, stream, track);
        track.onended = () => this.onRemoteScreenStopped(session.id);
        return;
      }

      if (track.kind === 'audio') {
        const hasVideo = stream.getVideoTracks().length > 0;
        if (hasVideo) {
          this.onRemoteScreenTrack(session.id, stream, track);
          return;
        }

        // No modo Player recebendo do GM: 1ª faixa de áudio sem vídeo = voz; 2ª = soundboard
        if (!session.audioStreamIds.has(stream.id)) {
          session.audioStreamIds.add(stream.id);
        }
        const index = Array.from(session.audioStreamIds).indexOf(stream.id);
        if (this.role === 'gm') {
          this.voice.registerRemoteVoice(session.id, stream);
        } else if (index === 0) {
          this.onRemoteAudioTrack(session.id, stream);
        } else {
          this.onRemoteSoundboardTrack(session.id, stream);
        }
      }
    };

    pc.oniceconnectionstatechange = async () => {
      session.iceState = pc.iceConnectionState;
      if (session.iceState === 'connected' || session.iceState === 'completed') {
        session.sasCode = await computeSasCode(
          pc.localDescription?.sdp,
          pc.remoteDescription?.sdp
        ).catch(() => null);
        this.startStatsLoop();
      }
      this.onPeersChanged(this.getPeerSummaries());
    };

    this.peers.set(peerId, session);
    this.onPeersChanged(this.getPeerSummaries());
    return session;
  }

  #setupSignalChannel(session, ch) {
    session.signalChannel = ch;
    ch.onopen = () => {
      this.onPeersChanged(this.getPeerSummaries());
    };
    ch.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'screen-stopped') {
          this.onRemoteScreenStopped(session.id);
          return;
        }
        if (msg.description) {
          const pc = session.pc;
          const collision =
            msg.description.type === 'offer' &&
            (session.makingOffer || pc.signalingState !== 'stable');
          if (collision && !session.polite) return;
          await pc.setRemoteDescription(msg.description);
          if (msg.description.type === 'offer') {
            const answer = await pc.createAnswer();
            answer.sdp = tuneOpusSdp(answer.sdp, this.getPtime10());
            await pc.setLocalDescription(answer);
            ch.send(JSON.stringify({ description: pc.localDescription }));
          }
        } else if (msg.candidate) {
          await session.pc.addIceCandidate(msg.candidate).catch(() => {});
        }
      } catch (err) {
        console.error('Erro na renegociação:', err);
      }
    };
  }

  #setupRpgChannel(session, ch) {
    session.rpgChannel = ch;
    ch.onopen = () => {
      this.onPeersChanged(this.getPeerSummaries());
      // Dispara evento sintético de abertura para o GM enviar state:snapshot
      this.onRpgMessage(session.id, createMessage(MSG.PEER_HELLO, { open: true }, session.id));
    };
    ch.onmessage = (ev) => {
      try {
        const msg = parseMessage(ev.data);
        if (msg.type === MSG.ASSET_START) {
          this.assembler.onStart(msg.payload);
          return;
        }
        if (msg.type === MSG.ASSET_CHUNK) {
          this.assembler.onChunk(msg.payload);
          return;
        }
        if (msg.type === MSG.ASSET_END) {
          const asset = this.assembler.onEnd(msg.payload);
          if (asset) this.onAssetReceived(session.id, asset);
          return;
        }
        this.onRpgMessage(session.id, msg);
      } catch (err) {
        console.error('Erro no canal RPG:', err);
      }
    };
  }

  async createInvite(peerId, label) {
    const session = this.createSession(peerId, label, false);
    const offer = await session.pc.createOffer();
    offer.sdp = tuneOpusSdp(offer.sdp, this.getPtime10());
    await session.pc.setLocalDescription(offer);
    await waitForIceGathering(session.pc);
    return encodeSignal(session.pc.localDescription);
  }

  async acceptAnswer(peerId, answerCode) {
    const session = this.peers.get(peerId);
    if (!session || session.pc.signalingState !== 'have-local-offer') {
      throw new Error('Gere um convite novo antes de conectar.');
    }
    const answer = await decodeSignal(answerCode);
    await session.pc.setRemoteDescription(answer);
  }

  async acceptInviteAndCreateAnswer(offerCode, label = 'Mestre') {
    const offer = await decodeSignal(offerCode);
    const session = this.createSession('gm', label, true);
    await session.pc.setRemoteDescription(offer);
    const answer = await session.pc.createAnswer();
    answer.sdp = tuneOpusSdp(answer.sdp, this.getPtime10());
    await session.pc.setLocalDescription(answer);
    await waitForIceGathering(session.pc);
    return encodeSignal(session.pc.localDescription);
  }

  sendToPeer(peerId, type, payload, senderId = this.role) {
    const session = this.peers.get(peerId);
    if (session?.rpgChannel?.readyState === 'open') {
      session.rpgChannel.send(JSON.stringify(createMessage(type, payload, senderId)));
      return true;
    }
    return false;
  }

  broadcast(type, payload, excludePeerId = null, senderId = this.role) {
    const raw = JSON.stringify(createMessage(type, payload, senderId));
    for (const [id, session] of this.peers.entries()) {
      if (id === excludePeerId) continue;
      if (session.rpgChannel?.readyState === 'open') {
        session.rpgChannel.send(raw);
      }
    }
  }

  async sendAssetToPeer(peerId, assetId, mime, bytes) {
    const session = this.peers.get(peerId);
    if (!session?.rpgChannel || session.rpgChannel.readyState !== 'open') return;
    const transfer = buildAssetTransfer(assetId, mime, bytes);
    session.rpgChannel.send(JSON.stringify(createMessage(MSG.ASSET_START, transfer.start, this.role)));
    for (const chunk of transfer.chunks) {
      session.rpgChannel.send(JSON.stringify(createMessage(MSG.ASSET_CHUNK, chunk, this.role)));
    }
    session.rpgChannel.send(JSON.stringify(createMessage(MSG.ASSET_END, transfer.end, this.role)));
  }

  async broadcastAsset(assetId, mime, bytes) {
    for (const peerId of this.peers.keys()) {
      await this.sendAssetToPeer(peerId, assetId, mime, bytes);
    }
  }

  async startScreenShare(opts) {
    const { preset, mode, codec, includeAudio, onLocalEnded } = opts;
    const videoConstraints =
      preset === '720p60'
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } }
        : preset === '1080p60'
        ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
        : preset === '1440p60'
        ? { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 60 } }
        : { frameRate: { ideal: 60 } };

    const audioConstraints = includeAudio
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : false;

    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: audioConstraints,
    });

    const videoTrack = this.screenStream.getVideoTracks()[0];
    if ('contentHint' in videoTrack) videoTrack.contentHint = mode === 'detail' ? 'detail' : 'motion';
    videoTrack.onended = () => {
      this.stopScreenShare();
      if (onLocalEnded) onLocalEnded();
    };

    this.lastScreenOpts = { preset, mode, codec };
    for (const session of this.peers.values()) {
      await this.#attachScreenToSession(session, this.screenStream, this.lastScreenOpts);
    }

    return this.screenStream;
  }

  async #attachScreenToSession(session, stream, { preset = '1080p60', mode = 'motion', codec = 'h264' }) {
    const maxBitrate =
      preset === '720p60'
        ? 6_000_000
        : preset === '1080p60'
        ? 12_000_000
        : preset === '1440p60'
        ? 20_000_000
        : 25_000_000;

    session.screenSenders = [];
    for (const track of stream.getTracks()) {
      const sender = session.pc.addTrack(track, stream);
      if (track.kind === 'video') {
        preferVideoCodec(session.pc, sender, codec);
        await applySenderPriority(sender, 'high', {
          maxBitrate,
          maxFramerate: mode === 'detail' ? 30 : 60,
          scaleResolutionDownBy: 1.0,
          degradationPreference: mode === 'detail' ? 'maintain-resolution' : 'maintain-framerate',
        });
      } else if (track.kind === 'audio') {
        await applySenderPriority(sender, 'high', { maxBitrate: 192_000 });
      }
      session.screenSenders.push(sender);
    }
  }

  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    for (const session of this.peers.values()) {
      session.screenSenders.forEach((s) => {
        try {
          session.pc.removeTrack(s);
        } catch {
          // Ignora erro se conexão já fechou
        }
      });
      session.screenSenders = [];
      if (session.signalChannel?.readyState === 'open') {
        session.signalChannel.send(JSON.stringify({ type: 'screen-stopped' }));
      }
    }
  }

  replaceLocalVoiceTrack(track) {
    if (this.role === 'gm') {
      this.voice.refreshLocalMicInMixers();
      return;
    }
    for (const session of this.peers.values()) {
      if (session.voiceSender && track) {
        session.voiceSender.replaceTrack(track).catch(() => {});
      }
    }
  }

  closePeer(peerId) {
    const session = this.peers.get(peerId);
    if (!session) return;
    try {
      session.pc.close();
    } catch {
      // Ignora
    }
    if (this.role === 'gm') {
      this.voice.unregisterRemoteVoice(peerId);
    }
    this.peers.delete(peerId);
    this.onPeersChanged(this.getPeerSummaries());
  }

  hangupAll() {
    this.stopScreenShare();
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }
    this.voice.disposeMixers();
    this.assembler.clear();
  }

  hasConnectedPeers() {
    for (const s of this.peers.values()) {
      if (s.iceState === 'connected' || s.iceState === 'completed') return true;
    }
    return false;
  }

  getPeerSummaries() {
    return Array.from(this.peers.values()).map((s) => ({
      id: s.id,
      label: s.label,
      iceState: s.iceState,
      sasCode: s.sasCode,
      rpgOpen: s.rpgChannel?.readyState === 'open',
      signalOpen: s.signalChannel?.readyState === 'open',
      signalingState: s.pc.signalingState,
    }));
  }

  startStatsLoop() {
    if (this.statsTimer) return;
    this.prevAudioBytes = 0;
    this.prevVideoBytes = 0;
    this.prevStatsTime = performance.now();

    this.statsTimer = setInterval(async () => {
      const firstConnected = Array.from(this.peers.values()).find(
        (s) => s.iceState === 'connected' || s.iceState === 'completed'
      );
      if (!firstConnected) return;

      const stats = await firstConnected.pc.getStats();
      let activePair = null;
      const candidates = {};
      const now = performance.now();
      const dt = Math.max(0.1, (now - this.prevStatsTime) / 1000);
      const summary = { rttMs: '--', jitterMs: '--', lossText: '--', audioKbps: '--', route: '--', videoOut: null, videoIn: null };

      stats.forEach((r) => {
        if (r.type === 'local-candidate' || r.type === 'remote-candidate') candidates[r.id] = r;
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || !activePair)) {
          activePair = r;
        }
        if (r.type === 'inbound-rtp' && r.kind === 'audio') {
          summary.jitterMs = r.jitter != null ? (r.jitter * 1000).toFixed(1) : '--';
          const lost = r.packetsLost || 0;
          const total = lost + (r.packetsReceived || 0);
          const pct = total > 0 ? ((lost / total) * 100).toFixed(1) : '0.0';
          summary.lossText = `${pct}% (${lost})`;
          if (this.prevAudioBytes > 0 && r.bytesReceived != null) {
            summary.audioKbps = (((r.bytesReceived - this.prevAudioBytes) * 8) / 1000 / dt).toFixed(0);
          }
          this.prevAudioBytes = r.bytesReceived || 0;
        }
        if (r.type === 'outbound-rtp' && r.kind === 'video' && this.screenStream) {
          summary.videoOut = {
            w: r.frameWidth || '--',
            h: r.frameHeight || '--',
            fps: r.framesPerSecond != null ? Math.round(r.framesPerSecond) : '--',
            enc: r.encoderImplementation || '--',
            why: { none: 'sem limitação', cpu: 'limitado pela CPU', bandwidth: 'limitado pela rede', other: 'outro' }[r.qualityLimitationReason] || '--',
          };
        }
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          let vKbps = '--';
          if (this.prevVideoBytes > 0 && r.bytesReceived != null) {
            vKbps = (((r.bytesReceived - this.prevVideoBytes) * 8) / 1000 / dt).toFixed(0);
          }
          this.prevVideoBytes = r.bytesReceived || 0;
          summary.videoIn = {
            w: r.frameWidth || '--',
            h: r.frameHeight || '--',
            fps: r.framesPerSecond != null ? Math.round(r.framesPerSecond) : '--',
            kbps: vKbps,
            lost: r.packetsLost || 0,
          };
        }
      });

      this.prevStatsTime = now;
      if (activePair) {
        summary.rttMs = activePair.currentRoundTripTime != null ? Math.round(activePair.currentRoundTripTime * 1000) : '--';
        const local = candidates[activePair.localCandidateId];
        const remote = candidates[activePair.remoteCandidateId];
        if (local && remote) {
          const isRelay = local.candidateType === 'relay' || remote.candidateType === 'relay';
          const isLan = local.candidateType === 'host' && remote.candidateType === 'host';
          summary.route = isRelay ? 'Relay (TURN)' : isLan ? 'Rede Local (LAN)' : 'Direto P2P (UDP)';
        }
      }
      this.onStats(summary);
    }, 1000);
  }
}
