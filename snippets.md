# Sane — Keyboard Shortcuts

## Global

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick Open (jump to any file) |
| `Ctrl+Shift+P` | Command Palette (prefix `>` to run commands) |
| `Ctrl+S` | Save current file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Enter` | Run current file (Python / JS / Go / Java) |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+Shift+F` | Global search (search in files) |
| `Ctrl+,` | Theme panel |
| `Ctrl+Shift+I` | AI Refactor |
| `Ctrl+Shift+A` | Toggle AI panel |
| `Ctrl+Shift+B` | Toggle Project Builder mode |
| `Ctrl+Shift+V` | Toggle HTML Preview |
| `Ctrl+Shift+T` | Task Mode / Execution Timeline |
| `Ctrl+Shift+C` | Project Context |
| `Ctrl+Shift+M` | Project Memory |
| `Escape` | Close any panel or overlay |
| **Git** | |
| `Ctrl+Shift+G` | Commit all changes (opens commit modal) |
| Right-click file | View Diff — color-coded diff vs HEAD |
| **Dev Toolkit** | |
| `Ctrl+Shift+H` | HTTP Client |
| `Ctrl+Shift+N` | .env Manager |
| `Ctrl+Shift+D` | DB Viewer (auto-opens when clicking a `.db` / `.sqlite` file) |
| `Ctrl+Shift+J` | Activity Log |
| `Alt+Shift+F` | Format JSON (when a `.json` file is open) |
| Command Palette | Git: View Diff (current file) |
| Command Palette | Port Manager (triggered automatically on port conflict, or open via palette) |
| Command Palette | Dev Scheduler (open via command palette) |

## Editor

| Shortcut | Action |
|---|---|
| `Tab` | Indent selection (4 spaces) |
| `Shift+Tab` | Dedent selection |
| `Enter` | Smart auto-indent (matches indentation; adds level after `:`) |
| `Backspace` | Smart backspace (removes indent block or auto-pair) |
| `(` `[` `{` `'` `"` `` ` `` | Auto-closes pair, wraps selection if text is selected |
| `Ctrl+.` | Quick Fix (if error active) · Autocomplete otherwise |
| `Ctrl+Shift+.` | Fix with AI (requires active AI model and error) |
| `Ctrl+Shift+R` | Rename Symbol (Python files) |
| `Ctrl+Shift+Z` | Undo last refactor |
| `F2` | Rename Symbol (Python, editor focused) · Rename file/folder (tree focused) |
| `F12` | Go to Definition (Python files) |
| `Shift+F12` | Find References (Python files) |
| `Ctrl+Alt+←` | Navigate back (navigation history) |
| `Ctrl+Alt+→` | Navigate forward (navigation history) |

## Autocomplete (Ctrl+.)

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Navigate suggestions |
| `Enter` / `Tab` | Insert selected suggestion |
| `Escape` | Close |

> Hover over any imported name in a `.py` file to see its import source.

## Editor Right-Click Menu

| Item | Shortcut | Description |
|---|---|---|
| Cut | `Ctrl+X` | Cut selected text |
| Copy | `Ctrl+C` | Copy selected text |
| Paste | `Ctrl+V` | Paste from clipboard |
| Save | `Ctrl+S` | Save current file |
| Run | `Ctrl+Enter` | Run current Python file (Python files only) |
| Go to Definition | `F12` | Jump to where the symbol under cursor is defined (Python only) |
| Find References | `Shift+F12` | Open References panel listing all uses of the symbol (Python only) |
| Explain with AI | — | Stream an AI explanation of the selected code (requires AI model selected) |
| Search in files | `Ctrl+Shift+F` | Open global search, pre-filled with selected text |
| Rename Symbol | `F2` / `Ctrl+Shift+R` | Rename all occurrences of the symbol under cursor (Python only, skips strings/comments) |
| Extract Function | — | Wrap selection in a new function with auto-detected params (Python only) |
| Inline Variable | — | Replace variable with its assigned value on the current line (Python only) |
| Remove Dead Code | — | Remove assigned variables that are never used (Python only) |
| AI Refactor | `Ctrl+Shift+I` | Two-pass AI refactoring with diff preview and approval step (Python + model required) |

## Quick Open (Ctrl+P) / Command Palette (Ctrl+Shift+P)

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Navigate results |
| `Enter` | Open selected file or run command |
| `Escape` | Close |

## Global Search (Ctrl+Shift+F)

| Shortcut | Action |
|---|---|
| `↑` / `↓` | Navigate results |
| `Enter` | Open file at result line |
| `Escape` | Close |

## New File Dialog (Ctrl+N)

| Shortcut | Action |
|---|---|
| `Enter` | Create file |
| `Escape` | Cancel |

## File Tree

| Shortcut / Action | Description |
|---|---|
| `Right-click` file or folder | Context menu: New File, New Folder, Rename, Delete |
| `F2` | Rename selected file or folder |
| `Delete` / `Shift+Delete` | Delete selected file or folder |
| Drag file / folder → folder | Move item into target folder |

## Execution Timeline (Ctrl+Shift+T)

| Shortcut | Action |
|---|---|
| `←` / `→` | Step backward / forward one step |
| `Ctrl+←` / `Ctrl+→` | Jump backward / forward 10 steps |
| `Home` | Jump to first step |
| `End` | Jump to last step |
| `Escape` | Close timeline |

## Terminal (Ctrl+`)

| Shortcut | Action |
|---|---|
| `Enter` | Run command |
| `↑` / `↓` | Navigate command history |
| `Ctrl+L` | Clear terminal output |
