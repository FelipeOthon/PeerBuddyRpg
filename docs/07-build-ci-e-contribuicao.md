# 07 — Build, CI/CD e Contribuição

## 1. Compilação Local

### Pré-requisitos (Windows)

- **Node.js** (testado no CI com versão `22`)
- **Rust** (`rustup` toolchain `stable`, com `rustfmt` e `clippy`)
- **Microsoft C++ Build Tools** e **WebView2** (já presente no Windows 10/11 moderno)

### Comandos (`package.json`)

```powershell
npm install      # Instala @tauri-apps/cli (^2.2.0)
npm run dev      # Inicia o app em modo desenvolvimento (tauri dev)
npm run build    # Compila binário e instaladores em src-tauri/target/release/
```

Os artefatos gerados pelo `npm run build` seguem `src-tauri/tauri.conf.json`:
- Executável portátil: `src-tauri/target/release/peerbuddy.exe`
- Instalador NSIS: `PeerBuddy_<versão>_x64-setup.exe`
- Instalador MSI: `PeerBuddy_<versão>_x64_en-US.msi`

---

## 2. Pipeline de CI (`.github/workflows/ci.yml`)

Disparado em `push` e `pull_request` para os branches `main` e `master`, com dois jobs paralelos:

### 2.1 `frontend-and-isolation` (`ubuntu-latest`, Node 22)

1. `npm ci`
2. `node --check src/app.js` — validação de sintaxe JavaScript.
3. `npm audit --audit-level=moderate` — auditoria de vulnerabilidades npm.
4. **Validação automatizada de isolamento e CSP:** script Node que falha o build se qualquer uma das condições abaixo for violada:
   - `src-tauri/tauri.conf.json`: `app.withGlobalTauri !== false`
   - `src-tauri/tauri.conf.json`: `app.security.csp` não contém `script-src 'self'`
   - `src-tauri/capabilities/default.json`: `permissions` diferente de `['core:default']`
   - `src/index.html`: presença de qualquer tag `<script>` sem atributo `src=` (script inline)

### 2.2 `rust-quality-and-audit` (`windows-latest`, Rust stable)

1. `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
2. `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
3. `cargo audit --file src-tauri/Cargo.lock` (usando `taiki-e/install-action@v2`)

---

## 3. Pipeline de Release (`.github/workflows/release.yml`)

Disparado automaticamente ao enviar uma tag `v*` (ex.: `v0.1.0`):

1. Executa em `windows-latest` com Node `22` e Rust `stable`.
2. Instala dependências com `npm ci`.
3. Executa `tauri-apps/tauri-action@v0` para compilar os instaladores `.msi` e `-setup.exe` e publicar a Release no GitHub (`PeerBuddy <tag>`).
4. Anexa o binário portátil `src-tauri/target/release/peerbuddy.exe` à mesma Release via `gh release upload ... --clobber`.

---

## 4. Hooks Locais (`pre-commit`)

O arquivo `.pre-commit-config.yaml` define verificações automáticas antes de cada commit (ativáveis com `pre-commit install`):

- **Hooks padrão (`pre-commit-hooks v5.0.0`):** `check-json`, `check-yaml`, `check-toml`, `end-of-file-fixer`, `trailing-whitespace`, `check-added-large-files` (limite de `500 KB`) e `detect-private-key`.
- **Hooks locais:**
  - `js-syntax-check`: `node --check src/app.js` (arquivos `^src/.*\.js$`)
  - `rust-fmt`: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` (arquivos `^src-tauri/.*\.rs$`)
  - `rust-clippy`: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` (arquivos `^src-tauri/.*\.(rs|toml)$`)
  - `npm-audit`: `npm audit --audit-level=high` (arquivos `^package(-lock)?\.json$`)

---

## 5. Checklist Rápido para Contribuições

- Nunca adicionar `<script>` inline em `src/index.html`.
- Nunca habilitar `withGlobalTauri: true` ou adicionar permissões além de `core:default` sem revisão de segurança.
- Rodar `node --check src/app.js`, `cargo fmt --check` e `cargo clippy -- -D warnings` antes de abrir PR.
