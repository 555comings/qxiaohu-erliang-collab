# P3 single-machine status CLI v1

Date: 2026-03-19
Scope: one bounded operator note for the single-machine P3 status CLI.
Boundary: this note documents status reporting only. It does not reopen P3.1, redesign P3.2/P3.3, or start MCP onboarding.
References: `scripts/p3_status_snapshot_cli.mjs`, `scripts/p3_status_snapshot_cli_test.mjs`, `notes/p3-status-snapshot-2026-03-19.md`, `notes/p3-3-mcp-zero-server-boundary-v1.md`

---

## 1. Purpose

This CLI compresses the current single-machine P3 line into one command so status checks no longer depend on manual note-hunting.

It answers three questions in one JSON report:
- is P3.1 still passed on the current machine?
- is P3.2 still usable from real artifacts?
- is P3.3 still truthfully frozen at the zero-server boundary?

---

## 2. Command

Run from `qxiaohu-erliang-collab/`.

```powershell
node scripts/p3_status_snapshot_cli.mjs status --validate-live
```

Fast artifact-only mode:

```powershell
node scripts/p3_status_snapshot_cli.mjs status
```

---

## 3. Expected current result on this machine

- `summary.current_call` says `P3.1 passed, P3.2 usable, P3.3 implemented and currently frozen at the zero-server boundary on this machine.`
- `artifact_status.p31.status = "passed"`
- `artifact_status.p32.status = "usable"`
- `artifact_status.p33.status = "implemented"`
- `live_validation.checks.p33.status = "frozen-zero-server-boundary"`
- `live_validation.checks.p33.outcome_reason = "no-configured-servers"`

---

## 4. Why this exists

Before this CLI, answering `where exactly is the single-machine mainline now` required re-reading multiple P3 notes and helper outputs.

After this CLI:
- one command returns the current call;
- artifact presence and live helper state are both visible;
- the zero-server boundary is machine-checkable instead of only narrative.

---

## 5. Exact validation checks

```powershell
git diff --check -- scripts/p3_status_snapshot_cli.mjs scripts/p3_status_snapshot_cli_test.mjs notes/p3-single-machine-status-cli-v1.md
node --test scripts/p3_status_snapshot_cli_test.mjs
node scripts/p3_status_snapshot_cli.mjs status --validate-live
```

Expected results:
- `git diff --check` returns clean output
- the test file passes
- the live report shows `p33.status = "frozen-zero-server-boundary"`

---

## 6. Exact files changed

- `scripts/p3_status_snapshot_cli.mjs`
- `scripts/p3_status_snapshot_cli_test.mjs`
- `notes/p3-single-machine-status-cli-v1.md`

Author: Q xiaohu
Version: v1
