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
    map_events,
    nearest_sky_midi,
    select_global_transpose,
)
from transcribe import convert_events_to_output, main, parse_transpose_argument  # noqa: E402


def event(start_ms: float, end_ms: float, midi: int, amplitude: float = 0.8) -> RawNoteEvent:
    return RawNoteEvent(start_ms, end_ms, midi, amplitude)


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

            with patch("transcribe.run_basic_pitch", return_value=((0.0, 0.1, 60, 0.8),)):
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
