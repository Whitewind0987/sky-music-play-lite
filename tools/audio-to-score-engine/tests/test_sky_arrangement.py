from __future__ import annotations

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

TOOL_DIRECTORY = Path(__file__).resolve().parents[1]
if str(TOOL_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(TOOL_DIRECTORY))

from sky_arrangement import (  # noqa: E402
    ArrangementError,
    AUTO_TRANSPOSE_CANDIDATES,
    RawNoteEvent,
    SKY_MIDI_NOTES,
    arrange_events,
    build_lite_score,
    build_mapping_diagnostics,
    map_events,
    nearest_sky_midi,
    normalize_basic_pitch_events,
    select_global_transpose,
)
from transcribe import (  # noqa: E402
    BasicPitchPrediction,
    build_raw_note_events_document,
    convert_events_to_output,
    main,
    parse_transpose_argument,
    run_basic_pitch,
)


def event(start_ms: float, end_ms: float, midi: int, amplitude: float = 0.8) -> RawNoteEvent:
    return RawNoteEvent(start_ms, end_ms, midi, amplitude)


class FakeMidiData:
    def __init__(self) -> None:
        self.write_paths: list[str] = []

    def write(self, path: str) -> None:
        self.write_paths.append(path)
        Path(path).write_bytes(b"MThd diagnostic test")


class SkyArrangementTests(unittest.TestCase):
    def test_target_midi_notes_map_to_expected_keys(self) -> None:
        mapped = map_events([event(0, 100, midi) for midi in SKY_MIDI_NOTES], 0)
        self.assertEqual([item.key_index for item in mapped], list(range(15)))

    def test_every_output_key_is_in_range(self) -> None:
        result = arrange_events([event(index * 100, index * 100 + 60, midi) for index, midi in enumerate(range(0, 128, 7))])
        for note in result.notes:
            key_index = int(str(note["key"])[4:])
            self.assertGreaterEqual(key_index, 0)
            self.assertLessEqual(key_index, 14)

    def test_nearest_target_ties_prefer_lower_midi(self) -> None:
        self.assertEqual(nearest_sky_midi(61), 60)

    def test_automatic_transpose_is_deterministic_and_octave_only(self) -> None:
        sources = (
            [event(0, 500, 55), event(600, 900, 59, 0.4), event(1000, 1100, 64)],
            [event(0, 100, 56), event(200, 300, 63), event(400, 500, 70)],
            [event(0, 100, 84), event(200, 300, 91)],
        )
        for source in sources:
            with self.subTest(source=source):
                selected = select_global_transpose(source)
                self.assertIn(selected, AUTO_TRANSPOSE_CANDIDATES)
                self.assertEqual(selected, select_global_transpose(source))

    def test_automatic_transpose_never_uses_old_non_octave_candidate(self) -> None:
        # The old unrestricted search selected +4 here to map MIDI 56 exactly
        # to MIDI 60. Automatic mode must instead preserve the musical key.
        selected = select_global_transpose([event(0, 100, 56)])
        self.assertIn(selected, AUTO_TRANSPOSE_CANDIDATES)
        self.assertNotIn(selected, {4, 5, 7})
        self.assertEqual(selected % 12, 0)

    def test_automatic_transpose_tie_breaking_prefers_zero(self) -> None:
        # MIDI 60 maps exactly at 0, +12, and +24; the lower absolute value wins.
        self.assertEqual(select_global_transpose([event(0, 100, 60)]), 0)

    def test_manual_transpose_is_applied_to_mapping(self) -> None:
        result = arrange_events([event(0, 100, 64)], transpose=-4)
        self.assertEqual(result.transpose, -4)
        self.assertEqual(list(result.notes), [{"time": 0, "key": "1Key0"}])

    def test_manual_zero_transpose_does_not_use_automatic_selection(self) -> None:
        source = [event(0, 100, 56)]
        automatic = arrange_events(source)
        manual_zero = arrange_events(source, transpose=0)
        self.assertEqual(manual_zero.transpose, 0)
        self.assertNotEqual(automatic.transpose, manual_zero.transpose)

    def test_invalid_manual_transposes_are_rejected(self) -> None:
        for invalid_transpose in (-37, 37, 1.5, True, "0"):
            with self.subTest(transpose=invalid_transpose):
                with self.assertRaises(ArrangementError):
                    arrange_events([event(0, 100, 60)], transpose=invalid_transpose)  # type: ignore[arg-type]

    def test_cli_transpose_argument_accepts_auto_and_manual_values(self) -> None:
        self.assertIsNone(parse_transpose_argument("auto"))
        self.assertEqual(parse_transpose_argument("-4"), -4)
        self.assertEqual(parse_transpose_argument("0"), 0)
        for invalid_value in ("-37", "37", "1.5", "AUTO"):
            with self.subTest(value=invalid_value):
                with self.assertRaisesRegex(
                    ArrangementError, "transpose must be 'auto' or an integer from -36 through 36"
                ):
                    parse_transpose_argument(invalid_value)

    def test_cli_summary_identifies_automatic_and_manual_transpose_modes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            input_path = Path(temporary_directory) / "input.wav"
            automatic_output = Path(temporary_directory) / "automatic.json"
            manual_output = Path(temporary_directory) / "manual.json"
            input_path.touch()

            prediction = BasicPitchPrediction(object(), ((0.0, 0.1, 60, 0.8),))
            with patch("transcribe.run_basic_pitch", return_value=prediction):
                automatic_stdout = io.StringIO()
                with redirect_stdout(automatic_stdout):
                    self.assertEqual(main([str(input_path), "--output", str(automatic_output)]), 0)

                manual_stdout = io.StringIO()
                with redirect_stdout(manual_stdout):
                    self.assertEqual(
                        main(
                            [
                                str(input_path),
                                "--output",
                                str(manual_output),
                                "--transpose",
                                "-4",
                            ]
                        ),
                        0,
                    )

        self.assertIn("Transpose mode: automatic octave-only", automatic_stdout.getvalue())
        self.assertIn("Selected transpose: 0 semitones", automatic_stdout.getvalue())
        self.assertIn("Transpose mode: manual", manual_stdout.getvalue())
        self.assertIn("Selected transpose: -4 semitones", manual_stdout.getvalue())

    def test_basic_pitch_prediction_retains_midi_and_events_from_one_call(self) -> None:
        midi_data = FakeMidiData()
        raw_events = ((0.0, 0.1, 60, 0.8),)
        with patch("transcribe._predict_audio", return_value=(object(), midi_data, raw_events)) as predict:
            prediction = run_basic_pitch(Path("piano.wav"))

        self.assertIs(prediction.midi_data, midi_data)
        self.assertEqual(prediction.note_events, raw_events)
        predict.assert_called_once_with(Path("piano.wav"))

    def test_raw_event_document_keeps_unfiltered_events_and_sorts_them(self) -> None:
        normalized = normalize_basic_pitch_events(
            (
                (0.2, 0.21, 63, 0.1),
                (0.1, 0.3, 61, 0.8),
                (0.0, 0.1, 60, 1.2),
            )
        )
        document = build_raw_note_events_document(
            normalized.events,
            input_path=Path("piano-test.wav"),
            raw_basic_pitch_event_count=3,
            rejected_invalid_event_count=normalized.rejected_count,
        )

        self.assertEqual(document["inputFile"], "piano-test.wav")
        self.assertEqual(document["normalizedEventCount"], 2)
        self.assertEqual(document["rejectedInvalidEventCount"], 1)
        self.assertEqual([item["midiPitch"] for item in document["events"]], [61, 63])
        self.assertEqual(document["events"][1]["durationMs"], 10.0)

    def test_mapping_diagnostics_classifies_range_chromatic_notes_and_clamps(self) -> None:
        source = [
            event(0, 100, 59),
            event(100, 200, 60),
            event(200, 300, 61),
            event(300, 400, 63),
            event(400, 500, 84),
            event(500, 600, 85),
        ]
        result = arrange_events(source, transpose=0)
        report = build_mapping_diagnostics(
            source,
            result,
            raw_basic_pitch_event_count=6,
            rejected_invalid_event_count=0,
            min_amplitude=0.25,
            min_duration_ms=50,
            transpose_mode="manual",
        )

        self.assertEqual(
            report["rangeClassificationAfterTranspose"],
            {"belowSkyRange": 1, "insideSkyRange": 4, "aboveSkyRange": 1},
        )
        self.assertEqual(
            report["mapping"],
            {
                "exactSkyNaturalNotes": 2,
                "chromaticNotesMappedToNatural": 2,
                "clampedToLowestKey": 1,
                "clampedToHighestKey": 1,
            },
        )
        self.assertEqual(report["outputKeyHistogram"]["1Key0"], 3)
        self.assertEqual(report["outputKeyHistogram"]["1Key14"], 2)

    def test_mapping_diagnostics_use_the_selected_manual_transpose(self) -> None:
        source = [event(0, 100, 48), event(100, 200, 73)]
        result = arrange_events(source, transpose=12)
        report = build_mapping_diagnostics(
            source,
            result,
            raw_basic_pitch_event_count=2,
            rejected_invalid_event_count=0,
            min_amplitude=0.25,
            min_duration_ms=50,
            transpose_mode="manual",
        )

        self.assertEqual(report["selectedTransposeSemitones"], 12)
        self.assertEqual(
            report["rangeClassificationAfterTranspose"],
            {"belowSkyRange": 0, "insideSkyRange": 1, "aboveSkyRange": 1},
        )

    def test_enabled_diagnostics_export_raw_midi_events_and_mapping_without_second_inference(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            input_path = temporary_path / "piano.wav"
            output_path = temporary_path / "lite.json"
            diagnostics_dir = temporary_path / "diagnostics"
            input_path.touch()
            midi_data = FakeMidiData()
            prediction = BasicPitchPrediction(
                midi_data,
                ((0.0, 0.1, 60, 0.8), (0.2, 0.3, 61, 0.7), (0.0, 0.1, 60, 1.2)),
            )

            stdout = io.StringIO()
            with patch("transcribe.run_basic_pitch", return_value=prediction) as run_prediction:
                with redirect_stdout(stdout):
                    self.assertEqual(
                        main(
                            [
                                str(input_path),
                                "--output",
                                str(output_path),
                                "--transpose",
                                "0",
                                "--diagnostics-dir",
                                str(diagnostics_dir),
                            ]
                        ),
                        0,
                    )

            raw_midi_path = diagnostics_dir / "basic-pitch-raw.mid"
            raw_events_path = diagnostics_dir / "raw-note-events.json"
            report_path = diagnostics_dir / "mapping-report.json"
            self.assertTrue(output_path.is_file())
            self.assertTrue(raw_midi_path.is_file())
            self.assertTrue(raw_events_path.is_file())
            self.assertTrue(report_path.is_file())
            self.assertEqual(midi_data.write_paths, [str(raw_midi_path)])
            run_prediction.assert_called_once_with(input_path)
            self.assertEqual(json.loads(raw_events_path.read_text(encoding="utf-8"))["normalizedEventCount"], 2)
            self.assertEqual(json.loads(report_path.read_text(encoding="utf-8"))["counts"]["filteredEvents"], 2)
            self.assertIn("Diagnostics written:", stdout.getvalue())
            self.assertIn("Mapping diagnostics:", stdout.getvalue())

    def test_diagnostics_disabled_writes_only_the_lite_json(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_path = Path(temporary_directory)
            input_path = temporary_path / "piano.wav"
            output_path = temporary_path / "lite.json"
            input_path.touch()
            prediction = BasicPitchPrediction(FakeMidiData(), ((0.0, 0.1, 60, 0.8),))

            with patch("transcribe.run_basic_pitch", return_value=prediction) as run_prediction:
                self.assertEqual(main([str(input_path), "--output", str(output_path)]), 0)

            self.assertTrue(output_path.is_file())
            self.assertFalse((temporary_path / "basic-pitch-raw.mid").exists())
            self.assertFalse((temporary_path / "raw-note-events.json").exists())
            self.assertFalse((temporary_path / "mapping-report.json").exists())
            self.assertEqual(prediction.midi_data.write_paths, [])
            run_prediction.assert_called_once_with(input_path)

    def test_low_amplitude_and_short_events_are_removed(self) -> None:
        result = arrange_events([event(0, 100, 60, 0.2), event(100, 140, 62), event(200, 300, 64)])
        self.assertEqual(list(result.notes), [{"time": 0, "key": "1Key2"}])

    def test_first_retained_note_is_normalized_to_zero(self) -> None:
        result = arrange_events([event(750, 850, 60)])
        self.assertEqual(result.notes[0]["time"], 0)

    def test_duplicate_mapped_keys_in_a_chord_keep_the_strongest(self) -> None:
        result = arrange_events([event(0, 100, 60, 0.5), event(20, 140, 60, 0.9)])
        self.assertEqual(len(result.notes), 1)
        self.assertEqual(result.notes[0]["time"], 0)

    def test_maximum_chord_size_is_enforced_and_highest_key_is_preserved(self) -> None:
        source = [event(0, 100, 60, 0.9), event(1, 101, 64, 0.8), event(2, 102, 67, 0.7), event(3, 103, 84, 0.3)]
        result = arrange_events(
            source,
            max_chord_notes=2,
        )
        mapped = map_events(source, result.transpose)
        highest_mapped_key = max(item.key_index for item in mapped)
        output_key_indexes = [int(str(note["key"])[4:]) for note in result.notes]
        self.assertIn(highest_mapped_key, output_key_indexes)
        self.assertEqual(len(result.notes), 2)
        self.assertEqual(result.maximum_chord_size, 2)

    def test_chord_anchor_does_not_chain_events(self) -> None:
        result = arrange_events(
            [event(0, 100, 60), event(25, 125, 62), event(50, 150, 64), event(75, 175, 65)],
            chord_window_ms=30,
        )
        self.assertEqual([note["time"] for note in result.notes], [0, 0, 50, 50])

    def test_immediate_same_key_repeats_are_suppressed(self) -> None:
        result = arrange_events([event(0, 100, 60), event(30, 130, 60)], chord_window_ms=0)
        self.assertEqual(list(result.notes), [{"time": 0, "key": "1Key0"}])

    def test_final_notes_sort_by_time_then_key(self) -> None:
        result = arrange_events([event(0, 100, 67), event(0, 100, 60), event(100, 200, 62)])
        self.assertEqual(list(result.notes), [{"time": 0, "key": "1Key0"}, {"time": 0, "key": "1Key4"}, {"time": 100, "key": "1Key1"}])

    def test_generated_json_has_exact_lite_top_level_shape(self) -> None:
        document = build_lite_score("Example", [{"time": 0, "key": "1Key7"}])
        self.assertEqual(document, [{"name": "Example", "bpm": 120, "bitsPerPage": 15, "pitchLevel": 0, "isComposed": True, "songNotes": [{"time": 0, "key": "1Key7"}]}])

    def test_no_output_is_written_when_every_event_is_filtered_out(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_path = Path(temporary_directory) / "result.json"
            with self.assertRaises(ArrangementError):
                convert_events_to_output([event(0, 20, 60, 0.1)], output_path, "No score")
            self.assertFalse(output_path.exists())

    def test_written_json_is_valid_utf8_json(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            output_path = Path(temporary_directory) / "result.json"
            convert_events_to_output([event(0, 100, 60)], output_path, "测试")
            with output_path.open(encoding="utf-8") as file:
                self.assertEqual(json.load(file)[0]["name"], "测试")


if __name__ == "__main__":
    unittest.main()
