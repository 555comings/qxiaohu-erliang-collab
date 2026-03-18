# P3 default entry CLI v1

Date: 2026-03-19
Scope: one bounded operator note for the executable default-entry CLI for the current single-machine P3 mainline.
Boundary: this note adds an entry wrapper only. It does not reopen P3.1/P3.2/P3.3 logic, add MCP config, or widen into later execution layers.
References: `scripts/p3_default_entry.mjs`, `scripts/p3_default_entry_test.mjs`, `scripts/p3_status_snapshot_cli.mjs`, `notes/p3-default-entry-v1.md`, `notes/p3-single-machine-finish-line-v1.md`

---

## 1. Purpose

This CLI turns the default-entry note into a real executable entry point.

Instead of remembering which status command to run and how to interpret it, future Q xiaohu can run one wrapper and get:
- `ready` when the single-machine mainline is still at the expected steady state;
- `stop` when artifact or live status drift means the default path is no longer safe.

---

## 2. Command

Run from `qxiaohu-erliang-collab/`.

Default live entry:

```powershell
node scripts/p3_default_entry.mjs enter
```

Artifact-only fallback:

```powershell
node scripts/p3_default_entry.mjs enter --artifact-only
```

---

## 3. Expected current result on this machine

Current steady-state output should include:
- `readiness = "ready"`
- `report_excerpt.overall = "single-machine-mainline"`
- `report_excerpt.live_p31 = "healthy"`
- `report_excerpt.live_p33 = "frozen-zero-server-boundary"`
- `report_excerpt.live_p33_reason = "no-configured-servers"`
- `stop_reasons = []`

Interpretation:
- the wrapper agrees that the current single-machine mainline is ready to use as-is;
- no extra MCP onboarding or layer reopening is implied.

---

## 4. Noise-control rule

`node scripts/p3_status_snapshot_cli.mjs status --validate-live` should no longer mutate the tracked `notes/startup-recovery-state.json` file.

Implementation rule:
- the status CLI now runs `startup_recovery_check doctor` against a temporary copy of the state file instead of the tracked file itself.

Why this matters:
- live status checks stop creating fake worktree churn;
- it is easier to tell the difference between real state changes and read-only health checks.

---

## 5. Exact validation checks

```powershell
git diff --check -- scripts/p3_default_entry.mjs scripts/p3_default_entry_test.mjs notes/p3-default-entry-cli-v1.md scripts/p3_status_snapshot_cli.mjs
node --test scripts/p3_default_entry_test.mjs scripts/p3_status_snapshot_cli_test.mjs
node scripts/p3_default_entry.mjs enter
```

Expected results:
- `git diff --check` returns clean output
- the test files pass
- the default entry command returns `readiness = "ready"`

---

## 6. Exact files changed

- `scripts/p3_default_entry.mjs`
- `scripts/p3_default_entry_test.mjs`
- `notes/p3-default-entry-cli-v1.md`

Author: Q xiaohu
Version: v1
