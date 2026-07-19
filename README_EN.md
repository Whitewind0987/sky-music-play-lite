<div align="center">

# SkyMusicPlay Lite

Lightweight · Windows · Tauri · React · Rust

[简体中文](./README.md) | [English](./README_EN.md)

</div>

## 丨Introduction

SkyMusicPlay Lite is a lightweight Windows desktop automatic music-playing tool for Sky: Children of the Light.

It is built with **Tauri v2 + React + TypeScript + Rust**, aiming to provide a clean, lightweight, and controllable desktop experience for score library management, preview playback, and real playback.

Current version: **v0.5.0**.
v0.5.0 is the current stable recommended release.

## 丨Download

Download the latest version from GitHub Releases:

- [Releases](https://github.com/Whitewind0987/sky-music-play-lite/releases)

## 丨User Manual

- [SkyMusicPlay Lite User Manual](https://www.kdocs.cn/l/ca0kaYgxB59Z)

The manual is currently written in Simplified Chinese.

## 丨Features

- Built-in scores
- On-demand built-in score loading
- Local score import
- Drag-and-drop score import
- SkyStudio-style score parsing
- `scores-v2` score format
- Per-note `duration` with long-note and sustained-note playback
- V2 score badge
- Upgrade V1 scores to V2
- Encrypted numeric score import
- Score library search
- Liked scores
- User-created playlists
- Playback queue
- Play next
- In-app keyboard preview
- Bottom player
- Play / pause / resume / stop
- Progress seeking
- Playback speed adjustment
- Note interval adjustment
- Repeat all / repeat one / shuffle
- Custom key mapping
- Local data persistence
- Always-on-top window
- Playback logs
- In-app update notification
- Preserve the existing installation directory during Windows installer upgrades
- Sky window auto-detection, including recognition when Sky is opened, closed, and reopened
- Local score record recovery, including missing library records from existing managed score files
- Windows real playback

## 丨Library and Player

The library supports:

- Built-in scores
- Local imports
- Liked scores
- User-created playlists
- Search
- Pagination
- Add to queue
- Play next
- Local score record recovery, including missing library records from existing managed score files

The bottom player supports:

- Play, pause, resume, and stop
- Next track
- Shuffle
- Repeat mode
- Playback queue
- Playback speed
- Note interval
- Playback progress
- V2 score badge
- V2 long-note and sustained-note playback
- Pause, progress seeking, and speed adjustment with V2 scores

## 丨Real Playback

SkyMusicPlay Lite includes real playback functionality.

Real playback is enabled by default and uses target-window playback by default. SkyMusicPlay Lite can automatically detect the Sky window and recognize when Sky is opened, closed, and reopened. Automatic detection may not work in every environment, so manual refresh and window selection remain available in Settings as a fallback.
Before using it, please understand and follow the rules of the related game or software.

Current real playback modes:

- **Background playback**: attempts to send key input to the selected target game window.
- **Foreground playback**: sends simulated keyboard input to the current foreground window.

Background playback provides two compatibility options:

- **Enhanced background playback (recommended)**
- **Chord compatibility**

## 丨Administrator Permission

SkyMusicPlay Lite may request administrator permission on Windows startup.

This helps reduce failures caused by permission differences between the app and the target window when using real playback.

If Windows shows a User Account Control (UAC) prompt when launching the app, confirm it to continue.

## 丨Updates

SkyMusicPlay Lite supports update checks on startup.

v0.5.0 is the current stable recommended release.

There are two update types:

- **Recommended update**: recommended for all users.
- **Alpha update**: testing release, can be ignored for the current version.

If you prefer a more stable experience, you may wait for recommended updates.  
If you want to try new features earlier, you may install Alpha updates.

## 丨Development Environment

Recommended development environment:

- **Operating system**: Windows 10 / Windows 11
- **Node.js**: 20+
- **Rust**: stable
- **Tauri**: v2
- **Package manager**: npm
- **Editor**: Visual Studio Code

Required dependencies:

- Node.js
- Rust
- Tauri system dependencies
- Microsoft C++ Build Tools / Visual Studio Build Tools

## 丨Tech Stack

- **Tauri v2**
- **React**
- **TypeScript**
- **Rust**
- **Vite**

## 丨Local Development

Install dependencies:

```bash
npm install
```

Start the development app:

```bash
npm run tauri dev
```

Run tests:

```bash
npm run test
```

Build the frontend:

```bash
npm run build
```

Check Rust code:

```bash
cd src-tauri
cargo check
cargo test
cd ..
```

Build the app package:

```bash
npm run tauri build
```

## 丨Feedback

If you encounter any issues, please submit feedback through [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues).

## 丨Community & Contact

- **QQ Group**: `632482169`
- **GitHub**: [@Whitewind0987](https://github.com/Whitewind0987)

You are welcome to discuss usage, feature ideas, and music scores in the QQ group. For bug reports, please use [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues) whenever possible.

## 丨License

This project is open-sourced under the **MIT License**.

See [LICENSE](./LICENSE) for details.

## 丨Acknowledgements

SkyMusicPlay Lite is inspired by [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows) and other related Sky-style auto music playback tools.

The built-in score resources and score decryption logic are used with permission from the original author of [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows).  
If you reuse related resources or logic, please preserve the original source and author attribution.

Thanks to [@wjhhuizi](https://github.com/wjhhuizi) for submitting [PR #1](https://github.com/Whitewind0987/sky-music-play-lite/pull/1), which provided the core proposal and initial implementation for the `scores-v2` format and long-note support.

This project is an independent lightweight implementation.
