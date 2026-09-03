<div align="center">

# SkyMusicPlay Lite

<p>
  <a href="https://github.com/Whitewind0987/sky-music-play-lite"><img src="https://img.shields.io/badge/Windows-0078D4?style=flat&amp;logo=windows&amp;logoColor=white" alt="Windows"></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Tauri-24C8DB?style=flat&amp;logo=tauri&amp;logoColor=white" alt="Tauri"></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-20232A?style=flat&amp;logo=react&amp;logoColor=61DAFB" alt="React"></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/Rust-000000?style=flat&amp;logo=rust&amp;logoColor=white" alt="Rust"></a>
</p>

<p>
  <a href="https://github.com/Whitewind0987/sky-music-play-lite"><img src="https://img.shields.io/github/stars/Whitewind0987/sky-music-play-lite?style=flat&amp;label=Stars" alt="Stars"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--only-blue?style=flat" alt="GPL-3.0-only"></a>
  <a href="https://github.com/Whitewind0987/sky-music-play-lite/releases/latest"><img src="https://img.shields.io/github/v/release/Whitewind0987/sky-music-play-lite?style=flat&amp;label=Latest" alt="Latest"></a>
  <a href="https://github.com/Whitewind0987/sky-music-play-lite/releases"><img src="https://img.shields.io/github/downloads/Whitewind0987/sky-music-play-lite/total?style=flat&amp;label=Downloads" alt="Downloads"></a>
  <a href="https://github.com/Whitewind0987/sky-music-play-lite/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Whitewind0987/sky-music-play-lite/ci.yml?branch=main&amp;style=flat&amp;label=CI" alt="CI"></a>
</p>

[简体中文](./README.md) | English

</div>

## 丨Introduction

SkyMusicPlay Lite is a lightweight automatic music-playing tool for **Sky: Children of the Light** on Windows.

Built with **Tauri v2 + React + TypeScript + Rust**, it provides score management, preview playback, and Windows real playback.

## 丨Quick Start

### Download

Download the latest stable version from **GitHub Releases**:

- [Download SkyMusicPlay Lite](https://github.com/Whitewind0987/sky-music-play-lite/releases/latest)

Two Windows installers are available:

- **Normal installer (recommended)**: smaller and suitable for most users
- **Bundled WebView2 installer**: includes the WebView2 offline installer for offline environments or systems where the normal installer cannot install WebView2

Both installers provide the same application features. They differ only in how WebView2 is installed.

### User Manual

For first-time setup or detailed usage instructions, see:

- [SkyMusicPlay Lite User Manual](https://www.kdocs.cn/l/ca0kaYgxB59Z)

The manual is currently written in Simplified Chinese.

## 丨Support the Project

SkyMusicPlay Lite will remain **free and open source**.

If you find the project useful and would like to support its continued maintenance, you can make a voluntary contribution through Afdian.

> ❤️ **[Support SkyMusicPlay Lite on Afdian](https://afdian.com/a/WhiteWind)**

Sponsorship does not affect access to any features and does not provide paid-exclusive features or development priority.

Thanks to everyone who uses, stars, provides feedback for, or supports SkyMusicPlay Lite.

## 丨Features

- **Score management**: built-in scores, local JSON / TXT import, drag-and-drop import, search, likes, playlists, pagination, and score export
- **Score formats**: SkyStudio-style scores, encrypted numeric scores, `scores-v2`, long / sustained notes, and V1 → V2 conversion
- **Playback controls**: play, pause, resume, stop, next track, seeking, playback speed, and note interval adjustment
- **Playback modes**: repeat all, repeat one, shuffle, playback queue, and Play Next
- **Score visualization**: keyboard and score-timeline visualization
- **Performance recording**: record manual performances in Sky and save them as local scores
- **Customization**: key mapping, playback shortcuts, Chinese / English UI, accent color, and exit confirmation
- **Other features**: Sky window auto-detection, always-on-top, runtime logs, in-app update notifications, and local data persistence and recovery

## 丨Real Playback

SkyMusicPlay Lite can convert scores into Windows keyboard input for real playback in the game.

Two playback methods are available:

- **Background playback**: sends key input to the selected target window without requiring the game window to remain in the foreground
- **Foreground playback**: sends simulated keyboard input to the current foreground window

Background playback supports automatic Sky window detection, and the target window can also be refreshed and selected manually.

Two background playback compatibility profiles are available:

- **Enhanced background playback (recommended)**
- **Chord compatibility**

If automatic detection does not find the correct Sky window, refresh and select the target window manually in Settings.

> Before using real playback, please understand and follow the rules of the related game or software.

### Administrator Permission

SkyMusicPlay Lite may request administrator permission when starting on Windows.

This helps reduce failures in features such as real playback when the application and target game window are running with different permission levels.

If Windows displays a User Account Control (UAC) prompt, confirm it to continue.

## 丨Development

Main tech stack:

- Tauri v2
- React
- TypeScript
- Rust
- Vite

Recommended development environment:

- Windows 10 / Windows 11
- Node.js 20+
- Rust stable
- npm
- Visual Studio Code

Install dependencies:

```bash
npm install
```

Start the development environment:

```bash
npm run tauri dev
```

Run frontend tests:

```bash
npm run test
```

Build the frontend:

```bash
npm run build
```

Check and test Rust:

```bash
cd src-tauri
cargo check
cargo test
cd ..
```

Build the Windows application:

```bash
npm run tauri build
```

## 丨Issue Reporting

If you encounter a bug, compatibility issue, or other unexpected behavior, please submit a report through [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues).

When submitting an issue, please include the application version, a description of the problem, and steps to reproduce it when possible.

## 丨Community & Contact

- **QQ Group**: `632482169`
- **GitHub**: [@Whitewind0987](https://github.com/Whitewind0987)

You are welcome to discuss usage, feature ideas, and music scores.

For bug reports and other issues, please use [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues) whenever possible.

## 丨License

SkyMusicPlay Lite software code is licensed under the **GNU General Public License version 3 only (GPL-3.0-only)**.

Copyright (C) 2026 Whitewind0987 and contributors

See [LICENSE](./LICENSE) for the complete current license and [NOTICE](./NOTICE) for historical notices and third-party resource information.

The built-in score resources under `public/builtin-scores/scores/` are used with permission from the original author of [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows). They are outside SkyMusicPlay Lite's GPL-3.0-only software-code grant, and the relevant rights remain with their respective rights holders.

## 丨Acknowledgements

SkyMusicPlay Lite is inspired by [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows) and other related Sky automatic music-playing tools.

The built-in score resources and the use of the score decryption compatibility logic / format rules are included with permission from the original author of [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows).

The built-in score resources are not covered by SkyMusicPlay Lite's GPL-3.0-only software-code license and remain subject to the rights of their respective rights holders. The current `src/lib/sheetDecrypt.ts` source is SkyMusicPlay Lite's own TypeScript compatibility implementation and is part of this project's software code.

Thanks to [@wjhhuizi](https://github.com/wjhhuizi) for submitting [PR #1](https://github.com/Whitewind0987/sky-music-play-lite/pull/1), which provided the core proposal and initial implementation for the `scores-v2` format and long-note support.

This project is an independent lightweight implementation.
