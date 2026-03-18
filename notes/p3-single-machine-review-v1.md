# P3 single-machine review v1

Date: 2026-03-19
Scope: code-review-style audit of the current single-machine mainline after the new status CLI.
Boundary: findings focus on behavioral bugs, regressions, and testing gaps in the current implementation. No existing project files were edited for this review.
Reviewed files: `scripts/p3_status_snapshot_cli.mjs`, `scripts/p3_status_snapshot_cli_test.mjs`, `scripts/startup_recovery_check.mjs`, `scripts/startup_recovery_check_test.mjs`, `scripts/skills_recall_preview.mjs`, `scripts/skills_recall_preview_test.mjs`, `scripts/mcp_entry_preview.mjs`, `scripts/mcp_entry_preview_test.mjs`

---

## Findings

### 1. High - P3.1 can be reported as passed even when a required P3.1 artifact is missing
- File refs: `scripts/p3_status_snapshot_cli.mjs:111`, `scripts/p3_status_snapshot_cli.mjs:127`
- `collectArtifactStatus()` builds one shared `existing` set for all P3.1/P3.2/P3.3 paths, but the P3.1 pass/fail gate uses `existing.size >= p31Paths.length` instead of checking that every P3.1 path exists.
- That means any four existing files anywhere in the combined artifact list are enough to mark `artifact_status.p31.status = "passed"`, even if one of the required P3.1 files is absent.
- Repro: in a disposable repo copy, removing `notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md` still left the CLI reporting `artifact_status.p31.status = "passed"` while `required_artifacts` correctly showed that file as `exists: false`.
- Risk: the CLI can silently hide missing startup-recovery evidence and overstate the health of the single-machine mainline.

### 2. Medium - the one-line status call is hardcoded and can contradict the computed report
- File refs: `scripts/p3_status_snapshot_cli.mjs:194`, `scripts/p3_status_snapshot_cli.mjs:196`
- `summary.current_call` is always emitted as `P3.1 passed, P3.2 usable, P3.3 implemented...` regardless of what `artifact_status` or `live_validation` actually found.
- Repro: in a disposable repo copy, removing `scripts/skills_recall_preview.mjs` changed `artifact_status.p32.status` to `"partial"`, but the top-line summary still claimed `P3.2 usable`.
- This undermines the main reason the CLI exists: the shortest answer can be stale or wrong while the detailed section says the opposite.
- Risk: operators who trust only the summary line can make the wrong call on whether the mainline is still intact.

### 3. Medium - artifact-only mode crashes instead of degrading to `needs-review` when startup state is missing
- File refs: `scripts/p3_status_snapshot_cli.mjs:120`, `scripts/p3_status_snapshot_cli.mjs:189`
- The CLI already checks file existence for the startup state, but then unconditionally calls `loadJson()` on `notes/startup-recovery-state.json`.
- Repro: in a disposable repo copy, removing `notes/startup-recovery-state.json` made `node scripts/p3_status_snapshot_cli.mjs status` exit with `ENOENT` instead of returning a structured report with `p31.status = "needs-review"`.
- The same failure mode applies to malformed JSON in that file.
- Risk: the status command is least usable in the exact scenario where operators most need a resilient diagnostic.

### 4. Low - tests only cover the happy-path artifact snapshot, so the regressions above stay green
- File refs: `scripts/p3_status_snapshot_cli_test.mjs:36`, `scripts/p3_status_snapshot_cli_test.mjs:49`
- The status CLI has one test, and it only asserts the current repo's artifact-only pass state.
- There is no isolated coverage for missing P3.1 artifacts, summary drift versus computed status, missing/corrupt `notes/startup-recovery-state.json`, or `status --validate-live` behavior.
- Because of that, all three issues above can ship while `node --test scripts/p3_status_snapshot_cli_test.mjs` still passes.

## Open questions / assumptions

- I assumed the CLI is supposed to stay truthful under degraded artifacts because the note in `notes/p3-single-machine-status-cli-v1.md` describes it as the one-command source of truth for current machine status.
- I treated disposable copy repros as valid because the bugs are in the CLI's decision logic, not in any external dependency.

## Validation

Commands run in the real repo:
- `node --test scripts/p3_status_snapshot_cli_test.mjs scripts/startup_recovery_check_test.mjs scripts/skills_recall_preview_test.mjs scripts/mcp_entry_preview_test.mjs`
- `node scripts/p3_status_snapshot_cli.mjs status --validate-live`

Disposable-copy repros used for findings:
- remove one required P3.1 artifact, then run `node scripts/p3_status_snapshot_cli.mjs status`
- remove `scripts/skills_recall_preview.mjs`, then run `node scripts/p3_status_snapshot_cli.mjs status`
- remove `notes/startup-recovery-state.json`, then run `node scripts/p3_status_snapshot_cli.mjs status`

## Change summary

- Added this review note only: `notes/p3-single-machine-review-v1.md`
