# P3.2 Skills Recall v1

Scope: define the first bounded retrieval layer that runs after P3.1 startup recovery has already restored execution truth.
Baseline: P3.1 is treated as passed/done-enough per `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`; this note does not reopen runtime, cron, delivery, gateway, or MCP implementation scope.
References: `plans/p3-1-startup-recovery-confirmation-v1.md`, `plans/p3-1-startup-recovery-done-enough-gate-v1.md`, `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`, `notes/startup-recovery-state.json`, `outputs/execution-checklist-v2.md`, `outputs/stage3-retrospective-v1.md`, `AGENTS.md`, `TOOLS.md`, `memory/qxiaohu-collab-rules.json`

---

## 1. One-line goal

Once startup recovery identifies the real active work, Skills Recall should surface the smallest set of reusable instructions, checklists, and local notes needed to continue that work accurately without pretending to own execution-state recovery.

---

## 2. Recall sources

Skills Recall should search sources in this priority order and stop once it has enough context to act.

### 2.1 Source tier S0: recovered active-item evidence

Use the hottest item already selected by P3.1 as the first retrieval anchor.

Read from:
- `notes/startup-recovery-state.json`
- the recovered item's `title`
- the recovered item's `notes`
- the recovered item's `expected_artifacts`
- the recovered item's `evidence[].path`
- the recovered item's `evidence[].command`

Why this tier comes first:
- it is the most task-specific signal already tied to real execution evidence
- it prevents Skills Recall from drifting into generic advice that does not match the live item

### 2.2 Source tier S1: workspace operating notes

Use local operating notes when the recovered item implies environment-specific behavior.

Read from:
- `AGENTS.md`
- `TOOLS.md`
- `memory/qxiaohu-collab-rules.json`

Use this tier for:
- startup rules that affect how work is resumed
- local device/tool facts kept outside shared skills
- collaboration guardrails such as handoff package requirements and rework rules

### 2.3 Source tier S2: repo-local runbooks and checklists

Use repo-local artifacts when the recovered item points at a known workflow already described inside the collaboration repo.

Candidate sources:
- `outputs/execution-checklist-v2.md`
- `outputs/stage3-retrospective-v1.md`
- the exact file paths named by the active item's `expected_artifacts`
- the most directly related plan or note under `plans/` or `notes/`

Use this tier for:
- handoff structure
- validation habits
- workflow-specific cautions already written down in the project

### 2.4 Source tier S3: installed skill instructions

Use one installed `SKILL.md` only when the recovered item or the user's wording clearly points to a specific tool/domain.

Examples:
- Feishu docs/wiki/drive/share work -> the matching Feishu skill
- security audit/hardening/version posture -> `healthcheck`
- weather request -> `weather`
- MCP server/tool work -> `mcporter`
- skill authoring/audit -> `skill-creator`

Rules for this tier:
- choose the single most specific matching skill first
- do not read multiple skills up front unless a later conflict proves the first match was insufficient
- installed skill guidance is supplemental; it does not replace repo-local workflow rules

### 2.5 Source tier S4: baseline context already loaded by startup

`SOUL.md`, `USER.md`, and the routine startup memory files remain valid context, but they are not counted as new Skills Recall hits unless the active item explicitly depends on them.

Reason:
- P3.2 is about recovering actionable skill context, not repeating the full startup read every time

### 2.6 Hard cap

The first bounded pass should recall at most 3 sources for one item:
- 1 anchor from S0
- up to 1 local operating/runbook source from S1 or S2
- up to 1 installed skill from S3

If nothing crosses the trigger bar, return an explicit no-extra-recall result instead of padding with generic files.

---

## 3. Recall triggers

Skills Recall should run only when at least one concrete trigger fires.

### 3.1 Trigger T1: active-item resume

Fire when P3.1 `doctor`, `resume`, or `resume-hottest` identifies a hottest open item.

Signals:
- `summary.openCount > 0`
- `nextAction.kind = resume-hottest`
- a recovered item id, title, or expected artifact path is available

### 3.2 Trigger T2: artifact-path match

Fire when the recovered item references a path that implies a known workflow.

Examples:
- `plans/` or `notes/` -> planning/review/handoff context
- `scripts/` -> command/test/validation context
- `outputs/` -> checklist/review package context
- root files such as `AGENTS.md` or `TOOLS.md` -> workspace operating context

### 3.3 Trigger T3: domain or tool hint

Fire when the recovered item or the latest user request contains domain words that map to a specific skill or runbook.

Examples:
- `Feishu`, `wiki`, `doc`, `drive`, `share`
- `review`, `handoff`, `validate`
- `weather`, `forecast`
- `security`, `hardening`, `exposure`
- `MCP`, `server`, `tool config`

### 3.4 Trigger T4: mandatory protocol gap

Fire when the next action would be risky without a reusable checklist or rule.

Examples:
- a review/handoff is about to happen and the handoff package has not been surfaced yet
- a rework loop is active and ETA/readability rules matter
- a skill/tool action is about to run and local operating notes are likely required

### 3.5 Trigger T5: explicit user pull

Fire when the user explicitly asks for the skill, runbook, checklist, or "what should I read before doing this" context.

### 3.6 Trigger precedence

Use this order:
1. T1 active-item resume
2. T2 artifact-path match
3. T3 domain or tool hint
4. T4 mandatory protocol gap
5. T5 explicit user pull

Why this order:
- evidence from the recovered item beats free-floating keyword matches
- explicit user asks still matter, but they should attach to the live work when possible

---

## 4. Minimum output shape

Skills Recall should return a small structured packet, not a long narrative.

Required top-level fields:
- `trigger`: which trigger fired first
- `active_item`: the recovered item or fresh task anchor
- `recall_candidates`: zero to three sources
- `boundary`: explicit statement that P3.1 still owns execution truth

Required `active_item` fields:
- `id`
- `title`
- `state`
- `owner`
- `artifact_hint` (nullable)

Required fields for each entry in `recall_candidates`:
- `source_path`
- `source_kind` (`active-item-evidence | workspace-note | collab-runbook | installed-skill`)
- `why_recalled`
- `required_before_action` (`true | false`)
- `matched_from` (for example `title`, `expected_artifacts`, `user_request`, `evidence_path`)

Required `boundary` fields:
- `startup_recovery_status`
- `does_not_update_promise_state`
- `does_not_override_hottest_item`
- `does_not_start_external_actions`

### 4.1 Example minimal packet

```json
{
  "trigger": "active-item-resume",
  "active_item": {
    "id": "p3-2-skills-recall-v1",
    "title": "Define the first Skills Recall packet",
    "state": "started",
    "owner": "qxiaohu",
    "artifact_hint": "plans/p3-2-skills-recall-v1.md"
  },
  "recall_candidates": [
    {
      "source_path": "AGENTS.md",
      "source_kind": "workspace-note",
      "why_recalled": "The recovered work depends on startup and collaboration rules already defined for this workspace.",
      "required_before_action": true,
      "matched_from": ["artifact_hint", "workflow_type"]
    },
    {
      "source_path": "outputs/execution-checklist-v2.md",
      "source_kind": "collab-runbook",
      "why_recalled": "The active item ends in a handoff-ready plan and needs the standard handoff package.",
      "required_before_action": true,
      "matched_from": ["workflow_type", "mandatory_protocol_gap"]
    }
  ],
  "boundary": {
    "startup_recovery_status": "already decided by P3.1",
    "does_not_update_promise_state": true,
    "does_not_override_hottest_item": true,
    "does_not_start_external_actions": true
  }
}
```

### 4.2 No-match packet

If no source qualifies, return:
- the same `trigger` and `active_item`
- `recall_candidates: []`
- a boundary block showing that no extra skill context was required

This is a valid outcome.

---

## 5. Boundary with P3.1 startup recovery

### 5.1 What P3.1 still owns

P3.1 remains the owner of:
- pending promise creation, updates, and closure
- evidence collection and state transitions
- `intent | started | in_progress | done` judgment
- `watch` and `stalled` detection
- hottest-item selection
- ETA tracking and recovery truth before any front-channel status reply

### 5.2 What P3.2 owns

P3.2 only owns:
- selecting the smallest useful set of reusable instructions after the active item is known
- explaining why each source was recalled
- marking which recalled sources are mandatory before action versus optional support

### 5.3 What P3.2 must not do

The first bounded pass must not do any of the following:
- change `notes/startup-recovery-state.json`
- create or close promises
- redefine P3.1 state semantics
- invent new cron or delivery behavior
- make OpenClaw gateway changes
- implement MCP implementation details
- perform unrelated memory cleanup

### 5.4 Execution order

The intended order is:
1. P3.1 `doctor` or `resume-hottest` restores the real work anchor.
2. P3.2 Skills Recall surfaces the supporting sources for that anchor.
3. Execution proceeds using the recalled context.
4. P3.1 later records new evidence and closes the item when done.

### 5.5 Failure boundary

If P3.1 reports structural errors, stale state ambiguity, or no trustworthy hottest item, stop at P3.1.
Do not let Skills Recall paper over missing execution truth.

---

## 6. Done-enough line for this first pass

This first Skills Recall pass counts as done enough once all of the following are true:
- recall sources are ordered and bounded
- recall triggers are explicit
- the minimum output shape is fixed
- the boundary with P3.1 is explicit
- validation checks prove the note contains the required sections and the current startup-recovery snapshot is still healthy

Anything beyond that belongs to later implementation work.

---

## 7. Exact validation checks

Run these checks from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- plans/p3-2-skills-recall-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('plans/p3-2-skills-recall-v1.md','utf8'); const required=['## 2. Recall sources','## 3. Recall triggers','## 4. Minimum output shape','## 5. Boundary with P3.1 startup recovery','## 7. Exact validation checks']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const boundaryTokens=['invent new cron or delivery behavior','make OpenClaw gateway changes','implement MCP implementation details']; for (const token of boundaryTokens) { if (!text.includes(token)) throw new Error('missing boundary '+token); } console.log('plan-structure-ok');"
node -e "const fs=require('fs'); const text=fs.readFileSync('plans/p3-2-skills-recall-v1.md','utf8'); const fields=['trigger','active_item','recall_candidates','source_path','source_kind','why_recalled','required_before_action','matched_from','startup_recovery_status']; for (const field of fields) { if (!text.includes(field)) throw new Error('missing field '+field); } console.log('output-shape-ok');"
node -e "const {spawnSync}=require('child_process'); const run=spawnSync('node',['scripts/startup_recovery_check.mjs','doctor','qxiaohu','notes/startup-recovery-state.json'],{encoding:'utf8'}); if (run.status !== 0) throw new Error(run.stderr || run.stdout); const parsed=JSON.parse(run.stdout); if (!parsed.ok || parsed.summary.shouldAlert !== false || parsed.summary.openCount !== 0 || parsed.nextAction.kind !== 'capture-live-template') { throw new Error(JSON.stringify(parsed,null,2)); } console.log('startup-boundary-ok');"
```

Expected results:
- `git diff --check` returns clean output for `plans/p3-2-skills-recall-v1.md`
- the first Node check prints `plan-structure-ok`
- the second Node check prints `output-shape-ok`
- the doctor boundary check prints `startup-boundary-ok`

---

## 8. Work log

- `2026-03-18 00:24 +08`: checked the dirty worktree and confirmed the task should stay bounded to a new `plans/p3-2-skills-recall-v1.md` artifact only.
- `2026-03-18 00:25 +08`: read the P3.1 confirmation note, the P3.1 transition note, and the latest startup-recovery E2E note to lock the boundary with startup recovery.
- `2026-03-18 00:26 +08`: pulled the collaboration checklist, retrospective, and retrieval vocabulary from `scripts/memory_bench.mjs` to align recall sources, handoff rules, and validation phrasing.
- `2026-03-18 00:28 +08`: wrote the first bounded Skills Recall plan at `plans/p3-2-skills-recall-v1.md`.
- `2026-03-18 00:29 +08`: ran the exact validation checks from section 7 and confirmed `plan-structure-ok`, `output-shape-ok`, and `startup-boundary-ok`.

## 9. Files changed

- `plans/p3-2-skills-recall-v1.md`

Author: Q xiaohu
Date: 2026-03-18
Version: v1
