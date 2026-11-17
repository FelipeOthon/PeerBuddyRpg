import { VoiceController } from './audio/voice.js';
import { SoundboardController } from './audio/soundboard.js';
import { PeerManager } from './net/peer-manager.js';
import { MSG } from './net/protocol.js';
import { formatRollSummary, parseAndRoll } from './rpg/dice.js';
import { InitiativeTracker } from './rpg/initiative.js';
import { HandoutModal } from './rpg/handouts.js';
import { VttBoard } from './rpg/vtt.js';
import { loadAssetBlob, loadKV, saveAssetBlob, saveKV } from './storage/db.js';

const $ = (id) => document.getElementById(id);

const els = {
  connBadge: $('connBadge'),
  sasBadge: $('sasBadge'),
  roleSelect: $('roleSelect'),
  btnStartMic: $('btnStartMic'),
  btnMute: $('btnMute'),
  btnHangup: $('btnHangup'),

  // Telemetria
  statRtt: $('statRtt'),
  statJitter: $('statJitter'),
  statLoss: $('statLoss'),
  statBitrate: $('statBitrate'),
  statRoute: $('statRoute'),

  // Conexão GM / Player
  gmConnectCard: $('gmConnectCard'),
  playerConnectCard: $('playerConnectCard'),
  newPeerName: $('newPeerName'),
  btnCreateOffer: $('btnCreateOffer'),
  btnCopyOffer: $('btnCopyOffer'),
  offerOut: $('offerOut'),
  answerIn: $('answerIn'),
  btnAcceptAnswer: $('btnAcceptAnswer'),
  peerListBox: $('peerListBox'),
  playerNameInput: $('playerNameInput'),
  offerIn: $('offerIn'),
  btnCreateAnswer: $('btnCreateAnswer'),
  btnCopyAnswer: $('btnCopyAnswer'),
  answerOut: $('answerOut'),

  // Áudio & Tela
  micSelect: $('micSelect'),
  speakerSelect: $('speakerSelect'),
  micMeter: $('micMeter'),
  remoteVolume: $('remoteVolume'),
  sbRemoteVolume: $('sbRemoteVolume'),
  rawAudioToggle: $('rawAudioToggle'),
  ptime10Toggle: $('ptime10Toggle'),
  audioStatus: $('audioStatus'),
  remoteAudio: $('remoteAudio'),
  remoteSoundboardAudio: $('remoteSoundboardAudio'),
  screenPreset: $('screenPreset'),
  screenMode: $('screenMode'),
  screenCodec: $('screenCodec'),
  screenAudioToggle: $('screenAudioToggle'),
  btnShareScreen: $('btnShareScreen'),
  btnStopScreen: $('btnStopScreen'),
  screenStatus: $('screenStatus'),
  localScreenBox: $('localScreenBox'),
  localScreenPreview: $('localScreenPreview'),
  btnToggleLocalPreview: $('btnToggleLocalPreview'),
  remoteScreenBox: $('remoteScreenBox'),
  remoteVideo: $('remoteVideo'),
  videoStatsText: $('videoStatsText'),
  screenVolume: $('screenVolume'),
  btnFullscreen: $('btnFullscreen'),

  // TURN
  turnUrl: $('turnUrl'),
  turnUser: $('turnUser'),
  turnPass: $('turnPass'),

  // VTT & RPG
  vttCanvas: $('vttCanvas'),
  fogEnabledToggle: $('fogEnabledToggle'),
  gridToggle: $('gridToggle'),
  snapToggle: $('snapToggle'),
  mapFileInput: $('mapFileInput'),
  btnLoadMap: $('btnLoadMap'),
  btnAddToken: $('btnAddToken'),
  btnFogCover: $('btnFogCover'),
  btnFogClear: $('btnFogClear'),
  diceExpr: $('diceExpr'),
  btnRollDice: $('btnRollDice'),
  gmSecretRoll: $('gmSecretRoll'),
  diceLog: $('diceLog'),
  roundNum: $('roundNum'),
  initName: $('initName'),
  initVal: $('initVal'),
  btnAddInit: $('btnAddInit'),
  initList: $('initList'),
  btnNextTurn: $('btnNextTurn'),
  btnResetInit: $('btnResetInit'),
  handoutTitle: $('handoutTitle'),
  handoutText: $('handoutText'),
  handoutImgInput: $('handoutImgInput'),
  btnSendHandoutImg: $('btnSendHandoutImg'),
  btnSendHandoutText: $('btnSendHandoutText'),
  gmNotes: $('gmNotes'),

  // Soundboard
  musicFileInput: $('musicFileInput'),
  btnLoadMusic: $('btnLoadMusic'),
  btnPlayMusic: $('btnPlayMusic'),
  btnPauseMusic: $('btnPauseMusic'),
  musicLoopToggle: $('musicLoopToggle'),
  musicCueStatus: $('musicCueStatus'),
  sbMasterVol: $('sbMasterVol'),
  sbLocalPreview: $('sbLocalPreview'),
  sfxFileInput: $('sfxFileInput'),
  btnAddSfx: $('btnAddSfx'),
  customSfxList: $('customSfxList'),

  // Modal Handout
  handoutModal: $('handoutModal'),
  handoutModalTitle: $('handoutModalTitle'),
  handoutModalImg: $('handoutModalImg'),
  handoutModalText: $('handoutModalText'),
  btnCloseHandout: $('btnCloseHandout'),
};

let currentRole = 'gm';
let pendingOfferPeerId = null;
const pendingHandoutMeta = new Map(); // assetId -> { title, text }
const remoteStreams = new Map();

function setBadge(text, type = '') {
  els.connBadge.textContent = text;
  els.connBadge.className = 'badge' + (type ? ' ' + type : '');
}

const voice = new VoiceController({
  micSelect: els.micSelect,
  speakerSelect: els.speakerSelect,
  micMeter: els.micMeter,
  rawAudioToggle: els.rawAudioToggle,
  onStatus: (msg) => {
    els.audioStatus.textContent = msg;
  },
});

const soundboard = new SoundboardController({
  onCueChange: (cue) => {
    els.musicCueStatus.textContent = cue.playing ? `Tocando: ${cue.title}` : `Pausado: ${cue.title}`;
    if (currentRole === 'gm') {
      peerManager.broadcast(MSG.AUDIO_CUE, cue);
    }
  },
});

const initiative = new InitiativeTracker();
const handoutModal = new HandoutModal({
  modalEl: els.handoutModal,
  titleEl: els.handoutModalTitle,
  textEl: els.handoutModalText,
  imgEl: els.handoutModalImg,
  closeBtn: els.btnCloseHandout,
});

const vtt = new VttBoard(els.vttCanvas, {
  onTokenMove: (id, x, y) => {
    if (currentRole === 'gm') {
      peerManager.broadcast(MSG.TOKEN_MOVE, { id, x, y });
      persistCampaign();
    } else {
      peerManager.sendToPeer('gm', MSG.TOKEN_MOVE, { id, x, y }, 'player');
    }
  },
  onFogChange: (update) => {
    if (currentRole === 'gm') {
      peerManager.broadcast(MSG.FOG_UPDATE, update);
      persistCampaign();
    }
  },
  onPing: (x, y) => {
    if (currentRole === 'gm') {
      peerManager.broadcast(MSG.PING_POINTER, { x, y });
    } else {
      peerManager.sendToPeer('gm', MSG.PING_POINTER, { x, y }, 'player');
    }
  },
});

const peerManager = new PeerManager({
  voice,
  soundboard,
  getIceConfig: () => ({
    turnUrl: els.turnUrl.value.trim(),
    turnUser: els.turnUser.value.trim(),
    turnPass: els.turnPass.value,
  }),
  getPtime10: () => els.ptime10Toggle.checked,
  onPeersChanged: (list) => renderPeers(list),
  onRpgMessage: (fromPeerId, msg) => handleRpgMessage(fromPeerId, msg),
  onAssetReceived: (_fromPeerId, asset) => handleAssetReceived(asset),
  onRemoteScreenTrack: (_peerId, stream) => {
    els.remoteVideo.srcObject = stream;
    els.remoteVideo.volume = parseFloat(els.screenVolume.value);
    els.remoteScreenBox.classList.add('active');
    if (els.speakerSelect.value && typeof els.remoteVideo.setSinkId === 'function') {
      els.remoteVideo.setSinkId(els.speakerSelect.value).catch(() => {});
    }
  },
  onRemoteScreenStopped: () => {
    els.remoteVideo.srcObject = null;
    els.remoteScreenBox.classList.remove('active');
  },
  onRemoteAudioTrack: (peerId, stream) => {
    remoteStreams.set(peerId, stream);
    els.remoteAudio.srcObject = stream;
    els.remoteAudio.volume = parseFloat(els.remoteVolume.value);
    if (els.speakerSelect.value && typeof els.remoteAudio.setSinkId === 'function') {
      els.remoteAudio.setSinkId(els.speakerSelect.value).catch(() => {});
    }
  },
  onRemoteSoundboardTrack: (_peerId, stream) => {
    els.remoteSoundboardAudio.srcObject = stream;
    els.remoteSoundboardAudio.volume = parseFloat(els.sbRemoteVolume.value);
    if (els.speakerSelect.value && typeof els.remoteSoundboardAudio.setSinkId === 'function') {
      els.remoteSoundboardAudio.setSinkId(els.speakerSelect.value).catch(() => {});
    }
  },
  onStats: (s) => {
    els.statRtt.textContent = `${s.rttMs} ms`;
    els.statJitter.textContent = `${s.jitterMs} ms`;
    els.statLoss.textContent = s.lossText;
    els.statBitrate.textContent = `${s.audioKbps} kbps`;
    els.statRoute.textContent = s.route;
    if (s.videoOut) {
      els.screenStatus.textContent = `Enviando ${s.videoOut.w}x${s.videoOut.h} • ${s.videoOut.fps} fps • encoder: ${s.videoOut.enc} • ${s.videoOut.why}`;
    }
    if (s.videoIn) {
      els.videoStatsText.textContent = `${s.videoIn.w}x${s.videoIn.h} • ${s.videoIn.fps} fps • ${s.videoIn.kbps} kbps • Perda vídeo: ${s.videoIn.lost}`;
    }
  },
});

function renderPeers(list) {
  const connected = list.filter((p) => p.iceState === 'connected' || p.iceState === 'completed');
  if (connected.length > 0) {
    setBadge(`Conectado P2P (${connected.length})`, 'ok');
    els.btnHangup.disabled = false;
    els.btnShareScreen.disabled = Boolean(peerManager.screenStream);
    els.screenStatus.textContent = 'Pronto! Você pode compartilhar a tela com preview local.';
    if (connected[0].sasCode) {
      els.sasBadge.textContent = `Segurança: ${connected[0].sasCode}`;
      els.sasBadge.style.display = 'inline-flex';
    }
  } else if (list.length > 0) {
    setBadge('Conectando P2P...', 'warn');
  } else {
    setBadge('Desconectado', '');
    els.sasBadge.style.display = 'none';
  }

  els.peerListBox.innerHTML = '';
  if (list.length === 0) {
    els.peerListBox.innerHTML = '<div class="hint">Nenhum jogador conectado ainda.</div>';
    return;
  }
  list.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'peer-item';
    row.innerHTML = `<span><strong>${escapeHtml(p.label)}</strong> • ${p.iceState} • SAS: ${p.sasCode || '--'}</span>`;
    const btn = document.createElement('button');
    btn.className = 'danger';
    btn.textContent = 'Remover';
    btn.onclick = () => peerManager.closePeer(p.id);
    row.appendChild(btn);
    els.peerListBox.appendChild(row);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function handleRpgMessage(fromPeerId, msg) {
  switch (msg.type) {
    case MSG.PEER_HELLO: {
      if (currentRole === 'gm') {
        peerManager.sendToPeer(fromPeerId, MSG.STATE_SNAPSHOT, {
          vtt: vtt.getState(),
          initiative: initiative.getState(),
        });
        if (vtt.mapAssetId) {
          const saved = await loadAssetBlob(vtt.mapAssetId);
          if (saved) {
            await peerManager.sendAssetToPeer(fromPeerId, saved.assetId, saved.mime, new Uint8Array(saved.bytes));
          }
        }
      }
      break;
    }
    case MSG.STATE_SNAPSHOT: {
      vtt.applyState(msg.payload?.vtt);
      initiative.setState(msg.payload?.initiative);
      renderInitiative();
      break;
    }
    case MSG.SCENE_SET: {
      vtt.applyState(msg.payload);
      break;
    }
    case MSG.FOG_UPDATE: {
      vtt.applyFogUpdate(msg.payload);
      break;
    }
    case MSG.TOKEN_UPSERT: {
      vtt.upsertToken(msg.payload);
      break;
    }
    case MSG.TOKEN_MOVE: {
      const { id, x, y } = msg.payload || {};
      vtt.moveToken(id, x, y);
      if (currentRole === 'gm') {
        peerManager.broadcast(MSG.TOKEN_MOVE, { id, x, y }, fromPeerId);
        persistCampaign();
      }
      break;
    }
    case MSG.TOKEN_REMOVE: {
      vtt.removeToken(msg.payload?.id);
      break;
    }
    case MSG.PING_POINTER: {
      const { x, y } = msg.payload || {};
      vtt.addPing(x, y);
      if (currentRole === 'gm') {
        peerManager.broadcast(MSG.PING_POINTER, { x, y }, fromPeerId);
      }
      break;
    }
    case MSG.DICE_ROLL: {
      const entry = msg.payload;
      if (entry.visibility === 'gm' && currentRole !== 'gm') return;
      appendDiceLog(entry);
      if (currentRole === 'gm' && entry.visibility !== 'gm') {
        peerManager.broadcast(MSG.DICE_ROLL, entry, fromPeerId);
      }
      break;
    }
    case MSG.INITIATIVE_UPDATE: {
      initiative.setState(msg.payload);
      renderInitiative();
      break;
    }
    case MSG.HANDOUT_SHOW: {
      const { assetId, title, text } = msg.payload || {};
      if (assetId) {
        pendingHandoutMeta.set(assetId, { title, text });
      } else {
        handoutModal.showText(title, text);
      }
      break;
    }
    case MSG.AUDIO_CUE: {
      const cue = msg.payload || {};
      els.musicCueStatus.textContent = cue.playing ? `Tocando: ${cue.title}` : `Pausado: ${cue.title}`;
      break;
    }
    default:
      break;
  }
}

function handleAssetReceived(asset) {
  if (asset.assetId.startsWith('map-')) {
    vtt.setMapBlob(asset.assetId, asset.mime, asset.bytes);
  } else if (asset.assetId.startsWith('handout-')) {
    const meta = pendingHandoutMeta.get(asset.assetId) || { title: 'Handout', text: '' };
    pendingHandoutMeta.delete(asset.assetId);
    handoutModal.showImage(meta.title, asset.mime, asset.bytes, meta.text);
  }
}

function appendDiceLog({ who, summary, visibility }) {
  const div = document.createElement('div');
  div.className = 'log-item' + (visibility === 'gm' ? ' gm-secret' : '');
  const tag = visibility === 'gm' ? ' [Oculto GM]' : '';
  div.textContent = `${who}${tag}: ${summary}`;
  els.diceLog.prepend(div);
}

function renderInitiative() {
  els.roundNum.textContent = String(initiative.round);
  els.initList.innerHTML = '';
  initiative.entries.forEach((e, idx) => {
    const row = document.createElement('div');
    row.className = 'init-row' + (idx === initiative.activeIndex ? ' active-turn' : '');
    row.innerHTML = `<span>${idx === initiative.activeIndex ? '▶ ' : ''}${escapeHtml(e.name)} (${e.init})</span>`;
    if (currentRole === 'gm') {
      const del = document.createElement('button');
      del.className = 'secondary';
      del.textContent = '×';
      del.style.padding = '1px 6px';
      del.onclick = () => {
        initiative.remove(e.id);
        syncInitiative();
      };
      row.appendChild(del);
    }
    els.initList.appendChild(row);
  });
}

function syncInitiative() {
  renderInitiative();
  if (currentRole === 'gm') {
    peerManager.broadcast(MSG.INITIATIVE_UPDATE, initiative.getState());
    persistCampaign();
  }
}

async function persistCampaign() {
  if (currentRole !== 'gm') return;
  await saveKV('campaign_state', {
    vtt: vtt.getState(),
    initiative: initiative.getState(),
    notes: els.gmNotes.value,
  }).catch(() => {});
}

async function restoreCampaign() {
  const saved = await loadKV('campaign_state', null).catch(() => null);
  if (!saved) return;
  if (saved.vtt) {
    vtt.applyState(saved.vtt);
    els.fogEnabledToggle.checked = Boolean(vtt.fogEnabled);
    els.gridToggle.checked = Boolean(vtt.showGrid);
    els.snapToggle.checked = Boolean(vtt.snapToGrid);
    if (saved.vtt.mapAssetId) {
      const mapBlob = await loadAssetBlob(saved.vtt.mapAssetId).catch(() => null);
      if (mapBlob) vtt.setMapBlob(mapBlob.assetId, mapBlob.mime, new Uint8Array(mapBlob.bytes));
    }
  }
  if (saved.initiative) {
    initiative.setState(saved.initiative);
    renderInitiative();
  }
  if (typeof saved.notes === 'string') els.gmNotes.value = saved.notes;
}

// Abas
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'vtt') vtt.resize();
  });
});

window.addEventListener('resize', () => vtt.resize());

// Papel GM vs Player
function applyRoleUi(role) {
  currentRole = role === 'player' ? 'player' : 'gm';
  peerManager.setRole(currentRole);
  vtt.setRole(currentRole);
  els.gmConnectCard.style.display = currentRole === 'gm' ? 'block' : 'none';
  els.playerConnectCard.style.display = currentRole === 'player' ? 'block' : 'none';
  document.querySelectorAll('.gm-only').forEach((el) => {
    el.style.display = currentRole === 'gm' ? '' : 'none';
  });
}
els.roleSelect.addEventListener('change', () => applyRoleUi(els.roleSelect.value));

// Microfone e Mute
async function handleStartMic() {
  try {
    const stream = await voice.startMicrophone();
    peerManager.replaceLocalVoiceTrack(stream.getAudioTracks()[0]);
    els.btnMute.textContent = 'Mutar (M)';
    els.btnMute.className = 'secondary';
    els.btnMute.disabled = false;
    els.btnCreateOffer.disabled = false;
    els.btnCreateAnswer.disabled = false;
  } catch (err) {
    els.audioStatus.textContent = 'Erro ao acessar microfone: ' + err.message;
  }
}

els.btnStartMic.addEventListener('click', handleStartMic);
els.rawAudioToggle.addEventListener('change', () => {
  if (voice.localStream) handleStartMic();
});
els.micSelect.addEventListener('change', () => {
  if (voice.localStream) handleStartMic();
});
els.speakerSelect.addEventListener('change', () => {
  [els.remoteAudio, els.remoteVideo, els.remoteSoundboardAudio].forEach((el) => {
    if (typeof el.setSinkId === 'function') el.setSinkId(els.speakerSelect.value).catch(() => {});
  });
});
els.remoteVolume.addEventListener('input', () => {
  els.remoteAudio.volume = parseFloat(els.remoteVolume.value);
});
els.sbRemoteVolume.addEventListener('input', () => {
  els.remoteSoundboardAudio.volume = parseFloat(els.sbRemoteVolume.value);
});
els.screenVolume.addEventListener('input', () => {
  els.remoteVideo.volume = parseFloat(els.screenVolume.value);
});

function handleToggleMute() {
  if (!voice.localStream) return;
  const muted = voice.toggleMute();
  els.btnMute.textContent = muted ? 'Desmutar (M)' : 'Mutar (M)';
  els.btnMute.className = muted ? 'danger' : 'secondary';
}
els.btnMute.addEventListener('click', handleToggleMute);
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'm' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    handleToggleMute();
  }
});

// Sinalização GM
els.btnCreateOffer.addEventListener('click', async () => {
  els.btnCreateOffer.disabled = true;
  setBadge('Gerando convite...', 'warn');
  const peerId = `player-${Date.now().toString(36)}`;
  const label = els.newPeerName.value.trim() || `Jogador ${peerManager.peers.size + 1}`;
  pendingOfferPeerId = peerId;
  els.offerOut.value = await peerManager.createInvite(peerId, label);
  els.btnCopyOffer.disabled = false;
  els.btnAcceptAnswer.disabled = false;
  els.btnCreateOffer.disabled = false;
  setBadge('Aguardando resposta...', 'warn');
});

els.btnCopyOffer.addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.offerOut.value);
  els.btnCopyOffer.textContent = 'Copiado!';
  setTimeout(() => (els.btnCopyOffer.textContent = 'Copiar'), 1500);
});

els.btnAcceptAnswer.addEventListener('click', async () => {
  try {
    if (!pendingOfferPeerId) throw new Error('Gere um convite primeiro.');
    await peerManager.acceptAnswer(pendingOfferPeerId, els.answerIn.value);
    els.answerIn.value = '';
    els.offerOut.value = '';
    els.btnAcceptAnswer.disabled = true;
    pendingOfferPeerId = null;
  } catch (err) {
    alert('Código de resposta inválido: ' + err.message);
  }
});

// Sinalização Player
els.btnCreateAnswer.addEventListener('click', async () => {
  try {
    els.btnCreateAnswer.disabled = true;
    setBadge('Gerando resposta...', 'warn');
    els.answerOut.value = await peerManager.acceptInviteAndCreateAnswer(els.offerIn.value, 'Mestre');
    els.btnCopyAnswer.disabled = false;
    els.btnCreateAnswer.disabled = false;
    setBadge('Resposta pronta — envie ao Mestre', 'warn');
  } catch (err) {
    els.btnCreateAnswer.disabled = false;
    alert('Convite inválido: ' + err.message);
  }
});

els.btnCopyAnswer.addEventListener('click', async () => {
  await navigator.clipboard.writeText(els.answerOut.value);
  els.btnCopyAnswer.textContent = 'Copiado!';
  setTimeout(() => (els.btnCopyAnswer.textContent = 'Copiar Resposta'), 1500);
});

// Compartilhamento de Tela + Preview Local Mutado
els.btnShareScreen.addEventListener('click', async () => {
  try {
    const stream = await peerManager.startScreenShare({
      preset: els.screenPreset.value,
      mode: els.screenMode.value,
      codec: els.screenCodec.value,
      includeAudio: els.screenAudioToggle.checked,
      onLocalEnded: clearLocalScreenPreview,
    });
    els.localScreenPreview.srcObject = stream;
    els.localScreenPreview.muted = true;
    els.localScreenBox.classList.add('active');
    els.btnShareScreen.disabled = true;
    els.btnStopScreen.disabled = false;
    els.screenStatus.textContent = 'Transmitindo tela com preview local mutado.';
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      els.screenStatus.textContent = 'Erro ao compartilhar tela: ' + err.message;
    }
  }
});

function clearLocalScreenPreview() {
  els.localScreenPreview.srcObject = null;
  els.localScreenBox.classList.remove('active');
  els.btnShareScreen.disabled = !peerManager.hasConnectedPeers();
  els.btnStopScreen.disabled = true;
  els.screenStatus.textContent = 'Transmissão encerrada.';
}

els.btnStopScreen.addEventListener('click', () => {
  peerManager.stopScreenShare();
  clearLocalScreenPreview();
});

els.btnToggleLocalPreview.addEventListener('click', () => {
  const hidden = els.localScreenPreview.style.display === 'none';
  els.localScreenPreview.style.display = hidden ? 'block' : 'none';
  els.btnToggleLocalPreview.textContent = hidden ? 'Ocultar Preview' : 'Mostrar Preview';
});

els.btnFullscreen.addEventListener('click', () => {
  if (els.remoteVideo.requestFullscreen) els.remoteVideo.requestFullscreen();
});

els.btnHangup.addEventListener('click', () => {
  peerManager.hangupAll();
  clearLocalScreenPreview();
  els.remoteAudio.srcObject = null;
  els.remoteSoundboardAudio.srcObject = null;
  els.remoteVideo.srcObject = null;
  els.remoteScreenBox.classList.remove('active');
  els.btnHangup.disabled = true;
  els.btnShareScreen.disabled = true;
  els.statRtt.textContent = '-- ms';
  els.statJitter.textContent = '-- ms';
  els.statLoss.textContent = '--';
  els.statBitrate.textContent = '-- kbps';
  els.statRoute.textContent = '--';
});

// Ferramentas VTT
document.querySelectorAll('[data-tool]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-tool]').forEach((b) => b.classList.remove('active-tool'));
    btn.classList.add('active-tool');
    vtt.setTool(btn.dataset.tool);
  });
});

els.gridToggle.addEventListener('change', () => {
  vtt.showGrid = els.gridToggle.checked;
  if (currentRole === 'gm') {
    peerManager.broadcast(MSG.SCENE_SET, { showGrid: vtt.showGrid });
    persistCampaign();
  }
});

els.snapToggle.addEventListener('change', () => {
  vtt.snapToGrid = els.snapToggle.checked;
});

els.fogEnabledToggle.addEventListener('change', () => {
  vtt.fogEnabled = els.fogEnabledToggle.checked;
  if (currentRole === 'gm') {
    peerManager.broadcast(MSG.SCENE_SET, { fogEnabled: vtt.fogEnabled });
    persistCampaign();
  }
});

els.btnFogCover.addEventListener('click', () => {
  vtt.fogEnabled = true;
  els.fogEnabledToggle.checked = true;
  vtt.applyFogUpdate({ op: 'cover-all' });
  peerManager.broadcast(MSG.SCENE_SET, { fogEnabled: true });
  peerManager.broadcast(MSG.FOG_UPDATE, { op: 'cover-all' });
  persistCampaign();
});

els.btnFogClear.addEventListener('click', () => {
  vtt.applyFogUpdate({ op: 'reset' });
  peerManager.broadcast(MSG.FOG_UPDATE, { op: 'reset' });
  persistCampaign();
});

els.btnLoadMap.addEventListener('click', () => els.mapFileInput.click());
els.mapFileInput.addEventListener('change', async () => {
  const file = els.mapFileInput.files?.[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const assetId = `map-${Date.now()}`;
  const mime = file.type || 'image/png';
  vtt.setMapBlob(assetId, mime, bytes);
  await saveAssetBlob(assetId, mime, bytes);
  await persistCampaign();
  await peerManager.broadcastAsset(assetId, mime, bytes);
  peerManager.broadcast(MSG.SCENE_SET, { mapAssetId: assetId, showGrid: vtt.showGrid, fogEnabled: vtt.fogEnabled });
  els.mapFileInput.value = '';
});

els.btnAddToken.addEventListener('click', () => {
  const name = prompt('Nome do Token:', 'Herói');
  if (!name) return;
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#a855f7'];
  const token = {
    id: `tok-${Date.now().toString(36)}`,
    name: name.trim(),
    x: vtt.gridSize * 2 + vtt.gridSize / 2,
    y: vtt.gridSize * 2 + vtt.gridSize / 2,
    size: 1,
    color: colors[vtt.tokens.size % colors.length],
    hidden: false,
  };
  vtt.upsertToken(token);
  peerManager.broadcast(MSG.TOKEN_UPSERT, token);
  persistCampaign();
});

// Rolador de Dados
function doRoll(expr) {
  try {
    const res = parseAndRoll(expr);
    const summary = formatRollSummary(res);
    const visibility = currentRole === 'gm' && els.gmSecretRoll.checked ? 'gm' : 'public';
    const who = currentRole === 'gm' ? 'Mestre' : els.playerNameInput.value.trim() || 'Jogador';
    const payload = { who, summary, visibility };
    appendDiceLog(payload);
    if (visibility === 'public') {
      if (currentRole === 'gm') peerManager.broadcast(MSG.DICE_ROLL, payload);
      else peerManager.sendToPeer('gm', MSG.DICE_ROLL, payload, 'player');
    }
  } catch (err) {
    alert(err.message);
  }
}

els.btnRollDice.addEventListener('click', () => doRoll(els.diceExpr.value));
els.diceExpr.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doRoll(els.diceExpr.value);
});
document.querySelectorAll('.quick-die').forEach((btn) => {
  btn.addEventListener('click', () => doRoll(btn.dataset.expr));
});

// Iniciativa
els.btnAddInit.addEventListener('click', () => {
  if (!els.initName.value.trim()) return;
  initiative.add(els.initName.value.trim(), els.initVal.value || 10);
  els.initName.value = '';
  els.initVal.value = '';
  syncInitiative();
});
els.btnNextTurn.addEventListener('click', () => {
  initiative.nextTurn();
  syncInitiative();
});
els.btnResetInit.addEventListener('click', () => {
  initiative.reset();
  syncInitiative();
});

// Handouts & Notas
els.btnSendHandoutText.addEventListener('click', () => {
  const title = els.handoutTitle.value.trim() || 'Handout';
  const text = els.handoutText.value.trim();
  if (!text) return;
  peerManager.broadcast(MSG.HANDOUT_SHOW, { title, text });
  handoutModal.showText(title, text);
});

els.btnSendHandoutImg.addEventListener('click', () => els.handoutImgInput.click());
els.handoutImgInput.addEventListener('change', async () => {
  const file = els.handoutImgInput.files?.[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const assetId = `handout-${Date.now()}`;
  const mime = file.type || 'image/png';
  const title = els.handoutTitle.value.trim() || file.name;
  const text = els.handoutText.value.trim();
  peerManager.broadcast(MSG.HANDOUT_SHOW, { assetId, title, text });
  await peerManager.broadcastAsset(assetId, mime, bytes);
  handoutModal.showImage(title, mime, bytes, text);
  els.handoutImgInput.value = '';
});

els.gmNotes.addEventListener('input', () => persistCampaign());

// Soundboard
els.btnLoadMusic.addEventListener('click', () => els.musicFileInput.click());
els.musicFileInput.addEventListener('change', () => {
  const file = els.musicFileInput.files?.[0];
  if (file) soundboard.loadMusicFile(file);
});
els.btnPlayMusic.addEventListener('click', () => soundboard.playMusic().catch(() => {}));
els.btnPauseMusic.addEventListener('click', () => soundboard.pauseMusic());
els.musicLoopToggle.addEventListener('change', () => soundboard.setMusicLoop(els.musicLoopToggle.checked));
els.sbMasterVol.addEventListener('input', () => soundboard.setMasterVolume(els.sbMasterVol.value));
els.sbLocalPreview.addEventListener('change', () => soundboard.setLocalPreview(els.sbLocalPreview.checked));

document.querySelectorAll('.sfx-builtin').forEach((btn) => {
  btn.addEventListener('click', () => soundboard.triggerBuiltInSfx(btn.dataset.sfx));
});

els.btnAddSfx.addEventListener('click', () => els.sfxFileInput.click());
els.sfxFileInput.addEventListener('change', () => {
  Array.from(els.sfxFileInput.files || []).forEach((file) => {
    const entry = soundboard.addSfxFile(file);
    const btn = document.createElement('button');
    btn.textContent = entry.name;
    btn.onclick = () => soundboard.triggerSfx(entry.id).catch(() => {});
    els.customSfxList.appendChild(btn);
  });
  els.sfxFileInput.value = '';
});

// Inicialização
applyRoleUi('gm');
voice.loadDevices().catch(() => {});
restoreCampaign();
