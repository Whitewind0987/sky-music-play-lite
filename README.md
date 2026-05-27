# SkyMusicPlay Lite

SkyMusicPlay Lite is an early-stage Windows desktop application for learning
and rebuilding a small, maintainable Sky: Children of the Light music-playing
helper.

The goal is not to clone the old reference project all at once. The goal is to
build a simple, understandable desktop app step by step.

## Current Status

This project is in early development.

Application code has not been created yet. The first step is to define the
project rules and scope before adding Tauri, React, TypeScript, or Rust files.

## Fixed Technology Stack

This project will use:

- Tauri v2
- React
- TypeScript
- Rust
- Vite
- Git and GitHub
- Windows first

The first version will not use Electron, Python, Vue, Svelte, Next.js, Flutter,
Qt, C#, Java, or a pure Rust GUI.

## First-Version Scope

The first usable version should stay small and understandable. It may include:

- A resizable Windows desktop app
- Basic React UI
- Simple text score input
- Simple score parsing
- In-app keyboard preview
- Preview playback timing
- Play, pause, resume, and stop controls
- Log and error display
- Minimal frontend-to-Rust command calls
- Rust dry-run playback
- Simple key mapping
- Experimental keyboard simulation behind a manual toggle
- Local settings persistence
- Simple JSON score import
- Windows build verification

## Explicitly Postponed Features

These features are intentionally postponed:

- Full clone of the archived reference project
- YOLO or image recognition
- Audio-to-score conversion
- MIDI conversion
- Cloud score library
- Account system
- Sync system
- Auto update
- Code signing
- Installer beautification
- Emulator-specific support
- WebSocket architecture
- Python backend
- Multi-window system
- Plugin system
- Complex themes or animation system
- Online marketplace
- Automatic game detection

If one of these features is needed later, it should be planned as a separate
future phase.
