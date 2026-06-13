<div align="center">

# SkyMusicPlay Lite

Lightweight · Windows · Tauri · React · Rust

[简体中文](./README.md) | [English](./README_EN.md)

</div>

## 丨Introduction

SkyMusicPlay Lite is a lightweight Windows desktop automatic music-playing tool for Sky: Children of the Light.

It is built with **Tauri v2 + React + TypeScript + Rust**, aiming to provide a clean, lightweight, and controllable desktop experience for score library management, preview playback, and real playback.

Current version: **v0.2.0 Alpha 1**.  
This is an Alpha testing release. Some features are still being improved, and undiscovered issues may still exist.

## 丨Download

Download the latest version from GitHub Releases:

- [Releases](https://github.com/Whitewind0987/sky-music-play-lite/releases)

For most Windows users, the `.exe` installer is recommended.

Please close the old version before installing a new one.  

## 丨User Manual

- [SkyMusicPlay Lite User Manual](https://www.kdocs.cn/l/ca0kaYgxB59Z)

The manual is currently written in Simplified Chinese.

For first-time users, it is recommended to read the quick start, real playback, and FAQ sections first.

## 丨Features

- Built-in scores
- On-demand built-in score loading
- Local score import
- Drag-and-drop score import
- SkyStudio-style score parsing
- Legacy encrypted numeric score import
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
- Playback logs
- In-app update notification
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

The bottom player supports:

- Play, pause, resume, and stop
- Next track
- Shuffle
- Repeat mode
- Playback queue
- Playback speed
- Note interval
- Playback progress

## 丨Real Playback

SkyMusicPlay Lite includes real playback functionality.

Real playback is disabled by default and must be manually enabled in Settings.  
Before using it, please understand and follow the rules of the related game or software.

Current real playback modes:

- **Background playback**: attempts to send key input to the selected target game window.
- **Foreground playback**: sends simulated keyboard input to the current foreground window.

Background playback provides two compatibility options:

- **Enhanced background playback (recommended)**
- **Chord compatibility**

It is generally recommended to try “Enhanced background playback” first.  
If some chords or combined keys do not work correctly, try switching to “Chord compatibility”.

If background playback does not work in your environment, try foreground playback instead.

These features are still experimental and are not guaranteed to work on all systems, permission levels, window states, or game environments.

## 丨Administrator Permission

SkyMusicPlay Lite may request administrator permission on Windows startup.

This helps reduce failures caused by permission differences between the app and the target window when using real playback.

If Windows shows a User Account Control (UAC) prompt when launching the app, confirm it to continue.

## 丨Updates

SkyMusicPlay Lite supports update checks on startup.

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

When reporting an issue, please provide:

- App version
- Windows version
- Screenshots
- Steps to reproduce
- Whether real playback is enabled
- Whether you are using background playback or foreground playback
- Whether the issue is reproducible
- Log files or screen recordings

## 丨Contact

- **GitHub**: [@Whitewind0987](https://github.com/Whitewind0987)
- **Email**: whitewind0569@gmail.com
- **Feedback and suggestions**: please submit issues, suggestions, or usage feedback through [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues)

## 丨License

This project is open-sourced under the **MIT License**.

See [LICENSE](./LICENSE) for details.

## 丨Acknowledgements

SkyMusicPlay Lite is inspired by [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows) and other related Sky-style auto music playback tools.

The built-in score resources and score decryption logic are used with permission from the original author of [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows).  
If you reuse related resources or logic, please preserve the original source and author attribution.

This project is an independent lightweight implementation.
