"""Development-only CLI for converting audio to one SkyMusicPlay Lite score."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile
from dataclasses import dataclass
from typing import Iterable, Sequence

from sky_arrangement import (
    ArrangementError,
    DEFAULT_CHORD_WINDOW_MS,
    DEFAULT_MAX_CHORD_NOTES,
    DEFAULT_MIN_AMPLITUDE,
    DEFAULT_MIN_DURATION_MS,
    RawNoteEvent,
    arrange_events,
    build_mapping_diagnostics,
    build_lite_score,
    normalize_basic_pitch_events,
    validate_options,
    validate_transpose_override,
)


SUPPORTED_AUDIO_EXTENSIONS = {".wav", ".mp3", ".flac", ".ogg", ".m4a"}


@dataclass(frozen=True)
class BasicPitchPrediction:
    midi_data: object
    note_events: tuple[object, ...]


@dataclass(frozen=True)
class DiagnosticPaths:
    raw_midi: Path
    raw_note_events: Path
    mapping_report: Path


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert one audio file to a SkyMusicPlay Lite JSON score."
    )
    parser.add_argument("input", type=Path, help="Input audio file")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON file")
    parser.add_argument("--name", help="Score name (defaults to the input file name)")
    parser.add_argument("--min-amplitude", type=float, default=DEFAULT_MIN_AMPLITUDE)
    parser.add_argument("--min-duration-ms", type=float, default=DEFAULT_MIN_DURATION_MS)
    parser.add_argument("--chord-window-ms", type=float, default=DEFAULT_CHORD_WINDOW_MS)
    parser.add_argument("--max-chord-notes", type=int, default=DEFAULT_MAX_CHORD_NOTES)
    parser.add_argument(
        "--transpose",
        default="auto",
        help="Transpose in semitones: 'auto' (default) or an integer from -36 through 36",
    )
    parser.add_argument(
        "--diagnostics-dir",
        type=Path,
        help="Optional directory for raw Basic Pitch MIDI and mapping diagnostics",
    )
    return parser.parse_args(argv)


def parse_transpose_argument(value: str) -> int | None:
    if value == "auto":
        return None
    try:
        transpose = int(value)
    except (TypeError, ValueError) as error:
        raise ArrangementError("transpose must be 'auto' or an integer from -36 through 36") from error
    try:
        validate_transpose_override(transpose)
    except ArrangementError as error:
        raise ArrangementError("transpose must be 'auto' or an integer from -36 through 36") from error
    return transpose


def validate_paths(input_path: Path, output_path: Path) -> None:
    if not input_path.is_file():
        raise ArrangementError(f"input audio file does not exist or is not a file: {input_path}")
    if input_path.suffix.lower() not in SUPPORTED_AUDIO_EXTENSIONS:
        extensions = ", ".join(sorted(SUPPORTED_AUDIO_EXTENSIONS))
        raise ArrangementError(f"unsupported input format '{input_path.suffix}'; supported: {extensions}")
    if output_path.suffix.lower() != ".json":
        raise ArrangementError("output file must use the .json extension")
    if input_path.resolve() == output_path.resolve():
        raise ArrangementError("output JSON path must not replace the input audio file")


def run_basic_pitch(input_path: Path) -> BasicPitchPrediction:
    prediction = _predict_audio(input_path)
    if not isinstance(prediction, (tuple, list)) or len(prediction) < 3:
        raise ArrangementError("Basic Pitch returned an unexpected prediction result")
    midi_data = prediction[1]
    note_events = prediction[2]
    if isinstance(note_events, (str, bytes)):
        raise ArrangementError("Basic Pitch returned invalid note events")
    try:
        return BasicPitchPrediction(midi_data=midi_data, note_events=tuple(note_events))
    except TypeError as error:
        raise ArrangementError("Basic Pitch returned non-iterable note events") from error


def _predict_audio(input_path: Path) -> object:
    try:
        from basic_pitch.inference import predict
    except ImportError as error:
        raise ArrangementError(
            "Basic Pitch is not installed. Create the tool virtual environment and install requirements.txt."
        ) from error

    return predict(str(input_path))


def convert_events_to_output(
    raw_events: Iterable[RawNoteEvent],
    output_path: Path,
    score_name: str,
    *,
    min_amplitude: float = DEFAULT_MIN_AMPLITUDE,
    min_duration_ms: float = DEFAULT_MIN_DURATION_MS,
    chord_window_ms: float = DEFAULT_CHORD_WINDOW_MS,
    max_chord_notes: int = DEFAULT_MAX_CHORD_NOTES,
    transpose: int | None = None,
):
    result = arrange_events(
        raw_events,
        min_amplitude=min_amplitude,
        min_duration_ms=min_duration_ms,
        chord_window_ms=chord_window_ms,
        max_chord_notes=max_chord_notes,
        transpose=transpose,
    )
    document = build_lite_score(score_name, result.notes)
    atomic_write_json(output_path, document)
    return result


def atomic_write_json(output_path: Path, document: object) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            suffix=".tmp",
            prefix=f".{output_path.name}.",
            dir=output_path.parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)
            json.dump(document, temporary_file, ensure_ascii=False, indent=2)
            temporary_file.write("\n")
            temporary_file.flush()
            os.fsync(temporary_file.fileno())
        os.replace(temporary_path, output_path)
    except OSError as error:
        raise ArrangementError(f"could not write output JSON: {output_path}: {error}") from error
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink(missing_ok=True)


def diagnostic_paths(diagnostics_dir: Path) -> DiagnosticPaths:
    return DiagnosticPaths(
        raw_midi=diagnostics_dir / "basic-pitch-raw.mid",
        raw_note_events=diagnostics_dir / "raw-note-events.json",
        mapping_report=diagnostics_dir / "mapping-report.json",
    )


def write_raw_midi_diagnostic(midi_data: object, output_path: Path) -> None:
    write_method = getattr(midi_data, "write", None)
    if not callable(write_method):
        raise ArrangementError("Basic Pitch returned MIDI data without a usable write method")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        # Basic Pitch's public MIDI writer accepts a path, rather than an open
        # file. It writes the original transcription directly before any Sky
        # filtering or mapping occurs.
        write_method(str(output_path))
    except Exception as error:
        raise ArrangementError(f"could not write raw Basic Pitch MIDI: {output_path}: {error}") from error


def build_raw_note_events_document(
    normalized_events: Iterable[RawNoteEvent],
    *,
    input_path: Path,
    raw_basic_pitch_event_count: int,
    rejected_invalid_event_count: int,
) -> dict[str, object]:
    sorted_events = sorted(
        normalized_events,
        key=lambda event: (event.start_ms, event.midi_pitch, event.end_ms, event.amplitude),
    )
    return {
        "schemaVersion": 1,
        "source": "basic-pitch",
        "inputFile": input_path.name,
        "rawBasicPitchEventCount": raw_basic_pitch_event_count,
        "rejectedInvalidEventCount": rejected_invalid_event_count,
        "normalizedEventCount": len(sorted_events),
        "events": [
            {
                "startMs": event.start_ms,
                "endMs": event.end_ms,
                "durationMs": event.duration_ms,
                "midiPitch": event.midi_pitch,
                "amplitude": event.amplitude,
            }
            for event in sorted_events
        ],
    }


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        transpose_override = parse_transpose_argument(args.transpose)
        validate_paths(args.input, args.output)
        score_name = args.name if args.name is not None else args.input.stem
        if not score_name.strip():
            raise ArrangementError("score name must not be empty")
        validate_options(
            args.min_amplitude,
            args.min_duration_ms,
            args.chord_window_ms,
            args.max_chord_notes,
        )

        print("[1/4] Validating input audio...")
        print("[2/4] Running Basic Pitch inference...")
        prediction = run_basic_pitch(args.input)
        raw_event_count = len(prediction.note_events)
        normalized = normalize_basic_pitch_events(prediction.note_events)
        paths = diagnostic_paths(args.diagnostics_dir) if args.diagnostics_dir is not None else None
        if paths is not None:
            write_raw_midi_diagnostic(prediction.midi_data, paths.raw_midi)
            atomic_write_json(
                paths.raw_note_events,
                build_raw_note_events_document(
                    normalized.events,
                    input_path=args.input,
                    raw_basic_pitch_event_count=raw_event_count,
                    rejected_invalid_event_count=normalized.rejected_count,
                ),
            )
        print("[3/4] Arranging note events...")
        result = convert_events_to_output(
            normalized.events,
            args.output,
            score_name,
            min_amplitude=args.min_amplitude,
            min_duration_ms=args.min_duration_ms,
            chord_window_ms=args.chord_window_ms,
            max_chord_notes=args.max_chord_notes,
            transpose=transpose_override,
        )
        song_notes = result.notes
        mapping_report = None
        if paths is not None:
            mapping_report = build_mapping_diagnostics(
                normalized.events,
                result,
                raw_basic_pitch_event_count=raw_event_count,
                rejected_invalid_event_count=normalized.rejected_count,
                min_amplitude=args.min_amplitude,
                min_duration_ms=args.min_duration_ms,
                transpose_mode="automatic" if transpose_override is None else "manual",
            )
            atomic_write_json(paths.mapping_report, mapping_report)
        first_time = song_notes[0]["time"] if song_notes else "n/a"
        last_time = song_notes[-1]["time"] if song_notes else "n/a"
        print("[4/4] Writing Lite-compatible JSON complete.")
        print("\nSummary")
        print(f"  Input path: {args.input}")
        print(f"  Output path: {args.output}")
        print(f"  Raw event count: {raw_event_count}")
        print(f"  Rejected invalid events: {normalized.rejected_count}")
        print(f"  Filtered event count: {result.filtered_event_count}")
        print(f"  Final note count: {len(song_notes)}")
        print(f"  Transpose mode: {'automatic octave-only' if transpose_override is None else 'manual'}")
        print(f"  Selected transpose: {_format_transpose(result.transpose)}")
        print(f"  First note time: {first_time} ms")
        print(f"  Last note time: {last_time} ms")
        print(f"  Maximum chord size: {result.maximum_chord_size}")
        if paths is not None and mapping_report is not None:
            print("\nDiagnostics written:")
            print(f"  Raw MIDI: {paths.raw_midi}")
            print(f"  Raw note events: {paths.raw_note_events}")
            print(f"  Mapping report: {paths.mapping_report}")
            classification = mapping_report["rangeClassificationAfterTranspose"]
            mapping = mapping_report["mapping"]
            print("\nMapping diagnostics:")
            print(f"  Below Sky range: {classification['belowSkyRange']}")
            print(f"  Above Sky range: {classification['aboveSkyRange']}")
            print(f"  Chromatic notes changed: {mapping['chromaticNotesMappedToNatural']}")
            print(f"  Lowest-key clamps: {mapping['clampedToLowestKey']}")
            print(f"  Highest-key clamps: {mapping['clampedToHighestKey']}")
        return 0
    except ArrangementError as error:
        print(f"Conversion failed: {error}")
        return 2
    except Exception as error:  # Keep model/library failures concise for the CLI user.
        print(f"Conversion failed unexpectedly: {error}")
        return 1


def _format_transpose(transpose: int) -> str:
    if transpose != 0 and transpose % 12 == 0:
        return f"{transpose} semitones ({transpose // 12} octave{'s' if abs(transpose // 12) != 1 else ''})"
    return f"{transpose} semitones"


if __name__ == "__main__":
    raise SystemExit(main())
