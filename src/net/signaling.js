/**
 * Utilitários de sinalização WebRTC (CV1:/CV0:), SAS, ajuste de SDP Opus e prioridades.
 */

export function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function encodeSignal(desc) {
  const compact = JSON.stringify({ t: desc.type === 'offer' ? 'o' : 'a', s: desc.sdp });
  const rawBytes = new TextEncoder().encode(compact);
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(rawBytes);
    writer.close();
    const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    return 'CV1:' + toBase64Url(compressed);
  }
  return 'CV0:' + toBase64Url(rawBytes);
}

export async function decodeSignal(input) {
  const str = input.trim();
  if (str.startsWith('CV1:')) {
    const bytes = fromBase64Url(str.slice(4));
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const text = await new Response(ds.readable).text();
    const obj = JSON.parse(text);
    return { type: obj.t === 'o' ? 'offer' : 'answer', sdp: obj.s };
  }
  if (str.startsWith('CV0:')) {
    const text = new TextDecoder().decode(fromBase64Url(str.slice(4)));
    const obj = JSON.parse(text);
    return { type: obj.t === 'o' ? 'offer' : 'answer', sdp: obj.s };
  }
  throw new Error('Formato inválido. O código deve começar com CV1:');
}

export function extractFingerprint(sdp) {
  const m = sdp.match(/a=fingerprint:[^\s]+\s+([A-Fa-f0-9:]+)/);
  return m ? m[1].toUpperCase() : '';
}

export async function computeSasCode(localSdp, remoteSdp) {
  const f1 = extractFingerprint(localSdp || '');
  const f2 = extractFingerprint(remoteSdp || '');
  if (!f1 || !f2) return null;
  const sorted = [f1, f2].sort().join('|');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sorted));
  const hex = Array.from(new Uint8Array(hash).slice(0, 3))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `${hex.slice(0, 3)}-${hex.slice(3)}`;
}

export function tuneOpusSdp(sdp, ptime10 = false) {
  const ptime = ptime10 ? 10 : 20;
  return sdp.replace(
    /a=fmtp:(\d+) (.*minptime=.*)/g,
    `a=fmtp:$1 minptime=${ptime};useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=192000`
  );
}

export function preferVideoCodec(pc, sender, choice) {
  try {
    const tr = pc.getTransceivers().find((t) => t.sender === sender);
    if (!tr || !tr.setCodecPreferences) return;
    const codecs = RTCRtpSender.getCapabilities('video').codecs;
    const want = { h264: 'video/H264', vp9: 'video/VP9', av1: 'video/AV1' }[choice] || 'video/H264';
    const first = codecs.filter((c) => c.mimeType.toLowerCase() === want.toLowerCase());
    if (!first.length) return;
    const rest = codecs.filter((c) => !first.includes(c));
    tr.setCodecPreferences([...first, ...rest]);
  } catch {
    // Mantém ordem padrão do navegador
  }
}

export function tuneReceiver(receiver, kind) {
  try {
    if ('jitterBufferTarget' in receiver) {
      receiver.jitterBufferTarget = kind === 'video' ? 60 : 80;
    }
  } catch {
    // Ignora se não suportado
  }
}

export async function applySenderPriority(sender, priority, extra = {}) {
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].priority = priority;
    params.encodings[0].networkPriority = priority;
    Object.assign(params.encodings[0], extra);
    if (extra.degradationPreference) {
      params.degradationPreference = extra.degradationPreference;
    }
    await sender.setParameters(params);
  } catch {
    // Alguns navegadores ignoram campos opcionais como networkPriority
  }
}

export function waitForIceGathering(peer, timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (peer.iceGatheringState === 'complete') return resolve();
    const timer = setTimeout(resolve, timeoutMs);
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
