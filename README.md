<div align="center">

<img src="src-tauri/icons/icon.png" alt="Sane" width="96" />

# Sane

**A local-first code editor for Python, HTML, CSS, and JavaScript.**  
Built-in AI. Zero cloud. Keyboard-first.

[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=flat-square&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest)
[![Version](https://img.shields.io/badge/version-0.1.0-22863a?style=flat-square)](https://github.com/andreisilva1/sane/releases/latest)

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
- Syntax highlighting for Python, JavaScript, HTML, CSS, JSON, Markdown
- Smart indent, auto-pairs, and block indentation
- Go to Definition, Find References, Rename Symbol
- Extract Function, Inline Variable, Remove Dead Code
- Drag-and-drop file and folder management

### Execution
- Run Python and JavaScript with a single keystroke (`Ctrl+Enter`)
- Zero configuration — no virtualenv setup required
- Integrated terminal with multiple sessions
- **Execution Timeline** — step through code line by line, inspect variable state at each step
- **Run Insight** — automatic one-sentence AI summary of what your code did after each run

### Built-in AI (fully local)
- Powered by [Ollama](https://ollama.ai) — no accounts, no API keys
- AI chat panel with streaming responses
- **Project Builder** — describe a project, generate real multi-file scaffolding
- AI Refactor with diff preview and approval step
- **Self-Healing** — detects common runtime errors, suggests or applies fixes automatically
- **Intent Detection** — reads your code and surfaces relevant actions contextually
- Quick Fix and AI Fix on editor errors
- Your code never leaves your machine

### Workflow
- Command palette (`Ctrl+P`) — files and commands in one place
- Global search across files (`Ctrl+Shift+F`)
- Fully keyboard-navigable — mouse optional
- Theme panel with built-in themes and custom color support
- Floating output window (always-on-top)
- Grid editor for side-by-side comparison
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

[![Download Installer](https://img.shields.io/badge/Download%20Installer-.exe-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest/download/Sane_0.1.0_x64-setup.exe)
[![Download MSI](https://img.shields.io/badge/Download%20MSI-.msi-6E40C9?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/andreisilva1/sane/releases/latest/download/Sane_0.1.0_x64_en-US.msi)

</div>

| Format | Description |
|---|---|
| `.exe` (recommended) | NSIS installer, standard Windows setup experience |
| `.msi` | Windows Installer package, suitable for managed deployments |

> macOS and Linux builds are on the roadmap.

---

## Build from source

**Requirements:** [Node.js](https://nodejs.org) · [Rust](https://rustup.rs) · [Go](https://go.dev) · [Tauri CLI](https://tauri.app)

```bash
git clone https://github.com/andreisilva1/sane
cd sane

# Build the Go backend
cd backend
go build -o ../src-tauri/binaries/sane-backend-x86_64-pc-windows-msvc.exe .
cd ..

# Build the app
npx tauri build
```

Installer output: `src-tauri/target/release/bundle/`

---

## Usage

### Running the editor
Open the installed app or run `sane.exe` directly.

### Opening files
`Ctrl+P` to open any file. Use the sidebar to browse project folders.

### Running code
Open a `.py` or `.js` file and press `Ctrl+Enter`. Output appears in the integrated panel.

### Using AI
1. Install [Ollama](https://ollama.ai) and make sure it's running
2. Open the AI panel (`Ctrl+Shift+A`)
3. Click the tier button and select a model — Sane downloads it for you

### Key shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Command palette / quick open |
| `Ctrl+Enter` | Run current file |
| `Ctrl+Shift+A` | Toggle AI panel |
| `Ctrl+Shift+B` | Toggle Project Builder |
| `Ctrl+Shift+T` | Execution Timeline |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+S` | Save file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+F` | Search in files |

Full reference: [snippets.md](snippets.md)

---

## AI models

Sane uses [Ollama](https://ollama.ai) to run models locally. Three built-in tiers:

| Tier | Notes |
|---|---|
| Fast | Lightweight, good for most tasks |
| Balanced | Better reasoning, moderate size |
| Advanced | Highest quality, requires strong hardware |

Performance depends on your hardware. A modern machine with 16 GB RAM handles the Fast tier well. The Advanced tier benefits from a dedicated GPU.

---

## Built with AI assistance

This project was built with heavy AI assistance — code generation, iteration, debugging, and feature exploration were all AI-accelerated.

The goal was speed of development and rapid iteration, not a polished architecture from day one. Some parts of the code reflect that. It works, it ships, and it will improve.

If you read the source and see something worth improving, a PR is welcome.

---

## Roadmap

- [ ] macOS and Linux builds
- [ ] TypeScript, Rust, Go language support
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
