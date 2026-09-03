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

简体中文 | [English](./README_EN.md)

</div>

## 丨项目简介

SkyMusicPlay Lite 是一款面向 Windows 的轻量级《Sky 光·遇》自动弹琴工具。

项目使用 **Tauri v2 + React + TypeScript + Rust** 构建，提供曲谱管理、预览播放、Windows 真实播放等功能。

## 丨快速开始

### 下载

请前往 **GitHub Releases** 下载最新稳定版本：

- [下载 SkyMusicPlay Lite](https://github.com/Whitewind0987/sky-music-play-lite/releases/latest)

提供两种 Windows 安装包：

- **正常版（推荐）**：体积较小，适合大多数用户
- **内置 WebView2 版**：包含 WebView2 离线安装程序，适合离线环境或正常版无法安装 WebView2 的情况

两个版本的软件功能相同，仅 WebView2 的安装方式不同。

### 使用手册

第一次使用或需要了解详细功能时，可以查看：

- [SkyMusicPlay Lite 使用手册](https://www.kdocs.cn/l/ca0kaYgxB59Z)

## 丨支持项目

SkyMusicPlay Lite 会继续保持 **免费和开源**。

如果这个项目对你有帮助，并且愿意支持项目的持续维护，可以通过爱发电进行自愿赞助。

> ❤️ **[在爱发电支持 SkyMusicPlay Lite](https://afdian.com/a/WhiteWind)**

赞助不会影响任何功能的使用，也不会提供付费专属功能或功能优先权。

感谢每一位使用、Star、反馈和支持 SkyMusicPlay Lite 的人。

## 丨主要功能

- **曲谱管理**：内置曲谱、本地 JSON / TXT 导入、拖拽导入、搜索、我喜欢、歌单、分页与曲谱导出
- **曲谱格式**：支持 SkyStudio-style、加密数字曲谱和 `scores-v2`，支持长音 / 延音以及 V1 → V2 转换
- **播放控制**：播放、暂停、继续、停止、下一首、进度拖动、倍速和音符间隔调节
- **播放模式**：列表循环、单曲循环、随机播放、播放队列与下一首播放
- **曲谱可视化**：提供琴键和曲谱时间线可视化
- **演奏录制**：可记录光遇中的手动演奏，并保存为本地曲谱
- **自定义设置**：键位映射、播放快捷键、中英文界面、强调色与退出确认
- **其他功能**：光遇窗口自动检测、窗口始终置顶、运行日志、App 内更新提醒以及本地数据持久化与恢复

## 丨真实播放

SkyMusicPlay Lite 可以将曲谱转换为 Windows 键盘输入，在游戏中进行真实播放。

目前支持两种播放方式：

- **后台播放**：向选定的目标窗口发送按键，不需要持续保持游戏窗口在前台
- **前台播放**：向当前前台窗口发送模拟键盘输入

后台播放支持自动检测光遇窗口，也可以手动刷新并选择目标窗口。

提供两个后台播放兼容方案：

- **后台播放增强（推荐）**
- **组合按键兼容**

如果自动检测没有正确找到光遇窗口，可以前往设置手动刷新并选择目标窗口。

> 使用真实播放功能前，请自行了解并遵守相关游戏或软件的规则。

### 管理员权限

SkyMusicPlay Lite 在 Windows 上启动时可能会请求管理员权限。

这是为了降低应用与目标游戏窗口权限不一致时，真实播放等功能出现失败的概率。

如果 Windows 显示用户账户控制（UAC）提示，请确认后继续。

## 丨开发

主要技术栈：

- Tauri v2
- React
- TypeScript
- Rust
- Vite

推荐开发环境：

- Windows 10 / Windows 11
- Node.js 20+
- Rust stable
- npm
- Visual Studio Code

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run tauri dev
```

运行前端测试：

```bash
npm run test
```

构建前端：

```bash
npm run build
```

检查并测试 Rust：

```bash
cd src-tauri
cargo check
cargo test
cd ..
```

构建 Windows 应用：

```bash
npm run tauri build
```

## 丨问题反馈

如果遇到 Bug、兼容性问题或其他异常，请通过 [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues) 提交反馈。

提交问题时，建议说明软件版本、问题现象和复现方式。

## 丨交流与联系

- **QQ 群**：`632482169`
- **GitHub**：[@Whitewind0987](https://github.com/Whitewind0987)

欢迎交流使用体验、功能建议和曲谱相关内容。

问题反馈建议优先使用 [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues)。

## 丨开源协议

SkyMusicPlay Lite 的软件代码采用 **GNU General Public License v3.0 only（GPL-3.0-only）**。

Copyright (C) 2026 Whitewind0987 and contributors

完整的当前许可证见 [LICENSE](./LICENSE)，历史许可声明及第三方资源信息见 [NOTICE](./NOTICE)。

`public/builtin-scores/scores/` 下的内置曲谱资源经 [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows) 原作者许可使用，不属于 SkyMusicPlay Lite 的 GPL-3.0-only 软件代码授权范围，相关权利归各自权利人所有。

## 丨致谢

SkyMusicPlay Lite 受到 [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows) 以及相关 Sky 光遇自动弹琴软件的启发。

内置曲谱资源以及曲谱解密兼容逻辑 / 格式规则的使用经 [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows) 原作者许可。

内置曲谱资源不属于 SkyMusicPlay Lite 的 GPL-3.0-only 软件代码授权范围，相关权利归各自权利人所有；当前 `src/lib/sheetDecrypt.ts` 是 SkyMusicPlay Lite 自行实现的 TypeScript 兼容实现，属于本项目的软件代码。

感谢 [@wjhhuizi](https://github.com/wjhhuizi) 提交 [PR #1](https://github.com/Whitewind0987/sky-music-play-lite/pull/1)，为 `scores-v2` 曲谱格式和长音 / 延音支持提供了核心方案与初始实现。

本项目是独立的轻量级实现。
