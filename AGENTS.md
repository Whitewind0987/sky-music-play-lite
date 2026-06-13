# AGENTS.md

This file defines the working rules for Codex and other AI agents in this project. Follow these rules before changing code.

## Fixed Stack

SkyMusicPlay Lite must use this stack:

- Tauri v2
- React
- TypeScript
- Rust
- Vite
- Git and GitHub
- Windows first

Do not replace this stack unless the human user explicitly changes the project direction.

## UI Refresh Rules

- This project is gradually introducing Tailwind CSS, Radix UI, and lucide-react.
- Do not rewrite the whole UI at once.
- Do not remove `App.css` until the migration is explicitly finished.
- Do not remove `iconfont.css` until every icon usage has been replaced and verified.
- New icons should use `lucide-react`.
- Do not add new font icon dependencies.
- Do not add new handwritten inline SVG icons unless there is no suitable `lucide-react` icon and the user approves it.
- Existing iconfont and handwritten SVG icons should be migrated gradually to `lucide-react`.
- Preserve existing icon wrapper class names during icon migration unless a later cleanup stage explicitly removes them.
- Do not remove `iconfont.css` until a dedicated cleanup stage confirms there are no remaining iconfont usages.
- Lucide icon migration must not re-enable Tailwind startup integration.
- Use Radix UI for interactive primitives such as Dialog, AlertDialog, DropdownMenu, Toast, Tooltip, Slider, Progress, and Popover.
- Do not install the `radix-ui` umbrella package during the UI refresh.
- Add Radix primitives only when a stage actually uses them, using specific packages such as `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-tooltip`, `@radix-ui/react-toast`, `@radix-ui/react-popover`, `@radix-ui/react-slider`, or `@radix-ui/react-progress`.
- Do not keep unused UI dependencies in `package.json` because they can increase install, build, and dev startup cost.
- Use Tailwind CSS for new UI styling, but preserve existing CSS during the gradual migration.
- UI polish should prefer `App.css` and existing class-level changes before component rewrites.
- During the early migration, do not use the full `@import "tailwindcss";` in the existing app styles. Use the no-Preflight Tailwind import until the user explicitly approves enabling Preflight.
- During early Alpha UI Refresh stages, Tailwind files and foundation components may exist without enabling the Tailwind Vite plugin in the active app startup path. Only enable the Tailwind Vite plugin when a stage actually migrates visible UI to Tailwind and the startup cost is accepted by the user.
- If enabling a UI tool noticeably slows startup compared with the stable version, prefer deferring active integration until the tool is actually used by visible UI.
- New shared UI building blocks should live in `src/components/ui/`.
- Shared className helpers should live in `src/lib/cn.ts`.
- Do not use `clsx`, `tailwind-merge`, or new styling dependencies unless the user explicitly approves them.
- UI foundation components must not be wired into existing screens until a later stage explicitly asks for it.
- Do not introduce Mantine, shadcn/ui CLI, or Radix Themes unless the user explicitly approves it.
- Controlled text inputs must update their value synchronously.
- Do not wrap controlled text input value updates in `startTransition`.
- Do not manually build input text from keydown events.
- Do not block IME composition events.
- Search input and other text inputs must support Chinese IME correctly.
- Drag-and-drop score import must reuse `handleImportScoreFiles`; do not duplicate parsing, decryption, or import logic in drag handlers, and do not add recursive directory import unless explicitly requested.
- Built-in score parser changes must stay compatible with the index generator and must run a regression test that parses every entry in `public/builtin-scores/index.json` against its source file.
- Built-in lazy loading must parse only the indexed song entry, and the runtime parser must accept the same legacy compatibility cases as the index generator.
- Failed built-in score loads must remain retryable; do not permanently cache transient fetch or parse failures.
- Built-in score files under `public/builtin-scores/scores` must be strict non-empty JSON arrays; do not add runtime recovery for corrupted assets unless explicitly requested.
- The runtime built-in index sanitizer must accept safe uppercase file names emitted by the generator while still rejecting path traversal, nested paths, spaces, hidden files, and unsupported extensions.
- Built-in score tests must cover raw asset JSON validity, generator/runtime index consistency, and indexed song lazy-load parsing.
- Locate-current-score behavior must use `librarySong.id`, not only an array index.
- Trigger library DOM scrolling through explicit locate requests, not on every selection change; import auto-scroll must reuse the same locate request mechanism.
- The library's main scroll container is `.app-layout`, not `window`.
- Search playback context must include all current search result IDs, not only the clicked song; repeat-all must cycle within that captured context.
- Long library titles must truncate before they push selected/loading badges or row actions out of view.
- A NetEase-style sidebar may be used only as a layout reference; do not clone or add unrelated product sections.
- Keep the sidebar brand fixed and scroll only navigation plus existing user-created playlists; do not fake collected or subscribed playlist data.
- Sidebar playlist names and queue song titles must truncate before pushing adjacent controls, badges, or remove buttons out of view.
- The locate-current-score button must not overlap the queue panel and should hide after scroll inactivity.
- The bottom player primary play/pause button remains the visual anchor; use the stop button as the reference size for secondary controls.
- Do not change playback, queue, experimental input, or score import logic during UI-only stages.
- Sidebar playlist lists should scroll internally and must not push lower navigation items out of view.
- The sidebar may reference a NetEase-style layout, but must not clone or add unrelated NetEase product sections.
- When library categories are represented directly in the sidebar, do not also render a top-level Library item.
- Logs and Settings belong in workspace header actions, not the sidebar.
- Only existing user-created playlists may appear in the sidebar; do not fake collected or subscribed playlist data.
- Keep the native sidebar scrollbar hidden; show a visual-only custom thumb on hover only when the sidebar is scrollable, with a permanently reserved gutter so content does not shift.
- Sidebar category and playlist names must use ellipsis when they overflow.
- The created-playlist header title and count use matching default and hover/focus weights; playlist row names must not become bold merely from hover.
- Do not set Tauri `security.csp` back to null; CSP changes must be tested in dev and avoid broad wildcards unless justified by a concrete violation.
- Progress seek is a later feature stage and must support both preview playback and experimental playback when implemented.
- Do not reintroduce frontend target-window activation preflight. `legacy-activate-scan-lparam` is an explicit compatibility profile that may send `WM_ACTIVATE` window messages, but it must never call `SetForegroundWindow`; non-activating profiles must remain available.
- Close confirmation must use the Rust force-close command when JavaScript `close()` would re-enter `onCloseRequested`.
- Stage 21 covers real playback simplification and lightweight stutter optimization only; Stage 22 library improvements remain postponed.
- Normal UI must not expose SendMessage/PostMessage implementation choices; target-window playback uses PostMessage internally.
- User-facing real playback methods are background playback (recommended) and foreground playback (fallback).
- Target-window settings expose only `legacy-activate-scan-lparam` and `grouped-legacy`.
- Persisted `send-message` values migrate to `post-message`; old target-window profiles migrate to `legacy-activate-scan-lparam` unless already `grouped-legacy`.
- Avoid per-note UI log updates during real playback and avoid large playback architecture rewrites unless explicitly requested.
- Every stage must run `npm run build` and `cargo check` before completion.

## Testing Rules

- Pure logic tests should use Vitest.
- Test files should use `.test.ts`.
- Prefer testing pure functions before changing app orchestration logic.
- Every feature or fix stage should run `npm run test`, `npm run build`, and `cd src-tauri && cargo check && cd ..`.
- Do not add UI or end-to-end tests unless a stage explicitly asks for them.
- App data migrations, sanitizers, and new persisted fields should have Vitest coverage.

## Persistence Safety

- App data writes should avoid direct `fs::write` to the final app data file.
- Prefer writing to a same-directory temporary file, syncing it, then replacing the final file.

## Score Import Safety

- Score import decryption lives in `src/lib/sheetDecrypt.ts`; keep it pure and covered by tests.
- Do not add runtime dependencies for score decryption.
- Do not log decrypted score contents, encrypted numeric arrays, decrypt keys, or signatures.
- Built-in lazy loading must parse only the indexed song entry; user file imports remain strict and validate the full imported file.
- Do not turn built-in index metadata such as duration or note count into fake playable notes.
- Repair corrupted built-in assets at the source; do not silently accept trailing garbage in runtime parsing.
- "播放队列" means `QueuePanel`; queue current-badge overflow fixes belong there and must not be applied to `LibraryPanel` or `BottomPlayer`.

## Project Hardening Rules

- Do not expose unused Tauri commands; command registrations must match current runtime UI or be explicitly documented as internal.
- Keep experimental input Rust code split by responsibility; do not collapse it back into one large module.
- Keep `App.tsx` wiring-focused.
- Playback coordination belongs in `usePlaybackCoordinator`.
- Global shortcut registration belongs in `usePlaybackShortcuts` and must remain serialized.
- Library rename/delete dialog state belongs in `useLibraryDialogs`.
- Update check orchestration belongs in `useUpdateCheck`.
- App data migrations and sanitizers should have Vitest coverage.
- UI polish should not change playback, persistence, update, or experimental input behavior unless explicitly requested.

## Development Style

- Build the project in small, phase-by-phase steps.
- Do one small thing, make it runnable or clearly verifiable, explain it, then stop.
- Before executing any plan, whether large or small, switch to a temporary working branch first.
- Do not redesign the master phase plan.
- Do not implement future phase features early.
- Do not perform large refactors unless the human user explicitly asks for one.
- Keep the `main` branch runnable.
- Stop after each phase and wait for human confirmation before continuing.

## Architecture and File Organization

`src/App.tsx` must stay small and should act mainly as the application composition layer.

`App.tsx` may contain:

- top-level app state wiring
- high-level page routing / active section switching
- passing props into major components
- connecting hooks together
- final app shell layout

`App.tsx` must not become a dumping ground for feature logic.

Do not keep adding unrelated logic to `App.tsx`. When a feature grows beyond simple wiring, extract it into one of these places:

- `src/hooks/` for React stateful logic
- `src/lib/` for pure utilities, parsing, scheduling, calculations, and side-effect wrappers
- `src/types/` for shared TypeScript types
- `src/components/` for UI components
- feature-specific files when a feature becomes large enough

Preferred extraction examples:

- score import state and handlers → `src/hooks/useScoreLibrary.ts`
- playback controller state and handlers → `src/hooks/usePreviewPlayback.ts`
- key mapping listener logic → `src/hooks/useKeyMapping.ts`
- logs state and append helpers → `src/hooks/usePlaybackLog.ts`
- library category state → `src/hooks/useLibraryNavigation.ts`
- random/repeat/queue next-song decisions → `src/lib/playbackFlow.ts`
- import error formatting → `src/lib/importErrors.ts`
- duration formatting → `src/lib/formatters.ts`

Keep feature boundaries clear:

- UI components should not own complex playback rules.
- Pure helper functions should not depend on React.
- Hooks may use React state, refs, effects, and callbacks.
- Rust/Tauri commands should stay behind frontend API wrappers in `src/lib/tauriApi.ts` or a similarly clear file.
- Do not duplicate playback timing logic. Reuse `src/lib/playbackScheduler.ts`.

## App.tsx Size Rule

Before adding new logic to `App.tsx`, check whether it belongs in a hook, component, type file, or library helper.

Prefer small focused hook extractions for standalone orchestration before broad `App.tsx` rewrites.

Playback shortcut registration lives in `usePlaybackShortcuts`; keep global shortcut register/unregister serialized and do not wire it directly in `App.tsx`.

Library rename/delete dialog state lives in `useLibraryDialogs`; do not reintroduce native `window.confirm` or `window.prompt`, and deleting unrelated local songs must not stop current playback.

Playback coordination between score library, queue, playback order, playback output, and experimental input lives in `usePlaybackCoordinator`; `App.tsx` should wire controllers and components, not own playback coordination logic.

Tauri commands should only be exposed when used by current runtime UI or intentionally documented as internal/debug; search frontend invoke usage before adding or keeping command registrations.

Avoid adding to `App.tsx` when the new code is:

- more than about 20 lines of feature logic
- an event handler with multiple branches
- a helper that could be unit-tested as a pure function
- a state group with several related refs/effects/handlers
- feature-specific logic for library, playback, queue, persistence, settings, or experimental input

If `App.tsx` grows because of a phase, include a cleanup step in the same phase or immediately after that phase.

When refactoring `App.tsx`:

- keep behavior unchanged unless the task explicitly asks for behavior changes
- move one feature group at a time
- preserve prop names where practical
- keep TypeScript types explicit
- avoid circular imports
- run build checks after the refactor

## Refactor Safety

A refactor is only successful if behavior stays the same.

When extracting code:

- do not change score format
- do not change parser behavior
- do not change key mapping shape
- do not change playback timing behavior
- do not change shuffle/repeat behavior unless explicitly requested
- do not change UI layout unless explicitly requested
- do not add persistence unless the phase asks for it
- do not start experimental input work unless the phase asks for it

After refactoring, explain:

- what moved out of `App.tsx`
- where it moved
- why that file/hook is the right place
- what behavior stayed unchanged
- what was intentionally not refactored yet

## Git Safety

- Do not implement planned work directly on `main`; create or switch to a temporary branch first.
- Do not run destructive Git commands.
- Do not run `git reset --hard`.
- Do not run `git clean -fd`.
- Do not run `git rebase`.
- Do not run `git push --force`.
- Do not commit or push unless the human user explicitly allows it.
- Suggest Git commands for the human user to run instead of doing commits or pushes automatically.
- After finishing the current phase, include the suggested Git commands for the human user to commit, push, merge back to `main`, push `main`, and check final status, so the human user does not need to ask separately.
- At the end of each task, check whether `src-tauri/Cargo.toml` only has line-ending noise. If so, restore it before reporting the final status so it is not accidentally committed.

## Dependency Safety

Ask before adding any dependency.

Before adding a package or crate, explain:

- The dependency name
- Why it is needed
- Whether it is required now
- Whether the same result can be achieved without it
- What risk it adds

Do not add dependencies for polish or convenience during early phases.

## Beginner Explanation Requirement

After each change, explain for a beginner:

- What changed
- Why it changed
- Which files changed
- How to run it
- How to verify it
- Which beginner concepts matter
- What should not be changed yet

## Current Phase Rule

Only implement the current phase.

If a task seems useful but belongs to a later phase, leave it for later and say so clearly.
