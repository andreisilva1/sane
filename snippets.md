# Sane — Keyboard Shortcuts

## Global

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick Open / Command Palette (prefix `>` for commands) |
| `Ctrl+N` | New file dialog |
| `Ctrl+Shift+N` | New folder dialog |
| `Ctrl+S` | Save current file |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Enter` | Run current Python file |
| `Ctrl+Shift+K` | Kill running Python execution |
| `Ctrl+`` ` `` | Toggle terminal |
| `Ctrl+Shift+F` | Global search (search in files) |
| `Ctrl+Shift+O` | Pop-out Output window (always-on-top floating window) |
| `Ctrl+,` | Theme panel |
| `Ctrl+Alt+G` | Grid Editor |
| `Ctrl+Alt+F` | Toggle Free Mode (resize handles + layout badge) |
| `Ctrl+Shift+I` | AI Refactor (Python files, requires active model) |
| `Ctrl+Shift+A` | Toggle AI panel |
| `Ctrl+Shift+B` | Toggle Project Builder mode |
| `Ctrl+Shift+P` | Toggle HTML Preview |
| `Ctrl+Shift+T` | Execution Timeline (Python files) |
| `Escape` | Cancel active AI stream (AI panel open) · Close AI panel (idle) · Cancel trace · Close timeline |

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

## Quick Open (Ctrl+P)

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
| `Ctrl+Shift+N` | New folder dialog (in current root) |
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
