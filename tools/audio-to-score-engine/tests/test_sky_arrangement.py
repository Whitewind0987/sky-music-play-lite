from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

TOOL_DIRECTORY = Path(__file__).resolve().parents[1]
if str(TOOL_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(TOOL_DIRECTORY))

from sky_arrangement import (  # noqa: E402
    ArrangementError,
    RawNoteEvent,
    SKY_MIDI_NOTES,
    arrange_events,
    build_lite_score,
    map_events,
    nearest_sky_midi,
    select_global_transpose,
)
from transcribe import convert_events_to_output  # noqa: E402


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

    def test_transpose_selection_is_deterministic(self) -> None:
        source = [event(0, 500, 55), event(600, 900, 59, 0.4), event(1000, 1100, 64)]
        self.assertEqual(select_global_transpose(source), select_global_transpose(source))

    def test_transpose_tie_breaking_prefers_smaller_absolute_then_numeric_shift(self) -> None:
        self.assertEqual(select_global_transpose([event(0, 100, 61)]), -1)

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
