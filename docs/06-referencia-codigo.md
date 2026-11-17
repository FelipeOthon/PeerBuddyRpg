# 06 — Referência de Código (`src/app.js`)

Arquivo único de lógica do frontend, executado em `'use strict'` (731 linhas).

---

## 1. Estado Global

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `els` | `Object` | Cache de referências `document.getElementById(...)` para todos os controles da UI. |
| `localStream` | `MediaStream \| null` | Stream ativo do microfone capturado via `getUserMedia`. |
| `screenStream` | `MediaStream \| null` | Stream ativo da tela (vídeo + áudio opcional) capturado via `getDisplayMedia`. |
| `screenSenders` | `RTCRtpSender[]` | Lista de senders adicionados para vídeo e áudio da tela. |
| `voiceSender` | `RTCRtpSender \| null` | Sender exclusivo da faixa de voz do microfone. |
| `pc` | `RTCPeerConnection \| null` | Instância WebRTC ativa da sessão. |
| `signalChannel` | `RTCDataChannel \| null` | DataChannel `'signal'` usado para renegociação e eventos pós-conexão. |
| `isPolite` | `boolean` | `false` para o Host (Lado A) e `true` para o Convidado (Lado B) no padrão *Perfect Negotiation*. |
| `makingOffer` | `boolean` | Flag para detecção de colisão de ofertas durante renegociação. |
| `isMuted` | `boolean` | Estado atual de mute do microfone local. |
| `statsTimer` | `number \| null` | ID do `setInterval` (1000 ms) da telemetria. |
| `meterRaf` | `number \| null` | ID do `requestAnimationFrame` do medidor de microfone. |
| `audioCtx` | `AudioContext \| null` | Contexto Web Audio usado pelo medidor de nível do microfone. |
| `prevAudioBytes` | `number` | Acumulador de bytes de áudio recebidos para cálculo de bitrate. |
| `prevVideoBytes` | `number` | Acumulador de bytes de vídeo recebidos para cálculo de bitrate. |
| `prevStatsTime` | `number` | Timestamp (`performance.now()`) da última coleta de `getStats()`. |

---

## 2. Catálogo de Funções

### 2.1 UI e Codificação de Sinalização

- **`setBadge(text, type = '')`**: atualiza texto e classe CSS (`''`, `'ok'`, `'warn'`, `'err'`) de `#connBadge`.
- **`toBase64Url(bytes)`**: converte `Uint8Array` para string Base64url sem padding.
- **`fromBase64Url(str)`**: decodifica string Base64url de volta para `Uint8Array`.
- **`async encodeSignal(desc)`**: serializa `{ t, s }`, comprime com `CompressionStream('deflate-raw')` retornando `'CV1:...'` (ou `'CV0:...'` se `CompressionStream` não existir).
- **`async decodeSignal(input)`**: aceita `'CV1:...'` ou `'CV0:...'` e retorna `{ type: 'offer' | 'answer', sdp }`; lança erro em formato inválido.

### 2.2 Criptografia SAS

- **`extractFingerprint(sdp)`**: extrai o primeiro `a=fingerprint` do SDP em maiúsculas.
- **`async updateSasCode()`**: ordena os fingerprints local e remoto, calcula SHA-256 e exibe `Segurança: XXX-XXX` em `#sasBadge`.

### 2.3 Otimização de Mídia e Codecs

- **`tuneOpusSdp(sdp)`**: injeta `minptime` (10 ou 20), `useinbandfec=1`, `usedtx=0`, `stereo=1`, `sprop-stereo=1`, `maxaveragebitrate=192000` nas linhas `a=fmtp` do Opus.
- **`preferVideoCodec(sender, choice)`**: reordena codecs de vídeo no transceiver via `setCodecPreferences` (`'h264'`, `'vp9'` ou `'av1'`).
- **`tuneReceiver(receiver, kind)`**: define `jitterBufferTarget` (`60` para vídeo, `80` para áudio) quando suportado.
- **`async applySenderPriority(sender, priority, extra = {})`**: aplica `priority`, `networkPriority`, parâmetros de encoding (`maxBitrate`, `maxFramerate`, `scaleResolutionDownBy`) e `degradationPreference` no `RTCRtpSender`.

### 2.4 Dispositivos e Áudio Local

- **`async loadDevices()`**: enumera dispositivos via `enumerateDevices()` e popula `#micSelect` (`audioinput`) e `#speakerSelect` (`audiooutput`), preservando seleções anteriores.
- **`startMicMeter(stream)`**: inicializa `AudioContext` + `AnalyserNode` (`fftSize = 256`) e atualiza `#micMeter` em loop `requestAnimationFrame`.
- **`async startMicrophone()`**: captura áudio com `getUserMedia`, atualiza `voiceSender` via `replaceTrack` se já houver chamada ativa, habilita `#btnMute`, `#btnCreateOffer` e `#btnCreateAnswer`.
- **`toggleMute()`**: inverte `isMuted`, atualiza `track.enabled` em `localStream` e altera texto/classe de `#btnMute`.

### 2.5 Conexão WebRTC, Tela e Telemetria

- **`setupDataChannel(ch)`**: configura `onopen` (habilita `#btnShareScreen`) e `onmessage` (`screen-stopped`, `description` com resolução de colisão, `candidate`).
- **`createPeerConnection(polite)`**: instancia `RTCPeerConnection` com STUN/TURN, adiciona `voiceSender` (`low`, 32 kbps), cria/recebe DataChannel `'signal'` e registra `onnegotiationneeded`, `onicecandidate`, `ontrack` e `oniceconnectionstatechange`.
- **`waitForIceGathering(peer, timeoutMs = 3000)`**: retorna `Promise` resolvida quando `iceGatheringState === 'complete'` ou ao atingir `timeoutMs`.
- **`async shareScreen()`**: captura tela via `getDisplayMedia` com preset, `contentHint`, codec preferido e prioridade `'high'` (vídeo até 25 Mbps, áudio até 192 kbps).
- **`stopScreenShare()`**: para faixas de `screenStream`, remove `screenSenders` da `RTCPeerConnection`, envia `{ type: 'screen-stopped' }` e atualiza botões.
- **`startStatsLoop()`**: inicia `setInterval` de 1000 ms para coletar `pc.getStats()` e atualizar telemetria de rede, voz e vídeo.
- **`hangup()`**: chama `stopScreenShare()`, limpa timers, fecha `pc`, limpa elementos de mídia, textareas, telemetria e reseta o badge para `Desconectado`.

---

## 3. Event Listeners e Inicialização

- **Controles de áudio:** cliques/mudanças em `btnStartMic`, `rawAudioToggle`, `micSelect`, `speakerSelect`, `remoteVolume`, `screenVolume`, `btnMute` e atalho global `keydown` (`'m'`).
- **Controles de tela e chamada:** cliques em `btnShareScreen`, `btnStopScreen`, `btnFullscreen` (`requestFullscreen()` em `#remoteVideo`) e `btnHangup`.
- **Fluxo Lado A:** `btnCreateOffer`, `btnCopyOffer`, `btnAcceptAnswer` (valida `pc.signalingState === 'have-local-offer'`).
- **Fluxo Lado B:** `btnCreateAnswer`, `btnCopyAnswer`.
- **Inicialização:** ao carregar o script, se `navigator.mediaDevices?.enumerateDevices` existir, executa `loadDevices().catch(() => {})`.
