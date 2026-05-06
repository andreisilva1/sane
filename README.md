<div align="center">

<img src="src-tauri/icons/icon.png" alt="Sane" width="96" />

# Sane

**A local-first code editor for Python, JavaScript, Go, and Java.**  
Built-in AI. Zero cloud. Keyboard-first.

[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest)
[![Version](https://img.shields.io/badge/version-0.3.1-22863a?style=flat-square)](https://github.com/andreisilva1/sane/releases/latest)

[![Tauri](https://img.shields.io/badge/Tauri-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Go](https://img.shields.io/badge/Go-00ADD8?style=flat-square&logo=go&logoColor=white)](https://go.dev)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Ollama](https://img.shields.io/badge/Ollama-local%20AI-gray?style=flat-square)](https://ollama.ai)

</div>

---

## Why this exists

Most editors have become sprawling platforms. AI integrations usually mean cloud APIs, accounts, and data leaving your machine. Setup friction is high, and the tools often get in the way of the actual work.

Sane is the opposite: a focused editor that runs your code, understands it, and helps you build projects — without setup, without subscriptions, and without sending anything to the cloud.

---

## Features

### Editor
- Syntax highlighting for Python, JavaScript, Go, and Java — each in its own language module
- Smart indent, auto-pairs, and block indentation
- Go to Definition, Find References, Rename Symbol
- Extract Function, Inline Variable, Remove Dead Code
- Drag-and-drop file and folder management
- Classic and Friendly UI modes — Friendly adds a VSCode-style menu toolbar

### Execution
- Run Python, JavaScript, Go, and Java with a single keystroke (`Ctrl+Enter`)
- Zero configuration — Python virtualenvs detected automatically, others use system PATH
- Java uses single-file execution mode (Java 11+) — no manual `javac` step
- Integrated terminal with multiple sessions
- **Execution Timeline** — step through Python code line by line, inspect variable state at each step
- **Run Insight** — automatic one-sentence AI summary of what your code did after each run

### Built-in AI (fully local)
- Powered by Ollama — installed automatically, no accounts, no API keys
- AI chat panel with streaming responses
- **Project Builder** — describe a project, generate real multi-file scaffolding
- AI Refactor with diff preview and approval step
- **Self-Healing** — detects common runtime errors, suggests or applies fixes automatically
- **Intent Detection** — reads your code and surfaces relevant actions contextually
- Quick Fix and AI Fix on editor errors
- Your code never leaves your machine

### Dev Toolkit
- **HTTP Client** — send any HTTP request directly from the editor, JSON auto-formatted (`Ctrl+Shift+H`)
- **.env Manager** — browse, edit, and activate `.env` files; sensitive values masked by default; detects vars referenced in open file (`Ctrl+Shift+N`)
- **DB Viewer** — browse SQLite databases: table list, paginated rows, ad-hoc query runner (`Ctrl+Shift+D`)
- **Dev Scheduler** — run shell commands on a recurring interval while Sane is open; persists job definitions across restarts
- **Port Manager** — detects `EADDRINUSE` on run failure, identifies the owning process, and offers a one-click kill
- **JSON Viewer** — live validation badge, Format button, and recursive tree view for `.json` files (`Alt+Shift+F`)
- **Activity Log** — rolling log of all toolkit actions, grouped by day, persisted in `localStorage` (`Ctrl+Shift+G`)

### Workflow
- Command palette (`Ctrl+Shift+P`) — commands in one place
- Quick Open (`Ctrl+P`) — jump to any file
- Global search across files (`Ctrl+Shift+F`)
- Recent projects — automatically reopens the last folder on launch
- Fully keyboard-navigable — mouse optional
- Theme panel with built-in themes and custom color support
- HTML preview with live refresh

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

[![Download Installer](https://img.shields.io/badge/Download%20Installer-.exe-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest/download/Sane_0.3.0_x64-setup.exe)
[![Download MSI](https://img.shields.io/badge/Download%20MSI-.msi-6E40C9?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest/download/Sane_0.3.0_x64_en-US.msi)

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
Open a `.py`, `.js`, `.go`, or `.java` file and press `Ctrl+Enter`. Output streams in real time in the integrated panel. For Python files with `input()`, an inline stdin field appears automatically.

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
| `Ctrl+Shift+B` | Project Builder |
| `Ctrl+Shift+V` | HTML preview |
| `Ctrl+Shift+H` | HTTP Client |
| `Ctrl+Shift+N` | .env Manager |
| `Ctrl+Shift+D` | DB Viewer |
| `Ctrl+Shift+G` | Activity Log |
| `Alt+Shift+F` | Format JSON |

Full reference: [snippets.md](snippets.md)

---

## Language support

| Language | Run | Trace | Highlight | Autocomplete | Notes |
|---|---|---|---|---|---|
| Python | ✓ | ✓ | ✓ | ✓ | Virtualenv auto-detection |
| JavaScript | ✓ | — | ✓ | ✓ | Requires Node.js |
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

### 0.3.1
- **Auto tree refresh** — file tree updates automatically every 3 seconds when files are added or removed; expanded folders are preserved across refreshes
- **Project Builder persistence** — build plan and per-file progress are saved to `localStorage`; if the build is interrupted (reload, app close), a resume card appears on next launch with a **Continue** button that picks up exactly where it left off

### 0.3.0
- **HTTP Client** — proxy any HTTP request through the backend, color-coded status, JSON pretty-print (`Ctrl+Shift+H`)
- **.env Manager** — list/edit/activate `.env` files, sensitive key masking, missing var detection, active env injected into every run (`Ctrl+Shift+N`)
- **DB Viewer** — browse SQLite tables with pagination and ad-hoc query runner; pure-Go driver, no extra tools required (`Ctrl+Shift+D`)
- **Dev Scheduler** — schedule shell commands to run on an interval while Sane is open; job definitions saved to `.sane-jobs.json`
- **Port Manager** — detects port conflicts on run failure, identifies the owning process, and offers a one-click kill
- **JSON Viewer** — live validation status, Format button (`Alt+Shift+F`), and recursive collapsible tree view for `.json` files
- **Activity Log** — rolling 300-entry log of all toolkit and AI actions, grouped by day, persisted in `localStorage` (`Ctrl+Shift+G`)
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
- [ ] macOS and Linux builds
- [ ] TypeScript and Rust language support
- [ ] Project-wide AI context
- [ ] Performance improvements for large files
- [ ] Plugin system
- [ ] Improved Project Builder with dependency resolution

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
