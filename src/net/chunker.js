/**
 * Fragmentação e remontagem de assets binários (mapas, handouts) para RTCDataChannel.
 * Usa chunks de 16 KB em Base64 para compatibilidade segura entre WebViews.
 */

export const DEFAULT_CHUNK_SIZE = 16 * 1024;

export function uint8ToBase64(bytes) {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

export function base64ToUint8(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Divide um Uint8Array em pacotes { start, chunks[], end } prontos para envio no DataChannel.
 */
export function buildAssetTransfer(assetId, mime, bytes, chunkSize = DEFAULT_CHUNK_SIZE) {
  const totalChunks = Math.max(1, Math.ceil(bytes.length / chunkSize));
  const chunks = [];
  for (let i = 0; i < totalChunks; i++) {
    const slice = bytes.subarray(i * chunkSize, (i + 1) * chunkSize);
    chunks.push({
      assetId,
      index: i,
      dataBase64: uint8ToBase64(slice),
    });
  }
  return {
    start: {
      assetId,
      mime,
      totalChunks,
      totalBytes: bytes.length,
    },
    chunks,
    end: { assetId },
  };
}

/**
 * Remonta assets recebidos via mensagens asset:start, asset:chunk e asset:end.
 */
export class ChunkAssembler {
  constructor() {
    this.pending = new Map();
  }

  onStart({ assetId, mime, totalChunks, totalBytes }) {
    this.pending.set(assetId, {
      mime,
      totalChunks,
      totalBytes,
      parts: new Array(totalChunks),
      received: 0,
    });
  }

  onChunk({ assetId, index, dataBase64 }) {
    const entry = this.pending.get(assetId);
    if (!entry || index < 0 || index >= entry.totalChunks) return null;
    if (!entry.parts[index]) {
      entry.parts[index] = base64ToUint8(dataBase64);
      entry.received++;
    }
    return { received: entry.received, total: entry.totalChunks };
  }

  onEnd({ assetId }) {
    const entry = this.pending.get(assetId);
    if (!entry) return null;
    if (entry.received !== entry.totalChunks) {
      this.pending.delete(assetId);
      return null;
    }
    const merged = new Uint8Array(entry.totalBytes);
    let offset = 0;
    for (const part of entry.parts) {
      merged.set(part, offset);
      offset += part.length;
    }
    this.pending.delete(assetId);
    return { assetId, mime: entry.mime, bytes: merged };
  }

  clear() {
    this.pending.clear();
  }
}
