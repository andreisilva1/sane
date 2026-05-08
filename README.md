<div align="center">

<img src="src-tauri/icons/icon.png" alt="Sane" width="96" />

# Sane

**A local-first code editor for Python, JavaScript, TypeScript, Go, and Java.**  
Built-in AI. Zero cloud. Keyboard-first.

[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest)
[![Version](https://img.shields.io/badge/version-1.1.0-22863a?style=flat-square)](https://github.com/andreisilva1/sane/releases/latest)

[![Tauri](https://img.shields.io/badge/Tauri-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Ollama](https://img.shields.io/badge/Ollama-local%20AI-gray?style=flat-square)](https://ollama.ai)

</div>

---

## Features at a glance

### Editor
- Syntax highlighting for Python, JavaScript, TypeScript, TSX, Go, and Java
- Smart indent, auto-pairs, block indentation, bracket matching
- Go to Definition, Find References, Rename Symbol
- Extract Function, Inline Variable, Remove Dead Code
- Drag-and-drop file and folder management
- Classic and Friendly UI modes (Friendly adds a VSCode-style toolbar)

### AI (fully local via Ollama)
- Chat panel with streaming responses, markdown rendering, and persistent history
- **Project Builder** — describe a project in any language; intent is auto-detected; generates a complete multi-file scaffold with curated dependency presets and resume support
- **Self-Healing** — detects common runtime errors, suggests or applies fixes automatically
- **AI Refactor** — diff preview and approval before applying changes
- **Inline AI toolbar** — Explain / Improve / Refactor on selected code
- Project-aware context: file tree and key files automatically included in every message
- Your code never leaves your machine

### Dev Toolkit
- HTTP Client · .env Manager · SQLite Viewer · Dev Scheduler
- JSON Viewer · Git status/diff/commit · Activity Log

### Execution
- Run Python, JavaScript, TypeScript, Go, and Java with `Ctrl+Enter`
- **Execution Timeline** — step through Python code line by line, inspect variable state at each step
- **Run Insight** — AI summary of what your code did after each run

---

## Why this exists

Most editors have become sprawling platforms. AI integrations usually mean cloud APIs, accounts, and data leaving your machine. Setup friction is high, and the tools often get in the way of the actual work.

Sane is the opposite: a focused editor that runs your code, understands it, and helps you build projects — without setup, without subscriptions, and without sending anything to the cloud.

### Dev Toolkit
- **HTTP Client** — send any HTTP request directly from the editor, JSON auto-formatted (`Ctrl+Shift+H`)
- **.env Manager** — browse, edit, and activate `.env` files; sensitive values masked by default; detects vars referenced in open file (`Ctrl+Shift+N`)
- **DB Viewer** — browse SQLite databases: table list, paginated rows, ad-hoc query runner (`Ctrl+Shift+D`)
- **Dev Scheduler** — run shell commands on a recurring interval while Sane is open; persists job definitions across restarts
- **JSON Viewer** — live validation badge, Format button, and recursive tree view for `.json` files (`Alt+Shift+F`)
- **Activity Log** — rolling log of all toolkit actions, grouped by day, persisted in `localStorage` (`Ctrl+Shift+J`)

### Git
- **Status badges** — M / A / U indicators next to changed files in the tree, updated automatically
- **Quick diff** — right-click any file → View Diff, or run via command palette; color-coded added/removed lines
- **One-step commit** — `Ctrl+Shift+G` opens a minimal commit modal; stages everything and commits with a message
- Auto-hidden for non-Git projects — no clutter if there's no repository

### Workflow
- Command palette (`Ctrl+Shift+P`) — commands in one place
- Quick Open (`Ctrl+P`) — jump to any file
- Global search across files (`Ctrl+Shift+F`)
- Recent projects — automatically reopens the last folder on launch
- Fully keyboard-navigable — mouse optional
- Theme panel with built-in themes and custom color support
- HTML preview with live refresh

---

## About this project

Sane is a personal project — started and maintained by one person, built with heavy AI assistance, and still finding its shape.

It works, it ships, and there is plenty of room to grow.

If you find a bug, have a feature idea, or just want to improve something: **you are very welcome here.** Open an issue, send a PR, or fork it and take it somewhere new. No contribution is too small.

The goal was never a finished product — it was a tool worth using, built openly, one feature at a time.

---

## Philosophy

> Simple tools for focused work.

**Local-first.** Nothing is sent to a remote server. AI runs entirely on your hardware.

**Minimal by default.** The interface stays out of the way. Panels appear when needed, shortcuts cover everything.

**Speed over ceremony.** Open a file, write code, press run. No config files required.

**AI as a tool, not the center.** AI features are integrated into the workflow — they act on real context without needing a conversation.

---

## Download

<div align="center">

[![Download Installer](https://img.shields.io/badge/Download%20Installer-.exe-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest/download/Sane_1.1.0_x64-setup.exe)
[![Download MSI](https://img.shields.io/badge/Download%20MSI-.msi-6E40C9?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest/download/Sane_1.1.0_x64_en-US.msi)

</div>

| Format | Description |
|---|---|
| `.exe` (recommended) | NSIS installer with custom dark theme |
| `.msi` | Windows Installer package, suitable for managed deployments |

> macOS and Linux builds are on the roadmap.

---

## Build from source

**Requirements:** [Node.js](https://nodejs.org) · [Rust](https://rustup.rs) · [Go](https://go.dev) · [Tauri CLI](https://tauri.app)

```bash
git clone https://github.com/andreisilva1/sane
cd sane
.\build.ps1
```

Or step by step:

```bash
# Build the Go backend
cd backend
go build -ldflags="-s -w" -o ../src-tauri/binaries/sane-backend-x86_64-pc-windows-msvc.exe .
cd ..

# Build the Tauri app (generates installer in src-tauri/target/release/bundle/)
npm install
npm run build
```

---

## Usage

### Running the editor
Open the installed app or run `sane.exe` directly. The last opened folder is restored automatically.

### Opening files
`Ctrl+P` to quick-open any file, or browse the sidebar. In Friendly mode, use the **File** menu.

### Running code
Open a `.py`, `.js`, `.ts`, `.go`, or `.java` file and press `Ctrl+Enter`. Output streams in real time in the integrated panel. For Python files with `input()`, an inline stdin field appears automatically.

### Using AI
1. Open the AI panel (`Ctrl+Shift+A`)
2. Click the model button and select a model
3. If Ollama isn't installed yet, Sane will offer to install it automatically
4. Once Ollama is ready, the model downloads in the background — no terminal required

### UI modes
Switch between **Classic** (minimal, keyboard-first) and **Friendly** (VSCode-style toolbar with File / View / Run / AI menus) using the selector in the top-right corner. The mode is remembered per session.

### Key shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick open file |
| `Ctrl+Shift+P` | Command palette |
| `Ctrl+Enter` | Run current file |
| `Ctrl+S` | Save file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+F` | Search in files |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+Shift+A` | Toggle AI panel |
| `Ctrl+Shift+V` | HTML preview |
| `Ctrl+Shift+G` | Git: Commit |
| `Ctrl+Shift+H` | HTTP Client |
| `Ctrl+Shift+N` | .env Manager |
| `Ctrl+Shift+D` | DB Viewer |
| `Ctrl+Shift+J` | Activity Log |
| `Alt+Shift+F` | Format JSON |

Full reference: [snippets.md](snippets.md)

---

## Language support

| Language | Run | Trace | Highlight | Autocomplete | Notes |
|---|---|---|---|---|---|
| Python | ✓ | ✓ | ✓ | ✓ | Virtualenv auto-detection and selection |
| JavaScript | ✓ | — | ✓ | ✓ | Requires Node.js |
| TypeScript | ✓ | — | ✓ | ✓ | Runs via `tsx` (Node.js required) |
| TSX | — | — | ✓ | ✓ | Bundled via Vite; inline AI toolbar supported |
| Go | ✓ | — | ✓ | ✓ | Requires Go toolchain |
| Java | ✓ | — | ✓ | ✓ | Java 11+, single-file mode |
| HTML / CSS | preview | — | — | — | Live preview via `Ctrl+Shift+V` |

Adding a new language means one backend file (`lang_xxx.go`) and one frontend file (`modules/langs/xxx.js`).

---

## AI models

Sane runs models locally via Ollama. If Ollama isn't on your machine, Sane installs it for you when you first set up AI.

| Tier | Notes |
|---|---|
| Fast | Lightweight, good for most tasks |
| Balanced | Better reasoning, moderate size |
| Advanced | Highest quality, requires strong hardware |

Performance depends on your hardware. A modern machine with 16 GB RAM handles the Fast tier well. The Advanced tier benefits from a dedicated GPU.

---

## Changelog

### 1.1.0
- **TypeScript first-class support** — `.ts` files get syntax highlighting, autocomplete, and a Run button (via `tsx`); `.tsx` files get highlighting and inline AI toolbar; TypeScript workspace is auto-detected from the open file and injected into AI context
- **Curated dependency presets** — Project Builder now uses validated stack presets (react-vite-ts, node-express-ts, node-ts, vanilla-vite) with pinned known-good versions for 30+ packages instead of dynamically generating dependency combinations
- **Post-generation sanitizer** — generated `package.json` is automatically corrected: hallucinated versions replaced with pinned ones, banned packages removed, `@types/*` for packages that ship native types stripped, misplaced entries moved to the right section
- **requirements.txt sanitizer** — Python dependency files are deduplicated and versions corrected against a curated Python package table
- **Dotfiles visible** — `.env`, `.gitignore`, `.eslintrc`, and other dotfiles now appear in the file tree (previously hidden by the backend)

### 1.0.0
- **Unified AI pipeline** — intent classification, context assembly, and streaming execution are now a single cohesive system; the "Project Builder mode" toggle is removed — intent is inferred automatically from your message in any language
- **Hybrid intent classifier** — regex fast path (EN + PT) with LLM fallback for ambiguous messages; handles Portuguese project requests natively without translation
- **Progressive markdown rendering** — AI responses render live as markdown during streaming (bold, code blocks, headers, lists) with 80ms throttle; stored as raw markdown for history persistence
- **Project Builder reliability** — improved plan prompts, per-file stack hints, manifest auto-inject when the model omits it, manifests always generated last so all dependencies are known

### 0.4.0
- **Git integration** — minimal, invisible Git support: file status badges (M/A/U) in the file tree update automatically; right-click any file → View Diff for a color-coded diff overlay; `Ctrl+Shift+G` opens a commit modal that stages and commits all changes in one step; hidden automatically for non-Git projects
- **Project Builder run commands** — after a build completes, the AI suggests the exact commands to run the project
- **Venv selector** — Python virtualenvs are detected and listed in the output panel; click to switch, persisted per project
- **Activity Log** shortcut moved to `Ctrl+Shift+J` (freed `G` for Git)

### 0.3.3
- **Project-aware AI** — every chat message automatically receives the project's file tree and contents of key files as context; no toggle needed — the model decides what's relevant
- **Chat history persistence** — messages are saved to `localStorage` and restored on reload; cleared only via the new ⌫ button (with confirmation)
- **Per-message delete** — × button on hover to remove individual messages or separators
- **Project Builder — Reject plan** — new ✕ Reject button on the review card to cancel a generated plan entirely
- **Project Builder — Resume card** stays visible after a choice: green when continued, red when discarded

### 0.3.2
- Chat history and per-message delete (superseded by 0.3.3 entry above)

### 0.3.1
- **Auto tree refresh** — file tree updates automatically every 3 seconds when files are added or removed; expanded folders are preserved across refreshes
- **Project Builder persistence** — build plan and per-file progress are saved to `localStorage`; if the build is interrupted (reload, app close), a resume card appears on next launch with a **Continue** button that picks up exactly where it left off

### 0.3.0
- **HTTP Client** — proxy any HTTP request through the backend, color-coded status, JSON pretty-print (`Ctrl+Shift+H`)
- **.env Manager** — list/edit/activate `.env` files, sensitive key masking, missing var detection, active env injected into every run (`Ctrl+Shift+N`)
- **DB Viewer** — browse SQLite tables with pagination and ad-hoc query runner; pure-Go driver, no extra tools required (`Ctrl+Shift+D`)
- **Dev Scheduler** — schedule shell commands to run on an interval while Sane is open; job definitions saved to `.sane-jobs.json`
- **JSON Viewer** — live validation status, Format button (`Alt+Shift+F`), and recursive collapsible tree view for `.json` files
- **Activity Log** — rolling 300-entry log of all toolkit and AI actions, grouped by day, persisted in `localStorage` (`Ctrl+Shift+J`)
- **AI Feature Settings** — toggle Run Insight, Self-Healing, and Intent Detection independently via the `⚙` button in the AI panel
- **Delete key in file tree** — `Delete` or `Shift+Delete` on a selected file triggers the delete flow

### 0.2.0
- **Go and Java language support** — run, syntax highlight, and autocomplete
- **Language module system** — each language lives in its own file (`backend/lang_xxx.go` + `frontend/modules/langs/xxx.js`); adding a new language requires only those two files
- **Classic / Friendly UI mode** — Friendly mode adds a VSCode-style menu toolbar (File / View / Run / AI)
- **Recent projects** — history of last 8 folders, auto-reopens the last one on launch
- **Custom dark installer** — NSIS installer with branded header and sidebar
- **Ollama install UX** — post-install shows a "restart required" message instead of attempting unreliable auto-start

### 0.1.0
- Initial release: Python and JavaScript execution, built-in AI via Ollama, execution timeline, project builder, AI refactor, self-healing

---

## Built with AI assistance

This project was built with heavy AI assistance — code generation, iteration, debugging, and feature exploration were all AI-accelerated.

The goal was speed of development and rapid iteration, not a polished architecture from day one. Some parts of the code reflect that. It works, it ships, and it will improve.

If you read the source and see something worth improving, a PR is welcome.

---

## Roadmap

- [x] Go and Java language support
- [x] Project-wide AI context
- [x] Git integration — file status in tree, quick diff, simple commit flow
- [x] TypeScript and TSX language support
- [x] Curated Project Builder with reliable dependency presets
- [ ] macOS and Linux builds
- [ ] PHP and Ruby language support
- [ ] Editor enhancements — multi-cursor, split view, minimap, custom snippets, find & replace with regex

---

## Contributing

Contributions are welcome. The project is early and there is plenty of room to improve across the editor core, AI features, and UI.

1. Fork the repo
2. Create a branch for your change
3. Open a pull request with a clear description

Not sure where to start? Open an issue.

---

## License

MIT — see [LICENSE](LICENSE) for details.
