# 04 — Telemetria e Interface (UI)

## 1. Estética e Estrutura Visual (`src/index.html`)

A interface utiliza CSS puro inline em `src/index.html` (sem arquivos CSS externos), inspirado no visual clássico do **Windows XP / 2000**:

- **Paleta principal (variáveis `:root`):**
  - `--xp-face`: `#ece9d8` / `--xp-face-dark`: `#d4d0c8`
  - Bordas 3D clássicas: `--xp-border-light` (`#ffffff`), `--xp-border-mid` (`#aca899`), `--xp-border-dark` (`#716f64`)
  - Estados do badge: `--ok-bg`/`--ok-border`/`--ok-text` (verde), `--warn-bg`/`--warn-border`/`--warn-text` (âmbar), `--err-bg`/`--err-border`/`--err-text` (vermelho)
- **Seções da janela (`.xp-body`):**
  1. **Banner de Status:** logotipo (`logo.png`), `#connBadge` e `#sasBadge` (oculto até conectar).
  2. **Telemetria da Rede (`fieldset`):** 5 cartões (`Latência (RTT)`, `Jitter`, `Perda de Pacotes`, `Voz (Recebida)`, `Tipo de Rota`).
  3. **Transmissão de Tela:** seletores de resolução/bitrate, modo, codec, botões `Compartilhar Tela` / `Parar Tela`, toggle de áudio da tela e moldura CRT (`#remoteScreenBox`) com `#remoteVideo`, `#videoStatsText`, `#screenVolume` e `#btnFullscreen`.
  4. **Microfone e Saída de Áudio:** seletores `#micSelect` e `#speakerSelect`, medidor `#micMeter`, slider `#remoteVolume`, toggles `#rawAudioToggle` e `#ptime10Toggle`, e botões `Ativar Microfone`, `Mutar (M)` e `Desconectar`.
  5. **Conexão P2P (2 colunas):** `Lado A — Criar Convite (Host)` e `Lado B — Entrar com Convite`.
  6. **Rede Avançada (`<details>`):** campos opcionais `#turnUrl`, `#turnUser` e `#turnPass`.
  7. **Barra de status inferior (`.xp-statusbar`):** identifica `Modo Seguro Isolado` e codecs suportados.

---

## 2. Mapa de Elementos DOM (`els` em `src/app.js`)

| Grupo | IDs mapeados em `els` |
| :--- | :--- |
| Status | `connBadge`, `sasBadge` |
| Telemetria | `statRtt`, `statJitter`, `statLoss`, `statBitrate`, `statRoute` |
| Tela | `screenPreset`, `screenMode`, `screenCodec`, `screenAudioToggle`, `btnShareScreen`, `btnStopScreen`, `screenStatus`, `remoteScreenBox`, `remoteVideo`, `videoStatsText`, `screenVolume`, `btnFullscreen` |
| Áudio/Voz | `micSelect`, `speakerSelect`, `micMeter`, `remoteVolume`, `rawAudioToggle`, `ptime10Toggle`, `btnStartMic`, `btnMute`, `btnHangup`, `audioStatus`, `remoteAudio` |
| Sinalização | `btnCreateOffer`, `btnCopyOffer`, `offerOut`, `answerIn`, `btnAcceptAnswer`, `offerIn`, `btnCreateAnswer`, `btnCopyAnswer`, `answerOut` |
| Rede TURN | `turnUrl`, `turnUser`, `turnPass` |

---

## 3. Loop de Telemetria (`startStatsLoop`)

Executado a cada `1000 ms` via `setInterval` enquanto conectado, consultando `await pc.getStats()`:

### 3.1 Métricas de Rede (`candidate-pair`)

Seleciona o `candidate-pair` com `r.state === 'succeeded'` (priorizando `r.nominated`):
- **Latência (`#statRtt`):** `Math.round(activePair.currentRoundTripTime * 1000)` + `' ms'`.
- **Tipo de Rota (`#statRoute`):**
  - `'Relay (TURN)'` se `local.candidateType === 'relay'` ou `remote.candidateType === 'relay'`.
  - `'Rede Local (LAN)'` se ambos forem `'host'`.
  - `'Direto P2P (UDP)'` para os demais casos (ex.: `srflx` / `prflx`).

### 3.2 Áudio Recebido (`inbound-rtp`, `kind === 'audio'`)

- **Jitter (`#statJitter`):** `(r.jitter * 1000).toFixed(1)` ms.
- **Perda de Pacotes (`#statLoss`):** percentual `((lost / (lost + recv)) * 100).toFixed(1)`% seguido de `(${lost})`.
- **Bitrate (`#statBitrate`):** calculado pela diferença `r.bytesReceived - prevAudioBytes` dividida pelo intervalo `dt` em segundos (`kbps`).

### 3.3 Vídeo Enviado (`outbound-rtp`, `kind === 'video'` com `screenStream` ativo)

Atualiza `#screenStatus` com:
- Resolução (`frameWidth x frameHeight`) e FPS (`framesPerSecond`).
- Implementação do encoder (`encoderImplementation`, indicando hardware ou software).
- Motivo de limitação (`qualityLimitationReason`):
  - `none` → `'sem limitação'`
  - `cpu` → `'limitado pela CPU'`
  - `bandwidth` → `'limitado pela rede'`
  - `other` → `'outro'`

### 3.4 Vídeo Recebido (`inbound-rtp`, `kind === 'video'`)

Atualiza `#videoStatsText` com resolução, FPS, bitrate (`kbps` via `prevVideoBytes`) e `packetsLost`. Se `#remoteScreenBox` estiver ativo e ainda não houver relatório `inbound-rtp` de vídeo, exibe `'Recebendo vídeo...'`.
