<div align="center">

# SkyMusicPlay Lite

轻量 · Windows · Tauri · React · Rust

[简体中文](./README.md) | [English](./README_EN.md)

</div>

## 丨项目简介

SkyMusicPlay Lite 是一个面向 Windows 的轻量级 Sky光遇自动弹琴软件。

项目使用 **Tauri v2 + React + TypeScript + Rust** 构建，目标是在保持体积轻、界面清晰、功能可控的前提下，提供更适合桌面端使用的曲库管理、预览播放和真实播放体验。

当前版本为 **v0.2.0 Alpha 1**。  
这是一个 Alpha 测试版本，部分功能仍在完善中，可能存在未发现的问题。

## 丨下载

请前往 GitHub Releases 下载最新版本：

- [Releases](https://github.com/Whitewind0987/sky-music-play-lite/releases)

普通 Windows 用户建议下载 `.exe` 安装包。

安装前建议先退出旧版软件。  

## 丨使用手册

- [SkyMusicPlay Lite 使用手册](https://www.kdocs.cn/l/ca0kaYgxB59Z)

如果你是第一次使用，建议先阅读使用手册中的快速开始、真实播放和常见问题说明。

## 丨功能特性

- 系统自带曲谱
- 内置曲谱按需加载
- 本地曲谱导入
- 拖拽导入曲谱
- SkyStudio-style 曲谱解析
- 旧版加密数字曲谱导入
- 曲库搜索
- 我喜欢
- 创建的歌单
- 播放队列
- 下一首播放
- App 内键盘预览
- 底部播放器
- 播放 / 暂停 / 继续 / 停止
- 进度条拖动
- 倍速调节
- 音符间隔调节
- 列表循环 / 单曲循环 / 随机播放
- 自定义键位映射
- 本地数据持久化
- 播放日志
- App 内更新提醒
- Windows 真实播放功能

## 丨曲库与播放器

曲库支持：

- 系统自带
- 本地导入
- 我喜欢
- 创建的歌单
- 搜索
- 分页
- 加入队列
- 下一首播放

底部播放器支持：

- 播放、暂停、继续、停止
- 下一首
- 随机播放
- 循环模式
- 播放队列
- 播放速度
- 按键间隔
- 播放进度

## 丨真实播放

SkyMusicPlay Lite 包含真实播放功能。

真实播放默认关闭，需要用户在设置中手动开启。  
使用前请自行了解并遵守相关游戏或软件的规则。

当前真实播放包括：

- **后台播放**：尝试向用户选择的目标游戏窗口发送按键。
- **前台播放**：向当前前台窗口发送模拟键盘输入。

后台播放提供两个方案：

- **后台播放增强（推荐）**
- **组合按键兼容**

一般建议优先使用“后台播放增强（推荐）”。  
如果部分组合按键或和弦效果不正常，可以尝试切换为“组合按键兼容”。

如果后台播放不可用，可以尝试使用前台播放。

这些功能仍处于实验阶段，不保证在所有系统、权限、窗口状态或游戏环境下可用。

## 丨管理员权限

SkyMusicPlay Lite 在 Windows 上启动时可能会请求管理员权限。

这是为了降低真实播放功能在目标窗口权限不一致时失败的概率。

启动软件时，如果 Windows 弹出用户账户控制（UAC）提示，请确认后继续。

## 丨更新说明

SkyMusicPlay Lite 支持启动时检查更新。

更新分为：

- **推荐更新**：建议所有用户更新。
- **Alpha 更新**：测试版本，可以选择忽略当前版本。

如果你更想稳定使用，可以等待推荐更新。  
如果你愿意体验新功能，可以更新 Alpha 版本。

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

运行测试：

```bash
npm run test
```

构建前端：

```bash
npm run build
```

检查 Rust 代码：

```bash
cd src-tauri
cargo check
cargo test
cd ..
```

打包应用：

```bash
npm run tauri build
```

## 丨问题反馈

如果遇到问题，可以通过 [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues) 提交反馈。

反馈时建议提供：

- 软件版本
- Windows 版本
- 问题截图
- 操作步骤
- 是否使用真实播放
- 使用的是后台播放还是前台播放
- 是否能稳定复现
- 日志文件或录屏

## 丨联系我

- **GitHub**：[@Whitewind0987](https://github.com/Whitewind0987)
- **Email**：whitewind0569@gmail.com
- **反馈与建议**：可以通过 [GitHub Issues](https://github.com/Whitewind0987/sky-music-play-lite/issues) 提交问题、建议或使用反馈

## 丨开源协议

本项目使用 **MIT License** 开源。

详见 [LICENSE](./LICENSE)。

## 丨致谢

SkyMusicPlay Lite 受到 [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows) 以及相关 Sky 光遇自动弹琴软件的启发。

内置曲谱资源和曲谱解密逻辑经 [SkyMusicPlay-for-Windows](https://github.com/windhide/SkyMusicPlay-for-Windows) 原作者许可使用。  
如复用相关资源或逻辑，请保留原始来源和作者署名。

本项目是独立的轻量级实现。
