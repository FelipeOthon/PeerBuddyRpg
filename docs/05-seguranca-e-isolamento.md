# 05 — Segurança e Isolamento

## 1. Criptografia Ponta a Ponta (DTLS-SRTP)

Todo o tráfego WebRTC — áudio da voz, vídeo da tela, áudio da tela e mensagens do `RTCDataChannel` `'signal'` — utiliza **DTLS-SRTP** nativo do WebRTC com certificados efêmeros gerados por sessão.

---

## 2. Verificação SAS (`Segurança: XXX-XXX`)

Para mitigar ataques *Man-in-the-Middle* (MitM) durante a troca manual dos códigos `CV1:` ou em caso de uso de servidor TURN não confiável, o PeerBuddy implementa uma **Short Authentication String (SAS)** determinística na função `updateSasCode()`:

1. Extrai o fingerprint DTLS do SDP local (`pc.localDescription.sdp`) e do SDP remoto (`pc.remoteDescription.sdp`) usando a regex:
   ```js
   /a=fingerprint:[^\s]+\s+([A-Fa-f0-9:]+)/
   ```
2. Normaliza em maiúsculas, ordena os dois fingerprints alfabeticamente (`[f1, f2].sort()`) e os une com `'|'`. Essa ordenação garante que Lado A e Lado B gerem exatamente a mesma string de entrada.
3. Calcula o digest **SHA-256** via `crypto.subtle.digest('SHA-256', ...)`.
4. Converte os 3 primeiros bytes (24 bits) em 6 dígitos hexadecimais maiúsculos e exibe em `#sasBadge` no formato `Segurança: XXX-XXX`.

Se ambos os usuários confirmarem verbalmente ou por chat que o código `XXX-XXX` é idêntico, há garantia criptográfica de que as chaves DTLS não foram substituídas no caminho.

---

## 3. Hardening do Container Tauri v2

### 3.1 Ponte JS/Rust Desabilitada

Em `src-tauri/tauri.conf.json`:
```json
"withGlobalTauri": false
```
- Impede a exposição de `window.__TAURI__` ao código JavaScript.

### 3.2 Content Security Policy (CSP)

Definida em `src-tauri/tauri.conf.json`:
```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self' mediastream: blob:; img-src 'self' data:
```

- `script-src 'self'`: bloqueia scripts externos, `eval` e `<script>` inline (validado também no CI).
- `connect-src 'self'`: bloqueia requisições `fetch`/`XMLHttpRequest`/WebSocket para domínios externos (a sinalização ICE/STUN/TURN ocorre na camada nativa WebRTC, fora de `connect-src`).
- `media-src 'self' mediastream: blob:`: restringe fontes de `<audio>` e `<video>` aos streams locais/WebRTC.

### 3.3 Capabilities Mínimas

Em `src-tauri/capabilities/default.json`:
```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```
- Concede apenas permissões básicas de janela (`core:default`), sem plugins de sistema de arquivos (`fs`), shell, processo, rede HTTP ou clipboard nativo do Tauri (a cópia usa `navigator.clipboard.writeText`).

---

## 4. Ausência de Persistência

- O projeto não utiliza `localStorage`, `sessionStorage`, `IndexedDB`, cookies nem APIs de arquivo.
- Ao clicar em **Desconectar** (`hangup()`) ou fechar a janela, todas as faixas de mídia são paradas (`track.stop()`), a `RTCPeerConnection` é encerrada e os códigos de convite/resposta e chaves DTLS são descartados da memória.
