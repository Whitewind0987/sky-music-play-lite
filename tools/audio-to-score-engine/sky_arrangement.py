"""Pure, deterministic conversion from Basic Pitch notes to Sky 15-key notes."""

from __future__ import annotations

from dataclasses import dataclass
import math
from numbers import Integral, Real
from typing import Iterable, Literal, Sequence, cast


SKY_MIDI_NOTES = (
    60,
    62,
    64,
    65,
    67,
    69,
    71,
    72,
    74,
    76,
    77,
    79,
    81,
    83,
    84,
)

DEFAULT_MIN_AMPLITUDE = 0.25
DEFAULT_MIN_DURATION_MS = 50.0
DEFAULT_CHORD_WINDOW_MS = 35.0
DEFAULT_MAX_CHORD_NOTES = 3
IMMEDIATE_REPEAT_WINDOW_MS = 40
MAX_WEIGHTED_DURATION_MS = 2_000.0
AUTO_TRANSPOSE_CANDIDATES = (-24, -12, 0, 12, 24)
MIN_MANUAL_TRANSPOSE = -36
MAX_MANUAL_TRANSPOSE = 36
PitchMappingMode = Literal["clamp", "octave-fold"]
DEFAULT_PITCH_MAPPING_MODE: PitchMappingMode = "clamp"


class ArrangementError(ValueError):
    """Raised when events cannot be turned into a playable score."""


@dataclass(frozen=True)
class RawNoteEvent:
    start_ms: float
    end_ms: float
    midi_pitch: int
    amplitude: float

    @property
    def duration_ms(self) -> float:
        return self.end_ms - self.start_ms


@dataclass(frozen=True)
class MappedNoteEvent:
    start_ms: float
    end_ms: float
    key_index: int
    amplitude: float
    source_index: int

    @property
    def duration_ms(self) -> float:
        return self.end_ms - self.start_ms


@dataclass(frozen=True)
class ArrangementResult:
    transpose: int
    filtered_event_count: int
    notes: tuple[dict[str, int | str], ...]
    maximum_chord_size: int


@dataclass(frozen=True)
class NormalizedBasicPitchEvents:
    events: tuple[RawNoteEvent, ...]
    rejected_count: int


def normalize_basic_pitch_events(note_events: Iterable[object]) -> NormalizedBasicPitchEvents:
    """Convert Basic Pitch tuples to an independent, validated internal type.

    Basic Pitch emits at least ``(start_seconds, end_seconds, midi_pitch,
    amplitude)`` and may append pitch-bend values. Pitch bends are deliberately
    ignored for this MVP.
    """

    accepted: list[RawNoteEvent] = []
    rejected_count = 0

    for event in note_events:
        if not isinstance(event, (tuple, list)) or len(event) < 4:
            rejected_count += 1
            continue

        start_seconds, end_seconds, midi_pitch, amplitude = event[:4]
        if not _is_finite_number(start_seconds) or not _is_finite_number(end_seconds):
            rejected_count += 1
            continue
        if not _is_finite_number(amplitude):
            rejected_count += 1
            continue
        if isinstance(midi_pitch, bool) or not isinstance(midi_pitch, Integral):
            rejected_count += 1
            continue
        if (
            start_seconds < 0
            or end_seconds <= start_seconds
            or not 0 <= midi_pitch <= 127
            or not 0.0 <= amplitude <= 1.0
        ):
            rejected_count += 1
            continue

        accepted.append(
            RawNoteEvent(
                start_ms=float(start_seconds) * 1_000.0,
                end_ms=float(end_seconds) * 1_000.0,
                midi_pitch=int(midi_pitch),
                amplitude=float(amplitude),
            )
        )

    return NormalizedBasicPitchEvents(tuple(accepted), rejected_count)


def validate_options(
    min_amplitude: float,
    min_duration_ms: float,
    chord_window_ms: float,
    max_chord_notes: int,
) -> None:
    if not _is_finite_number(min_amplitude) or not 0.0 <= min_amplitude <= 1.0:
        raise ArrangementError("min amplitude must be a finite number from 0 through 1")
    if not _is_finite_number(min_duration_ms) or min_duration_ms < 0:
        raise ArrangementError("minimum duration must be a non-negative finite number")
    if not _is_finite_number(chord_window_ms) or chord_window_ms < 0:
        raise ArrangementError("chord window must be a non-negative finite number")
    if isinstance(max_chord_notes, bool) or not isinstance(max_chord_notes, int):
        raise ArrangementError("maximum chord notes must be an integer")
    if not 1 <= max_chord_notes <= len(SKY_MIDI_NOTES):
        raise ArrangementError(f"maximum chord notes must be from 1 through {len(SKY_MIDI_NOTES)}")


def validate_transpose_override(transpose: int | None) -> None:
    if transpose is None:
        return
    if isinstance(transpose, bool) or not isinstance(transpose, int):
        raise ArrangementError("transpose must be an integer from -36 through 36")
    if not MIN_MANUAL_TRANSPOSE <= transpose <= MAX_MANUAL_TRANSPOSE:
        raise ArrangementError("transpose must be an integer from -36 through 36")


def validate_pitch_mapping_mode(pitch_mapping_mode: object) -> PitchMappingMode:
    if pitch_mapping_mode not in ("clamp", "octave-fold"):
        raise ArrangementError("pitch mapping mode must be 'clamp' or 'octave-fold'")
    return cast(PitchMappingMode, pitch_mapping_mode)


def filter_events(
    events: Iterable[RawNoteEvent], min_amplitude: float, min_duration_ms: float
) -> tuple[RawNoteEvent, ...]:
    """Return retained events without mutating the source collection."""

    return tuple(
        event
        for event in events
        if event.amplitude >= min_amplitude and event.duration_ms >= min_duration_ms
    )


def select_global_transpose(events: Sequence[RawNoteEvent]) -> int:
    if not events:
        raise ArrangementError("cannot select a transpose without note events")

    # Squared distance makes large pitch errors costly. Each event's influence
    # grows with confidence and duration, but duration is capped at two seconds
    # so one sustained note cannot dominate the entire arrangement.
    candidates: list[tuple[float, int, int]] = []
    for transpose in AUTO_TRANSPOSE_CANDIDATES:
        total_loss = math.fsum(
            _mapping_weight(event) * _nearest_distance(event.midi_pitch + transpose) ** 2
            for event in events
        )
        candidates.append((total_loss, abs(transpose), transpose))

    return min(candidates)[2]


def fold_pitch_to_sky_range(midi_pitch: int) -> tuple[int, int]:
    if isinstance(midi_pitch, bool) or not isinstance(midi_pitch, Integral):
        raise ArrangementError("MIDI pitch must be an integer")

    folded_pitch = int(midi_pitch)
    octave_steps = 0
    while folded_pitch < SKY_MIDI_NOTES[0]:
        folded_pitch += 12
        octave_steps += 1
    while folded_pitch > SKY_MIDI_NOTES[-1]:
        folded_pitch -= 12
        octave_steps -= 1
    return folded_pitch, octave_steps


def apply_pitch_mapping_mode(
    midi_pitch: int, pitch_mapping_mode: PitchMappingMode = DEFAULT_PITCH_MAPPING_MODE
) -> tuple[int, int]:
    mode = validate_pitch_mapping_mode(pitch_mapping_mode)
    if mode == "octave-fold":
        return fold_pitch_to_sky_range(midi_pitch)
    return midi_pitch, 0


def map_events(
    events: Sequence[RawNoteEvent],
    transpose: int,
    pitch_mapping_mode: PitchMappingMode = DEFAULT_PITCH_MAPPING_MODE,
) -> tuple[MappedNoteEvent, ...]:
    mode = validate_pitch_mapping_mode(pitch_mapping_mode)
    mapped: list[MappedNoteEvent] = []
    for source_index, event in enumerate(events):
        mapped_pitch, _ = apply_pitch_mapping_mode(event.midi_pitch + transpose, mode)
        target_midi = nearest_sky_midi(mapped_pitch)
        key_index = SKY_MIDI_NOTES.index(target_midi)
        mapped.append(
            MappedNoteEvent(
                start_ms=event.start_ms,
                end_ms=event.end_ms,
                key_index=key_index,
                amplitude=event.amplitude,
                source_index=source_index,
            )
        )
    return tuple(mapped)


def nearest_sky_midi(midi_pitch: int) -> int:
    """Return the nearest target, preferring the lower target on exact ties."""

    return min(SKY_MIDI_NOTES, key=lambda target: (abs(target - midi_pitch), target))


def arrange_events(
    events: Iterable[RawNoteEvent],
    *,
    min_amplitude: float = DEFAULT_MIN_AMPLITUDE,
    min_duration_ms: float = DEFAULT_MIN_DURATION_MS,
    chord_window_ms: float = DEFAULT_CHORD_WINDOW_MS,
    max_chord_notes: int = DEFAULT_MAX_CHORD_NOTES,
    transpose: int | None = None,
    pitch_mapping_mode: PitchMappingMode = DEFAULT_PITCH_MAPPING_MODE,
) -> ArrangementResult:
    validate_options(min_amplitude, min_duration_ms, chord_window_ms, max_chord_notes)
    validate_transpose_override(transpose)
    mode = validate_pitch_mapping_mode(pitch_mapping_mode)
    filtered_events = filter_events(events, min_amplitude, min_duration_ms)
    if not filtered_events:
        raise ArrangementError("no note events remain after amplitude and duration filtering")

    selected_transpose = select_global_transpose(filtered_events) if transpose is None else transpose
    mapped_events = map_events(filtered_events, selected_transpose, mode)
    earliest_start_ms = min(event.start_ms for event in mapped_events)
    normalized_events = tuple(
        MappedNoteEvent(
            start_ms=event.start_ms - earliest_start_ms,
            end_ms=event.end_ms - earliest_start_ms,
            key_index=event.key_index,
            amplitude=event.amplitude,
            source_index=event.source_index,
        )
        for event in mapped_events
    )

    chord_notes = _select_chord_notes(normalized_events, chord_window_ms, max_chord_notes)
    final_notes = _remove_immediate_repeats(chord_notes)
    return ArrangementResult(
        transpose=selected_transpose,
        filtered_event_count=len(filtered_events),
        notes=tuple({"time": time_ms, "key": f"1Key{key_index}"} for time_ms, key_index in final_notes),
        maximum_chord_size=max((len(notes) for _, notes in chord_notes), default=0),
    )


def build_lite_score(name: str, notes: Sequence[dict[str, int | str]]) -> list[dict[str, object]]:
    if not name.strip():
        raise ArrangementError("score name must not be empty")
    return [
        {
            "name": name,
            "bpm": 120,
            "bitsPerPage": 15,
            "pitchLevel": 0,
            "isComposed": True,
            "songNotes": list(notes),
        }
    ]


def build_mapping_diagnostics(
    normalized_events: Iterable[RawNoteEvent],
    arrangement_result: ArrangementResult,
    *,
    raw_basic_pitch_event_count: int,
    rejected_invalid_event_count: int,
    min_amplitude: float,
    min_duration_ms: float,
    transpose_mode: str,
    pitch_mapping_mode: PitchMappingMode = DEFAULT_PITCH_MAPPING_MODE,
) -> dict[str, object]:
    """Describe Sky mapping losses without mutating or re-arranging the score."""

    events = tuple(normalized_events)
    filtered_events = filter_events(events, min_amplitude, min_duration_ms)
    transposed_pitches = tuple(
        event.midi_pitch + arrangement_result.transpose for event in filtered_events
    )
    mode = validate_pitch_mapping_mode(pitch_mapping_mode)
    handled_pitches_and_steps = tuple(
        apply_pitch_mapping_mode(pitch, mode) for pitch in transposed_pitches
    )
    handled_pitches = tuple(item[0] for item in handled_pitches_and_steps)
    mapped_events = map_events(filtered_events, arrangement_result.transpose, mode)

    below_sky_range = sum(pitch < SKY_MIDI_NOTES[0] for pitch in transposed_pitches)
    above_sky_range = sum(pitch > SKY_MIDI_NOTES[-1] for pitch in transposed_pitches)
    inside_sky_range = len(filtered_events) - below_sky_range - above_sky_range
    exact_sky_natural_notes = sum(pitch in SKY_MIDI_NOTES for pitch in handled_pitches)
    chromatic_notes = sum(
        SKY_MIDI_NOTES[0] <= pitch <= SKY_MIDI_NOTES[-1] and pitch not in SKY_MIDI_NOTES
        for pitch in handled_pitches
    )
    octave_folded_up = sum(steps > 0 for _, steps in handled_pitches_and_steps)
    octave_folded_down = sum(steps < 0 for _, steps in handled_pitches_and_steps)
    unchanged_by_range_mapping = sum(
        SKY_MIDI_NOTES[0] <= pitch <= SKY_MIDI_NOTES[-1] for pitch in transposed_pitches
    )
    clamped_to_lowest = below_sky_range if mode == "clamp" else 0
    clamped_to_highest = above_sky_range if mode == "clamp" else 0
    histogram = {f"1Key{key_index}": 0 for key_index in range(len(SKY_MIDI_NOTES))}
    for event in mapped_events:
        histogram[f"1Key{event.key_index}"] += 1

    return {
        "schemaVersion": 1,
        "transposeMode": transpose_mode,
        "selectedTransposeSemitones": arrangement_result.transpose,
        "pitchMappingMode": mode,
        "skyMidiRange": {
            "minimum": SKY_MIDI_NOTES[0],
            "maximum": SKY_MIDI_NOTES[-1],
        },
        "counts": {
            "rawBasicPitchEvents": raw_basic_pitch_event_count,
            "rejectedInvalidEvents": rejected_invalid_event_count,
            "normalizedEvents": len(events),
            "filteredEvents": len(filtered_events),
            "finalLiteNotes": len(arrangement_result.notes),
        },
        "sourcePitchRange": _pitch_range(event.midi_pitch for event in filtered_events),
        "transposedPitchRange": _pitch_range(transposed_pitches),
        "rangeClassificationAfterTranspose": {
            "belowSkyRange": below_sky_range,
            "insideSkyRange": inside_sky_range,
            "aboveSkyRange": above_sky_range,
        },
        "mapping": {
            "exactSkyNaturalNotes": exact_sky_natural_notes,
            "chromaticNotesMappedToNatural": chromatic_notes,
            "clampedToLowestKey": clamped_to_lowest,
            "clampedToHighestKey": clamped_to_highest,
        },
        "pitchMapping": {
            "octaveFoldedUp": octave_folded_up,
            "octaveFoldedDown": octave_folded_down,
            "unchangedByRangeMapping": unchanged_by_range_mapping,
            "clampedToLowestKey": clamped_to_lowest,
            "clampedToHighestKey": clamped_to_highest,
            "chromaticNotesMappedToNatural": chromatic_notes,
        },
        "outputKeyHistogram": histogram,
        "arrangement": {
            "maximumChordSize": arrangement_result.maximum_chord_size,
        },
    }


def _select_chord_notes(
    events: Sequence[MappedNoteEvent], chord_window_ms: float, max_chord_notes: int
) -> list[tuple[int, tuple[MappedNoteEvent, ...]]]:
    sorted_events = sorted(events, key=lambda event: (event.start_ms, event.key_index, event.source_index))
    groups: list[tuple[float, list[MappedNoteEvent]]] = []

    for event in sorted_events:
        if not groups or event.start_ms - groups[-1][0] > chord_window_ms:
            groups.append((event.start_ms, [event]))
        else:
            groups[-1][1].append(event)

    result: list[tuple[int, tuple[MappedNoteEvent, ...]]] = []
    for anchor_ms, group in groups:
        selected_by_key: dict[int, MappedNoteEvent] = {}
        for event in group:
            previous = selected_by_key.get(event.key_index)
            if previous is None or _stronger_event(event, previous):
                selected_by_key[event.key_index] = event

        retained = list(selected_by_key.values())
        if len(retained) > max_chord_notes:
            highest = max(retained, key=lambda event: event.key_index)
            remaining = [event for event in retained if event != highest]
            remaining.sort(key=lambda event: (-event.amplitude, -event.duration_ms, -event.key_index, event.source_index))
            retained = [highest, *remaining[: max_chord_notes - 1]]

        retained.sort(key=lambda event: event.key_index)
        result.append((max(0, int(round(anchor_ms))), tuple(retained)))

    return result


def _remove_immediate_repeats(
    chord_notes: Sequence[tuple[int, Sequence[MappedNoteEvent]]]
) -> list[tuple[int, int]]:
    result: list[tuple[int, int]] = []
    last_time_by_key: dict[int, int] = {}
    for time_ms, notes in chord_notes:
        for event in notes:
            previous_time = last_time_by_key.get(event.key_index)
            if previous_time is not None and time_ms - previous_time < IMMEDIATE_REPEAT_WINDOW_MS:
                continue
            result.append((time_ms, event.key_index))
            last_time_by_key[event.key_index] = time_ms
    return sorted(result, key=lambda item: (item[0], item[1]))


def _mapping_weight(event: RawNoteEvent) -> float:
    capped_duration = min(event.duration_ms, MAX_WEIGHTED_DURATION_MS)
    return (0.25 + event.amplitude) * (0.5 + capped_duration / MAX_WEIGHTED_DURATION_MS)


def _pitch_range(pitches: Iterable[int]) -> dict[str, int | None]:
    values = tuple(pitches)
    return {
        "minimum": min(values) if values else None,
        "maximum": max(values) if values else None,
    }


def _nearest_distance(midi_pitch: int) -> int:
    return abs(nearest_sky_midi(midi_pitch) - midi_pitch)


def _stronger_event(candidate: MappedNoteEvent, current: MappedNoteEvent) -> bool:
    return (candidate.amplitude, candidate.duration_ms, -candidate.source_index) > (
        current.amplitude,
        current.duration_ms,
        -current.source_index,
    )


def _is_finite_number(value: object) -> bool:
    return isinstance(value, Real) and not isinstance(value, bool) and math.isfinite(value)
