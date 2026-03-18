# P3 single-machine finish line v1

Date: 2026-03-19
Scope: define the remaining finish line for the single-machine P3 system only, using the current mainline evidence already recorded in this repo.
Boundary: this note is an acceptance boundary only. It does not reopen P3.1/P3.2/P3.3 implementation, add MCP config/auth/tool-call work, or widen into multi-machine coordination.
References: `notes/p3-status-snapshot-2026-03-19.md`, `notes/p3-single-machine-status-cli-v1.md`, `notes/p3-3-mcp-entry-preview-dogfood-v1.md`, `notes/p3-3-mcp-zero-server-boundary-v1.md`, `scripts/p3_status_snapshot_cli.mjs`, `scripts/mcp_entry_preview.mjs`

---

## 1. Current finish-line call

The single-machine mainline is already at the truthful finish line for its current bounded scope.

That call means:
- P3.1 startup recovery is passed and does not need reopening without fresh defect evidence;
- P3.2 Skills Recall is implemented enough to produce and review bounded packets;
- P3.3 MCP inspect-first entry is implemented enough to stop honestly at `needs-server-selector` on this machine today;
- the remaining unresolved thing is not generic implementation debt, but whether this machine ever gets one real configured MCP server later.

So the finish line is no longer "build the missing layer".
The finish line is "keep the current machine truthfully green, and only open one more bounded pass if the MCP environment changes."

---

## 2. Remaining finish line, exactly

There are only two valid single-machine finish-line states from the current evidence.

### 2.1 State A: current-machine freeze counts as finished

This is the active state right now.
It counts as finished on this machine when all of these stay true:
- `node scripts/p3_status_snapshot_cli.mjs status --validate-live` reports `summary.overall = "single-machine-mainline"`;
- `artifact_status.p31.status = "passed"`;
- `artifact_status.p32.status = "usable"`;
- `artifact_status.p33.status = "implemented"`;
- `live_validation.checks.p33.status = "frozen-zero-server-boundary"`;
- `live_validation.checks.p33.outcome_reason = "no-configured-servers"`.

Interpretation:
- the single-machine system is done enough for its current scope;
- the MCP layer is not broken;
- the machine simply has no configured server to inspect yet.

### 2.2 State B: if the machine gets a real MCP server later

Only one additional bounded finish step is justified if the environment changes.

That step is:
- run one named-server inspect-first pass;
- confirm the preflight command becomes `mcporter list <server> --schema --json`;
- confirm the outcome becomes `schema-inspected`;
- stop again after schema inspection and restate the machine status.

Nothing larger belongs to this finish line.
Even on the future named-server branch, this note does not imply:
- auth flow,
- config mutation,
- daemon management,
- tool calls,
- or full MCP execution.

---

## 3. Acceptance checklist for the machine today

Treat the single-machine system as accepted today only if all of these are true together:

1. Startup recovery has no open live items.
- `artifact_status.p31.startup_state_summary.open_items = 0`
- `live_validation.checks.p31.status = "healthy"`

2. The current bounded helper stack exists.
- P3.2 helper and tests still exist.
- P3.3 helper and tests still exist.
- the single-machine status CLI still exists.

3. The current truthful stop line is machine-checkable.
- `live_validation.checks.p33.server_count = 0`
- `live_validation.checks.p33.preflight_command = "mcporter list --json"`
- `live_validation.checks.p33.outcome_status = "needs-server-selector"`

4. No hidden backlog is smuggled into the finish line.
- zero configured servers is treated as an environment fact, not as proof the layer is unfinished.
- later onboarding work is treated as a new bounded packet, not as retroactive failure of the current machine line.

---

## 4. What does not belong in the single-machine finish line

Do not add any of these to the finish line unless new evidence explicitly forces it:
- reopening the P3.1 pass line;
- redesigning the P3.2 packet shape or review gate;
- redesigning the P3.3 inspect-first packet shape;
- `mcporter auth ...`;
- `mcporter config add|remove|import ...`;
- `mcporter daemon ...`;
- `mcporter call ...`;
- multi-machine sync, shared-cloud-doc flow, or other cross-session coordination.

If one of those becomes necessary, that is a new bounded pass, not proof that the current single-machine system missed its finish line.

---

## 5. Reopen rules

Only reopen the single-machine finish line when one of these triggers appears:

1. Fresh defect evidence in P3.1, P3.2, or P3.3.
- Example: the live status CLI no longer reports `passed / usable / implemented`, or the live check stops producing the expected zero-server packet.

2. A real configured MCP server appears on this machine.
- Then run exactly one named-server schema inspection pass and stop again.

3. 猫爸 explicitly asks for one bounded MCP onboarding/config step.
- Then open that step as new scope rather than pretending it was always part of the current finish line.

Without one of those triggers, hold the line and treat the current machine as stably finished for its bounded scope.

---

## 6. Exact validation checks

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/p3-single-machine-finish-line-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('notes/p3-single-machine-finish-line-v1.md','utf8'); const required=['## 1. Current finish-line call','## 2. Remaining finish line, exactly','## 3. Acceptance checklist for the machine today','## 4. What does not belong in the single-machine finish line','## 6. Exact validation checks']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const mustInclude=['single-machine-mainline','frozen-zero-server-boundary','no-configured-servers','mcporter list --json','mcporter list <server> --schema --json']; for (const token of mustInclude) { if (!text.includes(token)) throw new Error('missing token '+token); } console.log('p3-single-machine-finish-line-note-ok');"
node --test scripts/p3_status_snapshot_cli_test.mjs
node -e "const {spawnSync}=require('child_process'); const run=spawnSync(process.execPath,['scripts/p3_status_snapshot_cli.mjs','status','--validate-live'],{encoding:'utf8'}); if (run.status !== 0) throw new Error(run.stderr || run.stdout); const report=JSON.parse(run.stdout); if (report.summary.overall !== 'single-machine-mainline') throw new Error('wrong overall '+report.summary.overall); if (report.artifact_status?.p31?.status !== 'passed') throw new Error('p31 not passed'); if (report.artifact_status?.p32?.status !== 'usable') throw new Error('p32 not usable'); if (report.artifact_status?.p33?.status !== 'implemented') throw new Error('p33 not implemented'); if (report.artifact_status?.p31?.startup_state_summary?.open_items !== 0) throw new Error('open items not zero'); if (report.live_validation?.checks?.p31?.status !== 'healthy') throw new Error('p31 not healthy'); if (report.live_validation?.checks?.p33?.status !== 'frozen-zero-server-boundary') throw new Error('p33 not frozen-zero-server-boundary'); if (report.live_validation?.checks?.p33?.outcome_status !== 'needs-server-selector') throw new Error('wrong p33 outcome status'); if (report.live_validation?.checks?.p33?.outcome_reason !== 'no-configured-servers') throw new Error('wrong p33 outcome reason'); if (report.live_validation?.checks?.p33?.server_count !== 0) throw new Error('wrong p33 server count'); if (report.live_validation?.checks?.p33?.preflight_command !== 'mcporter list --json') throw new Error('wrong p33 preflight command'); console.log('single-machine-finish-line-live-ok');"
```

Expected results:
- `git diff --check` returns clean output for this note;
- the Node structure check prints `p3-single-machine-finish-line-note-ok`;
- the status CLI test file passes;
- the live assertion check prints `single-machine-finish-line-live-ok`.

---

## 7. Work log

- `2026-03-19 02:18 +08`: re-read the current single-machine P3 snapshot, zero-server boundary note, dogfood note, and status CLI note to anchor the finish line to existing evidence only.
- `2026-03-19 02:21 +08`: wrote this note to collapse the remaining single-machine question into one acceptance rule: hold the zero-server freeze as finished now, and only reopen for a real server or fresh defect evidence.

## 8. Exact files changed

- `notes/p3-single-machine-finish-line-v1.md`

Author: Q xiaohu
Version: v1
