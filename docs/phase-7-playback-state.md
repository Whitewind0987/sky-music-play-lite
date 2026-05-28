# Phase 7 Playback State Notes

Phase 7 should introduce an explicit playback state before adding full controls.

- `idle`: no preview is scheduled or active.
- `playing`: preview timeouts are scheduled and notes can become active.
- `paused`: preview is not advancing, but the current playback position should be remembered.
- `finished`: preview reached the end of the current note list.

Phase 6.9 does not implement this state machine. It only documents the states so the next phase can add controls without guessing.
