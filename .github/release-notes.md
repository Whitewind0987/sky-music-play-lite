# SkyMusicPlay Lite v0.6.1

这是一个问题修复版本，修复 v0.6.0 中创建 V2 曲谱后可能出现的界面滚动异常。

## 下载说明

提供两个 `.exe` 安装包：

- **正常版（推荐）**：`SkyMusicPlay-Lite_0.6.1_Windows-x64_Setup.exe`
  - 安装包体积较小，推荐大多数用户使用。
  - 如果电脑缺少 WebView2，安装时需要联网完成 WebView2 安装。

- **内置 WebView2 版**：`SkyMusicPlay-Lite_0.6.1_Windows-x64_WebView2-Offline_Setup.exe`
  - 安装包体积较大，包含 WebView2 离线安装程序。
  - 适合离线环境，或正常版无法完成 WebView2 安装的情况。

两个版本的软件功能相同，仅 WebView2 的安装方式不同。

可以直接覆盖安装旧版本，无需先卸载。

## 修复

- 修复创建 V2 曲谱并自动定位新曲谱时，部分情况下整个应用界面向上滚动并在窗口底部出现大块空白的问题。

## 使用手册

https://www.kdocs.cn/l/ca0kaYgxB59Z

## 注意事项

- 更新前建议先退出正在运行的旧版软件。
- 请勿删除原安装目录中的 `imported-scores` 文件夹。
- Windows 可能会显示 SmartScreen 提示，因为当前应用暂未进行代码签名。
