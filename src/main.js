import { VoiceController } from './audio/voice.js';
import { SoundboardController } from './audio/soundboard.js';
import { PeerManager } from './net/peer-manager.js';
import { MSG } from './net/protocol.js';
import { formatRollSummary, parseAndRoll } from './rpg/dice.js';
import { Dice3DOverlay } from './rpg/dice3d.js';
import { parseChatCommand, renderFormattedText } from './rpg/chat.js';
import { addMacroToSheet, calcDndMod, createDefaultSheet, formatMod, removeMacroFromSheet } from './rpg/sheets.js';
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
  btnAddToken: $('btnAddToken'),
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

  // Fichas & Macros
  sheetSelector: $('sheetSelector'),
  sheetTemplateSelect: $('sheetTemplateSelect'),
  btnNewSheet: $('btnNewSheet'),
  btnExportSheet: $('btnExportSheet'),
  importSheetInput: $('importSheetInput'),
  btnImportSheet: $('btnImportSheet'),
  sheetEditorContainer: $('sheetEditorContainer'),

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
const sheets = new Map(); // sheetId -> sheetObj
let activeSheetId = null;
const dice3d = new Dice3DOverlay(els.dice3dCanvas);

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
          sheets: Array.from(sheets.values()),
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
      if (Array.isArray(msg.payload?.sheets)) {
        msg.payload.sheets.forEach((s) => sheets.set(s.id, s));
        renderSheetSelector();
        renderActiveSheet();
      }
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

function renderSheetSelector() {
  const prev = activeSheetId;
  els.sheetSelector.innerHTML = '';
  for (const s of sheets.values()) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.template === 'dnd5e' ? 'D&D 5e' : 'Genérica'})`;
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

function renderActiveSheet() {
  const container = els.sheetEditorContainer;
  container.innerHTML = '';
  const sheet = sheets.get(activeSheetId);
  if (!sheet) {
    container.innerHTML = '<div class="hint">Clique em "+ Nova Ficha" para criar uma ficha.</div>';
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
  await saveKV('campaign_state', {
    vtt: vtt.getState(),
    initiative: initiative.getState(),
    sheets: Array.from(sheets.values()),
    notes: els.gmNotes.value,
  }).catch(() => {});
}

async function restoreCampaign() {
  const saved = await loadKV('campaign_state', null).catch(() => null);
  if (saved) {
    if (saved.vtt) {
      vtt.applyState(saved.vtt);
      els.fogEnabledToggle.checked = Boolean(vtt.fogEnabled);
      els.lightingToggle.checked = Boolean(vtt.lightingEnabled);
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
    if (Array.isArray(saved.sheets)) {
      saved.sheets.forEach((s) => sheets.set(s.id, s));
    }
    if (typeof saved.notes === 'string') els.gmNotes.value = saved.notes;
  }
  if (sheets.size === 0) {
    const def = createDefaultSheet('dnd5e', 'Mestre');
    sheets.set(def.id, def);
  }
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
  await saveAssetBlob(assetId, mime, bytes);
  await persistCampaign();
  await peerManager.broadcastAsset(assetId, mime, bytes);
  peerManager.broadcast(MSG.SCENE_SET, { mapAssetId: assetId, showGrid: vtt.showGrid, fogEnabled: vtt.fogEnabled });
  els.mapFileInput.value = '';
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

// Fichas & Macros
els.sheetSelector.addEventListener('change', () => {
  activeSheetId = els.sheetSelector.value;
  renderActiveSheet();
  renderMacroBar();
});

els.btnNewSheet.addEventListener('click', () => {
  const tpl = els.sheetTemplateSelect.value;
  const owner = currentRole === 'gm' ? 'Mestre' : els.playerNameInput.value.trim() || 'Jogador';
  const sheet = createDefaultSheet(tpl, owner);
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
