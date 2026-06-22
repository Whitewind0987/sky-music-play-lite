# Audio-to-Sky Score Engine (experimental)

This development-only MVP turns one audio file into one SkyMusicPlay Lite JSON score. It is a standalone source-sidecar tool: it does not change the React UI, Tauri application, or any playback path.

It requires Python 3.10 or 3.11. The tool has its own virtual environment and `basic-pitch==0.4.0`; neither should be installed globally or committed.

## Setup

In PowerShell, create the private virtual environment and install the pinned inference dependency:

```powershell
py -3.11 -m venv tools\audio-to-score-engine\.venv

tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m pip install --upgrade pip

tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m pip install -r tools\audio-to-score-engine\requirements.txt
```

If the Windows `py` launcher is not installed, use an existing Python 3.10/3.11 executable instead:

```powershell
python -m venv tools\audio-to-score-engine\.venv
```

## Convert audio

Supported input extensions are `.wav`, `.mp3`, `.flac`, `.ogg`, and `.m4a`.

```powershell
tools\audio-to-score-engine\.venv\Scripts\python.exe `
  tools\audio-to-score-engine\transcribe.py `
  "D:\Music Library\我的歌曲\input song.mp3" `
  --output "D:\Music Library\我的歌曲\input-song-sky.json" `
  --name "My Sky Arrangement"
```

Optional parameters:

- `--min-amplitude` (default `0.25`, from `0` through `1`)
- `--min-duration-ms` (default `50`)
- `--chord-window-ms` (default `35`)
- `--max-chord-notes` (default `3`, from `1` through `15`)

The command creates the output parent directory if needed and writes the JSON atomically. It derives the score name from the input filename unless `--name` is supplied.

## Import and preview

Import the generated `.json` in SkyMusicPlay Lite's existing local import section. Start with preview playback before enabling foreground or target-window game playback. The output is one Lite-compatible JSON array containing one song and absolute millisecond note times.

## Known MVP limits

Basic Pitch works best with isolated or simple instruments. Full mixed songs can produce dense or inaccurate notes. This phase intentionally does not include melody extraction, Demucs, beat detection/BPM estimation, MIDI input, an LLM, UI integration, or release packaging. BPM is fixed at `120` because Lite playback uses absolute note times.

Do not commit `.venv`, Basic Pitch/model caches, generated output, or PyInstaller temporary build directories. This repository does not yet build or ship an executable Sidecar; source-sidecar packaging is a later, explicitly scoped task.

## Test the deterministic arrangement

```powershell
tools\audio-to-score-engine\.venv\Scripts\python.exe `
  -m unittest discover `
  -s tools\audio-to-score-engine\tests `
  -p "test_*.py"
```
