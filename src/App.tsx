import { useEffect, useRef, useState } from "react";
import {
  AppSidebar,
  WorkspaceHeader,
  type AppSection,
  type LibraryCategoryId,
} from "./components/AppShell";
import { BottomPlayer } from "./components/BottomPlayer";
import { LibraryPanel } from "./components/LibraryPanel";
import { PlaybackLog } from "./components/LogPanel";
import {
  KeyboardPreview,
  PlaybackControls,
} from "./components/PlaybackPanel";
import { SettingsPlaceholder } from "./components/SettingsPanel";
import {
  defaultLanguage,
  uiText,
  type LanguageCode,
  type UiText,
} from "./i18n/uiText";
import {
  getAdjustedPreviewDurationMs,
  schedulePreviewPlayback,
  type PreviewPlaybackController,
  type PreviewPlaybackProgress,
} from "./lib/playbackScheduler";
import {
  isSupportedScoreFileName,
  parseScoreFileContent,
  ScoreFileImportError,
} from "./lib/scoreFileImport";
import { dryRunPlayback, testRustCommand } from "./lib/tauriApi";
import {
  defaultKeyMapping,
  type SkyKeyName,
} from "./types/keyMapping";
import type { PlaybackState } from "./types/playback";
import {
  defaultNoteIntervalDelayMs,
  defaultPlaybackMode,
  defaultPlaybackSpeed,
  type NoteIntervalDelayMs,
  type PlaybackMode,
  type PlaybackSpeed,
} from "./types/playbackOptions";
import type { Song } from "./types/score";
import "../font/iconfont.css";
import "./App.css";

const ignoredKeyMappingKeys = new Set(["Alt", "Control", "Meta", "Shift"]);
const letterKeyPattern = /^[a-z]$/i;

function formatText(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

function formatImportError(error: unknown, text: UiText) {
  if (error instanceof ScoreFileImportError) {
    return formatText(text.score.importErrors[error.code], error.details);
  }

  return String(error instanceof Error ? error.message : error);
}

function formatImportFailureSummary(
  failedImports: Array<{ error: string; fileName: string }>,
) {
  return failedImports
    .map(({ error, fileName }) => `${fileName}: ${error}`)
    .join("; ");
}

function getBindableKey(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }

  if (ignoredKeyMappingKeys.has(event.key)) {
    return null;
  }

  if (letterKeyPattern.test(event.key)) {
    return event.key.toLowerCase();
  }

  return event.key;
}

function getRandomNextSongIndex(currentIndex: number, songCount: number) {
  if (songCount <= 1) {
    return currentIndex;
  }

  let nextIndex = currentIndex;

  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * songCount);
  }

  return nextIndex;
}

function App() {
  const playbackControllerRef = useRef<PreviewPlaybackController | null>(null);
  const importedSongsRef = useRef<Song[]>([]);
  const isShuffleEnabledRef = useRef(false);
  const noteIntervalDelayMsRef = useRef(defaultNoteIntervalDelayMs);
  const playbackModeRef = useRef<PlaybackMode>(defaultPlaybackMode);
  const playbackSpeedRef = useRef(defaultPlaybackSpeed);
  const [keyMapping, setKeyMapping] = useState(defaultKeyMapping);
  const [listeningSkyKey, setListeningSkyKey] = useState<SkyKeyName | null>(null);
  const [language, setLanguage] = useState<LanguageCode>(defaultLanguage);
  const [importedSongs, setImportedSongs] = useState<Song[]>([]);
  const [importError, setImportError] = useState("");
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(null);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [playbackProgress, setPlaybackProgress] =
    useState<PreviewPlaybackProgress>({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });
  const [playbackMode, setPlaybackMode] =
    useState<PlaybackMode>(defaultPlaybackMode);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [noteIntervalDelayMs, setNoteIntervalDelayMs] =
    useState<NoteIntervalDelayMs>(defaultNoteIntervalDelayMs);
  const [playbackSpeed, setPlaybackSpeed] =
    useState<PlaybackSpeed>(defaultPlaybackSpeed);
  const [activeSection, setActiveSection] = useState<AppSection>("Library");
  const [selectedLibraryCategory, setSelectedLibraryCategory] =
    useState<LibraryCategoryId>("local-imports");
  const [logEntries, setLogEntries] = useState<string[]>(() => [
    uiText[defaultLanguage].logs.appReady,
    uiText[defaultLanguage].logs.noPlaybackYet,
  ]);
  const text = uiText[language];
  const currentSelectedSong =
    selectedSongIndex === null ? null : importedSongs[selectedSongIndex] ?? null;
  const previewDurationMs =
    currentSelectedSong === null
      ? 0
      : getAdjustedPreviewDurationMs(currentSelectedSong.songNotes, {
          noteIntervalDelayMs,
          playbackSpeed,
        });
  const bottomPlayerProgress =
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "finished"
      ? playbackProgress
      : {
          currentMs: 0,
          percent: 0,
          totalMs: previewDurationMs,
        };

  useEffect(() => {
    return () => {
      playbackControllerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    importedSongsRef.current = importedSongs;
  }, [importedSongs]);

  useEffect(() => {
    isShuffleEnabledRef.current = isShuffleEnabled;
  }, [isShuffleEnabled]);

  useEffect(() => {
    noteIntervalDelayMsRef.current = noteIntervalDelayMs;
  }, [noteIntervalDelayMs]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    if (listeningSkyKey === null) {
      return;
    }

    const skyKeyBeingMapped = listeningSkyKey;

    function handleKeyMappingKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setListeningSkyKey(null);
        return;
      }

      const bindableKey = getBindableKey(event);

      if (bindableKey === null) {
        return;
      }

      setKeyMapping((currentMapping) => ({
        ...currentMapping,
        [skyKeyBeingMapped]: bindableKey,
      }));
      setListeningSkyKey(null);
    }

    window.addEventListener("keydown", handleKeyMappingKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyMappingKeyDown);
    };
  }, [listeningSkyKey]);

  function appendLog(entry: string) {
    setLogEntries((currentEntries) => [...currentEntries, entry]);
  }

  function resetPlaybackProgress() {
    setPlaybackProgress({
      currentMs: 0,
      percent: 0,
      totalMs: 0,
    });
  }

  async function handleImportScoreFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    stopCurrentPreview();

    const failedImports: Array<{ error: string; fileName: string }> = [];
    const importedSongsFromFiles: Song[] = [];
    let successfulFileCount = 0;

    for (const file of files) {
      try {
        if (!isSupportedScoreFileName(file.name)) {
          throw new Error(text.score.unsupportedFile);
        }

        const content = await file.text();
        const songs = parseScoreFileContent(content);

        importedSongsFromFiles.push(...songs);
        successfulFileCount += 1;
      } catch (error) {
        failedImports.push({
          error: formatImportError(error, text),
          fileName: file.name,
        });
      }
    }

    if (importedSongsFromFiles.length > 0) {
      const firstNewSongIndex = importedSongsRef.current.length;
      const shouldSelectFirstImportedSong = selectedSongIndex === null;

      setImportedSongs((currentSongs) => {
        const nextSongs = [...currentSongs, ...importedSongsFromFiles];

        importedSongsRef.current = nextSongs;
        return nextSongs;
      });

      if (shouldSelectFirstImportedSong) {
        setSelectedSongIndex(firstNewSongIndex);
      }

      setImportError("");
      appendLog(
        formatText(text.logs.importedScoresFromFiles, {
          count: importedSongsFromFiles.length,
          fileCount: successfulFileCount,
        }),
      );
    }

    if (failedImports.length > 0) {
      setImportError(formatImportFailureSummary(failedImports));

      failedImports.forEach(({ error, fileName }) => {
        appendLog(
          formatText(text.logs.importFailed, {
            error,
            fileName,
          }),
        );
      });
    }
  }

  function handleSelectImportedSong(songIndex: number | null) {
    stopCurrentPreview();
    setSelectedSongIndex(songIndex);
  }

  function handleLibraryCategoryChange(category: LibraryCategoryId) {
    setSelectedLibraryCategory(category);
  }

  function handlePlayImportedSong(songIndex: number) {
    stopCurrentPreview();
    startPreviewForSong(songIndex);
  }

  function handleStartKeyMappingListen(skyKey: SkyKeyName) {
    setListeningSkyKey(skyKey);
  }

  function handleShuffleToggle() {
    setIsShuffleEnabled((currentValue) => !currentValue);
  }

  function handleRepeatModeCycle() {
    setPlaybackMode((currentMode) => {
      if (currentMode === "sequence") {
        return "repeat-all";
      }

      if (currentMode === "repeat-all") {
        return "repeat-one";
      }

      return "sequence";
    });
  }

  function handleNoteIntervalDelayChange(
    nextNoteIntervalDelayMs: NoteIntervalDelayMs,
  ) {
    const nextOptions = {
      noteIntervalDelayMs: nextNoteIntervalDelayMs,
      playbackSpeed: playbackSpeedRef.current,
    };

    noteIntervalDelayMsRef.current = nextNoteIntervalDelayMs;
    setNoteIntervalDelayMs(nextNoteIntervalDelayMs);
    playbackControllerRef.current?.updateOptions(nextOptions);
  }

  function handlePlaybackSpeedChange(nextPlaybackSpeed: PlaybackSpeed) {
    const nextOptions = {
      noteIntervalDelayMs: noteIntervalDelayMsRef.current,
      playbackSpeed: nextPlaybackSpeed,
    };

    playbackSpeedRef.current = nextPlaybackSpeed;
    setPlaybackSpeed(nextPlaybackSpeed);
    playbackControllerRef.current?.updateOptions(nextOptions);
  }

  function stopCurrentPreview(nextState: PlaybackState = "idle") {
    playbackControllerRef.current?.stop();
    playbackControllerRef.current = null;
    setActiveKeys([]);
    setPlaybackState(nextState);
    resetPlaybackProgress();
  }

  function startPreviewForSong(songIndex: number) {
    try {
      const song = importedSongs[songIndex];

      if (!song) {
        appendLog(text.logs.noSelectedScore);
        return;
      }

      const notes = song.songNotes;
      const currentTimingOptions = {
        noteIntervalDelayMs: noteIntervalDelayMsRef.current,
        playbackSpeed: playbackSpeedRef.current,
      };

      setSelectedSongIndex(songIndex);

      if (notes.length === 0) {
        stopCurrentPreview("finished");
        appendLog(text.logs.previewFinished);
        return;
      }

      setPlaybackState("playing");
      resetPlaybackProgress();
      appendLog(
        formatText(text.logs.previewStartedWithOptions, {
          delayMs: currentTimingOptions.noteIntervalDelayMs,
          songName: song.name,
          speed: currentTimingOptions.playbackSpeed,
        }),
      );

      playbackControllerRef.current = schedulePreviewPlayback(
        notes,
        (noteGroup) => {
          const keys = noteGroup.map((note) => note.key);

          setActiveKeys(keys);
          appendLog(
            formatText(text.logs.playingPreviewKey, { key: keys.join(", ") }),
          );
        },
        () => {
          setActiveKeys([]);
          playbackControllerRef.current = null;
          const currentPlaybackMode = playbackModeRef.current;
          const currentImportedSongs = importedSongsRef.current;

          if (currentPlaybackMode === "repeat-one") {
            appendLog(
              formatText(text.logs.repeatOneTriggered, { songName: song.name }),
            );
            startPreviewForSong(songIndex);
            return;
          }

          if (currentPlaybackMode === "repeat-all") {
            let nextSongIndex =
              currentImportedSongs.length === 0
                ? songIndex
                : (songIndex + 1) % currentImportedSongs.length;

            if (isShuffleEnabledRef.current && currentImportedSongs.length > 1) {
              nextSongIndex = getRandomNextSongIndex(
                songIndex,
                currentImportedSongs.length,
              );
            }

            const nextSong = currentImportedSongs[nextSongIndex] ?? song;

            appendLog(
              formatText(text.logs.repeatAllTriggered, {
                songName: nextSong.name,
              }),
            );
            startPreviewForSong(nextSongIndex);
            return;
          }

          setPlaybackState("finished");
          appendLog(text.logs.previewFinished);
        },
        {
          noteIntervalDelayMs: currentTimingOptions.noteIntervalDelayMs,
          onProgress: setPlaybackProgress,
          playbackSpeed: currentTimingOptions.playbackSpeed,
        },
      );
    } catch (error) {
      stopCurrentPreview();
      appendLog(
        formatText(text.logs.playbackError, {
          error: String(error instanceof Error ? error.message : error),
        }),
      );
    }
  }

  function handlePlayPreview() {
    if (selectedSongIndex === null) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    stopCurrentPreview();
    startPreviewForSong(selectedSongIndex);
  }

  function handlePausePreview() {
    if (playbackState !== "playing") {
      return;
    }

    playbackControllerRef.current?.pause();
    setActiveKeys([]);
    setPlaybackState("paused");
    appendLog(text.logs.previewPaused);
  }

  function handleResumePreview() {
    if (playbackState !== "paused") {
      return;
    }

    playbackControllerRef.current?.resume();
    setPlaybackState("playing");
    appendLog(text.logs.previewResumed);
  }

  function handleStopPreview() {
    if (playbackState !== "playing" && playbackState !== "paused") {
      return;
    }

    stopCurrentPreview();
    appendLog(text.logs.previewStopped);
  }

  async function handleTestRust() {
    try {
      const message = await testRustCommand();
      appendLog(message);
    } catch (error) {
      setLogEntries((currentEntries) => [
        ...currentEntries,
        formatText(text.logs.rustCommandFailed, { error: String(error) }),
      ]);
    }
  }

  async function handleDryRunPlayback() {
    if (!currentSelectedSong) {
      appendLog(text.logs.noSelectedScore);
      return;
    }

    try {
      appendLog(
        formatText(text.logs.dryRunStarted, {
          songName: currentSelectedSong.name,
        }),
      );

      const result = await dryRunPlayback(currentSelectedSong.songNotes, keyMapping);
      const firstNote = result.first_note;
      const lastNote = result.last_note;

      appendLog(
        formatText(text.logs.dryRunFinished, {
          firstKey: firstNote?.key ?? text.logs.noNoteSummary,
          firstMappedKey: firstNote?.mapped_key ?? text.logs.noNoteSummary,
          firstTime: firstNote?.time ?? text.logs.noNoteSummary,
          lastKey: lastNote?.key ?? text.logs.noNoteSummary,
          lastMappedKey: lastNote?.mapped_key ?? text.logs.noNoteSummary,
          lastTime: lastNote?.time ?? text.logs.noNoteSummary,
          noteCount: result.note_count,
          status: text.logs.dryRunStatus[result.status] ?? result.status,
        }),
      );
    } catch (error) {
      appendLog(
        formatText(text.logs.dryRunFailed, {
          error: String(error),
        }),
      );
    }
  }

  function renderActiveSection() {
    if (activeSection === "Library") {
      return (
        <LibraryPanel
          importError={importError}
          onImportFiles={handleImportScoreFiles}
          onPlaySong={handlePlayImportedSong}
          onSelectSong={handleSelectImportedSong}
          selectedCategory={selectedLibraryCategory}
          selectedSongIndex={selectedSongIndex}
          songs={importedSongs}
          text={text.library}
        />
      );
    }

    if (activeSection === "Playback") {
      return (
        <>
          <KeyboardPreview
            activeKeys={activeKeys}
            keyMapping={keyMapping}
            text={text.keyboard}
          />
          <PlaybackControls
            canRunDryRun={currentSelectedSong !== null}
            canPlayPreview={currentSelectedSong !== null}
            onDryRunPlayback={handleDryRunPlayback}
            playbackState={playbackState}
            onPausePreview={handlePausePreview}
            onPlayPreview={handlePlayPreview}
            onResumePreview={handleResumePreview}
            onStopPreview={handleStopPreview}
            onTestRust={handleTestRust}
            text={text.playback}
          />
        </>
      );
    }

    if (activeSection === "Logs") {
      return <PlaybackLog entries={logEntries} text={text.logs} />;
    }

    if (activeSection === "Settings") {
      return (
          <SettingsPlaceholder
            keyMapping={keyMapping}
            language={language}
            listeningSkyKey={listeningSkyKey}
            onKeyMappingListenStart={handleStartKeyMappingListen}
            onLanguageChange={setLanguage}
            text={text.settings}
          />
      );
    }

    return null;
  }

  return (
    <main className="app-shell">
      <AppSidebar
        activeSection={activeSection}
        localImportCount={importedSongs.length}
        onLibraryCategoryChange={handleLibraryCategoryChange}
        onSectionChange={setActiveSection}
        selectedLibraryCategory={selectedLibraryCategory}
        text={text}
      />

      <section className="workspace-shell" aria-label={text.app.contentAria}>
        <WorkspaceHeader
          activeSection={activeSection}
          onSettingsClick={() => setActiveSection("Settings")}
          text={text}
        />

        <div
          className={`app-layout app-layout-${activeSection.toLowerCase()}`}
        >
          {renderActiveSection()}
        </div>

      </section>

      <BottomPlayer
        currentSong={currentSelectedSong}
        isShuffleEnabled={isShuffleEnabled}
        noteIntervalDelayMs={noteIntervalDelayMs}
        onNoteIntervalDelayChange={handleNoteIntervalDelayChange}
        onPause={handlePausePreview}
        onPlay={handlePlayPreview}
        onPlaybackSpeedChange={handlePlaybackSpeedChange}
        onRepeatModeCycle={handleRepeatModeCycle}
        onResume={handleResumePreview}
        onShuffleToggle={handleShuffleToggle}
        onStop={handleStopPreview}
        playbackMode={playbackMode}
        playbackState={playbackState}
        playbackSpeed={playbackSpeed}
        progress={bottomPlayerProgress}
        text={text.bottomPlayer}
      />
    </main>
  );
}

export default App;
