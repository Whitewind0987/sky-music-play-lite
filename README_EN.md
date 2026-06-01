<div align="center">

# SkyMusicPlay Lite

Lightweight · Windows · Tauri · React · Rust

[简体中文](./README.md) | [English](./README_EN.md)

</div>

## 丨About

SkyMusicPlay Lite is a lightweight Windows desktop tool for Sky-style score playback.

The project is built with **Tauri v2 + React + TypeScript + Rust**. Its goal is to provide a smaller, clearer, and more maintainable desktop implementation.

This project is still under development, and features will be improved over time.

## 丨Features

- Local score library
- Local score import
- Sky-style score parsing
- In-app keyboard preview
- Bottom player
- Play / pause / resume / stop
- Playback speed control
- Note interval delay control
- Repeat / shuffle playback
- Custom key mapping
- Playback logs
- Experimental Windows input features

## 丨Experimental Input

SkyMusicPlay Lite includes experimental input features.

Experimental features are disabled by default and must be enabled manually in Settings.  
Please understand and follow the rules of the game or software you use before enabling them.

Current experimental input modes include:

- **Foreground Input Mode**: sends simulated keyboard input to the current foreground window.
- **Target Window Message Mode**: sends keyboard messages to the selected target window handle.

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

SkyMusicPlay Lite is inspired by SkyMusicPlay-for-Windows and related Sky-style music playback tools.

This project is a separate lightweight implementation. 
