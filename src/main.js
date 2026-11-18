import { VoiceController } from './audio/voice.js';
import { SoundboardController } from './audio/soundboard.js';
import { PeerManager } from './net/peer-manager.js';
import { MSG } from './net/protocol.js';
import { formatRollSummary, parseAndRoll } from './rpg/dice.js';
import { Dice3DOverlay } from './rpg/dice3d.js';
import { parseChatCommand, renderFormattedText } from './rpg/chat.js';
import { addMacroToSheet, calcDndMod, canEditSheet, createDefaultSheet, formatMod, removeMacroFromSheet } from './rpg/sheets.js';
import { PdfSheetViewer } from './rpg/pdf-sheet.js';
import { SceneManager } from './rpg/scenes.js';
import { InitiativeTracker } from './rpg/initiative.js';
import { HandoutModal } from './rpg/handouts.js';
import { VttBoard } from './rpg/vtt.js';
import { deleteAssetBlob, loadAssetBlob, loadKV, saveAssetBlob, saveKV } from './storage/db.js';
import { exportCampaignBundle, importCampaignBundle } from './storage/backup.js';

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
  voiceEffectSelect: $('voiceEffectSelect'),
  voiceMonitorToggle: $('voiceMonitorToggle'),
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
  rightSidebar: $('rightSidebar'),
  btnToggleSidebar: $('btnToggleSidebar'),
  layerSelect: $('layerSelect'),
  btnClearDraw: $('btnClearDraw'),
  btnZoomIn: $('btnZoomIn'),
  btnZoomOut: $('btnZoomOut'),
  btnZoomReset: $('btnZoomReset'),
  vttCanvas: $('vttCanvas'),
  dice3dCanvas: $('dice3dCanvas'),
  macroBar: $('macroBar'),
  fogEnabledToggle: $('fogEnabledToggle'),
  lightingToggle: $('lightingToggle'),
  btnClearWalls: $('btnClearWalls'),
  gridToggle: $('gridToggle'),
  snapToggle: $('snapToggle'),
  mapFileInput: $('mapFileInput'),
  btnLoadMap: $('btnLoadMap'),
  btnClearMap: $('btnClearMap'),
  allowAllTokensToggle: $('allowAllTokensToggle'),
  btnAddToken: $('btnAddToken'),
  bottomPlayersBar: $('bottomPlayersBar'),
  btnFogCover: $('btnFogCover'),
  btnFogClear: $('btnFogClear'),
  diceExpr: $('diceExpr'),
  btnRollDice: $('btnRollDice'),
  gmSecretRoll: $('gmSecretRoll'),
  diceLog: $('diceLog'),
  rpChatLog: $('rpChatLog'),
  rpChatInput: $('rpChatInput'),
  btnSendChat: $('btnSendChat'),
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

  // Cenas, Fichas & Backup
  sceneSelector: $('sceneSelector'),
  btnNewScene: $('btnNewScene'),
  btnDeleteScene: $('btnDeleteScene'),
  gridSizeInput: $('gridSizeInput'),
  scaleMetersInput: $('scaleMetersInput'),
  sheetSelector: $('sheetSelector'),
  sheetTemplateSelect: $('sheetTemplateSelect'),
  sheetOwnerSelect: $('sheetOwnerSelect'),
  btnNewSheet: $('btnNewSheet'),
  pdfSheetFileInput: $('pdfSheetFileInput'),
  btnImportPdfSheet: $('btnImportPdfSheet'),
  btnExportSheet: $('btnExportSheet'),
  importSheetInput: $('importSheetInput'),
  btnImportSheet: $('btnImportSheet'),
  sheetEditorContainer: $('sheetEditorContainer'),
  pdfSheetContainer: $('pdfSheetContainer'),
  btnExportCampaign: $('btnExportCampaign'),
  importCampaignInput: $('importCampaignInput'),
  btnImportCampaign: $('btnImportCampaign'),

  // Menu Contextual & Modal Token
  tokenContextMenu: $('tokenContextMenu'),
  ctxEditToken: $('ctxEditToken'),
  ctxToggleLayer: $('ctxToggleLayer'),
  ctxDuplicateToken: $('ctxDuplicateToken'),
  ctxDeleteToken: $('ctxDeleteToken'),
  tokenEditModal: $('tokenEditModal'),
  btnCloseTokenModal: $('btnCloseTokenModal'),
  tokEditName: $('tokEditName'),
  tokEditHp: $('tokEditHp'),
  tokEditHpMax: $('tokEditHpMax'),
  tokEditSize: $('tokEditSize'),
  tokEditCond: $('tokEditCond'),
  tokEditOwner: $('tokEditOwner'),
  tokEditImgInput: $('tokEditImgInput'),
  btnSaveTokenModal: $('btnSaveTokenModal'),

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
let myPeerId = 'gm';
let roleLocked = false;
let pendingOfferPeerId = null;
const pendingHandoutMeta = new Map(); // assetId -> { title, text }
const remoteStreams = new Map();
const profiles = new Map(); // peerId -> { id, name }
const sheets = new Map(); // sheetId -> sheetObj
let activeSheetId = null;
let ctxTargetTokenId = null;
let editingTokenId = null;
const sceneManager = new SceneManager();
const dice3d = new Dice3DOverlay(els.dice3dCanvas);
const pdfViewer = new PdfSheetViewer(els.pdfSheetContainer, {
  onSave: (updatedSheet) => {
    sheets.set(updatedSheet.id, updatedSheet);
    broadcastSheet(updatedSheet);
    alert('Ficha PDF salva e sincronizada!');
  },
});

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
  onWallChange: (update) => {
    if (currentRole === 'gm') {
      peerManager.broadcast(MSG.WALL_UPDATE, update);
      persistCampaign();
    }
  },
  onDrawChange: (update) => {
    if (currentRole === 'gm') {
      peerManager.broadcast(MSG.DRAW_UPDATE, update);
      persistCampaign();
    } else {
      peerManager.sendToPeer('gm', MSG.DRAW_UPDATE, update, 'player');
    }
  },
  onPing: (x, y) => {
    if (currentRole === 'gm') {
      peerManager.broadcast(MSG.PING_POINTER, { x, y });
    } else {
      peerManager.sendToPeer('gm', MSG.PING_POINTER, { x, y }, 'player');
    }
  },
  onTokenContextMenu: (token, clientX, clientY) => {
    if (currentRole !== 'gm') return;
    ctxTargetTokenId = token.id;
    els.tokenContextMenu.style.left = `${Math.min(window.innerWidth - 190, clientX)}px`;
    els.tokenContextMenu.style.top = `${Math.min(window.innerHeight - 160, clientY)}px`;
    els.tokenContextMenu.style.display = 'flex';
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
    profiles.set(p.id, { id: p.id, name: p.label });
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
  renderOwnerSelects();
  renderBottomPlayersBar(list);
}

function renderBottomPlayersBar(list = []) {
  const names = list
    .filter((p) => p.iceState === 'connected' || p.iceState === 'completed')
    .map((p) => `🟢 ${p.label}`);
  els.bottomPlayersBar.textContent =
    names.length > 0 ? `Mesa: ${names.join(' • ')}` : 'Pronto • Arraste tokens (esq.), mova câmera (dir./meio), zoom (scroll)';
}

function renderOwnerSelects() {
  const opts = [{ id: '', label: 'Todos / Sem vínculo' }];
  for (const [id, prof] of profiles.entries()) {
    if (id !== 'gm') opts.push({ id, label: `${prof.name} (${id.slice(-4)})` });
  }
  [els.sheetOwnerSelect, els.tokEditOwner].forEach((sel) => {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    opts.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function handleRpgMessage(fromPeerId, msg) {
  // Bloqueio autoritativo: jogadores não podem emitir comandos exclusivos de Mestre
  const gmOnlyTypes = new Set([
    MSG.SCENE_SET,
    MSG.SCENE_DELETE,
    MSG.FOG_UPDATE,
    MSG.WALL_UPDATE,
    MSG.INITIATIVE_UPDATE,
    MSG.HANDOUT_SHOW,
    MSG.AUDIO_CUE,
  ]);
  if (currentRole === 'gm' && fromPeerId !== 'gm' && gmOnlyTypes.has(msg.type)) {
    console.warn(`Comando privilegiado ${msg.type} bloqueado para peer ${fromPeerId}`);
    return;
  }

  switch (msg.type) {
    case MSG.PEER_HELLO: {
      if (currentRole === 'gm') {
        sceneManager.updateActiveFromVtt(vtt.getState());
        peerManager.sendToPeer(fromPeerId, MSG.STATE_SNAPSHOT, {
          assignedPeerId: fromPeerId,
          vtt: vtt.getState(),
          allowAllTokensMove: vtt.allowAllTokensMove,
          initiative: initiative.getState(),
          sheets: Array.from(sheets.values()),
        });
        if (vtt.mapAssetId) {
          const saved = await loadAssetBlob(vtt.mapAssetId);
          if (saved) {
            await peerManager.sendAssetToPeer(fromPeerId, saved.assetId, saved.mime, new Uint8Array(saved.bytes));
          }
        }
        // Envia ícones de tokens e PDFs de fichas vinculadas
        for (const t of vtt.tokens.values()) {
          if (t.avatarAssetId) {
            const img = await loadAssetBlob(t.avatarAssetId);
            if (img) await peerManager.sendAssetToPeer(fromPeerId, img.assetId, img.mime, new Uint8Array(img.bytes));
          }
        }
        for (const s of sheets.values()) {
          if (s.pdfAssetId) {
            const pdf = await loadAssetBlob(s.pdfAssetId);
            if (pdf) await peerManager.sendAssetToPeer(fromPeerId, pdf.assetId, pdf.mime, new Uint8Array(pdf.bytes));
          }
        }
      }
      break;
    }
    case MSG.PROFILE_UPDATE: {
      if (msg.payload?.name && currentRole === 'gm') {
        profiles.set(fromPeerId, { id: fromPeerId, name: msg.payload.name });
        const s = peerManager.peers.get(fromPeerId);
        if (s) s.label = msg.payload.name;
        renderPeers(peerManager.getPeerSummaries());
      }
      break;
    }
    case MSG.STATE_SNAPSHOT: {
      if (msg.payload?.assignedPeerId) {
        myPeerId = msg.payload.assignedPeerId;
        vtt.setRole(currentRole, myPeerId);
      }
      if (typeof msg.payload?.allowAllTokensMove === 'boolean') {
        vtt.allowAllTokensMove = msg.payload.allowAllTokensMove;
      }
      vtt.applyState(msg.payload?.vtt);
      initiative.setState(msg.payload?.initiative);
      if (Array.isArray(msg.payload?.sheets)) {
        msg.payload.sheets.forEach((s) => sheets.set(s.id, s));
        renderSheetSelector();
        renderActiveSheet();
      }
      renderInitiative();
      break;
    }
    case MSG.SCENE_SET: {
      if (msg.payload?.clearMap) vtt.clearMap();
      if (typeof msg.payload?.allowAllTokensMove === 'boolean') {
        vtt.allowAllTokensMove = msg.payload.allowAllTokensMove;
      }
      vtt.applyState(msg.payload);
      break;
    }
    case MSG.FOG_UPDATE: {
      vtt.applyFogUpdate(msg.payload);
      break;
    }
    case MSG.WALL_UPDATE: {
      vtt.applyWallUpdate(msg.payload);
      break;
    }
    case MSG.DRAW_UPDATE: {
      vtt.applyDrawUpdate(msg.payload);
      if (currentRole === 'gm') {
        peerManager.broadcast(MSG.DRAW_UPDATE, msg.payload, fromPeerId);
        persistCampaign();
      }
      break;
    }
    case MSG.TOKEN_UPSERT: {
      vtt.upsertToken(msg.payload);
      break;
    }
    case MSG.TOKEN_MOVE: {
      const { id, x, y } = msg.payload || {};
      if (currentRole === 'gm' && fromPeerId !== 'gm') {
        const target = vtt.tokens.get(id);
        if (!target || (!vtt.allowAllTokensMove && target.ownerId !== fromPeerId)) return;
      }
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
      if (entry.total != null) dice3d.trigger(entry.total);
      if (currentRole === 'gm' && entry.visibility !== 'gm') {
        peerManager.broadcast(MSG.DICE_ROLL, entry, fromPeerId);
      }
      break;
    }
    case MSG.CHAT_MSG: {
      const chatEntry = msg.payload;
      if (chatEntry.mode === 'whisper' && currentRole !== 'gm') return;
      appendChatLog(chatEntry);
      if (currentRole === 'gm' && chatEntry.mode !== 'whisper') {
        peerManager.broadcast(MSG.CHAT_MSG, chatEntry, fromPeerId);
      }
      break;
    }
    case MSG.SHEET_UPDATE: {
      const sheet = msg.payload;
      if (sheet?.id) {
        if (currentRole === 'gm' && fromPeerId !== 'gm' && sheet.ownerId && sheet.ownerId !== fromPeerId) {
          return;
        }
        sheets.set(sheet.id, sheet);
        renderSheetSelector();
        if (activeSheetId === sheet.id) renderActiveSheet();
        if (currentRole === 'gm') {
          peerManager.broadcast(MSG.SHEET_UPDATE, sheet, fromPeerId);
          persistCampaign();
        }
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

async function handleAssetReceived(asset) {
  if (asset.assetId.startsWith('map-')) {
    vtt.setMapBlob(asset.assetId, asset.mime, asset.bytes);
  } else if (asset.assetId.startsWith('tokimg-')) {
    vtt.setTokenImageBlob(asset.assetId, asset.mime, asset.bytes);
  } else if (asset.assetId.startsWith('sheetpdf-')) {
    await saveAssetBlob(asset.assetId, asset.mime, asset.bytes);
    const active = sheets.get(activeSheetId);
    if (active?.pdfAssetId === asset.assetId) renderActiveSheet();
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

function appendChatLog({ speaker, body, mode }) {
  const div = document.createElement('div');
  div.className = 'log-item' + (mode === 'whisper' ? ' gm-secret' : '');
  if (mode === 'action') {
    const em = document.createElement('em');
    em.textContent = `* ${speaker} `;
    renderFormattedText(em, body);
    div.appendChild(em);
  } else {
    const prefix = mode === 'ooc' ? '[OOC] ' : mode === 'whisper' ? '[Sussurro GM] ' : '';
    const strong = document.createElement('strong');
    strong.textContent = `${prefix}${speaker}: `;
    div.appendChild(strong);
    renderFormattedText(div, body);
  }
  els.rpChatLog.appendChild(div);
  els.rpChatLog.scrollTop = els.rpChatLog.scrollHeight;
}

function broadcastSheet(sheet) {
  if (currentRole === 'gm') {
    peerManager.broadcast(MSG.SHEET_UPDATE, sheet);
    persistCampaign();
  } else {
    peerManager.sendToPeer('gm', MSG.SHEET_UPDATE, sheet, 'player');
  }
}

function renderMacroBar() {
  els.macroBar.innerHTML = '';
  const sheet = sheets.get(activeSheetId);
  if (!sheet?.macros?.length) return;
  sheet.macros.forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = `${m.name} (${m.expr})`;
    btn.onclick = () => doRoll(m.expr);
    els.macroBar.appendChild(btn);
  });
}

function renderSceneSelector() {
  if (!els.sceneSelector) return;
  els.sceneSelector.innerHTML = '';
  for (const sc of sceneManager.list()) {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = sc.name + (sc.mapAssetId ? ' (com mapa)' : ' (grid)');
    els.sceneSelector.appendChild(opt);
  }
  els.sceneSelector.value = sceneManager.activeSceneId;
}

async function applySceneToVtt(scene, broadcast = false) {
  if (!scene) return;
  vtt.clearMap();
  vtt.applyState(scene);
  els.fogEnabledToggle.checked = Boolean(vtt.fogEnabled);
  els.lightingToggle.checked = Boolean(vtt.lightingEnabled);
  els.gridToggle.checked = Boolean(vtt.showGrid);
  els.snapToggle.checked = Boolean(vtt.snapToGrid);
  els.gridSizeInput.value = vtt.gridSize;
  els.scaleMetersInput.value = vtt.scaleMeters;

  if (scene.mapAssetId) {
    const mapBlob = await loadAssetBlob(scene.mapAssetId).catch(() => null);
    if (mapBlob) {
      vtt.setMapBlob(mapBlob.assetId, mapBlob.mime, new Uint8Array(mapBlob.bytes));
      if (broadcast) await peerManager.broadcastAsset(mapBlob.assetId, mapBlob.mime, new Uint8Array(mapBlob.bytes));
    }
  } else if (broadcast) {
    peerManager.broadcast(MSG.SCENE_SET, { clearMap: true });
  }

  for (const t of vtt.tokens.values()) {
    if (t.avatarAssetId && !vtt.tokenImages.has(t.avatarAssetId)) {
      const img = await loadAssetBlob(t.avatarAssetId).catch(() => null);
      if (img) vtt.setTokenImageBlob(img.assetId, img.mime, new Uint8Array(img.bytes));
    }
  }

  if (broadcast) {
    peerManager.broadcast(MSG.SCENE_SET, vtt.getState());
    persistCampaign();
  }
}

function renderSheetSelector() {
  const prev = activeSheetId;
  els.sheetSelector.innerHTML = '';
  for (const s of sheets.values()) {
    const opt = document.createElement('option');
    opt.value = s.id;
    const tag = s.template === 'pdf' ? 'PDF' : s.template === 'dnd5e' ? 'D&D 5e' : 'Genérica';
    opt.textContent = `${s.name} (${tag})`;
    els.sheetSelector.appendChild(opt);
  }
  if (prev && sheets.has(prev)) {
    activeSheetId = prev;
  } else {
    activeSheetId = sheets.keys().next().value || null;
  }
  if (activeSheetId) els.sheetSelector.value = activeSheetId;
  renderMacroBar();
}

async function renderActiveSheet() {
  const container = els.sheetEditorContainer;
  container.innerHTML = '';
  els.pdfSheetContainer.innerHTML = '';
  const sheet = sheets.get(activeSheetId);
  if (!sheet) {
    container.innerHTML = '<div class="hint">Clique em "+ Nova Ficha" para criar uma ficha.</div>';
    return;
  }
  if (els.sheetOwnerSelect) els.sheetOwnerSelect.value = sheet.ownerId || '';

  const editable = canEditSheet(sheet, currentRole, myPeerId);

  if (sheet.template === 'pdf') {
    const pdfBlob = sheet.pdfAssetId ? await loadAssetBlob(sheet.pdfAssetId).catch(() => null) : null;
    await pdfViewer.render(sheet, pdfBlob?.bytes || null, !editable);
    return;
  }

  // Card 1: Dados básicos e atributos
  const infoCard = document.createElement('fieldset');
  infoCard.className = 'card';
  infoCard.innerHTML = `<legend>${escapeHtml(sheet.name)} — Dados &amp; Atributos</legend>`;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = sheet.name;
  nameInput.onchange = () => {
    sheet.name = nameInput.value.trim() || 'Sem Nome';
    renderSheetSelector();
    broadcastSheet(sheet);
  };
  infoCard.appendChild(Object.assign(document.createElement('label'), { textContent: 'Nome do Personagem' }));
  infoCard.appendChild(nameInput);

  const vitalsRow = document.createElement('div');
  vitalsRow.className = 'row';
  vitalsRow.style.marginTop = '6px';
  const hpIn = document.createElement('input');
  hpIn.type = 'number';
  hpIn.value = sheet.hp;
  hpIn.style.width = '70px';
  hpIn.onchange = () => { sheet.hp = Number(hpIn.value); broadcastSheet(sheet); };
  const hpMaxIn = document.createElement('input');
  hpMaxIn.type = 'number';
  hpMaxIn.value = sheet.hpMax;
  hpMaxIn.style.width = '70px';
  hpMaxIn.onchange = () => { sheet.hpMax = Number(hpMaxIn.value); broadcastSheet(sheet); };
  vitalsRow.append('PV:', hpIn, '/', hpMaxIn);
  infoCard.appendChild(vitalsRow);

  if (sheet.template === 'dnd5e' && sheet.stats) {
    const statsGrid = document.createElement('div');
    statsGrid.className = 'stats-grid';
    statsGrid.style.marginTop = '8px';
    for (const [attr, val] of Object.entries(sheet.stats)) {
      const box = document.createElement('div');
      box.className = 'stat';
      const mod = calcDndMod(val);
      const lbl = document.createElement('div');
      lbl.className = 'stat-label';
      lbl.textContent = `${attr} (${formatMod(mod)})`;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = val;
      inp.onchange = () => {
        sheet.stats[attr] = Number(inp.value);
        renderActiveSheet();
        broadcastSheet(sheet);
      };
      const rollBtn = document.createElement('button');
      rollBtn.className = 'secondary';
      rollBtn.textContent = `Rolar 1d20${formatMod(mod)}`;
      rollBtn.style.marginTop = '4px';
      rollBtn.onclick = () => doRoll(`1d20${formatMod(mod)}`);
      box.append(lbl, inp, rollBtn);
      statsGrid.appendChild(box);
    }
    infoCard.appendChild(statsGrid);
  } else if (Array.isArray(sheet.customFields)) {
    sheet.customFields.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginTop = '6px';
      const l = document.createElement('input');
      l.type = 'text';
      l.value = f.label;
      l.style.flex = '1';
      l.onchange = () => { f.label = l.value; broadcastSheet(sheet); };
      const r = document.createElement('input');
      r.type = 'text';
      r.value = f.rollExpr;
      r.style.width = '90px';
      r.onchange = () => { f.rollExpr = r.value; broadcastSheet(sheet); };
      const btn = document.createElement('button');
      btn.textContent = 'Rolar';
      btn.onclick = () => doRoll(f.rollExpr);
      row.append(l, r, btn);
      infoCard.appendChild(row);
    });
  }

  // Card 2: Macros e Notas da Ficha
  const macroCard = document.createElement('fieldset');
  macroCard.className = 'card';
  macroCard.innerHTML = '<legend>Macros Rápidas &amp; Anotações</legend>';

  const addRow = document.createElement('div');
  addRow.className = 'row';
  const mName = document.createElement('input');
  mName.type = 'text';
  mName.placeholder = 'Nome (ex: Bola de Fogo)';
  mName.style.flex = '1';
  const mExpr = document.createElement('input');
  mExpr.type = 'text';
  mExpr.placeholder = '8d6';
  mExpr.style.width = '85px';
  const mAdd = document.createElement('button');
  mAdd.textContent = '+ Macro';
  mAdd.onclick = () => {
    if (!mName.value.trim() || !mExpr.value.trim()) return;
    addMacroToSheet(sheet, mName.value, mExpr.value);
    renderActiveSheet();
    renderMacroBar();
    broadcastSheet(sheet);
  };
  addRow.append(mName, mExpr, mAdd);
  macroCard.appendChild(addRow);

  const mList = document.createElement('div');
  mList.className = 'list-box';
  mList.style.marginTop = '6px';
  (sheet.macros || []).forEach((m) => {
    const r = document.createElement('div');
    r.className = 'init-row';
    const run = document.createElement('button');
    run.textContent = `${m.name} (${m.expr})`;
    run.onclick = () => doRoll(m.expr);
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = '×';
    del.onclick = () => {
      removeMacroFromSheet(sheet, m.id);
      renderActiveSheet();
      renderMacroBar();
      broadcastSheet(sheet);
    };
    r.append(run, del);
    mList.appendChild(r);
  });
  macroCard.appendChild(mList);

  const notesLbl = document.createElement('label');
  notesLbl.textContent = 'Inventário / Habilidades:';
  notesLbl.style.marginTop = '8px';
  const notesArea = document.createElement('textarea');
  notesArea.value = sheet.notes || '';
  notesArea.onchange = () => { sheet.notes = notesArea.value; broadcastSheet(sheet); };
  macroCard.append(notesLbl, notesArea);

  container.append(infoCard, macroCard);
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
  sceneManager.updateActiveFromVtt(vtt.getState());
  await saveKV('campaign_state', {
    scenesData: sceneManager.serialize(),
    allowAllTokensMove: vtt.allowAllTokensMove,
    initiative: initiative.getState(),
    sheets: Array.from(sheets.values()),
    notes: els.gmNotes.value,
  }).catch(() => {});
}

async function restoreCampaign() {
  const saved = await loadKV('campaign_state', null).catch(() => null);
  if (saved) {
    if (saved.scenesData) {
      sceneManager.restore(saved.scenesData);
      await applySceneToVtt(sceneManager.getActive(), false);
    } else if (saved.vtt) {
      vtt.applyState(saved.vtt);
      sceneManager.updateActiveFromVtt(vtt.getState());
      await applySceneToVtt(sceneManager.getActive(), false);
    }
    if (typeof saved.allowAllTokensMove === 'boolean') {
      vtt.allowAllTokensMove = saved.allowAllTokensMove;
      if (els.allowAllTokensToggle) els.allowAllTokensToggle.checked = saved.allowAllTokensMove;
    }
    if (saved.initiative) {
      initiative.setState(saved.initiative);
      renderInitiative();
    }
    if (Array.isArray(saved.sheets)) {
      saved.sheets.forEach((s) => sheets.set(s.id, s));
    }
    if (typeof saved.notes === 'string') els.gmNotes.value = saved.notes;
  }
  if (sheets.size === 0) {
    const def = createDefaultSheet('dnd5e', 'Mestre');
    sheets.set(def.id, def);
  }
  renderSceneSelector();
  renderOwnerSelects();
  renderSheetSelector();
  renderActiveSheet();
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
function applyRoleUi(role, locked = false) {
  if (roleLocked && role !== 'player') return;
  currentRole = role === 'player' ? 'player' : 'gm';
  if (locked) {
    roleLocked = true;
    els.roleSelect.value = currentRole;
    els.roleSelect.disabled = true;
  }
  peerManager.setRole(currentRole);
  vtt.setRole(currentRole, myPeerId);
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
  if (voice.rawMicStream) handleStartMic();
});
els.micSelect.addEventListener('change', () => {
  if (voice.rawMicStream) handleStartMic();
});
els.voiceEffectSelect.addEventListener('change', () => {
  const stream = voice.setVoiceEffect(els.voiceEffectSelect.value);
  if (stream) peerManager.replaceLocalVoiceTrack(stream.getAudioTracks()[0]);
});
els.voiceMonitorToggle.addEventListener('change', () => {
  const stream = voice.setLocalMonitor(els.voiceMonitorToggle.checked);
  if (stream) peerManager.replaceLocalVoiceTrack(stream.getAudioTracks()[0]);
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

// Sinalização Player (Convite travado como Jogador)
els.btnCreateAnswer.addEventListener('click', async () => {
  try {
    els.btnCreateAnswer.disabled = true;
    setBadge('Gerando resposta...', 'warn');
    const res = await peerManager.acceptInviteAndCreateAnswer(els.offerIn.value, 'Mestre');
    if (res.assignedPeerId) myPeerId = res.assignedPeerId;
    if (res.playerName && !els.playerNameInput.value.trim()) {
      els.playerNameInput.value = res.playerName;
    }
    applyRoleUi(res.lockedRole || 'player', true);
    els.answerOut.value = res.answerCode;
    els.btnCopyAnswer.disabled = false;
    els.btnCreateAnswer.disabled = false;
    setBadge('Resposta pronta — envie ao Mestre (Jogador)', 'warn');
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

els.lightingToggle.addEventListener('change', () => {
  vtt.lightingEnabled = els.lightingToggle.checked;
  if (currentRole === 'gm') {
    peerManager.broadcast(MSG.SCENE_SET, { lightingEnabled: vtt.lightingEnabled });
    persistCampaign();
  }
});

els.btnClearWalls.addEventListener('click', () => {
  vtt.applyWallUpdate({ op: 'clear' });
  peerManager.broadcast(MSG.WALL_UPDATE, { op: 'clear' });
  persistCampaign();
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
  const active = sceneManager.getActive();
  if (active) active.mapAssetId = assetId;
  await saveAssetBlob(assetId, mime, bytes);
  await persistCampaign();
  renderSceneSelector();
  await peerManager.broadcastAsset(assetId, mime, bytes);
  peerManager.broadcast(MSG.SCENE_SET, { mapAssetId: assetId, showGrid: vtt.showGrid, fogEnabled: vtt.fogEnabled });
  els.mapFileInput.value = '';
});

els.btnClearMap.addEventListener('click', async () => {
  const active = sceneManager.getActive();
  if (active?.mapAssetId) {
    await deleteAssetBlob(active.mapAssetId).catch(() => {});
  }
  vtt.clearMap();
  sceneManager.clearSceneMap();
  renderSceneSelector();
  peerManager.broadcast(MSG.SCENE_SET, { clearMap: true });
  persistCampaign();
});

els.allowAllTokensToggle.addEventListener('change', () => {
  vtt.allowAllTokensMove = els.allowAllTokensToggle.checked;
  peerManager.broadcast(MSG.SCENE_SET, { allowAllTokensMove: vtt.allowAllTokensMove });
  persistCampaign();
});

els.sceneSelector.addEventListener('change', async () => {
  sceneManager.updateActiveFromVtt(vtt.getState());
  const next = sceneManager.switchScene(els.sceneSelector.value);
  await applySceneToVtt(next, true);
});

els.btnNewScene.addEventListener('click', async () => {
  const name = prompt('Nome da nova Cena / Mapa:', `Cena ${sceneManager.scenes.size + 1}`);
  if (!name) return;
  sceneManager.updateActiveFromVtt(vtt.getState());
  const sc = sceneManager.createScene(name.trim());
  sceneManager.switchScene(sc.id);
  renderSceneSelector();
  await applySceneToVtt(sc, true);
});

els.btnDeleteScene.addEventListener('click', async () => {
  if (sceneManager.scenes.size <= 1) {
    alert('Mantenha pelo menos 1 cena. Para tirar a imagem, use "Remover Mapa".');
    return;
  }
  const active = sceneManager.getActive();
  if (active?.mapAssetId) await deleteAssetBlob(active.mapAssetId).catch(() => {});
  sceneManager.removeScene(sceneManager.activeSceneId);
  renderSceneSelector();
  await applySceneToVtt(sceneManager.getActive(), true);
});

els.gridSizeInput.addEventListener('change', () => {
  vtt.gridSize = Math.max(20, Math.min(200, Number(els.gridSizeInput.value) || 50));
  peerManager.broadcast(MSG.SCENE_SET, { gridSize: vtt.gridSize });
  persistCampaign();
});

els.scaleMetersInput.addEventListener('change', () => {
  vtt.scaleMeters = Math.max(0.5, Number(els.scaleMetersInput.value) || 1.5);
  peerManager.broadcast(MSG.SCENE_SET, { scaleMeters: vtt.scaleMeters });
  persistCampaign();
});

// Menu Contextual, Edição de Token & Delete
window.addEventListener('click', (e) => {
  if (!els.tokenContextMenu.contains(e.target)) {
    els.tokenContextMenu.style.display = 'none';
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' && currentRole === 'gm' && vtt.selectedTokenId && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
    const id = vtt.selectedTokenId;
    vtt.removeToken(id);
    vtt.selectedTokenId = null;
    peerManager.broadcast(MSG.TOKEN_REMOVE, { id });
    persistCampaign();
  }
});

els.ctxDeleteToken.addEventListener('click', () => {
  els.tokenContextMenu.style.display = 'none';
  if (!ctxTargetTokenId) return;
  vtt.removeToken(ctxTargetTokenId);
  peerManager.broadcast(MSG.TOKEN_REMOVE, { id: ctxTargetTokenId });
  persistCampaign();
});

els.ctxToggleLayer.addEventListener('click', () => {
  els.tokenContextMenu.style.display = 'none';
  const t = vtt.tokens.get(ctxTargetTokenId);
  if (!t) return;
  t.hidden = !t.hidden;
  peerManager.broadcast(MSG.TOKEN_UPSERT, t);
  persistCampaign();
});

els.ctxDuplicateToken.addEventListener('click', () => {
  els.tokenContextMenu.style.display = 'none';
  const t = vtt.tokens.get(ctxTargetTokenId);
  if (!t) return;
  const copy = { ...t, id: `tok-${Date.now().toString(36)}`, x: t.x + vtt.gridSize, y: t.y };
  vtt.upsertToken(copy);
  peerManager.broadcast(MSG.TOKEN_UPSERT, copy);
  persistCampaign();
});

els.ctxEditToken.addEventListener('click', () => {
  els.tokenContextMenu.style.display = 'none';
  const t = vtt.tokens.get(ctxTargetTokenId);
  if (!t) return;
  editingTokenId = t.id;
  els.tokEditName.value = t.name || '';
  els.tokEditHp.value = t.hp ?? '';
  els.tokEditHpMax.value = t.hpMax ?? '';
  els.tokEditSize.value = String(t.size || 1);
  els.tokEditCond.value = t.conditions || '';
  renderOwnerSelects();
  els.tokEditOwner.value = t.ownerId || '';
  els.tokEditImgInput.value = '';
  els.tokenEditModal.style.display = 'flex';
});

els.btnCloseTokenModal.addEventListener('click', () => {
  els.tokenEditModal.style.display = 'none';
});

els.btnSaveTokenModal.addEventListener('click', async () => {
  const t = vtt.tokens.get(editingTokenId);
  if (!t) return;
  t.name = els.tokEditName.value.trim() || t.name;
  t.hp = els.tokEditHp.value !== '' ? Number(els.tokEditHp.value) : 0;
  t.hpMax = els.tokEditHpMax.value !== '' ? Number(els.tokEditHpMax.value) : 0;
  t.size = Number(els.tokEditSize.value) || 1;
  t.conditions = els.tokEditCond.value.trim();
  t.ownerId = els.tokEditOwner.value || null;

  const file = els.tokEditImgInput.files?.[0];
  if (file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const assetId = `tokimg-${Date.now().toString(36)}`;
    const mime = file.type || 'image/png';
    t.avatarAssetId = assetId;
    vtt.setTokenImageBlob(assetId, mime, bytes);
    await saveAssetBlob(assetId, mime, bytes);
    await peerManager.broadcastAsset(assetId, mime, bytes);
  }

  vtt.upsertToken(t);
  peerManager.broadcast(MSG.TOKEN_UPSERT, t);
  persistCampaign();
  els.tokenEditModal.style.display = 'none';
});

els.btnToggleSidebar.addEventListener('click', () => {
  const collapsed = els.rightSidebar.classList.toggle('collapsed');
  els.btnToggleSidebar.textContent = collapsed ? 'Mostrar Painel' : 'Ocultar Painel';
  vtt.resize();
});

els.layerSelect.addEventListener('change', () => {
  vtt.setLayer(els.layerSelect.value);
});

els.btnClearDraw.addEventListener('click', () => {
  vtt.applyDrawUpdate({ op: 'clear' });
  if (currentRole === 'gm') {
    peerManager.broadcast(MSG.DRAW_UPDATE, { op: 'clear' });
    persistCampaign();
  } else {
    peerManager.sendToPeer('gm', MSG.DRAW_UPDATE, { op: 'clear' }, 'player');
  }
});

els.btnZoomIn.addEventListener('click', () => vtt.zoomIn());
els.btnZoomOut.addEventListener('click', () => vtt.zoomOut());
els.btnZoomReset.addEventListener('click', () => vtt.resetView());

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
    hidden: vtt.activeLayer === 'gm',
  };
  vtt.upsertToken(token);
  peerManager.broadcast(MSG.TOKEN_UPSERT, token);
  persistCampaign();
});

// Rolador de Dados (com animação 3D)
function doRoll(expr) {
  try {
    const res = parseAndRoll(expr);
    const summary = formatRollSummary(res);
    const visibility = currentRole === 'gm' && els.gmSecretRoll.checked ? 'gm' : 'public';
    const who = currentRole === 'gm' ? 'Mestre' : els.playerNameInput.value.trim() || 'Jogador';
    const payload = { who, summary, total: res.total, visibility };
    appendDiceLog(payload);
    dice3d.trigger(res.total);
    if (visibility === 'public') {
      if (currentRole === 'gm') peerManager.broadcast(MSG.DICE_ROLL, payload);
      else peerManager.sendToPeer('gm', MSG.DICE_ROLL, payload, 'player');
    }
  } catch (err) {
    alert(err.message);
  }
}

// Chat de Roleplay
function sendRpChat() {
  const speaker = currentRole === 'gm' ? 'Mestre' : els.playerNameInput.value.trim() || 'Jogador';
  const parsed = parseChatCommand(els.rpChatInput.value, speaker);
  if (!parsed) return;
  els.rpChatInput.value = '';
  appendChatLog(parsed);
  if (currentRole === 'gm') {
    if (parsed.mode !== 'whisper') peerManager.broadcast(MSG.CHAT_MSG, parsed);
  } else {
    peerManager.sendToPeer('gm', MSG.CHAT_MSG, parsed, 'player');
  }
}

els.btnSendChat.addEventListener('click', sendRpChat);
els.rpChatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendRpChat();
});

// Fichas & Macros & PDF & Backup
els.sheetSelector.addEventListener('change', () => {
  activeSheetId = els.sheetSelector.value;
  renderActiveSheet();
  renderMacroBar();
});

els.sheetOwnerSelect.addEventListener('change', () => {
  const sheet = sheets.get(activeSheetId);
  if (!sheet || currentRole !== 'gm') return;
  sheet.ownerId = els.sheetOwnerSelect.value || null;
  broadcastSheet(sheet);
});

els.btnImportPdfSheet.addEventListener('click', () => els.pdfSheetFileInput.click());
els.pdfSheetFileInput.addEventListener('change', async () => {
  const file = els.pdfSheetFileInput.files?.[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const assetId = `sheetpdf-${Date.now().toString(36)}`;
  const owner = currentRole === 'gm' ? 'Mestre' : els.playerNameInput.value.trim() || 'Jogador';
  const sheet = createDefaultSheet('pdf', owner, {
    name: file.name.replace(/\.pdf$/i, ''),
    pdfAssetId: assetId,
    ownerId: currentRole === 'gm' ? els.sheetOwnerSelect.value || null : myPeerId,
  });
  await saveAssetBlob(assetId, 'application/pdf', bytes);
  sheets.set(sheet.id, sheet);
  activeSheetId = sheet.id;
  renderSheetSelector();
  await renderActiveSheet();
  await peerManager.broadcastAsset(assetId, 'application/pdf', bytes);
  broadcastSheet(sheet);
  els.pdfSheetFileInput.value = '';
});

els.btnExportCampaign.addEventListener('click', async () => {
  await persistCampaign();
  const bundle = await exportCampaignBundle();
  const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `peerbuddy-campanha-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

els.btnImportCampaign.addEventListener('click', () => els.importCampaignInput.click());
els.importCampaignInput.addEventListener('change', async () => {
  const file = els.importCampaignInput.files?.[0];
  if (!file) return;
  try {
    const bundle = JSON.parse(await file.text());
    await importCampaignBundle(bundle);
    sheets.clear();
    await restoreCampaign();
    alert('Campanha restaurada com sucesso!');
  } catch (err) {
    alert('Erro ao importar campanha: ' + err.message);
  }
  els.importCampaignInput.value = '';
});

els.btnNewSheet.addEventListener('click', () => {
  const tpl = els.sheetTemplateSelect.value;
  if (tpl === 'pdf') {
    els.pdfSheetFileInput.click();
    return;
  }
  const owner = currentRole === 'gm' ? 'Mestre' : els.playerNameInput.value.trim() || 'Jogador';
  const sheet = createDefaultSheet(tpl, owner, {
    ownerId: currentRole === 'gm' ? els.sheetOwnerSelect.value || null : myPeerId,
  });
  sheets.set(sheet.id, sheet);
  activeSheetId = sheet.id;
  renderSheetSelector();
  renderActiveSheet();
  broadcastSheet(sheet);
});

els.btnExportSheet.addEventListener('click', () => {
  const sheet = sheets.get(activeSheetId);
  if (!sheet) return;
  const blob = new Blob([JSON.stringify(sheet, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sheet.name.replace(/[^a-z0-9_-]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

els.btnImportSheet.addEventListener('click', () => els.importSheetInput.click());
els.importSheetInput.addEventListener('change', async () => {
  const file = els.importSheetInput.files?.[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!imported || typeof imported !== 'object' || !imported.name) {
      throw new Error('Arquivo de ficha inválido');
    }
    imported.id = `sheet-${Date.now().toString(36)}`;
    sheets.set(imported.id, imported);
    activeSheetId = imported.id;
    renderSheetSelector();
    renderActiveSheet();
    broadcastSheet(imported);
  } catch (err) {
    alert(err.message);
  }
  els.importSheetInput.value = '';
});

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
