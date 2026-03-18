# Shared Startup Hook v1

Date: 2026-03-19
Owner: Q xiaohu
Scope: add a minimal executable startup recovery entry so fresh sessions can recover the shared cross-computer memory chain before guessing.

## Problem

The shared memory bootstrap files already exist, but the startup hook slice was still only a plan.
That means Erliang could still wake up, skip the shared source-of-truth files, and fall back to stale habits or local-only assumptions.

## Change

Repurpose `scripts/wakeup-memory-scan.mjs` into the shared startup recovery entry.
The command now reads the shared startup files in a fixed order:

1. `memory/shared-startup-context.md`
2. `memory/shared-collab-rules.json`
3. `memory/shared-active-state.json`
4. `notes/memory-continuity-handoff.md`
5. `notes/memory-continuity-state.json`
6. `notes/p1-skills-recall-input.md`
7. `notes/p2-mcp-activation-input.md`

If any path is missing, the command reports the missing path and stops instead of guessing.
If all files exist, it emits a compact recovery summary with:
- current slice
- next owner
- active focus
- open loops
- do-now items
- latest handoff change
- default recovery command

## Default command

```powershell
node scripts/wakeup-memory-scan.mjs recover --brief
```

Use this as the first shared-memory recovery step for fresh cross-computer sessions.
Then run the non-brief version when you need the structured JSON summary.

## Acceptance

- `scripts/wakeup-memory-scan.mjs` reads the shared startup chain instead of local-only memory files.
- `scripts/wakeup-memory-scan.mjs recover --brief` prints a one-line shared recovery summary.
- Missing shared startup files produce a stop result with explicit missing paths.
- `scripts/wakeup-memory-scan_test.mjs` covers success, missing-path stop, and brief mode.

## Validation

```powershell
node --test scripts/wakeup-memory-scan_test.mjs
node scripts/wakeup-memory-scan.mjs recover --brief
node scripts/wakeup-memory-scan.mjs recover
```
