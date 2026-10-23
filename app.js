const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
const canvas = document.querySelector("#pitchRoll"),
  ctx = canvas.getContext("2d");
const els = {
  micStatus: $("#micStatus"),
  playbackVolume: $("#playbackVolume"),
  playbackVolumeValue: $("#playbackVolumeValue"),
  playbackVolumeReset: $("#playbackVolumeReset"),
  currentNote: $("#currentNote"),
  currentFreq: $("#currentFreq"),
  targetNote: $("#targetNote"),
  needle: $("#tunerNeedle"),
  feedback: $("#feedback"),
  title: $("#exerciseTitle"),
  hint: $("#exerciseHint"),
  tag: $("#stageTag"),
  score: $("#scoreValue"),
  ring: $("#scoreRing"),
  start: $("#startBtn"),
  demo: $("#demoBtn"),
  replay: $("#replayBtn"),
  next: $("#newBtn"),
  goalProgress: $("#goalProgress"),
  goalToast: $("#goalToast"),
  goalToastText: $("#goalToastText"),
  rangeOptions: $("#rangeOptions"),
  rangeMin: $("#rangeMin"),
  rangeMax: $("#rangeMax"),
  songOptions: $("#songOptions"),
  songStatus: $("#songLibraryStatus"),
  songImportBtn: $("#songImportBtn"),
  songClearBtn: $("#songClearBtn"),
  songImportInput: $("#songImportInput"),
  songScope: $("#songScope"),
  artistSearch: $("#artistSearch"),
  artistAll: $("#artistAll"),
  artistChoices: $("#artistChoices"),
  artistFilterSummary: $("#artistFilterSummary"),
  genderAll: $("#genderAll"),
  genderChoices: [...document.querySelectorAll(".gender-choice")],
  genderFilterSummary: $("#genderFilterSummary"),
  songSearch: $("#songSearch"),
  songSelect: $("#songSelect"),
  filterBpmMin: $("#filterBpmMin"),
  filterBpmMax: $("#filterBpmMax"),
  filterPitchMin: $("#filterPitchMin"),
  filterPitchMax: $("#filterPitchMax"),
  filterLyricMin: $("#filterLyricMin"),
  filterLyricMax: $("#filterLyricMax"),
  filterResult: $("#filterResult"),
  applyFilters: $("#applyFiltersBtn"),
  resetFilters: $("#resetFiltersBtn"),
  battleTabBtn: $("#battleTabBtn"),
  battleOptions: $("#battleOptions"),
  battlePlayerCount: $("#battlePlayerCount"),
  battleRoundCount: $("#battleRoundCount"),
  battleLevelSelect: $("#battleLevelSelect"),
  startBattleBtn: $("#startBattleBtn"),
  battleBanner: $("#battleBanner"),
  battleTurnText: $("#battleTurnText"),
  battleRoundText: $("#battleRoundText"),
  battleResultModal: $("#battleResultModal"),
  battleScoreBoard: $("#battleScoreBoard"),
  endBattleBtn: $("#endBattleBtn"),
};
let audioCtx,
  analyser,
  micSource,
  pitchHighpass,
  pitchLowpass,
  stream,
  raf,
  progressRaf,
  level = 1,
  exercise,
  listening = false,
  preparingToListen = false,
  demoing = false,
  demoElapsed = 0,
  startAt = 0,
  lastPitch = null,
  voicedFrames = 0,
  hitFrames = 0;
const PITCH_ANALYSIS_INTERVAL_MS = 32;
let micSetupPromise = null;
let micGeneration = 0;
let micGraphNeedsRefresh = false;
const PLAYBACK_VOLUME_KEY = "vocalFlowPlaybackVolume";
let playbackVolume = loadPlaybackVolume();
let playbackGain = null;
let playbackGainContext = null;
let replaySource = null;
let replayRequestId = 0;

// 【更新】縮短為 200 毫秒。保有防斷線能力，但降低對舊聲音的「黏滯感」
const PITCH_HOLD_MS = 200; 
const pitchTracker = {
  noiseFloor: 0.0015,
  smoothedMidi: null,
  recentMidis: [],
  lastReliableAt: -Infinity,
  lastAnalysisAt: -Infinity,
};
let mediaRecorder = null,
  recordingSessionId = 0,
  lastRecordingUrl = null,
  replayAudio = null,
  replaying = false,
  replayElapsed = 0,
  replayRaf = 0,
  exercisePassed = false,
  goalToastTimer = null;
let pianoReady = false,
  pianoLoading = null;

let showingBattleSetup = false;
let battleRecorded = false;
const battle = { active: false, players: 2, rounds: 3, level: 1, currPlayer: 1, currRound: 1, scores: [] };

const pianoBuffers = new Map();
const PIANO_BASE = "https://tonejs.github.io/audio/salamander/";
const PIANO_SAMPLES = {
  48: "C3.mp3",
  51: "Ds3.mp3",
  54: "Fs3.mp3",
  57: "A3.mp3",
  60: "C4.mp3",
  63: "Ds4.mp3",
  66: "Fs4.mp3",
  69: "A4.mp3",
  72: "C5.mp3",
  75: "Ds5.mp3",
  78: "Fs5.mp3",
};
const history = [];
let songLibrary = [];
let lastSongId = null;
let songBag = [];
let songLibrarySignature = "";
let flowId = 0;
let listenId = 0;
let builtInSongPromise = null;
const activeAudioNodes = new Set();
const PRE_ROLL_MS = 1000;
const RANGE_STORAGE_KEY = "vocalFlowPracticeRange";
const SONG_STORAGE_KEY = "vocalFlowLocalSongs";
const SONG_SCOPE_STORAGE_KEY = "vocalFlowSongScope";
const LEVEL3_FILTER_STORAGE_KEY = "vocalFlowLevel3Filters";
const DAILY_GOAL_STORAGE_KEY = "vocalFlowDailyGoals";
const DAILY_GOALS = { 1: 30, 2: 20, 3: 10 };
function $(q) {
  return document.querySelector(q);
}
function localDateKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}
function loadDailyProgress() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(DAILY_GOAL_STORAGE_KEY) || "null");
  } catch (error) {
    localStorage.removeItem(DAILY_GOAL_STORAGE_KEY);
  }
  if (saved?.date === localDateKey() && saved.counts)
    return { date: saved.date, counts: saved.counts };
  return { date: localDateKey(), counts: { 1: 0, 2: 0, 3: 0 } };
}
let dailyProgress = loadDailyProgress();
function refreshDailyProgressIfNeeded() {
  if (dailyProgress.date !== localDateKey()) {
    dailyProgress = loadDailyProgress();
    saveDailyProgress();
  }
}
function saveDailyProgress() {
  localStorage.setItem(DAILY_GOAL_STORAGE_KEY, JSON.stringify(dailyProgress));
}
function updateGoalDisplay() {
  refreshDailyProgressIfNeeded();
  const total = DAILY_GOALS[level];
  const count = Math.min(total, Number(dailyProgress.counts[level]) || 0);
  els.goalProgress.textContent = `${count} / ${total}`;
}
function showGoalToast() {
  clearTimeout(goalToastTimer);
  els.goalToastText.textContent = `Level ${level} 已完成 ${DAILY_GOALS[level]} 關`;
  els.goalToast.hidden = false;
  goalToastTimer = setTimeout(() => {
    els.goalToast.hidden = true;
  }, 4500);
}
function recordPassedExercise() {
  if (exercisePassed) return;
  refreshDailyProgressIfNeeded();
  const total = DAILY_GOALS[level];
  const before = Math.min(total, Number(dailyProgress.counts[level]) || 0);
  dailyProgress.counts[level] = Math.min(total, before + 1);
  exercisePassed = true;
  saveDailyProgress();
  updateGoalDisplay();
  if (before < total && dailyProgress.counts[level] >= total) showGoalToast();
}
function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}
function noteName(m) {
  const n = Math.round(m);
  return NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
}
function freqToMidi(f) {
  return 69 + 12 * Math.log2(f / 440);
}
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
function resetPitchTracker() {
  pitchTracker.noiseFloor = 0.0015;
  pitchTracker.smoothedMidi = null;
  pitchTracker.recentMidis.length = 0;
  pitchTracker.lastReliableAt = -Infinity;
  pitchTracker.lastAnalysisAt = -Infinity;
}
function pitchToMidi(value) {
  if (Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const match = value
    .trim()
    .replaceAll("♯", "#")
    .replaceAll("♭", "b")
    .match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return null;
  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let midi = (Number(match[3]) + 1) * 12 + semitones[match[1].toUpperCase()];
  if (match[2] === "#") midi += 1;
  if (match[2] === "b") midi -= 1;
  return midi >= 24 && midi <= 96 ? midi : null;
}
function normalizeNotes(rawNotes, filename, lineLabel) {
  if (!Array.isArray(rawNotes) || !rawNotes.length || rawNotes.length > 512)
    throw new Error(`${filename} 的「${lineLabel}」必須包含 1～512 個音符`);
  const notes = rawNotes.map((note, index) => {
    const beats = Number(note.beats);
    if (!Number.isFinite(beats) || beats <= 0 || beats > 16)
      throw new Error(
        `${filename}「${lineLabel}」第 ${index + 1} 個音符的 beats 不正確`,
      );
    const midi =
      note.rest === true ? null : pitchToMidi(note.pitch ?? note.midi);
    if (note.rest !== true && !Number.isFinite(midi))
      throw new Error(
        `${filename}「${lineLabel}」第 ${index + 1} 個音符的 pitch 不正確`,
      );
    return { midi, beats, lyric: String(note.lyric ?? "").slice(0, 12) };
  });
  if (!notes.some((note) => Number.isFinite(note.midi)))
    throw new Error(`${filename}「${lineLabel}」至少需要一個有音高的音符`);
  return notes;
}
function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => String(tag).trim()).filter(Boolean))].slice(
    0,
    40,
  );
}
function normalizeMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : {};
}
function normalizeVocalGender(value) {
  const key = String(value || "").trim().toLowerCase();
  const aliases = {
    male: "male", man: "male", 男: "male", 男聲: "male",
    female: "female", woman: "female", 女: "female", 女聲: "female",
    duet: "duet", mixed: "duet", 合唱: "duet", 男女合唱: "duet",
    group: "group", band: "group", 團體: "group", 多人: "group",
  };
  return aliases[key] || "";
}
function firstVocalGender(...values) {
  for (const value of values.flatMap((item) => (Array.isArray(item) ? item : [item]))) {
    const normalized = normalizeVocalGender(value);
    if (normalized) return normalized;
  }
  return "";
}
function normalizeSong(raw, filename = "歌曲檔案") {
  if (!raw || typeof raw !== "object") throw new Error(`${filename} 不是物件`);
  const bpm = Number(raw.bpm);
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 240)
    throw new Error(`${filename} 的 bpm 必須介於 30～240`);
  let sections = raw.sections;
  if (!Array.isArray(sections) || !sections.length) {
    if (!Array.isArray(raw.notes))
      throw new Error(`${filename} 必須包含 sections，或使用單句格式的 notes`);
    sections = [
      {
        id: "single",
        type: "single",
        name: "單句",
        lines: [
          { id: "single-line", lyric: raw.phrase || "", notes: raw.notes },
        ],
      },
    ];
  }
  const lines = [];
  sections.forEach((section, sectionIndex) => {
    if (!Array.isArray(section.lines) || !section.lines.length)
      throw new Error(`${filename} 第 ${sectionIndex + 1} 個區段沒有 lines`);
    const sectionType = String(section.type || "other").toLowerCase();
    const defaultName = {
      verse: "主歌",
      chorus: "副歌",
      prechorus: "前副歌",
      "pre-chorus": "前副歌",
      bridge: "橋段",
      single: "單句",
    }[sectionType];
    const sectionName = String(section.name || defaultName || "其他");
    section.lines.forEach((line, lineIndex) => {
      const lineLabel = String(
        line.name || line.lyric || `${sectionName}第 ${lineIndex + 1} 句`,
      );
      const lineBpm = Number(line.bpm ?? bpm);
      if (!Number.isFinite(lineBpm) || lineBpm < 30 || lineBpm > 240)
        throw new Error(`${filename}「${lineLabel}」的 bpm 不正確`);
      const notes = normalizeNotes(line.notes, filename, lineLabel);
      const lyric = String(line.lyric || notes.map((note) => note.lyric).join(""));
      const pitchedNotes = notes
        .map((note) => note.midi)
        .filter(Number.isFinite);
      const totalBeats = notes.reduce((sum, note) => sum + note.beats, 0);
      lines.push({
        id: String(line.id || `${section.id || sectionIndex}-${lineIndex}`),
        sectionType,
        sectionName,
        lyric,
        bpm: lineBpm,
        notes,
        vocalGender: firstVocalGender(
          line.vocalGender,
          line.singerGender,
          line.gender,
          line.metadata?.vocalGender,
          line.tags,
        ),
        tags: normalizeTags(line.tags),
        metadata: normalizeMetadata(line.metadata),
        stats: {
          minMidi: Math.min(...pitchedNotes),
          maxMidi: Math.max(...pitchedNotes),
          lyricLength: Array.from(lyric.replace(/\s/g, "")).length,
          totalBeats,
          durationSeconds: (totalBeats * 60) / lineBpm,
          pitchedNoteCount: pitchedNotes.length,
        },
      });
    });
  });
  return {
    id: String(raw.id || filename),
    name: String(raw.title || raw.name || filename).slice(0, 80),
    artist: String(raw.artist || "未知歌手").slice(0, 80),
    bpm,
    key: String(raw.key || ""),
    language: String(raw.language || "zh-TW"),
    genre: String(raw.genre || ""),
    vocalGender: firstVocalGender(
      raw.vocalGender,
      raw.singerGender,
      raw.gender,
      raw.metadata?.vocalGender,
      raw.tags,
    ),
    year: Number.isFinite(Number(raw.year)) ? Number(raw.year) : null,
    tags: normalizeTags(raw.tags),
    metadata: normalizeMetadata(raw.metadata),
    source: typeof raw.source === "string" ? raw.source : "",
    lines,
  };
}
function githubPagesRepository() {
  const host = location.hostname.toLowerCase();
  if (!host.endsWith(".github.io")) return null;
  const owner = host.slice(0, -".github.io".length);
  const firstPathPart = location.pathname
    .split("/")
    .filter(Boolean)
    .find((part) => !part.toLowerCase().endsWith(".html"));
  return { owner, repo: firstPathPart || `${owner}.github.io` };
}
function encodeRepoPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
async function loadGitHubDirectorySongs() {
  const repository = githubPagesRepository();
  if (!repository) throw new Error("目前不是 GitHub Pages 網址");
  const songs = [];
  const serverErrors = [];
  const scan = async (path) => {
    const url = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/contents/${encodeRepoPath(path)}`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub songs 目錄讀取失敗（${response.status}）`);
    const entries = await response.json();
    if (!Array.isArray(entries)) throw new Error("GitHub songs 路徑不是資料夾");
    for (const entry of entries) {
      if (entry.type === "dir") {
        await scan(entry.path);
        continue;
      }
      if (
        entry.type !== "file" ||
        !entry.name.toLowerCase().endsWith(".json") ||
        entry.name.startsWith("_") ||
        entry.name === "catalog.json"
      ) continue;
      try {
        const songResponse = await fetch(entry.download_url, { cache: "no-store" });
        if (!songResponse.ok) throw new Error(`HTTP ${songResponse.status}`);
        songs.push({ filename: entry.path, data: await songResponse.json(), origin: "github" });
      } catch (error) {
        serverErrors.push({ filename: entry.path, error: error.message });
      }
    }
  };
  await scan("songs");
  return { songs, server_errors: serverErrors, source: "GitHub songs 資料夾" };
}
async function loadCatalogSongs() {
  const songsBase = new URL("songs/", document.baseURI);
  const catalogResponse = await fetch(new URL("catalog.json", songsBase), {
    cache: "no-store",
  });
  if (!catalogResponse.ok)
    throw new Error(`songs/catalog.json 讀取失敗（${catalogResponse.status}）`);
  const catalog = await catalogResponse.json();
  if (!Array.isArray(catalog.files))
    throw new Error("songs/catalog.json 必須包含 files 陣列");
  const songs = [];
  const serverErrors = [];
  for (const filename of catalog.files) {
    try {
      const response = await fetch(new URL(String(filename), songsBase), {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      songs.push({
        filename: String(filename),
        data: await response.json(),
        origin: "catalog",
      });
    } catch (error) {
      serverErrors.push({ filename: String(filename), error: error.message });
    }
  }
  return { songs, server_errors: serverErrors, source: "catalog.json" };
}
function loadBuiltInSongs() {
  if (!builtInSongPromise) {
    builtInSongPromise = (async () => {
      if (githubPagesRepository()) {
        try {
          return await loadGitHubDirectorySongs();
        } catch (error) {
          console.warn("GitHub folder listing unavailable; using catalog", error);
        }
      }
      return loadCatalogSongs();
    })();
  }
  return builtInSongPromise;
}
async function refreshSongLibrary() {
  let catalogPayload = { songs: [], server_errors: [] };
  try {
    catalogPayload = await loadBuiltInSongs();
  } catch (error) {
    catalogPayload.server_errors.push({
      filename: "catalog.json",
      error: error.message,
    });
  }
  let importedPayload = { songs: [], server_errors: [] };
  try {
    importedPayload =
      JSON.parse(localStorage.getItem(SONG_STORAGE_KEY) || "null") ||
      importedPayload;
  } catch (error) {
    localStorage.removeItem(SONG_STORAGE_KEY);
  }
  const payload = {
    songs: [...catalogPayload.songs, ...(importedPayload.songs || [])],
  };
  const sourceWarnings = (catalogPayload.server_errors || []).map(
    (item) => `${item.filename}：${item.error}`,
  );
  const errors = (importedPayload.server_errors || []).map(
    (item) => `${item.filename}：${item.error}`,
  );
  const songsById = new Map();
  payload.songs.forEach((item) => {
    try {
      const song = normalizeSong(item.data, item.filename);
      songsById.set(song.id, song);
    } catch (error) {
      errors.push(error.message);
    }
  });
  songLibrary = [...songsById.values()];
  if (!songLibrary.length)
    throw new Error(
      errors[0] ||
        sourceWarnings[0] ||
        "沒有可用的歌曲 JSON；請檢查 catalog 或匯入檔案",
    );
  const importedCount = (importedPayload.songs || []).length;
  const sourceLabel =
    catalogPayload.source || (importedCount ? "裝置匯入" : "歌曲資料");
  const songNames = songLibrary.map((song) => song.name).join("、");
  const visibleNames = songLibrary
    .slice(0, 3)
    .map((song) => song.name)
    .join("、");
  els.songStatus.textContent = `共 ${songLibrary.length} 首 · ${sourceLabel}：${visibleNames}${songLibrary.length > 3 ? " 等" : ""}${importedCount ? ` · ${importedCount} 首由裝置匯入` : ""}`;
  els.songStatus.title = `已載入：${songNames}${sourceWarnings.length ? `\n資料來源提醒：${sourceWarnings.join("；")}` : ""}`;
  refreshFilterOptions();
  updateFilterResult();
  return { count: songLibrary.length, errors, warnings: sourceWarnings };
}
function selectedValues(selector) {
  return [...document.querySelectorAll(selector)]
    .filter((input) => input.checked)
    .map((input) => input.value);
}
function level3Filters() {
  return {
    scope: els.songScope.value,
    artistsAll: els.artistAll.checked,
    artists: selectedValues(".artist-choice"),
    gendersAll: els.genderAll.checked,
    genders: els.genderChoices.filter((input) => input.checked).map((input) => input.value),
    songId: els.songSelect.value,
    bpmMin: Number(els.filterBpmMin.value) || 30,
    bpmMax: Number(els.filterBpmMax.value) || 240,
    pitchMin: Number(els.filterPitchMin.value) || 24,
    pitchMax: Number(els.filterPitchMax.value) || 96,
    lyricMin: Math.max(0, Number(els.filterLyricMin.value) || 0),
    lyricMax: Math.max(1, Number(els.filterLyricMax.value) || 200),
  };
}
function level3LineCandidates(song) {
  const filters = level3Filters();
  if (filters.songId && song.id !== filters.songId) return [];
  if (!filters.artistsAll && (!song.artist || !filters.artists.includes(song.artist))) return [];
  return song.lines.filter((line) => {
    if (filters.scope === "chorus" && line.sectionType !== "chorus") return false;
    const vocalGender = line.vocalGender || song.vocalGender;
    if (!filters.gendersAll && (!vocalGender || !filters.genders.includes(vocalGender))) return false;
    return (
      line.bpm >= Math.min(filters.bpmMin, filters.bpmMax) &&
      line.bpm <= Math.max(filters.bpmMin, filters.bpmMax) &&
      line.stats.minMidi >= Math.min(filters.pitchMin, filters.pitchMax) &&
      line.stats.maxMidi <= Math.max(filters.pitchMin, filters.pitchMax) &&
      line.stats.lyricLength >= Math.min(filters.lyricMin, filters.lyricMax) &&
      line.stats.lyricLength <= Math.max(filters.lyricMin, filters.lyricMax)
    );
  });
}
function takeShuffledSong(pool) {
  const filters = level3Filters();
  const bagSignature = `${JSON.stringify(filters)}:${pool.map((song) => `${song.id}:${level3LineCandidates(song).map((line) => line.id).join(",")}`).sort().join("|")}`;
  if (bagSignature !== songLibrarySignature) {
    songLibrarySignature = bagSignature;
    songBag = [];
  }
  if (!songBag.length) {
    songBag = pool.map((song) => song.id);
    for (let index = songBag.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [songBag[index], songBag[swapIndex]] = [songBag[swapIndex], songBag[index]];
    }
    if (songBag.length > 1 && songBag[0] === lastSongId) {
      [songBag[0], songBag[1]] = [songBag[1], songBag[0]];
    }
  }
  const id = songBag.shift();
  return pool.find((song) => song.id === id) || pool[0];
}
function saveLevel3Filters() {
  localStorage.setItem(LEVEL3_FILTER_STORAGE_KEY, JSON.stringify(level3Filters()));
}
function savedLevel3Filters() {
  try {
    return JSON.parse(localStorage.getItem(LEVEL3_FILTER_STORAGE_KEY) || "null") || {};
  } catch (error) {
    localStorage.removeItem(LEVEL3_FILTER_STORAGE_KEY);
    return {};
  }
}
function makeCheckRow(value, label, checked) {
  const row = document.createElement("label");
  row.className = "check-row";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.value = value;
  input.className = "artist-choice";
  input.checked = checked;
  row.append(input, document.createTextNode(` ${label}`));
  return row;
}
function refreshFilterOptions() {
  if (!els.artistChoices || !els.songSelect) return;
  const stored = savedLevel3Filters();
  const currentArtists = els.artistChoices.children.length
    ? selectedValues(".artist-choice")
    : Array.isArray(stored.artists) ? stored.artists : [];
  const artists = [...new Set(songLibrary.map((song) => song.artist).filter((artist) => artist && artist !== "未知歌手"))]
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
  els.artistChoices.replaceChildren(...artists.map((artist) => makeCheckRow(artist, artist, currentArtists.includes(artist))));
  const keepSongId = els.songSelect.value || stored.songId || "";
  renderSongOptions(keepSongId);
  updateFilterSummaries();
}
function renderSongOptions(selectedId = els.songSelect.value) {
  const query = els.songSearch.value.trim().toLocaleLowerCase("zh-Hant");
  const options = [new Option("全部歌曲", "")];
  songLibrary
    .filter((song) => !query || `${song.name} ${song.artist}`.toLocaleLowerCase("zh-Hant").includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"))
    .forEach((song) => options.push(new Option(`${song.name} — ${song.artist}`, song.id)));
  els.songSelect.replaceChildren(...options);
  if ([...els.songSelect.options].some((option) => option.value === selectedId)) els.songSelect.value = selectedId;
}
function updateFilterSummaries() {
  const artists = selectedValues(".artist-choice");
  const genders = els.genderChoices.filter((input) => input.checked);
  const genderNames = { male: "男聲", female: "女聲", duet: "男女合唱", group: "團體" };
  els.artistFilterSummary.textContent = els.artistAll.checked ? "全部歌手" : artists.length ? `已選 ${artists.length} 位` : "尚未選擇";
  els.genderFilterSummary.textContent = els.genderAll.checked ? "全部類型" : genders.length ? genders.map((input) => genderNames[input.value]).join("、") : "尚未選擇";
}
function updateFilterResult() {
  if (!els.filterResult) return;
  const matches = songLibrary.map((song) => ({ song, lines: level3LineCandidates(song) })).filter((item) => item.lines.length);
  const lineCount = matches.reduce((sum, item) => sum + item.lines.length, 0);
  els.filterResult.textContent = `目前符合 ${matches.length} 首歌・${lineCount} 句`;
  els.applyFilters.disabled = !lineCount;
  updateFilterSummaries();
}
function onFilterChanged() {
  saveLevel3Filters();
  songBag = [];
  songLibrarySignature = "";
  updateFilterResult();
}
function resetLevel3Filters() {
  els.songScope.value = "all";
  els.artistAll.checked = true;
  document.querySelectorAll(".artist-choice").forEach((input) => (input.checked = false));
  els.genderAll.checked = true;
  els.genderChoices.forEach((input) => (input.checked = false));
  els.songSearch.value = "";
  renderSongOptions("");
  els.filterBpmMin.value = 30;
  els.filterBpmMax.value = 240;
  els.filterPitchMin.value = 24;
  els.filterPitchMax.value = 96;
  els.filterLyricMin.value = 0;
  els.filterLyricMax.value = 200;
  onFilterChanged();
}
async function importSongFiles(files) {
  const jsonFiles = [...files].filter((file) =>
    file.name.toLowerCase().endsWith(".json"),
  );
  if (!jsonFiles.length) throw new Error("沒有選取歌曲 JSON 檔案");
  const songs = [];
  const serverErrors = [];
  for (const file of jsonFiles) {
    try {
      songs.push({
        filename: file.name,
        data: JSON.parse(await file.text()),
        origin: "import",
      });
    } catch (error) {
      serverErrors.push({ filename: file.name, error: error.message });
    }
  }
  const payload = { songs, server_errors: serverErrors };
  localStorage.setItem(SONG_STORAGE_KEY, JSON.stringify(payload));
  els.songStatus.textContent = `已匯入 ${songs.length} 首歌曲`;
  return refreshSongLibrary();
}
function renderSongHint(song, line) {
  els.hint.textContent = `${song.artist} · ${line.sectionName} · ${line.bpm} BPM${song.key ? ` · 調性 ${song.key}` : ""} · 歌詞：${line.lyric}`;
  if (/^https?:\/\//i.test(song.source)) {
    const link = document.createElement("a");
    link.href = song.source;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "查看資料來源 ↗";
    els.hint.append(link);
  }
}
function populateRangeSelectors() {
  const saved = JSON.parse(localStorage.getItem(RANGE_STORAGE_KEY) || "null");
  for (let midi = 36; midi <= 84; midi++) {
    const minOption = new Option(noteName(midi), midi);
    const maxOption = new Option(noteName(midi), midi);
    els.rangeMin.add(minOption);
    els.rangeMax.add(maxOption);
  }
  els.rangeMin.value = String(saved?.min ?? 48);
  els.rangeMax.value = String(saved?.max ?? 74);
  normalizePracticeRange("max");
}
function practiceRange() {
  return { min: Number(els.rangeMin.value), max: Number(els.rangeMax.value) };
}
function normalizePracticeRange(changed) {
  let { min, max } = practiceRange();
  min = Math.max(36, Math.min(84, Number.isFinite(min) ? min : 48));
  max = Math.max(36, Math.min(84, Number.isFinite(max) ? max : 74));
  if (max - min < 7) {
    if (changed === "min") {
      max = min + 7;
      if (max > 84) {
        max = 84;
        min = 77;
      }
    } else {
      min = max - 7;
      if (min < 36) {
        min = 36;
        max = 43;
      }
    }
  }
  els.rangeMin.value = String(min);
  els.rangeMax.value = String(max);
  localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify({ min, max }));
}
function updateOptionVisibility() {
  if (showingBattleSetup) {
    els.rangeOptions.hidden = true;
    els.songOptions.hidden = true;
    els.battleOptions.hidden = false;
  } else {
    els.rangeOptions.hidden = level === 3 || battle.active;
    els.songOptions.hidden = level !== 3 || battle.active;
    els.battleOptions.hidden = true;
  }
  els.battleBanner.hidden = !battle.active;
}
function setFeedback(type, title, sub) {
  els.feedback.className = "feedback " + (type || "");
  els.feedback.innerHTML = `<span class="feedback-icon">${type === "pass" ? "✓" : type === "warn" ? "↑" : "◌"}</span><div><b>${title}</b><small>${sub}</small></div>`;
}
function exerciseDuration() {
  return exercise
    ? (exercise.notes.reduce((sum, n) => sum + n.beats, 0) * 60000) /
        exercise.bpm
    : 0;
}
function pitchRange() {
  const values = exercise
      ? exercise.notes.map((n) => n.midi).filter(Number.isFinite)
      : [60],
    lo = Math.min(...values),
    hi = Math.max(...values);
  if (lo === hi) return { min: lo - 6, max: hi + 6 };
  let min = Math.floor(lo - 3),
    max = Math.ceil(hi + 3);
  if (max - min < 10) {
    const extra = Math.ceil((10 - (max - min)) / 2);
    min -= extra;
    max += extra;
  }
  return { min, max };
}
function clearAttemptTrace() {
  history.length = 0;
  voicedFrames = hitFrames = 0;
  lastPitch = null;
  resetPitchTracker();
  els.score.textContent = "—";
  els.ring.classList.remove("good");
  els.currentNote.textContent = "—";
  els.currentFreq.textContent = "等待輸入";
}
async function chooseExercise(autoPlayDemo = false) {
  cancelCurrentFlow();
  clearLastRecording();
  const selectionId = flowId;
  let keepFeedback = false;
  exercisePassed = false;
  clearAttemptTrace();

  if (battle.active) {
    battleRecorded = false;
    els.next.disabled = true;
    els.next.innerHTML = "等待錄音...";
    resetStartButton();
  } else {
    els.next.disabled = false;
    els.next.innerHTML = "<span>↻</span> 換一題";
  }

  if (level === 1) {
    const { min, max } = practiceRange();
    const m = min + Math.floor(Math.random() * (max - min + 1));
    exercise = { name: noteName(m), notes: [{ midi: m, beats: 2 }], bpm: 80 };
    els.title.textContent = `唱出 ${noteName(m)}`;
    els.hint.textContent = `${noteName(min)}～${noteName(max)} 隨機抽題 · 聽完鋼琴後穩定唱住約 2 秒。`;
    els.targetNote.textContent = noteName(m);
  }
  if (level === 2) {
    const { min, max } = practiceRange();
    const roots = Array.from(
      { length: max - min - 6 },
      (_, index) => min + index,
    );
    const root = roots[Math.floor(Math.random() * roots.length)],
      seq = [0, 2, 4, 5, 7, 5, 4, 2, 0];
    exercise = {
      name: `${noteName(root)} 大調音階`,
      notes: seq.map((m) => ({ midi: root + m, beats: 1 })),
      bpm: 94,
    };
    els.title.textContent = exercise.name;
    els.hint.textContent = `音階全程位於 ${noteName(min)}～${noteName(max)} · 每拍一個音。`;
    els.targetNote.textContent = noteName(root);
  }
  if (level === 3) {
    exercise = null;
    els.demo.disabled = true;
    els.start.disabled = true;
    els.title.textContent = "正在讀取歌曲目錄…";
    els.hint.textContent = "先隨機抽歌曲，再從該歌的主歌或副歌隨機抽一句。";
    draw();
    try {
      const result = await refreshSongLibrary();
      if (selectionId !== flowId) return;
      const eligibleSongs = songLibrary.filter(
        (candidate) => level3LineCandidates(candidate).length,
      );
      if (!eligibleSongs.length)
        throw new Error("沒有符合目前篩選條件的句子，請放寬段落、歌手、演唱類型、BPM、音域或字數條件");
      const song = takeShuffledSong(eligibleSongs);
      const lines = level3LineCandidates(song);
      const line = lines[Math.floor(Math.random() * lines.length)];
      lastSongId = song.id;
      exercise = {
        name: song.name,
        notes: line.notes,
        bpm: line.bpm,
        lyric: line.lyric,
        sectionName: line.sectionName,
      };
      els.title.textContent = `${song.name} · ${line.sectionName}`;
      renderSongHint(song, line);
      els.targetNote.textContent = noteName(
        line.notes.find((note) => Number.isFinite(note.midi)).midi,
      );
      if (result.errors.length) {
        keepFeedback = true;
        setFeedback(
          "warn",
          `已載入 ${result.count} 首，另有 ${result.errors.length} 個檔案格式錯誤`,
          result.errors[0],
        );
      }
    } catch (error) {
      els.title.textContent = songLibrary.length
        ? "沒有符合篩選條件的句子"
        : "找不到可用的歌曲資料";
      els.hint.textContent = songLibrary.length
        ? "請調整上方條件；缺少歌手、演唱類型或段落標示的檔案，只會在相應條件選擇全部時納入。"
        : "請檢查 GitHub 的 songs 資料夾或 catalog.json，也可使用上方按鈕匯入歌曲 JSON。";
      els.targetNote.textContent = "—";
      setFeedback("warn", "Level 3 載入失敗", error.message);
      draw();
      return;
    }
  }
  if (selectionId !== flowId) return;
  els.demo.disabled = false;
  els.start.disabled = false;
  demoElapsed = 0;
  if (!keepFeedback) {
    if (battle.active) {
      setFeedback("", `請將裝置交給 玩家 ${battle.currPlayer}`, "聽完示範後按「開始錄音」");
    } else {
      setFeedback("", "新題目已準備好", "可重聽示範，或直接按「開始錄音」");
    }
  }
  draw();
  updateGoalDisplay();
  if (autoPlayDemo) await playDemo();
}
async function loadPiano() {
  ensureAudio();
  if (pianoReady) return true;
  if (pianoLoading) return pianoLoading;
  pianoLoading = (async () => {
    try {
      setFeedback(
        "warn",
        "正在載入平台鋼琴",
        "第一次載入約需數秒，之後會使用瀏覽器快取",
      );
      await Promise.all(
        Object.entries(PIANO_SAMPLES).map(async ([m, file]) => {
          const res = await fetch(PIANO_BASE + file, { mode: "cors" });
          if (!res.ok) throw new Error("sample " + file);
          pianoBuffers.set(
            +m,
            await audioCtx.decodeAudioData(await res.arrayBuffer()),
          );
        }),
      );
      pianoReady = true;
      return true;
    } catch (err) {
      console.warn("Piano samples unavailable, using fallback", err);
      return false;
    }
  })();
  return pianoLoading;
}
function loadPlaybackVolume() {
  try {
    const saved = localStorage.getItem(PLAYBACK_VOLUME_KEY);
    const value = saved === null ? 100 : Number(saved);
    return Number.isFinite(value) ? Math.max(50, Math.min(400, value)) : 100;
  } catch (error) {
    return 100;
  }
}
function getPlaybackOutput() {
  if (!playbackGain || playbackGainContext !== audioCtx) {
    playbackGain?.disconnect();
    playbackGain = audioCtx.createGain();
    playbackGainContext = audioCtx;
    playbackGain.gain.value = playbackVolume / 100;
    playbackGain.connect(audioCtx.destination);
  }
  return playbackGain;
}
function setPlaybackVolume(value) {
  const number = Number(value);
  playbackVolume = Number.isFinite(number) ? Math.max(50, Math.min(400, number)) : 100;
  els.playbackVolume.value = String(playbackVolume);
  els.playbackVolume.setAttribute("aria-valuetext", `${playbackVolume}%`);
  els.playbackVolumeValue.textContent = `${playbackVolume}%`;
  if (playbackGain && playbackGainContext === audioCtx && audioCtx.state !== "closed") {
    const gain = playbackGain.gain;
    gain.cancelScheduledValues(audioCtx.currentTime);
    gain.setTargetAtTime(playbackVolume / 100, audioCtx.currentTime, 0.015);
  }
  try { localStorage.setItem(PLAYBACK_VOLUME_KEY, String(playbackVolume)); }
  catch (error) { /* The current session still keeps the volume setting. */ }
}
function disconnectReplaySource() {
  replaySource?.disconnect();
  replaySource = null;
}
function synthFallback(midi, when, duration) {
  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.0001, when);
  master.gain.exponentialRampToValueAtTime(0.2, when + 0.008);
  master.gain.exponentialRampToValueAtTime(0.045, when + 0.23);
  master.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.45);
  master.connect(getPlaybackOutput());
  [1, 2, 3, 4].forEach((h, i) => {
    const o = audioCtx.createOscillator(),
      g = audioCtx.createGain();
    o.type = i ? "sine" : "triangle";
    o.frequency.value = midiToFreq(midi) * h;
    g.gain.value = [1, 0.19, 0.08, 0.03][i];
    o.connect(g).connect(master);
    activeAudioNodes.add(o);
    o.onended = () => activeAudioNodes.delete(o);
    o.start(when);
    o.stop(when + duration + 0.5);
  });
}
function pianoNote(midi, when, duration) {
  if (!pianoReady) {
    synthFallback(midi, when, duration);
    return;
  }
  const keys = [...pianoBuffers.keys()],
    nearest = keys.reduce((a, b) =>
      Math.abs(b - midi) < Math.abs(a - midi) ? b : a,
    ),
    source = audioCtx.createBufferSource(),
    gain = audioCtx.createGain();
  source.buffer = pianoBuffers.get(nearest);
  source.playbackRate.value = Math.pow(2, (midi - nearest) / 12);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(0.72, when + 0.008);
  gain.gain.setValueAtTime(0.72, when + Math.max(0.04, duration - 0.08));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.7);
  source.connect(gain).connect(getPlaybackOutput());
  activeAudioNodes.add(source);
  source.onended = () => activeAudioNodes.delete(source);
  source.start(when);
  source.stop(when + duration + 0.8);
}
function resetDemoButton() {
  els.demo.disabled = !exercise;
  els.demo.innerHTML = "<span>▶</span> 只聽示範";
  els.demo.onclick = () => playDemo();
}
async function playDemo() {
  if (!exercise) return;
  cancelCurrentFlow();
  stopReplay();
  const runId = flowId;
  if (!(await ensureAudio()) || runId !== flowId) return;

  els.demo.disabled = false;
  els.demo.innerHTML = "<span>■</span> 停止示範";
  els.demo.onclick = () => {
    cancelCurrentFlow();
    setFeedback("", "已停止示範", "可重新聆聽，或直接按「開始錄音」");
  };

  els.start.disabled = true;
  els.replay.disabled = true;
  await loadPiano();
  if (runId !== flowId || !exercise) return;
  setFeedback("warn", "準備聽示範", "1 秒後開始，音高條會依實際時值逐段亮起");
  const beat = 60 / exercise.bpm,
    t0 = audioCtx.currentTime + PRE_ROLL_MS / 1000;
  let cursor = 0;
  exercise.notes.forEach((n) => {
    if (Number.isFinite(n.midi))
      pianoNote(n.midi, t0 + cursor * beat, Math.max(0.12, n.beats * beat));
    cursor += n.beats;
  });
  const noteDuration = cursor * beat * 1000,
    visualDuration = PRE_ROLL_MS + noteDuration,
    demoStart = performance.now();
  demoElapsed = 0;
  demoing = true;
  const animate = () => {
    if (!demoing || runId !== flowId) return;
    demoElapsed = Math.max(
      0,
      Math.min(performance.now() - demoStart, visualDuration),
    );
    draw();
    if (demoElapsed < visualDuration)
      progressRaf = requestAnimationFrame(animate);
  };
  animate();
  await wait(visualDuration + 700);
  if (runId !== flowId) return;
  demoElapsed = visualDuration;
  demoing = false;
  cancelAnimationFrame(progressRaf);
  draw();
  els.demo.disabled = false;
  resetStartButton();
  updateReplayButton();
  resetDemoButton();
  setFeedback("", "示範播放完成", "準備好後直接按「開始錄音」");
}
// Permissions belong to the browser. A saved permission is not a live audio stream.
async function ensureAudio() {
  try {
    if (!audioCtx || audioCtx.state === "closed") {
      disconnectMicGraph();
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.onstatechange = () => {
        if (audioCtx.state !== "running" && listening) {
          cancelCurrentFlow();
          micGraphNeedsRefresh = true;
          setMicStatus("音訊已中斷，請點開始錄音", false);
          setFeedback("warn", "音訊已中斷", "回到此頁後，請再按一次開始錄音或只聽示範");
        }
      };
    }
    // Safari can use interrupted, in addition to suspended.
    if (audioCtx.state !== "running") {
      let timer;
      try {
        await Promise.race([
          audioCtx.resume(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Audio resume timed out")), 4000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    if (audioCtx.state !== "running") throw new Error("Audio context is not running");
    return true;
  } catch (error) {
    console.warn("Audio could not resume", error);
    setMicStatus("音訊待恢復", false);
    setFeedback("warn", "音訊尚未恢復", "請確認已回到此分頁，再按一次開始錄音或只聽示範");
    return false;
  }
}
function setMicStatus(text, live = false) {
  document.querySelector(".header-status").classList.toggle("live", live);
  els.micStatus.textContent = text;
}
function disconnectMicGraph() {
  for (const node of [micSource, pitchHighpass, pitchLowpass, analyser]) {
    try { node?.disconnect(); } catch (error) { /* Already disconnected. */ }
  }
  micSource = pitchHighpass = pitchLowpass = analyser = null;
}
function releaseMic() {
  micGeneration++;
  micSetupPromise = null;
  const oldStream = stream;
  stream = null;
  disconnectMicGraph();
  oldStream?.getTracks().forEach((track) => track.stop());
  setMicStatus("麥克風未連線");
}
function hasUsableMic() {
  return Boolean(stream?.active && stream.getAudioTracks().some(
    (track) => track.readyState === "live" && track.enabled && !track.muted,
  ));
}
function micInterrupted(message) {
  if (listening) {
    // Do not score a take interrupted by the system or an unplugged microphone.
    cancelCurrentFlow();
    setFeedback("warn", "麥克風收音中斷", "請按開始錄音重新連接；若仍無聲，點頁首麥克風狀態重連");
  }
  micGraphNeedsRefresh = true;
  setMicStatus(message, false);
}
function setupMic() {
  // Call resume immediately inside the click handler, before awaiting permission.
  const audioReady = ensureAudio();
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    setFeedback("warn", "此網址無法使用麥克風", "請改用 GitHub Pages 的 HTTPS 網址，並使用最新版 Safari、Chrome 或 Edge");
    return Promise.resolve(false);
  }
  if (micSetupPromise) return micSetupPromise;
  const generation = micGeneration;
  const task = (async () => {
    try {
      if (!hasUsableMic()) {
        const oldStream = stream;
        stream = null;
        disconnectMicGraph();
        oldStream?.getTracks().forEach((track) => track.stop());
        setMicStatus("正在連接麥克風…");
        const acquired = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        // A permission prompt may finish after the page has been left.
        if (generation !== micGeneration || document.hidden) {
          acquired.getTracks().forEach((track) => track.stop());
          return false;
        }
        stream = acquired;
        const ownedStream = stream;
        stream.getAudioTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (stream === ownedStream) micInterrupted("麥克風已斷線");
          });
          track.addEventListener("mute", () => {
            if (stream === ownedStream) micInterrupted("麥克風暫時無法收音");
          });
        });
      }
      const wasReady = await audioReady;
      if (generation !== micGeneration || document.hidden) return false;
      // The permission dialog itself may have interrupted the context.
      if ((!wasReady || audioCtx.state !== "running") && !(await ensureAudio())) return false;
      if (generation !== micGeneration || document.hidden) return false;
      if (!hasUsableMic()) {
        micInterrupted("麥克風暫時無法收音");
        setFeedback("warn", "麥克風尚未就緒", "請確認其他應用程式沒有佔用麥克風，再按開始錄音");
        return false;
      }
      if (!analyser || micGraphNeedsRefresh) {
        disconnectMicGraph();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        micSource = audioCtx.createMediaStreamSource(stream);
        pitchHighpass = audioCtx.createBiquadFilter();
        pitchHighpass.type = "highpass";
        pitchHighpass.frequency.value = 65;
        pitchHighpass.Q.value = 0.7;
        pitchLowpass = audioCtx.createBiquadFilter();
        pitchLowpass.type = "lowpass";
        pitchLowpass.frequency.value = 1400;
        pitchLowpass.Q.value = 0.7;
        micSource.connect(pitchHighpass).connect(pitchLowpass).connect(analyser);
        micGraphNeedsRefresh = false;
      }
      setMicStatus("麥克風已連線（點此重連）", true);
      return true;
    } catch (error) {
      if (generation !== micGeneration) return false;
      console.warn("Microphone setup failed", error);
      releaseMic();
      const hints = {
        NotAllowedError: "請到網址列的網站設定，將麥克風改為允許；若已允許，也請檢查系統的瀏覽器麥克風權限。網頁無法強制授權。",
        SecurityError: "瀏覽器禁止此頁使用麥克風，請檢查網站權限與 HTTPS 網址。",
        NotFoundError: "找不到麥克風，請確認裝置已連接。",
        NotReadableError: "麥克風無法讀取，請關閉可能佔用它的應用程式，再重試。",
        AbortError: "麥克風連線中斷，請再按一次開始錄音。",
      };
      setFeedback("warn", "無法開啟麥克風", hints[error.name] || "請確認麥克風與系統權限正常，再點頁首麥克風狀態重連。");
      return false;
    }
  })();
  micSetupPromise = task;
  task.finally(() => {
    if (micSetupPromise === task) micSetupPromise = null;
  });
  return task;
}
async function reconnectMic() {
  cancelCurrentFlow();
  stopReplay();
  releaseMic();
  const requestId = flowId;
  if (await setupMic() && requestId === flowId) {
    setFeedback("", "麥克風已重新連接", "準備好後按開始錄音");
  }
}
function updateReplayButton() {
  els.replay.disabled = !lastRecordingUrl || listening || demoing;
  if (!replaying)
    els.replay.innerHTML = "<span>↺</span> 重播我的聲音";
}
function stopReplay(showFullTrace = true) {
  replayRequestId++;
  disconnectReplaySource();
  cancelAnimationFrame(replayRaf);
  replayRaf = 0;
  if (replayAudio) {
    replayAudio.pause();
    replayAudio.currentTime = 0;
    replayAudio = null;
  }
  replaying = false;
  replayElapsed = showFullTrace ? PRE_ROLL_MS + exerciseDuration() : 0;
  draw();
  updateReplayButton();
}
function clearLastRecording() {
  stopReplay(false);
  recordingSessionId++;
  if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
  lastRecordingUrl = null;
  updateReplayButton();
}
function startMediaCapture() {
  clearLastRecording();
  if (!window.MediaRecorder || !stream) return false;
  const sessionId = ++recordingSessionId;
  const chunks = [];
  try {
    const recorder = new MediaRecorder(stream);
    mediaRecorder = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      if (sessionId !== recordingSessionId || !chunks.length) return;
      const blob = new Blob(chunks, {
        type: recorder.mimeType || chunks[0].type || "audio/webm",
      });
      lastRecordingUrl = URL.createObjectURL(blob);
      updateReplayButton();
    };
    recorder.start(250);
    return true;
  } catch (error) {
    console.warn("Voice replay recording unavailable", error);
    mediaRecorder = null;
    return false;
  }
}
function stopMediaCapture(keepRecording) {
  const recorder = mediaRecorder;
  mediaRecorder = null;
  if (!recorder) return;
  if (!keepRecording) recordingSessionId++;
  if (recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch (error) {
      console.warn("Could not stop voice recording", error);
    }
  }
}
async function replayLastRecording() {
  if (!lastRecordingUrl || listening || demoing) return;
  if (replaying) {
    stopReplay();
    return;
  }
  stopReplay(false);
  const requestId = replayRequestId;
  const recordingUrl = lastRecordingUrl;
  if (!(await ensureAudio()) || requestId !== replayRequestId ||
      recordingUrl !== lastRecordingUrl || listening || demoing) return;
  replayAudio = new Audio(recordingUrl);
  try {
    replaySource = audioCtx.createMediaElementSource(replayAudio);
    replaySource.connect(getPlaybackOutput());
  } catch (error) {
    stopReplay();
    setFeedback("warn", "無法重播錄音", "音訊輸出無法連接，請重新整理後再試");
    return;
  }
  const playingAudio = replayAudio;
  replaying = true;
  replayElapsed = 0;
  const visualDuration = PRE_ROLL_MS + exerciseDuration();
  const animateReplay = () => {
    if (!replaying || !replayAudio) return;
    const audioDuration = replayAudio.duration;
    replayElapsed =
      Number.isFinite(audioDuration) && audioDuration > 0
        ? Math.min(visualDuration, (replayAudio.currentTime / audioDuration) * visualDuration)
        : Math.min(visualDuration, replayAudio.currentTime * 1000);
    draw();
    replayRaf = requestAnimationFrame(animateReplay);
  };
  replayAudio.onended = () => {
    if (replayAudio !== playingAudio) return;
    disconnectReplaySource();
    cancelAnimationFrame(replayRaf);
    replayRaf = 0;
    replayElapsed = visualDuration;
    replaying = false;
    replayAudio = null;
    demoElapsed = visualDuration;
    draw();
    updateReplayButton();
  };
  replayAudio.onerror = () => {
    if (replayAudio !== playingAudio) return;
    disconnectReplaySource();
    cancelAnimationFrame(replayRaf);
    replayRaf = 0;
    replaying = false;
    replayAudio = null;
    draw();
    updateReplayButton();
    setFeedback("warn", "無法重播錄音", "這個瀏覽器無法播放剛才的錄音格式");
  };
  replayAudio.play().then(() => {
    if (replayAudio !== playingAudio) return;
    els.replay.innerHTML = "<span>■</span> 停止重播";
    animateReplay();
  }).catch(() => {
    if (replayAudio !== playingAudio) return;
    disconnectReplaySource();
    replaying = false;
    replayAudio = null;
    draw();
    updateReplayButton();
  });
}
async function startFlow() {
  cancelCurrentFlow();
  stopReplay();
  const requestId = flowId;
  if (!(await setupMic())) return;
  if (requestId !== flowId) return;
  if (!exercise || document.hidden) return;
  beginListening();
}
function beginListening() {
  stopListening();
  stopReplay(false);
  demoElapsed = 0;
  clearAttemptTrace();
  const replaySupported = startMediaCapture();
  els.start.disabled = false;
  els.start.textContent = "■ 結束本題";
  els.start.onclick = () => finish(false);
  setFeedback(
    "warn",
    "錄音已開始",
    replaySupported
      ? "前 1 秒為準備區，聲音與橘色軌跡已開始記錄"
      : "前 1 秒為準備區；此瀏覽器不支援聲音重播",
  );
  preparingToListen = true;
  listening = true;
  startAt = performance.now();
  tick();
}
function resetStartButton() {
  els.start.disabled = false;
  els.start.innerHTML = '<span class="mic-icon">●</span> 開始錄音';
  els.start.onclick = startFlow;
}
function stopListening(resetButton = true) {
  listenId++;
  listening = false;
  preparingToListen = false;
  stopMediaCapture(false);
  cancelAnimationFrame(raf);
  cancelAnimationFrame(progressRaf);
  if (resetButton) resetStartButton();
}
function stopScheduledAudio() {
  activeAudioNodes.forEach((node) => {
    try {
      node.stop();
    } catch (error) {
      // The node may already have ended.
    }
  });
  activeAudioNodes.clear();
}
function cancelCurrentFlow() {
  flowId++;
  stopListening();
  demoing = false;
  cancelAnimationFrame(progressRaf);
  stopScheduledAudio();
  if (exercise) {
    resetDemoButton();
    els.next.disabled = false;
  }
}
function finish(completed = false) {
  if (!listening) return;
  listenId++;
  listening = false;
  preparingToListen = false;
  stopMediaCapture(true);
  cancelAnimationFrame(raf);
  demoElapsed = PRE_ROLL_MS + exerciseDuration();
  draw();
  const score = voicedFrames ? Math.round((hitFrames / voicedFrames) * 100) : 0;
  els.score.textContent = score + "%";
  if (score >= 70) {
    recordPassedExercise();
    els.ring.classList.add("good");
    setFeedback(
      "pass",
      "PASS！音準達標",
      `本題命中率 ${score}% · 很好，換下一題吧`,
    );
  } else
    setFeedback(
      "warn",
      "再試一次",
      voicedFrames < 10
        ? "沒有偵測到足夠的聲音，請靠近麥克風"
        : "先看橘線偏高或偏低，再跟鋼琴校準一次",
    );
  els.start.textContent = "再唱一次";
  els.start.onclick = startFlow;

  if (battle.active) {
    battleRecorded = true;
    battle.scores[battle.currPlayer - 1][battle.currRound - 1] = score;

    els.start.disabled = true;
    els.start.textContent = "已記錄成績";
    els.start.onclick = null;

    els.next.disabled = false;
    if (battle.currPlayer < battle.players) {
        els.next.innerHTML = `<span>👉</span> 換玩家 ${battle.currPlayer + 1}`;
    } else if (battle.currRound < battle.rounds) {
        els.next.innerHTML = `<span>👉</span> 下一輪 (玩家 1)`;
    } else {
        els.next.innerHTML = `<span>🏆</span> 查看結算`;
    }
  }
}
function currentTarget(elapsed) {
  const beatMs = 60000 / exercise.bpm;
  let sum = 0;
  for (const n of exercise.notes) {
    sum += n.beats * beatMs;
    if (elapsed <= sum) return n;
  }
  return undefined;
}

// 【替換 2】加入優化過的 tick
function tick(frameTime = performance.now()) {
  if (!listening) return;
  const elapsed = performance.now() - startAt,
    noteElapsed = elapsed - PRE_ROLL_MS,
    target = noteElapsed >= 0 ? currentTarget(noteElapsed) : null;
  if (elapsed >= PRE_ROLL_MS + exerciseDuration() || (noteElapsed >= 0 && !target)) {
    finish(true);
    return;
  }
  if (preparingToListen && noteElapsed >= 0) {
    preparingToListen = false;
    setFeedback("", "開始唱吧", "粉色軌跡越靠近青色目標帶越準");
  }
  const targetMidi = target?.midi ?? null;
  els.targetNote.textContent = target
    ? Number.isFinite(targetMidi)
      ? noteName(targetMidi)
      : "休"
    : "準備";

  if (frameTime - pitchTracker.lastAnalysisAt >= PITCH_ANALYSIS_INTERVAL_MS) {
    pitchTracker.lastAnalysisAt = frameTime;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    
    // 放寬收音門檻，降低底線，並減少倍率
    const rmsGate = Math.max(0.001, Math.min(0.015, pitchTracker.noiseFloor * 1.5));
    const detection = detectPitch(data, audioCtx.sampleRate, rmsGate);
    
    if (!detection.frequency && detection.rms < 0.03) {
      pitchTracker.noiseFloor = Math.max(
        0.0008,
        Math.min(0.006, pitchTracker.noiseFloor * 0.96 + detection.rms * 0.04),
      );
    }
    const tracked = stabilizePitch(detection, frameTime, targetMidi);
    const midi = tracked?.midi ?? null;
    if (tracked) {
      lastPitch = midi;
      els.currentNote.textContent = noteName(midi);
      const freq = midiToFreq(midi);
      if (Number.isFinite(targetMidi)) {
        const cents = (midi - targetMidi) * 100;
        els.currentFreq.textContent = `${freq.toFixed(1)} Hz · ${cents > 0 ? "+" : ""}${Math.round(cents)} cents${tracked.held ? " · 穩定中" : ""}`;
        els.needle.style.left = Math.max(0, Math.min(100, 50 + cents / 2.5)) + "%";
        if (tracked.reliable) {
          voicedFrames++;
          if (Math.abs(cents) <= 40) hitFrames++;
          els.score.textContent = Math.round((hitFrames / voicedFrames) * 100) + "%";
        }
      } else {
        els.currentFreq.textContent = `${freq.toFixed(1)} Hz · ${target ? "休止符" : "準備區"}`;
      }
    } else if (target && !Number.isFinite(targetMidi)) {
      els.currentNote.textContent = "—";
      els.needle.style.left = "50%";
      els.currentFreq.textContent = "休止符";
    } else {
      els.currentNote.textContent = "—";
      els.needle.style.left = "50%";
      els.currentFreq.textContent = target ? "等待穩定聲音" : "準備區已開始錄音";
    }
    history.push({ midi, target: targetMidi, elapsed, held: Boolean(tracked?.held) });
    if (history.length > 2400) history.shift();
  }
  draw();
  raf = requestAnimationFrame(tick);
}

// 【替換 3】加入優化過的 detectPitch
function detectPitch(buf, sampleRate, rmsGate = 0.0025) {
  const frameSize = Math.min(2048, buf.length),
    offset = buf.length - frameSize;
  let mean = 0;
  for (let i = 0; i < frameSize; i++) mean += buf[offset + i];
  mean /= frameSize;
  let rms = 0;
  const frame = new Float32Array(frameSize);
  for (let i = 0; i < frameSize; i++) {
    const value = buf[offset + i] - mean;
    frame[i] = value;
    rms += value * value;
  }
  rms = Math.sqrt(rms / frameSize);
  if (rms < rmsGate)
    return { frequency: null, confidence: 0, rms };

  const minTau = Math.max(2, Math.floor(sampleRate / 1100)),
    maxTau = Math.min(Math.floor(sampleRate / 65), Math.floor(frameSize / 2) - 1),
    difference = new Float32Array(maxTau + 1),
    normalized = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    const limit = frameSize - tau;
    for (let i = 0; i < limit; i++) {
      const delta = frame[i] - frame[i + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }
  normalized[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += difference[tau];
    normalized[tau] = runningSum ? (difference[tau] * tau) / runningSum : 1;
  }

  let bestTau = -1;
  for (let tau = minTau; tau < maxTau; tau++) {
    if (normalized[tau] < 0.25) {
      while (tau + 1 <= maxTau && normalized[tau + 1] < normalized[tau]) tau++;
      bestTau = tau;
      break;
    }
  }
  if (bestTau < 0) {
    let bestValue = Infinity;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (normalized[tau] < bestValue) {
        bestValue = normalized[tau];
        bestTau = tau;
      }
    }
    if (bestValue > 0.5)
      return { frequency: null, confidence: Math.max(0, 1 - bestValue), rms };
  }

  const left = normalized[Math.max(minTau, bestTau - 1)],
    center = normalized[bestTau],
    right = normalized[Math.min(maxTau, bestTau + 1)],
    denominator = left - 2 * center + right,
    refinedTau = denominator
      ? bestTau + Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator))
      : bestTau,
    confidence = Math.max(0, Math.min(1, 1 - center));
    
  if (confidence < 0.4 || !Number.isFinite(refinedTau) || refinedTau <= 0)
    return { frequency: null, confidence, rms };
  return { frequency: sampleRate / refinedTau, confidence, rms };
}

// 【替換 4】加入優化過的 stabilizePitch，提高靈敏度，降低黏滯感
function stabilizePitch(detection, now, targetMidi) {
  const previous = pitchTracker.smoothedMidi;
  let isReliable = false;

  if (detection.frequency) {
    if (detection.confidence >= 0.45) {
      isReliable = true;
    } else if (detection.confidence >= 0.25 && Number.isFinite(previous)) {
      const rawMidi = freqToMidi(detection.frequency);
      if (Math.abs(rawMidi - previous) < 2.5) {
        isReliable = true;
      }
    }
  }

  if (isReliable) {
    let rawMidi = freqToMidi(detection.frequency);
    if (Number.isFinite(previous) && Math.abs(rawMidi - previous) > 7) {
      const octaveCandidates = [rawMidi - 12, rawMidi + 12];
      const corrected = octaveCandidates.reduce((best, candidate) =>
        Math.abs(candidate - previous) < Math.abs(best - previous) ? candidate : best
      );
      const rawFitsTarget = Number.isFinite(targetMidi) &&
        Math.abs(rawMidi - targetMidi) + 0.8 < Math.abs(corrected - targetMidi);
      if (!rawFitsTarget && Math.abs(corrected - previous) < 4.5) rawMidi = corrected;
    }

    pitchTracker.recentMidis.push(rawMidi);
    
    // 縮小濾波器視窗，從 5 降到 3，大幅縮減延遲
    if (pitchTracker.recentMidis.length > 3) pitchTracker.recentMidis.shift();

    const stableMidi = median(pitchTracker.recentMidis);
    const delta = Number.isFinite(previous) ? Math.abs(stableMidi - previous) : Infinity;
    
    // 放寬大跳音的限速：改變超過 1.5 半音就給予 95% 速度，小抖動則保有 65% 平滑
    const alpha = delta > 1.5 ? 0.95 : 0.65;
    
    pitchTracker.smoothedMidi = Number.isFinite(previous)
      ? previous + (stableMidi - previous) * alpha
      : stableMidi;
    pitchTracker.lastReliableAt = now;

    return {
      midi: pitchTracker.smoothedMidi,
      reliable: true,
      held: false,
      confidence: detection.confidence,
    };
  }

  if (
    Number.isFinite(pitchTracker.smoothedMidi) &&
    now - pitchTracker.lastReliableAt <= PITCH_HOLD_MS
  ) {
    return {
      midi: pitchTracker.smoothedMidi,
      reliable: false,
      held: true,
      confidence: detection.confidence || 0,
    };
  }

  pitchTracker.smoothedMidi = null;
  pitchTracker.recentMidis.length = 0;
  return null;
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2),
    rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
function draw() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight,
    gutter = 52,
    lyricH = level === 3 ? 34 : 0,
    { min: rangeMin, max: rangeMax } = pitchRange(),
    plotH = h - lyricH,
    rowH = plotH / (rangeMax - rangeMin + 1),
    plotW = w - gutter;
  ctx.clearRect(0, 0, w, h);
  if (lyricH) {
    ctx.fillStyle = "#151126";
    ctx.fillRect(gutter, 0, plotW, lyricH);
  }
  for (let m = rangeMin; m <= rangeMax; m++) {
    const y = lyricH + plotH - (m - rangeMin + 1) * rowH;
    ctx.fillStyle = NOTE_NAMES[m % 12].includes("♯")
      ? m % 2
        ? "#0d0a18"
        : "#110d1e"
      : m % 2
        ? "#171126"
        : "#130f22";
    ctx.fillRect(gutter, y, plotW, rowH);
    ctx.strokeStyle = "#ffffff0b";
    ctx.beginPath();
    ctx.moveTo(gutter, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  if (exercise) {
    const beatMs = 60000 / exercise.bpm,
      noteDuration = exerciseDuration(),
      total = PRE_ROLL_MS + noteDuration,
      elapsed = listening
        ? performance.now() - startAt
        : replaying
          ? replayElapsed
          : demoElapsed,
      baseX = gutter + 14,
      pxMs = Math.max(0.04, (plotW - 28) / total),
      timelineX = baseX + PRE_ROLL_MS * pxMs,
      fillLimit = baseX + elapsed * pxMs;
    const preRollWidth = PRE_ROLL_MS * pxMs;
    ctx.fillStyle = "#ffffff0a";
    ctx.fillRect(baseX, 0, preRollWidth, h);
    ctx.strokeStyle = "#ffffff22";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(timelineX, 0);
    ctx.lineTo(timelineX, h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#8d9bad";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 10px sans-serif";
    ctx.fillText("準備 1 秒", baseX + preRollWidth / 2, lyricH ? lyricH / 2 : 11);
    let t = 0;
    ctx.lineWidth = 1.5;
    exercise.notes.forEach((n) => {
      const rawX = timelineX + t * pxMs,
        ww = n.beats * beatMs * pxMs,
        x = Math.max(rawX, gutter),
        right = Math.min(rawX + ww, w),
        filledRight = Math.min(right, fillLimit);
      t += n.beats * beatMs;
      if (right <= x) return;
      if (n.lyric) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = '700 13px "Noto Sans TC",sans-serif';
        ctx.fillStyle = filledRight > x ? "#58f5ea" : "#c3bad2";
        ctx.fillText(
          n.lyric,
          Math.max(gutter + 7, Math.min(w - 7, rawX + ww / 2)),
          lyricH / 2,
        );
      }
      if (!Number.isFinite(n.midi)) return;
      const y = lyricH + plotH - (n.midi - rangeMin + 0.5) * rowH;
      ctx.fillStyle = "#58f5ea22";
      ctx.fillRect(x, y - rowH * 0.34, right - x, rowH * 0.68);
      if (filledRight > x) {
        ctx.fillStyle = "#58f5eacc";
        ctx.fillRect(x, y - rowH * 0.34, filledRight - x, rowH * 0.68);
      }
      ctx.strokeStyle = "#58f5ea";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    });
    if (demoing || replaying || preparingToListen || listening) {
      const playhead = Math.min(baseX + elapsed * pxMs, w);
      ctx.strokeStyle = "#ffffff70";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(playhead, 0);
      ctx.lineTo(playhead, h);
      ctx.stroke();
    }
    if (history.length) {
      ctx.strokeStyle = "#ff4fd8";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let began = false;
      const traceLimit = replaying ? replayElapsed : Infinity;
      history.forEach((p) => {
        if (p.elapsed > traceLimit) return;
        if (p.midi == null) {
          began = false;
          return;
        }
        const x = baseX + p.elapsed * pxMs,
          y = lyricH + plotH - (p.midi - rangeMin + 0.5) * rowH;
        if (x < gutter || p.midi < rangeMin - 0.5 || p.midi > rangeMax + 0.5) {
          began = false;
          return;
        }
        if (!began) {
          ctx.moveTo(x, y);
          began = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
  ctx.fillStyle = "#090712";
  ctx.fillRect(0, 0, gutter, h);
  ctx.strokeStyle = "#263246";
  ctx.beginPath();
  ctx.moveTo(gutter - 0.5, 0);
  ctx.lineTo(gutter - 0.5, h);
  if (lyricH) {
    ctx.moveTo(gutter, lyricH - 0.5);
    ctx.lineTo(w, lyricH - 0.5);
  }
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "600 10px sans-serif";
  ctx.fillStyle = "#6f7d90";
  if (lyricH) ctx.fillText("歌詞", 11, lyricH / 2);
  for (let m = rangeMin; m <= rangeMax; m++) {
    const used = exercise?.notes.some((n) => n.midi === m);
    if (NOTE_NAMES[m % 12] === "C" || used) {
      const y = lyricH + plotH - (m - rangeMin + 0.5) * rowH;
      ctx.fillStyle = used ? "#b7c3d3" : "#6f7d90";
      ctx.fillText(noteName(m), 11, y);
    }
  }
}
function updateBattleUI() {
  els.battleTurnText.textContent = `玩家 ${battle.currPlayer} 的回合`;
  els.battleRoundText.textContent = `第 ${battle.currRound} / ${battle.rounds} 輪`;
}
function showBattleResults() {
  let html = "";
  let maxScore = -1;
  let winners = [];

  const totals = battle.scores.map((playerScores, i) => {
    const total = playerScores.reduce((a, b) => a + b, 0);
    const avg = Math.round(total / battle.rounds);
    if (avg > maxScore) { maxScore = avg; winners = [i + 1]; }
    else if (avg === maxScore) { winners.push(i + 1); }
    return avg;
  });

  totals.forEach((avg, i) => {
    const isWinner = winners.includes(i + 1);
    html += `<div class="battle-score-row">
      <span>玩家 ${i + 1} ${isWinner ? "🏆" : ""}</span>
      <b>${avg}%</b>
    </div>`;
  });

  els.battleScoreBoard.innerHTML = html;
  els.battleResultModal.hidden = false;
  setFeedback("pass", "對戰結束", `恭喜 玩家 ${winners.join("、")} 獲勝！`);
}

document.querySelectorAll(".level[data-level]").forEach((b) => {
  b.onclick = () => {
    if (battle.active) {
      if (!confirm("目前正在對戰中，確定要退出嗎？")) return;
      battle.active = false;
    }
    showingBattleSetup = false;
    level = +b.dataset.level;
    document.querySelectorAll(".level").forEach((x) => x.classList.toggle("active", x === b));
    els.tag.textContent = `LEVEL 0${level} · ${["單音練習", "爬音階", "資料夾歌曲"][level - 1]}`;
    updateOptionVisibility();
    updateGoalDisplay();
    chooseExercise();
  };
});

els.battleTabBtn.onclick = () => {
  if (battle.active) {
    if (!confirm("目前正在對戰中，確定要重新設定嗎？")) return;
    battle.active = false;
  }
  showingBattleSetup = true;
  document.querySelectorAll(".level").forEach((x) => x.classList.remove("active"));
  els.battleTabBtn.classList.add("active");
  updateOptionVisibility();
};

els.startBattleBtn.onclick = () => {
  battle.players = parseInt(els.battlePlayerCount.value);
  battle.rounds = parseInt(els.battleRoundCount.value);
  battle.level = parseInt(els.battleLevelSelect.value);
  battle.currPlayer = 1;
  battle.currRound = 1;
  battle.scores = Array.from({length: battle.players}, () => []);
  battle.active = true;
  showingBattleSetup = false;

  level = battle.level;
  els.tag.textContent = `對戰模式 · LEVEL 0${level}`;
  updateOptionVisibility();
  updateBattleUI();
  chooseExercise(false);
};

els.endBattleBtn.onclick = () => {
  els.battleResultModal.hidden = true;
  battle.active = false;
  showingBattleSetup = false;
  document.querySelectorAll(".level[data-level]").forEach(x => x.classList.remove("active"));
  const currentLvlBtn = document.querySelector(`.level[data-level="${level}"]`);
  if (currentLvlBtn) currentLvlBtn.classList.add("active");
  els.battleTabBtn.classList.remove("active");
  updateOptionVisibility();
  chooseExercise();
};

populateRangeSelectors();
updateOptionVisibility();
const storedLevel3Filters = savedLevel3Filters();
els.songScope.value = storedLevel3Filters.scope || localStorage.getItem(SONG_SCOPE_STORAGE_KEY) || "all";
els.artistAll.checked = storedLevel3Filters.artistsAll !== false;
els.genderAll.checked = storedLevel3Filters.gendersAll !== false;
els.genderChoices.forEach((input) => {
  input.checked = Array.isArray(storedLevel3Filters.genders) && storedLevel3Filters.genders.includes(input.value);
});
for (let midi = 24; midi <= 96; midi++) {
  els.filterPitchMin.add(new Option(noteName(midi), midi));
  els.filterPitchMax.add(new Option(noteName(midi), midi));
}
els.filterBpmMin.value = storedLevel3Filters.bpmMin ?? 30;
els.filterBpmMax.value = storedLevel3Filters.bpmMax ?? 240;
els.filterPitchMin.value = storedLevel3Filters.pitchMin ?? 24;
els.filterPitchMax.value = storedLevel3Filters.pitchMax ?? 96;
els.filterLyricMin.value = storedLevel3Filters.lyricMin ?? 0;
els.filterLyricMax.value = storedLevel3Filters.lyricMax ?? 200;
els.rangeMin.onchange = () => {
  normalizePracticeRange("min");
  chooseExercise();
};
els.rangeMax.onchange = () => {
  normalizePracticeRange("max");
  chooseExercise();
};
els.songImportBtn.onclick = () => els.songImportInput.click();
els.songScope.onchange = onFilterChanged;
els.artistSearch.oninput = () => {
  const query = els.artistSearch.value.trim().toLocaleLowerCase("zh-Hant");
  [...els.artistChoices.children].forEach((row) => {
    row.hidden = Boolean(query && !row.textContent.toLocaleLowerCase("zh-Hant").includes(query));
  });
};
els.artistAll.onchange = () => {
  if (els.artistAll.checked) document.querySelectorAll(".artist-choice").forEach((input) => (input.checked = false));
  onFilterChanged();
};
els.artistChoices.onchange = () => {
  els.artistAll.checked = !selectedValues(".artist-choice").length;
  onFilterChanged();
};
els.genderAll.onchange = () => {
  if (els.genderAll.checked) els.genderChoices.forEach((input) => (input.checked = false));
  onFilterChanged();
};
els.genderChoices.forEach((input) => (input.onchange = () => {
  els.genderAll.checked = !els.genderChoices.some((choice) => choice.checked);
  onFilterChanged();
}));
els.songSearch.oninput = () => renderSongOptions();
els.songSelect.onchange = onFilterChanged;
[els.filterBpmMin, els.filterBpmMax, els.filterPitchMin, els.filterPitchMax, els.filterLyricMin, els.filterLyricMax]
  .forEach((input) => (input.onchange = onFilterChanged));
els.resetFilters.onclick = resetLevel3Filters;
els.applyFilters.onclick = () => {
  ensureAudio();
  chooseExercise(true);
};
els.songImportInput.onchange = async () => {
  try {
    const result = await importSongFiles(els.songImportInput.files);
    setFeedback(
      result.errors.length ? "warn" : "",
      `歌曲匯入完成，目前共 ${result.count} 首`,
      result.errors[0] || "按下換一題即可重新抽選",
    );
    await chooseExercise();
  } catch (error) {
    setFeedback("warn", "歌曲 JSON 匯入失敗", error.message);
  }
  els.songImportInput.value = "";
};
els.songClearBtn.onclick = async () => {
  localStorage.removeItem(SONG_STORAGE_KEY);
  els.songStatus.textContent = "已清除裝置匯入資料";
  await chooseExercise();
};
try {
  const savedSongs = JSON.parse(
    localStorage.getItem(SONG_STORAGE_KEY) || "null",
  );
  if (savedSongs?.songs?.length)
    els.songStatus.textContent = `瀏覽器已保存 ${savedSongs.songs.length} 首歌曲`;
} catch (error) {
  localStorage.removeItem(SONG_STORAGE_KEY);
}
refreshSongLibrary().catch((error) => {
  els.songStatus.textContent = "尚未載入歌曲；Level 3 可查看詳細錯誤";
  console.warn("Song preload failed", error);
});
els.start.onclick = startFlow;
els.demo.onclick = () => playDemo();
els.replay.onclick = replayLastRecording;

els.next.onclick = () => {
  if (battle.active) {
    if (!battleRecorded) {
      setFeedback("warn", "請先完成錄音", "對戰模式中每人必須錄音一次才能換人");
      return;
    }
    battle.currPlayer++;
    if (battle.currPlayer > battle.players) {
      battle.currPlayer = 1;
      battle.currRound++;
    }
    if (battle.currRound > battle.rounds) {
      showBattleResults();
      return;
    }
    updateBattleUI();
    ensureAudio();
    chooseExercise(false);
  } else {
    ensureAudio();
    chooseExercise(true);
  }
};

els.playbackVolume.oninput = () => setPlaybackVolume(els.playbackVolume.value);
els.playbackVolumeReset.onclick = () => setPlaybackVolume(100);
setPlaybackVolume(playbackVolume);

// Keep a working stream within a visit; reconnect only after an actual interruption.
els.micStatus.setAttribute("role", "button");
els.micStatus.setAttribute("tabindex", "0");
els.micStatus.title = "收不到聲音時，點此重新連接麥克風";
els.micStatus.style.cursor = "pointer";
els.micStatus.onclick = reconnectMic;
els.micStatus.onkeydown = (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    reconnectMic();
  }
};
document.addEventListener("visibilitychange", () => {
  // Recheck the input graph on the next recording; keep existing practice behavior.
  if (document.hidden && stream) micGraphNeedsRefresh = true;
});
window.addEventListener("pagehide", releaseMic);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) setMicStatus("請按開始錄音連接麥克風", false);
});
window.addEventListener("resize", resize);
window.addEventListener("focus", updateGoalDisplay);
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
chooseExercise();
updateGoalDisplay();
resize();
