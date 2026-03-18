# Shared Startup Context

This file is the shared cross-computer startup source for Q xiaohu and Erliang.
Read this before starting work that depends on shared memory or collaboration rules.

## Read Order

1. `memory/shared-startup-context.md`
2. `memory/shared-collab-rules.json`
3. `memory/shared-active-state.json`
4. `notes/memory-continuity-handoff.md`
5. `notes/memory-continuity-state.json`
6. `notes/p1-skills-recall-input.md`
7. `notes/p2-mcp-activation-input.md`

If one of these paths is missing, report the missing path and stop guessing.
Do not create a substitute file unless explicitly asked.

## Default Startup Recovery Command

Run this first in a fresh shared-memory session:

`node scripts/wakeup-memory-scan.mjs recover --brief`

If you need the structured recovery payload, run:

`node scripts/wakeup-memory-scan.mjs recover`

## Current Reality

- Q xiaohu and Erliang run on different computers.
- Local workspace files are not shared truth unless they are committed into this repo or another shared store.
- The control-center readonly UI first slice is complete in branch `openclaw-control-center` at commit `36bda65`.
- The latest shared coordination fix for the old control-center handoff is on `main` at commit `f23eb30`.

## Active Priority

The main engineering problem is memory continuity across fresh sessions.
The immediate goal is to make both agents start from the same shared recovery command and the same shared startup files before acting.

## Current Slice

- Slice: `shared-startup-hook`
- Owner: `Q xiaohu`
- Support: `Erliang`
- Status: `implemented`

## Working Rules

- Shared files are the default coordination path.
- Use chat only for human decisions, approvals, or blocking alerts.
- If git conflict appears in shared work, stop first and escalate.
- Erliang should not independently resolve shared-work git conflicts or run destructive recovery commands.

## Next Engineering Order

1. Verify that fresh Erliang sessions actually run the shared recovery command.
2. Require a short startup recovery confirmation against the shared active-state file.
3. Layer in Skills recall and MCP activation on top of the shared startup chain.
4. Treat any missing shared startup path as a stop condition, not a cue to guess.
