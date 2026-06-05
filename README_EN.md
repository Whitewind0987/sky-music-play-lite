<div align="center">

# SkyMusicPlay Lite

Lightweight · Windows · Tauri · React · Rust

[简体中文](./README.md) | [English](./README_EN.md)

</div>

## 丨About

SkyMusicPlay Lite is a lightweight Windows desktop automatic music-playing tool for Sky: Children of the Light.

The project is built with **Tauri v2 + React + TypeScript + Rust**, aiming to provide a lighter, clearer, and more controllable desktop experience for score library management, playback, and experimental input.

The project is currently in alpha development. Features, UI, and data structures may still change over time.

## 丨Features

- Built-in scores
- Local score library
- Local score import
- SkyStudio-style score parsing
- Library search
- Liked songs
- User playlists
- Playback queue
- Play Next
- In-app keyboard preview
- Bottom player
- Play / pause / resume / stop
- Playback speed control
- Note interval delay control
- Repeat / repeat one / shuffle playback
- Custom key mapping
- Local app data persistence
- Playback logs
- Experimental Windows input features

## 丨Experimental Input

SkyMusicPlay Lite includes experimental input features.

Experimental features are disabled by default and must be enabled manually in Settings.  
Please understand and follow the rules of the related game or software before using them.

Current experimental input modes include:

- **Foreground Input Mode**: sends keyboard input to the current foreground window.
- **Target Window Message Mode**: sends keyboard messages to the selected target window handle.

Target-window message mode provides multiple compatibility profiles, including basic message mode, scan code compatibility mode, grouped key compatibility mode, and activation message compatibility mode.

These features are still experimental and are not guaranteed to work on every system, permission level, window state, or game environment.

## 丨Development Environment

Recommended development environment:

- **Operating System**: Windows 10 / Windows 11
- **Node.js**: 20+
- **Rust**: stable
- **Tauri**: v2
- **Package Manager**: npm
- **Editor**: Visual Studio Code

Required tools:

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

Run the development app:

```bash
npm run tauri dev
```

Build the frontend:

```bash
npm run build
```

Check Rust code:

```bash
cd src-tauri
cargo check
cd ..
```

## 丨Contact

- **GitHub**: [@Whitewind0987](https://github.com/Whitewind0987)
- **Email**: whitewind0569@gmail.com
- **Feedback**: Please use GitHub Issues for bug reports, suggestions, or general feedback

## 丨License

This project is licensed under the **MIT License**.

See [LICENSE](./LICENSE) for details.

## 丨Credits

SkyMusicPlay Lite is inspired by SkyMusicPlay-for-Windows and other automatic music-playing tools for Sky: Children of the Light.

Built-in score resources are used with permission from the author of SkyMusicPlay-for-Windows.  
Please keep attribution to the original source when reusing these resources.

This project is a separate lightweight implementation.
