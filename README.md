<div align="center">

# SkyMusicPlay Lite

轻量 · Windows · Tauri · React · Rust

[简体中文](./README.md) | [English](./README_EN.md)

</div>

## 丨项目简介

SkyMusicPlay Lite 是一个面向 Windows 的轻量级 Sky 光遇自动弹琴软件。

项目使用 **Tauri v2 + React + TypeScript + Rust** 构建，目标是在保持体积轻、界面清晰、功能可控的前提下，提供更适合桌面端使用的曲库、播放和实验性输入体验。

当前项目仍处于 Alpha 开发阶段，功能、界面和数据结构后续仍可能调整。

## 丨功能特性

- 系统自带曲谱
- 本地曲库
- 本地曲谱导入
- SkyStudio-style 曲谱解析
- 曲库搜索
- 我喜欢
- 收藏歌单
- 播放队列
- 下一首播放
- App 内键盘预览
- 底部播放器
- 播放 / 暂停 / 继续 / 停止
- 倍速调节
- 音符间隔调节
- 循环 / 单曲循环 / 随机播放
- 自定义键位映射
- 本地数据持久化
- 播放日志
- Windows 实验性输入功能

## 丨实验性输入

SkyMusicPlay Lite 包含实验性输入功能。

实验性功能默认关闭，需要用户在设置中手动开启。  
使用前请自行了解并遵守相关游戏或软件的规则。

当前实验性输入包括：

- **前台输入模式**：向当前前台窗口发送键盘输入。
- **目标窗口消息模式**：向用户选择的目标窗口句柄发送键盘消息。

目标窗口消息模式提供多种兼容配置，包括基础消息模式、扫描码兼容模式、组合按键兼容模式和激活消息兼容模式。

这些功能仍处于实验阶段，不保证在所有系统、权限、窗口状态或游戏环境下可用。

## 丨项目开发环境

推荐开发环境：

- **操作系统**：Windows 10 / Windows 11
- **Node.js**：20+
- **Rust**：stable
- **Tauri**：v2
- **包管理器**：npm
- **编辑器**：Visual Studio Code

需要安装：

- Node.js
- Rust
- Tauri 相关系统依赖
- Microsoft C++ Build Tools / Visual Studio Build Tools

## 丨技术栈

- **Tauri v2**
- **React**
- **TypeScript**
- **Rust**
- **Vite**

## 丨本地运行

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run tauri dev
```

构建前端：

```bash
npm run build
```

检查 Rust 代码：

```bash
cd src-tauri
cargo check
cd ..
```

## 丨联系我

- **GitHub**：[@Whitewind0987](https://github.com/Whitewind0987)
- **Email**：whitewind0569@gmail.com
- **反馈与建议**：可以通过 GitHub Issues 提交问题、建议或使用反馈

## 丨开源协议

本项目使用 **MIT License** 开源。

详见 [LICENSE](./LICENSE)。

## 丨致谢

SkyMusicPlay Lite 受到 SkyMusicPlay-for-Windows 以及相关 Sky 光遇自动弹琴软件的启发。

内置曲谱资源经 SkyMusicPlay-for-Windows 原作者许可使用。  
如复用这些资源，请保留原始来源和作者署名。

本项目是独立的轻量级实现。
