"""Deterministic diagnostic separation of filtered MIDI events into voices."""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Sequence

from sky_arrangement import ArrangementError, RawNoteEvent, group_events_by_onset


@dataclass(frozen=True)
class VoiceAssignedEvent:
    group_index: int
    event: RawNoteEvent
    source_order: int
    assignment_cost: float


@dataclass(frozen=True)
class SeparatedVoice:
    index: int
    events: tuple[VoiceAssignedEvent, ...]
    minimum_pitch: int | None
    maximum_pitch: int | None
    median_pitch: float | None
    average_amplitude: float
    average_duration_ms: float
    large_jump_count: int
    octave_or_larger_jump_count: int
    maximum_jump_semitones: int


@dataclass(frozen=True)
class VoiceSeparationResult:
    voices: tuple[SeparatedVoice, ...]
    onset_group_count: int
    input_event_count: int
    considered_event_count: int
    assigned_event_count: int
    dropped_event_count: int
    truncated_group_event_count: int
    beam_width: int


def validate_voice_options(voice_count: int, onset_window_ms: float, beam_width: int, max_notes_per_group: int) -> None:
    if isinstance(voice_count, bool) or not isinstance(voice_count, int) or not 2 <= voice_count <= 6:
        raise ArrangementError("voice count must be an integer from 2 through 6")
    if not isinstance(onset_window_ms, (int, float)) or not 0 <= onset_window_ms <= 500:
        raise ArrangementError("voice onset window must be from 0 through 500 ms")
    if isinstance(beam_width, bool) or not isinstance(beam_width, int) or not 4 <= beam_width <= 256:
        raise ArrangementError("voice beam width must be an integer from 4 through 256")
    if isinstance(max_notes_per_group, bool) or not isinstance(max_notes_per_group, int) or not 1 <= max_notes_per_group <= 12:
        raise ArrangementError("voice maximum notes per group must be an integer from 1 through 12")


def separate_voices(events: Sequence[RawNoteEvent], *, voice_count: int = 4, onset_window_ms: float = 70.0, beam_width: int = 64, max_notes_per_group: int = 6) -> VoiceSeparationResult:
    validate_voice_options(voice_count, onset_window_ms, beam_width, max_notes_per_group)
    groups = group_events_by_onset(events, onset_window_ms)
    # A beam state is total cost plus one immutable event tuple per voice.
    beam: list[tuple[float, tuple[tuple[VoiceAssignedEvent, ...], ...], int, int]] = [(0.0, tuple(() for _ in range(voice_count)), 0, 0)]
    considered = assigned = truncated = 0
    for group_index, group in enumerate(groups):
        retained, removed = _retain_diverse(group, max_notes_per_group)
        considered += len(retained)
        truncated += removed
        next_beam: list[tuple[float, tuple[tuple[VoiceAssignedEvent, ...], ...], int, int]] = []
        for cost, voices, dropped, movement in beam:
            _assign_group(next_beam, retained, group_index, voices, cost, dropped, movement)
        next_beam.sort(key=lambda state: (state[0], state[2], state[3], _source_key(state[1])))
        beam = next_beam[:beam_width]
    best = min(beam, key=lambda state: (state[0], state[2], state[3], _source_key(state[1])))
    voice_objects = [_build_voice(index, voice) for index, voice in enumerate(best[1]) if voice]
    voice_objects.sort(key=lambda voice: (voice.median_pitch if voice.median_pitch is not None else 9999, voice.index))
    ordered = tuple(_renumber_voice(index, voice) for index, voice in enumerate(voice_objects))
    return VoiceSeparationResult(ordered, len(groups), len(events), considered, sum(len(v.events) for v in ordered), best[2] + truncated, truncated, beam_width)


def _assign_group(out, events, group_index, voices, cost, dropped, movement, event_index=0, used=()):
    if event_index == len(events):
        out.append((cost, voices, dropped, movement))
        return
    event = events[event_index]
    # Drop is explicit and costs more for strong, sustained notes.
    _assign_group(out, events, group_index, voices, cost + _drop_cost(event), dropped + 1, movement, event_index + 1, used)
    for voice_index in range(len(voices)):
        if voice_index in used:
            continue
        continuation, interval = _continuation_cost(voices[voice_index], event)
        assigned = VoiceAssignedEvent(group_index, event, event_index, continuation)
        updated = list(voices)
        updated[voice_index] = voices[voice_index] + (assigned,)
        _assign_group(out, events, group_index, tuple(updated), cost + continuation, dropped, movement + interval, event_index + 1, used + (voice_index,))


def _retain_diverse(group, limit):
    ranked = sorted(group, key=lambda event: (-(1.5 * event.amplitude + .5 * min(event.duration_ms, 1000) / 1000), -event.amplitude, -event.duration_ms, event.midi_pitch))
    retained = []
    while ranked and len(retained) < limit:
        choice = max(ranked, key=lambda event: (min((abs(event.midi_pitch - chosen.midi_pitch) for chosen in retained), default=999), event.amplitude, event.duration_ms, event.midi_pitch))
        retained.append(choice); ranked.remove(choice)
    return tuple(sorted(retained, key=lambda event: (event.midi_pitch, event.start_ms))), len(group) - len(retained)


def _continuation_cost(voice, event):
    if not voice:
        return .15, 0
    previous = voice[-1].event
    interval = abs(event.midi_pitch - previous.midi_pitch)
    base = .05 if interval <= 2 else .15 if interval <= 4 else .35 if interval <= 7 else .8 if interval <= 11 else 1.2 + max(0, interval - 12) * .15
    gap = event.start_ms - previous.end_ms
    scale = .4 if gap >= 1000 else .7 if gap >= 400 else 1.0
    overlap = max(0.0, previous.end_ms - event.start_ms - 30) / 200
    center = median(item.event.midi_pitch for item in voice[-5:])
    return base * scale + overlap + .03 * abs(event.midi_pitch - center), interval


def _drop_cost(event): return .4 + 1.2 * event.amplitude + .4 * min(event.duration_ms, 1000) / 1000
def _source_key(voices): return tuple(item.source_order for voice in voices for item in voice)
def _renumber_voice(index, voice): return SeparatedVoice(index, voice.events, voice.minimum_pitch, voice.maximum_pitch, voice.median_pitch, voice.average_amplitude, voice.average_duration_ms, voice.large_jump_count, voice.octave_or_larger_jump_count, voice.maximum_jump_semitones)
def _build_voice(index, events):
    pitches = [item.event.midi_pitch for item in events]; jumps = [abs(b.event.midi_pitch-a.event.midi_pitch) for a,b in zip(events,events[1:])]
    return SeparatedVoice(index, events, min(pitches), max(pitches), float(median(pitches)), sum(item.event.amplitude for item in events)/len(events), sum(item.event.duration_ms for item in events)/len(events), sum(j>=5 for j in jumps), sum(j>=12 for j in jumps), max(jumps, default=0))
