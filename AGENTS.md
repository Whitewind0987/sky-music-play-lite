# AGENTS.md

This file defines the working rules for Codex and other AI agents in this
project. Follow these rules before changing code.

## Fixed Stack

SkyMusicPlay Lite must use this stack:

- Tauri v2
- React
- TypeScript
- Rust
- Vite
- Git and GitHub
- Windows first

Do not replace this stack unless the human user explicitly changes the project
direction.

## Development Style

- Build the project in small, phase-by-phase steps.
- Do one small thing, make it runnable or clearly verifiable, explain it, then
  stop.
- Do not redesign the master phase plan.
- Do not implement future phase features early.
- Do not perform large refactors unless the human user explicitly asks for one.
- Keep the `main` branch runnable.
- Stop after each phase and wait for human confirmation before continuing.

## Git Safety

- Do not run destructive Git commands.
- Do not run `git reset --hard`.
- Do not run `git clean -fd`.
- Do not run `git rebase`.
- Do not run `git push --force`.
- Do not commit or push unless the human user explicitly allows it.
- Suggest Git commands for the human user to run instead of doing commits or
  pushes automatically.

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

If a task seems useful but belongs to a later phase, leave it for later and say
so clearly.
