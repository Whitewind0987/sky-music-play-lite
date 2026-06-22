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

默认自动转调只会按完整八度移动检测到的音符，不会把歌曲移到不同的音乐调性。

```powershell
& ".\tools\audio-to-score-engine\.venv\Scripts\python.exe" `
  ".\tools\audio-to-score-engine\transcribe.py" `
  "D:\Music\test.wav" `
  --output ".\tools\audio-to-score-engine\output\test.json"
```

可选参数：

- `--min-amplitude`：最小音符置信度，默认 `0.25`，范围为 `0` 至 `1`
- `--min-duration-ms`：最短音符时长，默认 `50` 毫秒
- `--chord-window-ms`：和弦分组窗口，默认 `35` 毫秒
- `--max-chord-notes`：每个和弦最多保留的音符数，默认 `3`，范围为 `1` 至 `15`
- `--transpose`：转调模式，默认 `auto`；也可使用 `-36` 至 `36` 的手动整数值
- `--pitch-mapping`：音高范围映射模式，默认 `clamp`；可试验性地使用 `octave-fold`

命令会在需要时创建输出目录，并通过同目录临时文件原子写入 JSON。未传入 `--name` 时，乐谱名称会使用输入文件名。

### 转调选项

`--transpose auto` 是默认值。它只会评估 `-24`、`-12`、`0`、`12` 和 `24` 半音，因此自动调整会保持 Basic Pitch 检测到的原始调性和音程关系。

如需完全关闭自动八度调整，请使用：

```powershell
--transpose 0
```

这会尽可能保留 Basic Pitch 检测到的绝对音高。超出 Sky 15 键范围的音符仍会被限制到边界键，半音音符仍会映射到最近的自然音。

如需诊断或手动修正，也可以使用非八度的手动转调：

```powershell
--transpose -4
```

非八度手动转调用于诊断和用户修正，不会作为自动模式的默认行为。

### 音高映射实验

默认的 `--pitch-mapping clamp` 保留原有行为：低于 Sky MIDI 60 的音高会向 `Key0` 收缩，高于 MIDI 84 的音高会向 `Key14` 收缩。A/B 对比时请保留它作为基线。

`--pitch-mapping octave-fold` 是实验模式。它会在转调后，把范围外音高反复按完整八度移入 MIDI 60–84，再继续使用原有的最近自然音映射。例如 MIDI 38 会折叠到 62，MIDI 43 会折叠到 67，而不会都变成 `Key0`。折叠保留音级，但不等于旋律提取。

使用同一音频和诊断目录比较两种模式：

```powershell
$Python = ".\tools\audio-to-score-engine\.venv\Scripts\python.exe"
$Script = ".\tools\audio-to-score-engine\transcribe.py"
$Audio = "D:\Music\piano-test.wav"
$Output = ".\tools\audio-to-score-engine\output"

& $Python $Script $Audio `
  --output "$Output\mapping-clamp.json" `
  --transpose 0 `
  --pitch-mapping clamp `
  --diagnostics-dir "$Output\mapping-clamp-diagnostics"

& $Python $Script $Audio `
  --output "$Output\mapping-octave-fold.json" `
  --transpose 0 `
  --pitch-mapping octave-fold `
  --diagnostics-dir "$Output\mapping-octave-fold-diagnostics"
```

`mapping-report.json` 中的 `rangeClassificationAfterTranspose` 始终是范围处理前的基线；新增 `pitchMapping` 区域说明折叠、原本在范围内和边界钳制的数量。输出键位直方图反映当前模式下、和弦裁剪和重复抑制之前的映射结果。

八度折叠可能恢复低音的运动，但也可能把伴奏折叠到旋律音区，造成更密集的碰撞。它只用于试听对比，不是完整的编排质量解决方案。

### 旋律提取实验

`--arrangement-mode polyphonic` 仍是默认值，保留当前多音编排。`--arrangement-mode melody-dp` 是实验性的单旋律动态规划提取器：它先按锚点起音窗口分组过滤后的 Basic Pitch 事件，在每组中对少量候选评分，再在转调和音高映射之前选择一条连续路径。它不会重建伴奏。

```powershell
& $Python $Script $Audio `
  --output "$Output\melody-dp.json" `
  --transpose 0 `
  --pitch-mapping octave-fold `
  --arrangement-mode melody-dp `
  --melody-onset-window-ms 70 `
  --melody-max-candidates 6 `
  --melody-max-skip-groups 3 `
  --diagnostics-dir "$Output\melody-dp-diagnostics"
```

旋律路径在原始 MIDI 音高上选择；之后才执行转调、clamp/octave-fold 和 Sky 自然音映射。默认参数为 70ms 锚点起音窗口、每组最多 6 个候选、最多跳过 3 组。旋律模式的诊断会新增 `melody-selected-events.json`，并在 `mapping-report.json` 中添加包含分组、候选、覆盖率和跳音统计的 `melodyExtraction` 区域。

请在相同音频、转调和音高映射参数下，将 `melody-dp.json` 与 polyphonic 的最高音式基线比较。旋律 DP 的目标是稳定且可识别的单音旋律线，不是钢琴伴奏重建；折叠后的伴奏仍可能与旋律碰撞，重要旋律音也可能被跳过。

### 转写诊断

使用 `--diagnostics-dir` 可以检查同一次 Basic Pitch 预测在进入 Sky 15 键编排层之前的原始结果：

```powershell
& ".\tools\audio-to-score-engine\.venv\Scripts\python.exe" `
  ".\tools\audio-to-score-engine\transcribe.py" `
  "D:\Music\piano-test.wav" `
  --output ".\tools\audio-to-score-engine\output\piano-test.json" `
  --name "Piano diagnostic test" `
  --transpose 0 `
  --diagnostics-dir ".\tools\audio-to-score-engine\output\piano-test-diagnostics"
```

诊断目录会包含：

- `basic-pitch-raw.mid`：Basic Pitch 直接返回的原始 MIDI，尚未经过筛选、转调、Sky 键位映射、和弦裁剪或重复抑制。
- `raw-note-events.json`：已通过基础合法性检查的 Basic Pitch 原始音符事件；即使后续会因振幅或时长筛选而移除，仍会保留在此文件中。
- `mapping-report.json`：音高范围损失、半音到自然音映射、边界键钳制和输出键使用量的统计。

请依次比较原始钢琴音频、`basic-pitch-raw.mid`，以及在 SkyMusicPlay Lite 中播放的 Lite JSON。若原始 MIDI 已不像原曲，主要问题在 Basic Pitch 转写；若原始 MIDI 像原曲而 Lite 乐谱不像，主要问题在 Sky 编排层；若原始 MIDI 有旋律但过于密集，则后续需要旋律提取或伴奏削减。

诊断文件是开发产物，不得提交。

## 导入与试听

在 SkyMusicPlay Lite 现有的本地导入区域导入生成的 `.json` 文件。建议先使用预览播放确认效果，再启用前台或目标窗口的游戏内播放。

输出是一个 Lite 兼容的 JSON 数组，数组中只包含一首歌曲，音符时间使用绝对毫秒。

## 当前 MVP 限制

Basic Pitch 更适合单独或简单的乐器声音。完整混音歌曲可能产生过密或不准确的音符。本阶段有意不包含旋律提取、Demucs、人声/伴奏分离、节拍或 BPM 检测、MIDI 输入、LLM、UI 集成或发布打包。

由于 Lite 播放使用绝对音符时间，输出中的 BPM 固定为 `120`。

不要提交 `.venv`、Basic Pitch/模型缓存、生成的输出文件（包括诊断 MIDI 和 JSON）或 PyInstaller 临时构建目录。本仓库尚未构建或发布可执行 Sidecar；源代码 Sidecar 的打包应在后续、明确划定的阶段进行。

## 测试确定性编排逻辑

```powershell
tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m unittest discover `
  -s tools\audio-to-score-engine\tests `
  -p "test_*.py"
```
