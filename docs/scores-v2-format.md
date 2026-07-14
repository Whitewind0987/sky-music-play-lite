# SkyMusicPlay Lite scores-v2 曲谱格式规范

本规范面向曲谱转换工具作者与 AI 生成提示词。目标是从简谱、MIDI 或其他来源生成可被 SkyMusicPlay Lite 直接导入的 v2 曲谱文件。**请严格遵循本规范的写法**;任何偏离都可能导致导入失败。

## 文件结构

- 编码:UTF-8,扩展名 `.txt` 或 `.json`。
- 顶层必须是 **JSON 数组**,数组的每个元素是一首歌曲对象。
- 一个文件内可以同时包含 v1(无 `formatVersion`)和 v2(`formatVersion: 2`)歌曲。

## 歌曲对象字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 曲名 |
| `formatVersion` | number | v2 必填 | 必须是数字字面量 `2`(不要写字符串 `"2"`)。省略表示 v1,音符不允许携带时值 |
| `bpm` | number | 否(默认 120) | 元数据,不参与播放计时 |
| `bitsPerPage` | number | 否(默认 16) | 兼容 SkyStudio 的历史字段 |
| `pitchLevel` | number | 否(默认 0) | 移调元数据 |
| `isComposed` | boolean | 否(默认 false) | 兼容字段 |
| `songNotes` | Note[] | 是 | 音符数组,按 `time` 升序书写 |

不要添加规范之外的字段。

## 音符对象(Note)

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `time` | number | 是 | 按下时刻,**绝对毫秒**,从 0 开始 |
| `key` | string | 是 | 键位,格式 `1Key0` ~ `1Key14`(15 键布局,左上到右下,音高递增) |
| `duration` | number | 否 | **按住时长,毫秒**。仅 v2 歌曲允许。必须满足 `0 < duration <= 60000`。省略表示点按 |

规则:

1. `duration` 表示 keydown 到 keyup 的真实按住时间,用于延音乐器(电吉他、极光之声、凯旋小提琴、凯旋萨克斯、大提琴、口琴)。
2. `duration` 永远是绝对毫秒,**不受** `isRelativeTime` 影响。
3. 和弦:多个音符使用相同的 `time`。
4. 同一时刻同一 `key` 重复出现时,播放取其中最大的 `duration`;请避免这样写。
5. 点按乐器(钢琴、竖琴等)会忽略按住时长,v2 谱在点按乐器上照常可用。
6. `time` 换算:`毫秒 = 拍数 × 60000 / BPM`。例如 BPM 120 时一拍 = 500ms,一个二分音符的 `duration` = 1000。

应用保存到“已导入曲谱”目录的托管 v2 文件会使用规范形式，并明确保留 `"formatVersion": 2`。因此复制该托管文件后再次导入，`duration` 不会被降级为 v1 字段而丢失。

播放计时按每个唯一 `time` 分组。先根据倍速和音符间隔调整得到每组起点，再用“该组调整后起点 + 该组最大 `duration` / 倍速”计算每组长音结束点；全曲时长取最后组起点和所有长音结束点的最大值。正、负音符间隔只移动组起点，不会拉长或缩短 `duration` 本身。暂停或 seek 会释放当前按键，跨过暂停点或 seek 点的长音不会自动补按。

## 完整示例

```json
[
  {
    "name": "示例长音曲",
    "formatVersion": 2,
    "bpm": 120,
    "bitsPerPage": 16,
    "pitchLevel": 0,
    "isComposed": true,
    "songNotes": [
      { "time": 0, "key": "1Key0", "duration": 1000 },
      { "time": 0, "key": "1Key4" },
      { "time": 500, "key": "1Key2" },
      { "time": 1000, "key": "1Key5", "duration": 2000 },
      { "time": 2000, "key": "1Key7" }
    ]
  }
]
```

说明:第 1 个音符按住 1 秒;第 2 个音符与第 1 个同刻构成和弦(点按);最后一个长音(`time: 1000, duration: 2000`)在曲末之后仍延音 1 秒,播放器会等它结束再结束播放。

## 常见错误对照

| 写法 | 结果 |
| --- | --- |
| `"formatVersion": "2"`(字符串) | 导入失败:formatVersion 无效 |
| `"formatVersion": 3` | 导入失败:formatVersion 无效 |
| v1 歌曲(无 formatVersion)写了 `duration` | `duration` 被静默忽略,不报错 |
| `"duration": 0` 或负数 | 导入失败:duration 无效 |
| `"duration": 60001` | 导入失败:duration 超出 60000 上限 |
| `"duration": "1500"`(字符串) | 导入失败:duration 无效 |

## 延音乐器的建议写法

延音乐器(笛子、大提琴、口琴、萨克斯等)按住才持续发声,**过短的按压可能完全不出声**。为这类乐器制谱时:

- **每个音符都写 `duration`**,最小值 25ms;不要留纯点按音符。
- **轻微连奏(overlap)**:`duration` = 记谱时值 + 30~50ms,让上一个音延伸到下一个音按下之后,消除颗粒感。
- 同键连续音的 overlap 是安全的:播放器重按同键前会先释放旧按压,不会双发声。
- 这种写法在点按乐器(钢琴、竖琴等)上同样可用——它们忽略按住时长。

## 给 AI 生成器的提示

- 输出必须是纯 JSON,不要包裹 Markdown 代码块以外的说明文字。
- 全部时间用绝对毫秒整数;先确定 BPM,再把拍数换算成毫秒。
- 面向延音乐器时,按上一节规则给每个音符写 `duration`(时值 + 30~50ms,最小 25ms);面向点按乐器时可只给长音写 `duration`。
- 生成后自查:顶层是数组、`formatVersion` 是数字 2、所有 `time` 非负递增、所有 `duration` 在 (0, 60000] 区间。
