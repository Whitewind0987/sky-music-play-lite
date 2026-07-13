# scores-v2 设计文档(长音/延音支持)

日期:2026-07-12
状态:已批准(方案 A,全链路支持)
分支:`feature/scores-v2`

## 背景与目标

光遇中存在延音式乐器(电吉他、极光之声、凯旋小提琴、凯旋萨克斯、大提琴、口琴):按住琴键声音持续,松开停止。当前曲谱格式 `Note = { time, key }` 无法表达按住时长,播放引擎对所有音符使用统一的固定按住时长(后台 10–200ms 可调,前台固定 40ms),因此延音乐器无法正确演奏长音。

scores-v2 的目标:让曲谱能表达每个音符的持续时长,并让全部三条播放路径(App 内预览、前台播放、后台/目标窗口播放)按时值执行。

曲谱来源定位:转换工具生成 + AI 读简谱图片/PDF 生成。因此格式必须语义明确、校验严格、文档清晰。

## 方案选择

- **方案 A(采用)**:v2 作为 v1 的超集,同一 JSON 谱系,歌曲级版本标记 + 音符级可选时值字段。一条解析路径,v1 文件天然有效,基础设施全部复用。
- 方案 B(否决):全新信封格式。规范干净但需要维护两套解析器/错误码,生态不认识,回归面大。
- 方案 C(否决):v1 文件 + 旁挂时值元数据。谱子不可移植,AI 无法一次生成完整谱。

## 1. v2 文件格式规范

文件形态不变:UTF-8 JSON,顶层为歌曲数组,扩展名 `.txt` 或 `.json`。

### 歌曲级:`formatVersion`

- 可选字段。缺省视为 1(v1)。
- 若存在,必须是数字字面量 `1` 或 `2`(不接受字符串 `"2"`)。
- 大于 2 或其他类型 → 解析错误 `formatVersionInvalid`(给未来版本留失败快路径)。
- 同一文件内可混装 v1/v2 歌曲,逐歌曲判定。

### 音符级:`duration`(仅 v2 歌曲生效)

- 可选字段,单位毫秒,表示 keydown 到 keyup 的按住时长。
- 若存在,必须是有限正数,且 `0 < duration <= 60000`(60 秒上限)。
- 违规 → 解析错误 `noteDurationInvalid`(携带 songName/noteIndex 详情)。
- 无 `duration` 的音符 = 点按,沿用全局按住时长(后台设置项、前台常量)。
- **v1 歌曲中出现 `duration` 一律忽略**——现有解析器本就忽略音符上的未知字段,行为零变化,不破坏任何现存文件。

### 与现有变体开关的关系

- `isRelativeTime: true`:只影响 `time` 的归一化(与 v1 相同),`duration` 永远是绝对毫秒,不参与相对时间累加。
- `isEncrypted` / 数字数组 `songNotes`:解密路径不变;解密产物按歌曲的 `formatVersion` 规则校验。本阶段不为加密谱做时值专项支持。

### 示例

```json
[{
  "name": "演示曲",
  "formatVersion": 2,
  "bpm": 120,
  "bitsPerPage": 16,
  "pitchLevel": 0,
  "isComposed": true,
  "songNotes": [
    { "time": 0,    "key": "1Key0" },
    { "time": 500,  "key": "1Key2", "duration": 1500 },
    { "time": 2000, "key": "1Key4" }
  ]
}]
```

### 面向生成者的规范文档

新增 `docs/scores-v2-format.md`:面向 AI 提示词和转换器作者的严格规范,只写规范写法(绝对毫秒、数字字面量、字段约束、完整示例),不提及解析器的宽松容错。

## 2. 内部类型与存储

### 类型

- `src/types/score.ts`:`Note` 增加可选 `duration?: number`(毫秒)。`Song` 不变。
- 内部不保存 `formatVersion`:解析完成后,时值信息已落在音符上,版本标记只在解析边界使用。

### 导入文件存储(Rust `imported_scores.rs`)

- `save_imported_score_song` 保存原始 JSON `Value`,`duration` 天然保留,无需改动。
- `SemanticNote` 增加 `duration: Option<f64>`,使保存后回读的内容语义校验覆盖时值(防止时值损坏未被发现)。
- 托管文件轻量校验:音符若含 `duration` 字段,必须是正数(与 time/key 校验同级的宽松检查)。

### 本地曲目元数据(`LocalSongMetadata`)

- 增加可选字段 `sustainTailMs: number`(默认 0):`max(0, max(note.time + note.duration) - lastNoteTimeMs)`,即最后一组音符之后仍在延音的尾巴时长。
- 用于不加载全曲时的时长显示(曲库列表)。
- appData 迁移与清洗器同步支持该字段,并有 Vitest 覆盖(项目规则:新持久化字段必须有迁移/清洗测试)。

## 3. 播放计划协议(前端 → Rust)

内部协议,前端与 Rust 同版本发布,可自由改形状。

- `prepareMappedKeyboardKeyGroups`(`src/lib/scoreKeyMapping.ts`):分组结果从 `Map<number, string[]>` 变为 `Map<number, { key: string; holdMs?: number }[]>`。同一时刻同一映射键出现多次时,去重并保留最大 `holdMs`(无 `holdMs` 视为最小)。
- `BackgroundPlaybackPlanEvent`:`{ timeMs, keys: [{ key, holdMs? }] }`。
- 计划缓存键(songIdentity + keyMapping 签名)不变:时值属于歌曲内容,身份已覆盖。

## 4. Rust 播放引擎(后台/前台共用 worker)

### 数据结构

- `TimelineGroup.keys`:`Arc<[String]>` → `Arc<[PlannedKey]>`,`PlannedKey { key: String, hold_ms: Option<f64> }`。
- `unique_keys`(会话预热用)保持字符串列表。
- `play_group` 内的组内去重:按 key 去重,保留最大 `hold_ms`。

### keyup 调度

- 每个键的 keyup 截止时间 = 实际 keydown 发出时刻 + 有效按住时长:
  - 有 `hold_ms`:`hold_ms / playback_speed`(时值随倍速缩放,音乐语义)。
  - 无 `hold_ms`:现有 `key_hold_ms`(固定值,不随倍速缩放——保持现状不变)。
- 同键重叠(长音未结束又按同键):现有 generation 机制已正确处理(新按下使旧 keyup 作废),无需改动。
- 倍速中途变更:已排定的 keyup 保持原截止时间(可接受的简化);之后的 keydown 用新倍速计算。

### 时间线与结束语义

- `total_ms` = `max(最后一组 adjusted_start, max_i(adjusted_start_i + scaled_hold_max_i))`——进度以延音尾巴结束为 100%。
- `finish_ms` = `max(total_ms, 最后一组 adjusted_start + NOTE_HIGHLIGHT_MS / playback_speed)`(保持现有最小收尾垫时长)。
- `finish()` 前所有到期 keyup 已按截止时间释放,结束不再切断尾音。

### 保持不变(记录为已知简化)

- 暂停/seek/停止:释放所有按下的键并清空已排定 keyup;跨越暂停点/seek 点的长音**不补按**。
- 前台播放共用同一 worker 与协议,除计划形状外无额外改动;`FOREGROUND_KEY_HOLD_MS = 40` 仍是前台点按缺省。

## 5. 预览播放路径

### 调度器(`src/lib/playbackScheduler.ts`)

- 音符组携带时值(组结构已含 `Note[]`,时值随 `Note.duration` 自然传递)。
- `getAdjustedPreviewDurationMs` / 总时长:计入缩放后的延音尾巴,公式与 Rust 端 `total_ms` 语义一致(时值按 `playbackSpeed` 缩放,不受 `noteIntervalDelayMs` 影响)。
- `getAdjustedPreviewDurationFromMetadata`:利用 `sustainTailMs` 计算含尾音的显示时长。
- finish 任务时间 = `max(现有收尾, 最后延音结束)`。

### 键盘高亮(`usePreviewPlayback`)

- 现状:整组替换,一组亮到下一组到来。
- 新模型:按键级过期。点按键 = 现行为(被下一组替换);长音键 = 亮到 `duration / playbackSpeed` 结束(即使中途有其他组到来,未到期的长音键保持点亮;若下一组按下同一键,则由新状态接管)。
- 过期状态归并逻辑抽为纯函数模块 `src/lib/previewActiveKeys.ts`,Vitest 覆盖;hook 只做接线与定时器。
- 暂停/停止清空全部高亮(现行为不变)。

## 6. 内置曲谱工具链

- `scripts/generate-builtin-score-index.mjs` 与运行时解析(`builtinScoreLoader` / `scoreFileImport`)按**同一套 v2 规则**接受与校验(项目红线:生成器/运行时一致)。
- 索引条目的 `durationMs` 计入延音尾巴。
- 本阶段不新增 v2 内置曲谱;既有 1.1 万 v1 谱回归测试必须全绿。

## 7. 错误处理与文案

- 新错误码:`formatVersionInvalid`、`noteDurationInvalid`,进 `ScoreFileImportErrorCode` 联合类型。
- `src/lib/importErrors.ts` + `src/i18n/uiText.ts` 增加中英文案(含 songName/noteIndex 占位)。

## 8. 测试计划

Vitest(纯逻辑优先):
- `scoreFileImport`:v2 接受/拒绝矩阵(formatVersion 各种形态、duration 边界 0/负数/NaN/超上限/字符串、v1+duration 忽略、isRelativeTime+duration、混装文件)。
- `scoreKeyMapping`:分组携带 holdMs、同刻同键取最大。
- `playbackScheduler`:含尾音总时长、倍速缩放、间隔不影响时值、finish 时机。
- `previewActiveKeys`:点按替换、长音跨组保持、到期清除、同键接管。
- appData 迁移/清洗:`sustainTailMs` 缺省/非法值处理。
- 内置索引:生成器/运行时一致性、原始 JSON 有效性、懒加载解析(既有回归 + v2 用例)。

Rust 单元测试(`background_playback.rs` 既有 `#[cfg(test)]` 模块扩展):
- keyup 截止时间:有 hold 缩放、无 hold 回退、组内同键取最大。
- `total_ms`/`finish_ms` 含尾音计算。
- `imported_scores.rs`:语义校验覆盖 duration。

验证门(每阶段):`npm run test`、`npx tsc --noEmit`、`npm run build`、`cd src-tauri && cargo check && cargo test`。

手动验证:提供 `docs/examples/scores-v2-sample.txt` 示例谱(含长音、和弦、混装),导入后在三条路径试放;延音乐器实机验证由用户在游戏内进行。

## 9. 明确不做(YAGNI)

- 拍子制/BPM 换算时间(已决策:绝对毫秒)。
- 音符 `type` 字段(duration 存在与否即语义)。
- 力度/音量、tempo 变化事件、小节结构。
- 暂停/seek 跨越点的长音补按。
- 曲库 v2 徽标、新设置项、UI 大改。
- 加密数字谱的时值扩展。
- 新增 v2 内置曲谱。

## 10. 实施阶段划分(小步、每步可验证)

1. **格式与解析**:类型 + `scoreFileImport` v2 校验 + 错误码/文案 + 测试。
2. **存储与元数据**:Rust 语义校验 + `sustainTailMs` + 迁移测试。
3. **计划协议与 Rust 引擎**:分组结构 + PlannedKey + keyup 调度 + 时间线尾音 + Rust 测试。
4. **预览路径**:调度器尾音 + 按键级高亮 + 测试。
5. **工具链与文档**:索引生成器一致性 + 格式文档 + 示例谱 + 全量回归。
