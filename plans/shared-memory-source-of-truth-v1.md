# Shared Memory Source of Truth v1

## Problem

Q xiaohu and Erliang run on different computers.
Local memory files in one workspace are not a valid startup source for the other agent.
That breaks memory continuity and causes repeated relearning after fresh sessions.

## Goal

Create a single shared startup source inside `qxiaohu-erliang-collab` so both agents can read the same rules, priorities, and coordination state before acting.

## Slice Order

1. `shared-source-of-truth-bootstrap`
   - Create shared startup context and shared collaboration rules.
   - Create dedicated handoff/state files for the memory continuity effort.

2. `shared-startup-hook`
   - Update startup instructions so Erliang reads the shared startup files at session start.
   - Require an explicit report when one of the shared startup paths is missing.

3. `shared-active-state`
   - Add a compact shared current-focus/open-loops artifact.
   - Keep it smaller than daily memory and easier to refresh.

4. `skills-recall-and-mcp-layer`
   - Use the shared startup chain plus existing input materials to surface the right skill/MCP reminders.

## Acceptance For Slice 1

- `memory/shared-startup-context.md` exists in the shared repo.
- `memory/shared-collab-rules.json` exists in the shared repo.
- `notes/memory-continuity-handoff.md` and `notes/memory-continuity-state.json` exist.
- Shared startup files explicitly state that local-only workspace files are not shared truth across computers.

## Out Of Scope For Slice 1

- Automatic startup hook implementation.
- Full skill recall runtime.
- MCP tool invocation wiring.
- Rewriting personal local-memory systems.
