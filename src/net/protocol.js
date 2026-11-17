/**
 * Protocolo de mensagens JSON do canal 'rpg' no RTCDataChannel.
 */

export const PROTOCOL_VERSION = 1;

export const MSG = Object.freeze({
  PEER_HELLO: 'peer:hello',
  STATE_SNAPSHOT: 'state:snapshot',
  SCENE_SET: 'scene:set',
  FOG_UPDATE: 'fog:update',
  TOKEN_UPSERT: 'token:upsert',
  TOKEN_MOVE: 'token:move',
  TOKEN_REMOVE: 'token:remove',
  PING_POINTER: 'ping:pointer',
  DICE_ROLL: 'dice:roll',
  INITIATIVE_UPDATE: 'initiative:update',
  HANDOUT_SHOW: 'handout:show',
  HANDOUT_CLOSE: 'handout:close',
  AUDIO_CUE: 'audio:cue',
  ASSET_START: 'asset:start',
  ASSET_CHUNK: 'asset:chunk',
  ASSET_END: 'asset:end',
});

let seqCounter = 0;

export function createMessage(type, payload = {}, senderId = 'local') {
  seqCounter += 1;
  return {
    v: PROTOCOL_VERSION,
    type,
    seq: seqCounter,
    senderId,
    ts: Date.now(),
    payload,
  };
}

export function parseMessage(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
    throw new Error('Mensagem de protocolo inválida');
  }
  return data;
}
