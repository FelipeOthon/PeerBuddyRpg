# 03 — Mídia, Codecs e Priorização de Rede

O PeerBuddy foi projetado para priorizar **imagem e áudio da tela** sobre a **voz do microfone**, evitando que picos de banda ou processamento degradem a transmissão.

---

## 1. Captura de Voz (`startMicrophone`)

A captura de microfone usa `navigator.mediaDevices.getUserMedia`:

```js
audio: {
  deviceId: els.micSelect.value ? { exact: els.micSelect.value } : undefined,
  echoCancellation: !raw,
  noiseSuppression: !raw,
  autoGainControl: !raw,
  latency: 0.02,
}
```

- **`rawAudioToggle` (marcado por padrão):** ativa o *Modo Ultra-Baixa Latência*, desabilitando cancelamento de eco, supressão de ruído e controle automático de ganho. Alterar esse checkbox ou o seletor `#micSelect` com o microfone já ativo reinicia a captura automaticamente.
- **Substituição em chamada ativa:** se `pc` e `voiceSender` já existirem, `voiceSender.replaceTrack(localStream.getAudioTracks()[0])` troca o microfone sem precisar renegociar a conexão.
- **Prioridade na rede:** ao adicionar a faixa em `createPeerConnection`:
  ```js
  applySenderPriority(voiceSender, 'low', { maxBitrate: 32_000 });
  ```
  Limita a voz a **32 kbps** com prioridade `'low'` (tanto `priority` quanto `networkPriority`).

### 1.1 Medidor de Microfone (`startMicMeter`)

- Cria um `AudioContext` + `MediaStreamSource` conectado a um `AnalyserNode` (`fftSize = 256`).
- A cada frame (`requestAnimationFrame`), lê `getByteFrequencyData(data)`, calcula a média de amplitude normalizada (`((sum / data.length) / 90) * 100`, limitada a `100%`) e ajusta a largura de `#micMeter`. Quando `isMuted === true`, exibe `0%`.

### 1.2 Mute (`toggleMute`)

- Alterna `isMuted` e atualiza `track.enabled = !isMuted` nas faixas de `localStream`.
- Atalho global: pressionar `M` (quando o foco não está em `INPUT` ou `TEXTAREA`).

---

## 2. Ajuste de Codec Opus no SDP (`tuneOpusSdp`)

Toda oferta e resposta gerada passa por `tuneOpusSdp(sdp)`, que reescreve linhas `a=fmtp:<pt> ...minptime=...` para:

```text
a=fmtp:<pt> minptime=<10|20>;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=192000
```

| Parâmetro | Valor | Motivo |
| :--- | :--- | :--- |
| `minptime` | `10` (se `#ptime10Toggle` marcado) ou `20` (padrão) | Menor pacote reduz latência; 20 ms reduz overhead e perda. |
| `useinbandfec` | `1` | Habilita correção de erros in-band no Opus. |
| `usedtx` | `0` | Desativa transmissão descontínua para não cortar início/fim de sons da tela. |
| `stereo` / `sprop-stereo` | `1` | Permite áudio estéreo puro na transmissão de tela. |
| `maxaveragebitrate` | `192000` | Até 192 kbps para áudio da tela (o microfone continua limitado a 32 kbps via `maxBitrate` do sender). |

---

## 3. Transmissão de Tela (`shareScreen`)

Usa `navigator.mediaDevices.getDisplayMedia` com constraints derivadas da UI:

### 3.1 Presets de Resolução e Bitrate (`#screenPreset`)

| Valor | Resolução Ideal | FPS Ideal | `maxBitrate` |
| :--- | :--- | :--- | :--- |
| `720p60` | 1280×720 | 60 | `6_000_000` (6 Mbps) |
| `1080p60` (padrão) | 1920×1080 | 60 | `12_000_000` (12 Mbps) |
| `1440p60` | 2560×1440 | 60 | `20_000_000` (20 Mbps) |
| `native60` | Nativa da tela | 60 | `25_000_000` (25 Mbps) |

### 3.2 Modo de Conteúdo (`#screenMode`)

| Modo | `videoTrack.contentHint` | `maxFramerate` | `degradationPreference` | `scaleResolutionDownBy` |
| :--- | :--- | :--- | :--- | :--- |
| `motion` (padrão) | `'motion'` | `60` | `'maintain-framerate'` | `1.0` |
| `detail` | `'detail'` | `30` | `'maintain-resolution'` | `1.0` |

### 3.3 Seleção de Codec de Vídeo (`preferVideoCodec`)

- Consulta `RTCRtpSender.getCapabilities('video').codecs`.
- Filtra pelo MIME type escolhido em `#screenCodec`:
  - `h264` → `video/H264` (padrão; usa encoder por hardware quando disponível)
  - `vp9` → `video/VP9`
  - `av1` → `video/AV1`
- Reordena os codecs no transceiver via `tr.setCodecPreferences([...first, ...rest])`, mantendo os demais codecs como fallback.

### 3.4 Áudio da Tela (`#screenAudioToggle`)

- Quando marcado (padrão), solicita `audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }` no `getDisplayMedia`.
- Se uma faixa de áudio for retornada, ela é adicionada com prioridade `'high'` e `maxBitrate: 192_000`.

### 3.5 Encerramento da Tela (`stopScreenShare`)

- Também é acionado automaticamente pelo evento `videoTrack.onended` (quando o usuário clica em "Parar compartilhamento" na barra nativa do sistema).
- Para todas as faixas de `screenStream`, remove os `screenSenders` da `RTCPeerConnection` e envia `{ type: 'screen-stopped' }` via `signalChannel`.

---

## 4. Recepção e Roteamento de Mídia (`pc.ontrack`)

- **`tuneReceiver(event.receiver, track.kind)`:** define `receiver.jitterBufferTarget` como **`60` ms** para vídeo e **`80` ms** para áudio (quando suportado pelo navegador), priorizando reprodução contínua sem engasgos.
- **Separação de fluxos:**
  - Faixas `video` vão para `#remoteVideo` (com `#remoteScreenBox.classList.add('active')`) e volume controlado por `#screenVolume`.
  - Faixas `audio` pertencentes a um stream que contém vídeo (`stream.getVideoTracks().length > 0`) vão junto para `#remoteVideo` (áudio da tela).
  - Faixas `audio` sem vídeo vão para `#remoteAudio` (voz), com volume controlado por `#remoteVolume`.
- **Dispositivo de saída (`#speakerSelect`):** aplica `setSinkId(els.speakerSelect.value)` tanto em `#remoteAudio` quanto em `#remoteVideo`.
