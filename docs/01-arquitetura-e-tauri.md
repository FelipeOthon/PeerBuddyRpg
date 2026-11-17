# 01 — Arquitetura e Tauri v2

## 1. Visão Geral da Stack

O PeerBuddy é composto por duas camadas principais:

1. **Host Nativo (Rust / Tauri v2):** responsável exclusivamente por criar a janela da aplicação (`main`), embutir os assets estáticos de `src/` e aplicar as políticas de segurança e permissões.
2. **Aplicação Web (HTML/CSS/JS Vanilla):** executada dentro do WebView2 (no Windows), responsável por toda a lógica de captura de mídia, WebRTC, compressão de sinalização, cálculo criptográfico do SAS e telemetria.

Não há *bundler* (Webpack, Vite, etc.) nem dependências de runtime no `package.json` — apenas `@tauri-apps/cli` (`^2.2.0`) como `devDependency`.

---

## 2. Estrutura Completa do Repositório

```text
PeerBuddy-0.1.0/
├── .github/
│   └── workflows/
│       ├── ci.yml                     # Pipeline de validação JS, auditorias, CSP/isolamento e Rust
│       └── release.yml                # Pipeline de build e publicação de releases no Windows
├── src/
│   ├── index.html                     # Estrutura HTML, estilos CSS inline (tema XP) e carga de app.js
│   ├── app.js                         # Toda a lógica de aplicação (731 linhas, 'use strict')
│   └── logo.png                       # Logotipo exibido no banner de status e na barra inferior
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json               # Permissões Tauri ("core:default" apenas para janela "main")
│   ├── gen/schemas/                   # Schemas JSON gerados pelo Tauri v2
│   ├── icons/                         # icon.ico e icon.png do executável e instaladores
│   ├── src/
│   │   ├── main.rs                    # Entrypoint binário; oculta console em release no Windows
│   │   └── lib.rs                     # Função run() que inicializa o tauri::Builder
│   ├── build.rs                       # Script de build (tauri_build::build + rerun-if-changed nos ícones)
│   ├── Cargo.lock                     # Lockfile auditado no CI via cargo-audit
│   ├── Cargo.toml                     # Manifesto Rust e perfil [profile.release]
│   └── tauri.conf.json                # Configurações de janela, CSP, bundle e isolamento
├── .gitignore                         # Arquivos ignorados pelo Git
├── .pre-commit-config.yaml            # Hooks locais de lint/formatação/segurança
├── LICENSE                            # Licença do projeto
├── package.json                       # Scripts npm: tauri, dev e build
├── package-lock.json                  # Lockfile npm auditado no CI via npm audit
└── README.md                          # Apresentação e guia rápido
```

---

## 3. Backend Rust (`src-tauri/`)

### 3.1 `src-tauri/src/main.rs`

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    peerbuddy_lib::run()
}
```

- Em builds de release (`not(debug_assertions)`), define o subsistema `windows` para não abrir janela de console junto ao aplicativo.

### 3.2 `src-tauri/src/lib.rs`

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o PeerBuddy");
}
```

- **Nenhum comando Tauri (`#[tauri::command]`) ou plugin adicional é registrado.** O backend Rust não expõe nenhuma API de sistema ao frontend.

### 3.3 `src-tauri/build.rs`

- Monitora alterações em `icons/icon.ico` e `icons/icon.png` (`cargo:rerun-if-changed`) e invoca `tauri_build::build()`.

### 3.4 `src-tauri/Cargo.toml`

- Crate: `peerbuddy` (`0.1.0`, edition `2021`), biblioteca `peerbuddy_lib` (`staticlib`, `cdylib`, `rlib`).
- Dependências: apenas `tauri = { version = "2", features = [] }` e `tauri-build = { version = "2", features = [] }`.
- Perfil de release otimizado para binário compacto:
  - `opt-level = "s"` (otimização para tamanho)
  - `lto = true` (Link-Time Optimization)
  - `codegen-units = 1`
  - `panic = "abort"`
  - `strip = true` (remove símbolos de debug)

---

## 4. Configuração do Aplicativo (`src-tauri/tauri.conf.json`)

| Campo | Valor | Finalidade |
| :--- | :--- | :--- |
| `productName` | `"PeerBuddy"` | Nome exibido no aplicativo e instaladores. |
| `version` | `"0.1.0"` | Versão do pacote. |
| `identifier` | `"com.peerbuddy.app"` | Identificador único da aplicação. |
| `build.frontendDist` | `"../src"` | Diretório servido diretamente pelo Tauri (sem etapa de build JS). |
| `app.withGlobalTauri` | `false` | Desativa a injeção de `window.__TAURI__`. |
| `app.windows[0]` | `title: "PeerBuddy"`, `980x820`, min `680x580`, `resizable: true` | Janela principal única. |
| `bundle.targets` | `["nsis", "msi"]` | Gera instalador NSIS (`-setup.exe`) e MSI no Windows. |
| `bundle.icon` | `["icons/icon.png", "icons/icon.ico"]` | Ícones do bundle. |
