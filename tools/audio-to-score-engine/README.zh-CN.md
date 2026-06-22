# 音频转 Sky 乐谱引擎（实验性）

这是一个开发阶段的 MVP 工具：把一个音频文件转换为一个 SkyMusicPlay Lite JSON 乐谱。它是独立的源代码 Sidecar 工具，不会修改 React UI、Tauri 应用或任何播放路径。

需要 Python 3.10 或 3.11。工具使用独立虚拟环境和 `basic-pitch==0.4.0`；不要将它们安装到全局 Python，也不要提交到 Git。

## 安装

在 PowerShell 中创建工具私有虚拟环境，并安装已固定版本的推理依赖：

```powershell
py -3.11 -m venv tools\audio-to-score-engine\.venv

tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m pip install --upgrade pip

tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m pip install -r tools\audio-to-score-engine\requirements.txt
```

如果 Windows 没有安装 `py` 启动器，请使用已安装的 Python 3.10/3.11：

```powershell
python -m venv tools\audio-to-score-engine\.venv
```

## 转换音频

支持的输入扩展名为 `.wav`、`.mp3`、`.flac`、`.ogg` 和 `.m4a`。

```powershell
tools\audio-to-score-engine\.venv\Scripts\python.exe `
  tools\audio-to-score-engine\transcribe.py `
  "D:\Music Library\我的歌曲\input song.mp3" `
  --output "D:\Music Library\我的歌曲\input-song-sky.json" `
  --name "我的 Sky 改编"
```

可选参数：

- `--min-amplitude`：最小音符置信度，默认 `0.25`，范围为 `0` 至 `1`
- `--min-duration-ms`：最短音符时长，默认 `50` 毫秒
- `--chord-window-ms`：和弦分组窗口，默认 `35` 毫秒
- `--max-chord-notes`：每个和弦最多保留的音符数，默认 `3`，范围为 `1` 至 `15`

命令会在需要时创建输出目录，并通过同目录临时文件原子写入 JSON。未传入 `--name` 时，乐谱名称会使用输入文件名。

## 导入与试听

在 SkyMusicPlay Lite 现有的本地导入区域导入生成的 `.json` 文件。建议先使用预览播放确认效果，再启用前台或目标窗口的游戏内播放。

输出是一个 Lite 兼容的 JSON 数组，数组中只包含一首歌曲，音符时间使用绝对毫秒。

## 当前 MVP 限制

Basic Pitch 更适合单独或简单的乐器声音。完整混音歌曲可能产生过密或不准确的音符。本阶段有意不包含旋律提取、Demucs、人声/伴奏分离、节拍或 BPM 检测、MIDI 输入、LLM、UI 集成或发布打包。

由于 Lite 播放使用绝对音符时间，输出中的 BPM 固定为 `120`。

不要提交 `.venv`、Basic Pitch/模型缓存、生成的输出文件或 PyInstaller 临时构建目录。本仓库尚未构建或发布可执行 Sidecar；源代码 Sidecar 的打包应在后续、明确划定的阶段进行。

## 测试确定性编排逻辑

```powershell
tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m unittest discover `
  -s tools\audio-to-score-engine\tests `
  -p "test_*.py"
```
