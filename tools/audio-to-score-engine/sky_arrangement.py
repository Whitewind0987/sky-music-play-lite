"""Pure, deterministic conversion from Basic Pitch notes to Sky 15-key notes."""

from __future__ import annotations

from dataclasses import dataclass
import math
from numbers import Integral, Real
from typing import Iterable, Sequence


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
    for transpose in range(-36, 37):
        total_loss = math.fsum(
            _mapping_weight(event) * _nearest_distance(event.midi_pitch + transpose) ** 2
            for event in events
        )
        candidates.append((total_loss, abs(transpose), transpose))

    return min(candidates)[2]


def map_events(events: Sequence[RawNoteEvent], transpose: int) -> tuple[MappedNoteEvent, ...]:
    mapped: list[MappedNoteEvent] = []
    for source_index, event in enumerate(events):
        target_midi = nearest_sky_midi(event.midi_pitch + transpose)
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
) -> ArrangementResult:
    validate_options(min_amplitude, min_duration_ms, chord_window_ms, max_chord_notes)
    filtered_events = filter_events(events, min_amplitude, min_duration_ms)
    if not filtered_events:
        raise ArrangementError("no note events remain after amplitude and duration filtering")

    transpose = select_global_transpose(filtered_events)
    mapped_events = map_events(filtered_events, transpose)
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
        transpose=transpose,
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
