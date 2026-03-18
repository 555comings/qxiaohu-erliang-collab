# P3 default entry v1

Date: 2026-03-19
Scope: one bounded operator note for how future Q xiaohu should enter the current single-machine P3 mainline by default.
Boundary: this note uses the current status CLI and existing P3 artifacts only. It does not reopen P3.1, redesign P3.2 or P3.3, add MCP config, or widen into later execution layers.
References: `scripts/p3_status_snapshot_cli.mjs`, `scripts/p3_status_snapshot_cli_test.mjs`, `notes/p3-single-machine-status-cli-v1.md`, `notes/p3-status-snapshot-2026-03-19.md`, `notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md`, `notes/p3-2-skills-recall-operator-flow-v1.md`, `notes/p3-3-mcp-zero-server-boundary-v1.md`

---

## 1. Default entry command

Run from `qxiaohu-erliang-collab/`.

Default command:

```powershell
node scripts/p3_status_snapshot_cli.mjs status --validate-live
```

Fast orientation-only fallback:

```powershell
node scripts/p3_status_snapshot_cli.mjs status
```

Default rule:
- use `--validate-live` when deciding what the machine truth is right now;
- use artifact-only mode only when you need a quick read of the stored P3 stack and do not want to treat environment state as proven.

---

## 2. How to read the output

### 2.1 Read the top line first

The top line is:
- `summary.overall`
- `summary.current_call`

Current healthy read:
- `summary.overall = "single-machine-mainline"`
- `summary.current_call = "P3.1 passed, P3.2 usable, P3.3 implemented and currently frozen at the zero-server boundary on this machine."`

If either one drifts, stop treating the old snapshot as current truth.

### 2.2 Read artifact status second

These fields tell you whether the known P3 stack still exists on disk:
- `artifact_status.p31.status`
- `artifact_status.p32.status`
- `artifact_status.p33.status`
- `artifact_status.snapshot_note`

Current expected artifact read:
- `artifact_status.snapshot_note = "notes/p3-status-snapshot-2026-03-19.md"`
- `artifact_status.p31.status = "passed"`
- `artifact_status.p32.status = "usable"`
- `artifact_status.p33.status = "implemented"`

Interpretation:
- `passed` for P3.1 means the startup-recovery pass artifacts still exist and the saved state has no open items;
- `usable` for P3.2 means the Skills Recall helper, tests, and operator artifacts are present;
- `implemented` for P3.3 means the inspect-first MCP helper stack exists, even though the current machine still stops at the zero-server boundary.

### 2.3 Read live validation last

Only `status --validate-live` gives you the machine read you should act on.

Current expected live read:
- `live_validation.checks.p31.status = "healthy"`
- `live_validation.checks.p31.doctor_ok = true`
- `live_validation.checks.p31.open_count = 0`
- `live_validation.checks.p32.status = "usable"`
- `live_validation.checks.p32.candidate_count >= 1`
- `live_validation.checks.p33.status = "frozen-zero-server-boundary"`
- `live_validation.checks.p33.outcome_status = "needs-server-selector"`
- `live_validation.checks.p33.outcome_reason = "no-configured-servers"`
- `live_validation.checks.p33.server_count = 0`
- `live_validation.checks.p33.preflight_command = "mcporter list --json"`

Interpretation:
- P3.1 is quiet and does not need reopening;
- P3.2 still has a runnable recall path;
- P3.3 is implemented, but the truthful current-machine stop line is still no configured MCP servers.

---

## 3. Default operator path after the check

If the live report matches the expected current read, use this as the default mainline:
1. treat P3.1 as passed and closed unless fresh defect evidence appears;
2. treat P3.2 as usable when you need the small support packet for a bounded task;
3. treat P3.3 as frozen at the zero-server boundary and do not force config, auth, daemon, or tool-call work.

Read these artifacts only when you need deeper layer detail:
- P3.1 anchor: `notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md`
- P3.2 anchor: `notes/p3-2-skills-recall-operator-flow-v1.md`
- P3.3 anchor: `notes/p3-3-mcp-zero-server-boundary-v1.md`
- single-page status anchor: `notes/p3-status-snapshot-2026-03-19.md`

Shortcut rule:
- use the CLI to enter;
- use the snapshot note to explain;
- use the layer note only when the CLI shows drift or the task needs that specific layer.

---

## 4. When to stop or escalate

Stop and escalate instead of continuing the default mainline if any of these happens:

1. The command itself fails.
- non-zero exit code, non-JSON output, or broken stderr means the status entry path is not trustworthy yet.

2. The top-line call drifts.
- `summary.overall` is not `single-machine-mainline`, or
- `summary.current_call` no longer matches the current known stop line.

3. Any artifact status drifts.
- `artifact_status.p31.status != "passed"`
- `artifact_status.p32.status != "usable"`
- `artifact_status.p33.status != "implemented"`

4. P3.1 is no longer healthy.
- `live_validation.checks.p31.status != "healthy"`, or
- `live_validation.checks.p31.open_count != 0`
- In that case, bounce to the P3.1 startup-recovery path first. Do not use this note to guess around broken execution truth.

5. P3.2 is no longer usable.
- `live_validation.checks.p32.status != "usable"`, or
- `live_validation.checks.p32.candidate_count < 1`
- In that case, stop and repair or review the Skills Recall helper path before continuing.

6. P3.3 is no longer at the current zero-server boundary.
- `live_validation.checks.p33.outcome_reason != "no-configured-servers"`, or
- `live_validation.checks.p33.server_count > 0`, or
- `live_validation.checks.p33.status = "schema-inspected"`
- In that case, the machine has crossed into a new MCP condition. Open one new bounded named-server inspect packet and stop again after schema inspection.

7. The next requested step is wider than inspection-first status.
- MCP auth, config edits, daemon control, ad-hoc server setup, or any real `mcporter call` is later-scope work.
- Open a new bounded pass instead of treating it as part of this default entry note.

---

## 5. Exact validation checks

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/p3-default-entry-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('notes/p3-default-entry-v1.md','utf8'); const required=['## 1. Default entry command','## 2. How to read the output','## 3. Default operator path after the check','## 4. When to stop or escalate','## 5. Exact validation checks']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const mustInclude=['node scripts/p3_status_snapshot_cli.mjs status --validate-live','single-machine-mainline','needs-server-selector','no-configured-servers','mcporter list --json']; for (const token of mustInclude) { if (!text.includes(token)) throw new Error('missing token '+token); } console.log('p3-default-entry-note-ok');"
node --test scripts/p3_status_snapshot_cli_test.mjs
node -e "const {spawnSync}=require('child_process'); const run=spawnSync('node',['scripts/p3_status_snapshot_cli.mjs','status','--validate-live'],{encoding:'utf8'}); if (run.status !== 0) throw new Error(run.stderr || run.stdout); const parsed=JSON.parse(run.stdout); const checks=[['summary.overall',parsed.summary?.overall,'single-machine-mainline'],['artifact_status.p31.status',parsed.artifact_status?.p31?.status,'passed'],['artifact_status.p32.status',parsed.artifact_status?.p32?.status,'usable'],['artifact_status.p33.status',parsed.artifact_status?.p33?.status,'implemented'],['live_validation.checks.p31.status',parsed.live_validation?.checks?.p31?.status,'healthy'],['live_validation.checks.p33.status',parsed.live_validation?.checks?.p33?.status,'frozen-zero-server-boundary'],['live_validation.checks.p33.outcome_status',parsed.live_validation?.checks?.p33?.outcome_status,'needs-server-selector'],['live_validation.checks.p33.outcome_reason',parsed.live_validation?.checks?.p33?.outcome_reason,'no-configured-servers'],['live_validation.checks.p33.preflight_command',parsed.live_validation?.checks?.p33?.preflight_command,'mcporter list --json']]; for (const [label,actual,expected] of checks) { if (actual !== expected) throw new Error(label+' expected '+expected+' got '+actual); } if ((parsed.live_validation?.checks?.p31?.open_count ?? null) !== 0) throw new Error('expected p31 open_count=0'); if ((parsed.live_validation?.checks?.p32?.candidate_count ?? 0) < 1) throw new Error('expected p32 candidate_count>=1'); if ((parsed.live_validation?.checks?.p33?.server_count ?? null) !== 0) throw new Error('expected p33 server_count=0'); console.log('p3-default-entry-live-ok');"
```

Expected results:
- `git diff --check` returns clean output for this note;
- the structure check prints `p3-default-entry-note-ok`;
- the test file passes;
- the live CLI check prints `p3-default-entry-live-ok`.

---

## 6. Work log

- `2026-03-19 02:18 +08`: read the current status CLI note, the latest single-page P3 snapshot, and the live CLI output to lock the default entry path to the current machine truth.
- `2026-03-19 02:20 +08`: wrote this note as the default operator entry for the single-machine P3 mainline so future status checks start from one command instead of note-hunting.

## 7. Exact files changed

- `notes/p3-default-entry-v1.md`

Author: Q xiaohu
Version: v1
