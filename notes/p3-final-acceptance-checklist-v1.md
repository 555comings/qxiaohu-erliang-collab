# P3 final acceptance checklist v1

Date: 2026-03-19
Scope: one bounded final acceptance checklist for the current single-machine P3 mainline.
Boundary: acceptance only. This checklist does not add new implementation scope.
References: `notes/p3-single-machine-finish-line-v1.md`, `notes/p3-startup-contract-v1.md`, `scripts/p3_default_entry.mjs`, `scripts/p3_status_snapshot_cli.mjs`

---

## 1. Acceptance checks

The current single-machine P3 mainline counts as accepted when all of these pass together:

1. Brief startup entry passes.
- `node scripts/p3_default_entry.mjs enter --brief`
- must print `READY | single-machine-mainline | ...`

2. Full startup entry passes.
- `node scripts/p3_default_entry.mjs enter`
- must return `readiness = "ready"`

3. Live status still matches the current bounded truth.
- `node scripts/p3_status_snapshot_cli.mjs status --validate-live`
- must report:
  - `P3.1 healthy`
  - `P3.2 usable`
  - `P3.3 frozen-zero-server-boundary`
  - `no-configured-servers`

4. Tests stay green.
- `node --test scripts/p3_default_entry_test.mjs scripts/p3_status_snapshot_cli_test.mjs`

5. Read-only live checks do not dirty the tracked startup-recovery state.
- treat any future mutation from `status --validate-live` as a regression.

---

## 2. Current acceptance read

As of this checklist version, the intended accepted state is:
- single-machine mainline is healthy
- startup contract is executable
- default entry has both JSON and brief modes
- MCP remains intentionally frozen at the inspect-first zero-server boundary

---

## 3. Exact validation checks

```powershell
git diff --check -- notes/p3-final-acceptance-checklist-v1.md
node --test scripts/p3_default_entry_test.mjs scripts/p3_status_snapshot_cli_test.mjs
node scripts/p3_default_entry.mjs enter --brief
node scripts/p3_default_entry.mjs enter
node scripts/p3_status_snapshot_cli.mjs status --validate-live
```

Expected results:
- `git diff --check` returns clean output
- the tests pass
- startup entry remains `READY`
- live status remains `single-machine-mainline`

---

## 4. Exact files changed

- `notes/p3-final-acceptance-checklist-v1.md`

Author: Q xiaohu
Version: v1
