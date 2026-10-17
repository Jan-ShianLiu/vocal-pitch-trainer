# Vocal Flow 歌曲 JSON 格式

目前使用 `formatVersion: 1`。必填的核心資料只有歌曲識別、BPM，以及可以播放的音符；其他分類欄位皆為選填。

## 設計原則

- 向後相容：舊檔案不需要補上新選填欄位。
- 向前擴充：程式會忽略不認識的欄位，未來可以新增資料而不影響目前版本。
- 可計算的資料不必重複填寫：程式會由每句音符自動算出最低／最高音、字數、總拍數、秒數與有音高的音符數。
- 特殊資料可放在 `metadata`，常用分類則放在 `tags`，避免為每次小改版破壞格式。

## 歌曲層級

| 欄位 | 必填 | 型別 | 說明 |
| --- | --- | --- | --- |
| `formatVersion` | 建議 | 數字 | 目前為 `1` |
| `id` | 建議 | 字串 | 全資料庫唯一；未填時暫用檔名 |
| `title` | 建議 | 字串 | 歌名 |
| `artist` | 否 | 字串 | 歌手 |
| `bpm` | 是 | 數字 | 全曲預設速度，30～240 |
| `key` | 否 | 字串 | 例如 `C major`、`Eb major` |
| `language` | 否 | 字串 | 例如 `zh-TW` |
| `genre` | 否 | 字串 | 例如 `Mandopop` |
| `vocalGender` | 否 | 字串 | `male`、`female`、`duet` 或 `group`；用於演唱類型篩選。也相容 `gender`、`singerGender` 或 tags 內的男聲／女聲等文字 |
| `year` | 否 | 數字 | 發行年份 |
| `tags` | 否 | 字串陣列 | 任意可搜尋分類 |
| `metadata` | 否 | 物件 | 自訂擴充資料 |
| `source` | 否 | 字串 | 合法資料來源網址 |
| `sections` | 完整歌曲必填 | 陣列 | 歌曲區段 |

## 區段與句子

`sections[].type` 建議使用 `verse`、`prechorus`、`chorus`、`bridge` 或 `other`。每個區段的 `lines` 是可抽題句子。

每句可填 `id`、`lyric`、`notes`，並可用自己的 `bpm` 覆蓋全曲速度。`tags` 與 `metadata` 可用來標示難度、唱法或資料來源細節。合唱歌曲也可在個別句子填入 `vocalGender` 覆蓋歌曲層級，讓男聲與女聲句子分開篩選。

程式載入後會自動替每句建立下列統計值，未來可直接拿來做篩選：

| 統計值 | 用途 |
| --- | --- |
| `bpm` | 只出 BPM 大於／小於指定值的句子 |
| `stats.minMidi`、`stats.maxMidi` | 依最低音、最高音或音域跨度篩選 |
| `stats.lyricLength` | 依不含空白的歌詞字數篩選 |
| `stats.totalBeats` | 依總拍數篩選 |
| `stats.durationSeconds` | 依估算秒數篩選 |
| `stats.pitchedNoteCount` | 依實際有音高的音符數篩選 |

## 音符

一般音符：

```json
{ "pitch": "F#4", "beats": 0.5, "lyric": "你" }
```

休止符：

```json
{ "rest": true, "beats": 0.5, "lyric": "" }
```

`pitch` 可使用科學音高名稱或 MIDI 數字；`beats` 是拍數，不是秒數。實際秒數會依該句 BPM 換算。

## 未來篩選不需要改檔案的例子

- 「速度快過 120 BPM」：讀取每句 `bpm`。
- 「最高音高過 A4」：讀取自動計算的 `stats.maxMidi`。
- 「歌詞超過 12 字」：讀取自動計算的 `stats.lyricLength`。
- 「只練副歌且標有高難度」：同時檢查區段 `type` 與句子 `tags`／`metadata`。

當畫面選擇特定歌手、演唱類型或副歌時，缺少相應欄位的歌曲不會被納入；選擇「全部」時才會包含未標示資料。副歌必須明確標示 `sections[].type: "chorus"`。

這些條件目前尚未做成畫面上的篩選器，但 JSON 已能支援，往後只需新增介面與過濾規則。
