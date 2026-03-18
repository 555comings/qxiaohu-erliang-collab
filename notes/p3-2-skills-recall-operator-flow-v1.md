# P3.2 Skills Recall operator flow v1

Date: 2026-03-18
Scope: one bounded adoption note for how operators should use Skills Recall in day-to-day work immediately after the P3.1 startup-recovery pass.
Boundary: this note explains operator flow only. It does not add runtime behavior, change startup-recovery state, reopen P3.1, or define new cron, delivery, gateway, or MCP implementation work.
References: `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`, `plans/p3-2-skills-recall-v1.md`, `plans/p3-2-skills-recall-packet-review-gate-v1.md`, `scripts/SKILLS_RECALL_PREVIEW.md`, `scripts/skills_recall_preview.mjs`, `notes/startup-recovery-state.json`, `outputs/execution-checklist-v2.md`, `outputs/stage3-retrospective-v1.md`, `../memory/qxiaohu-collab-rules.json`

---

## 1. Operator goal

The day-to-day goal is simple:
- let P3.1 recover execution truth first,
- let P3.2 recall the smallest useful support packet next,
- then continue the real work without mixing the two layers.

This note is the adoption bridge between the P3.1 pass line and the first practical use of Skills Recall.

---

## 2. Entry condition

Only enter this Skills Recall flow when one of these is true:

1. P3.1 already returned a trustworthy active item.
   - Example: `doctor` is healthy and `resume-hottest` can point to a real item or artifact.

2. There is no open startup item, but the operator is starting one bounded fresh task and wants a first-pass recall packet before acting.
   - Example: a new doc, review, or tool task with a clear `task-title`, `task-path`, and `user-request`.

Do not enter P3.2 first if P3.1 is unhealthy, ambiguous, or missing the real work anchor.

---

## 3. Day-to-day operator flow

### 3.1 Step 1: ask P3.1 for execution truth first

Run the P3.1 check before any Skills Recall call.

Normal first command:

```powershell
node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json
```

Interpretation:
- if `ok=true` and the state is trustworthy, P3.2 may continue;
- if `nextAction.kind` points to `resume-hottest`, use that active item as the recall anchor;
- if `nextAction.kind` shows a structural problem or stale ambiguity, stop in P3.1 and fix that first.

Skills Recall is not allowed to guess around a broken startup anchor.

### 3.2 Step 2: call the preview/helper only after the anchor is clear

Use the preview/helper when you need a first-pass packet showing which files or skill instructions should be read next.

Call it in one of two modes.

Mode A: open-item resume flow
- use this when P3.1 already has a real active item;
- the helper should infer the active item from `notes/startup-recovery-state.json`.

Example:

```powershell
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --user-request "Continue the current bounded task and surface the right support packet before acting."
```

Mode B: fresh bounded task flow
- use this when there is no open item yet, but the task is clear enough to name directly;
- provide `task-title`, `task-path`, and `user-request` so the preview packet stays anchored.

Example:

```powershell
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Draft the Skills Recall operator flow note" --task-path notes/p3-2-skills-recall-operator-flow-v1.md --user-request "Write one adoption note that explains when to call preview, when to review the packet, and how to keep P3.1 and P3.2 boundaries clean."
```

### 3.3 Step 3: read the packet before touching the task

The operator should immediately check four things in the returned packet:
- does `active_item` match the real task;
- do `recall_candidates` stay small and ranked;
- is at least one source clearly mandatory when the task has review, rework, handoff, or tool risk;
- does the `boundary` block keep P3.1 as the owner of execution truth.

Fast accept pattern:
- packet is anchored to the real task,
- `recall_candidates.length <= 3`,
- recalled sources are concrete and readable,
- no hidden scope appears.

Fast reject pattern:
- wrong anchor,
- generic file dumping,
- missing mandatory protocol source,
- packet tries to solve a P3.1 problem instead of a recall problem.

### 3.4 Step 4: decide whether packet review is required

Packet review is required before action when any of these conditions hold:
- the task is a handoff, review, rework, or escalation-sensitive task;
- the packet includes an installed skill or a tool/domain-specific instruction path;
- the packet will guide external, risky, or hard-to-reverse work;
- the packet feels weak, surprising, or incomplete;
- a second agent such as Erliang is about to rely on the packet.

Packet review is optional but still recommended when:
- the task is small and local,
- the packet contains one or two obvious sources only,
- the operator can clearly defend every recalled source.

When review is required, use `node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path <packet>` as the default fast path, and use `plans/p3-2-skills-recall-packet-review-gate-v1.md` as the rubric or manual fallback.

### 3.5 Step 5: execute with the packet, not with a new broad search

Once the packet passes review or quick operator inspection:
- read the top-ranked required source first;
- read any other required source before acting;
- only read optional sources if they fill a concrete gap.

Do not immediately widen back into a repo-wide sweep.
The point of Skills Recall is to shorten the search space after P3.1, not recreate startup from scratch.

### 3.6 Step 6: handoff and closure go back to P3.1 plus the standard package

After execution:
- use the standard handoff fields from `outputs/execution-checklist-v2.md`;
- keep ETA, evidence updates, and item closure in the P3.1 state path;
- if the work becomes stalled or changes state, update that through startup-recovery flow, not through Skills Recall.

In short:
- P3.2 helps you decide what to read;
- P3.1 still tracks what is really happening.

---

## 4. When to call the preview/helper

Call the preview/helper now when:
- P3.1 already identified the hottest trustworthy item;
- a bounded fresh task has a clear title, path, and user request;
- the next action depends on a reusable skill, runbook, or protocol note;
- the operator would otherwise start a broad manual search.

Do not call the preview/helper yet when:
- `doctor` shows the startup state is unhealthy;
- the hottest item is still ambiguous;
- the task is not yet scoped tightly enough to name;
- the real problem is that P3.1 state or evidence is missing.

Shortcut rule:
- if the question is "what am I really doing", stay in P3.1;
- if the question is "what should I read before doing it", use P3.2 preview.

---

## 5. When to review the packet

Review the packet before action when any of these apply:
- another agent will execute from it;
- the task includes review, rework, handoff, or explicit validation;
- the packet includes an installed skill recall;
- the task touches risky tool use or any external-facing behavior;
- the packet has zero candidates when a protocol source seems mandatory;
- the packet feels too broad, too vague, or attached to the wrong anchor.

A quick operator-only read is usually enough when all of these apply:
- the task is local and low risk;
- the packet is anchored correctly;
- the packet stays within 1-2 clearly relevant sources;
- no skill/tool boundary is being crossed;
- no second agent depends on the packet.

Review outcome choices:
- `pass`: use the packet as the working set;
- `bounded revision`: fix the packet once, without reopening P3.1;
- `bounce to P3.1`: if the real issue is anchor/state truth, not packet quality.

---

## 6. Clean boundary between P3.1 and P3.2

### 6.1 P3.1 owns

P3.1 remains the owner of:
- promise capture, state updates, and closure;
- hottest-item selection;
- ETA, stalled, and watch logic;
- evidence truth and status truth;
- deciding whether the startup state is trustworthy enough to proceed.

### 6.2 P3.2 owns

P3.2 only owns:
- selecting a small support packet after the active item is known;
- explaining why each source was recalled;
- marking which recalled sources are required before action.

### 6.3 P3.2 must not do

P3.2 must not:
- edit `notes/startup-recovery-state.json`;
- create, close, or reinterpret promises;
- choose a different hottest item than P3.1;
- treat chat status as execution truth;
- invent cron or delivery behavior;
- make gateway changes;
- design MCP implementation details;
- expand into unrelated cleanup because the packet feels incomplete.

### 6.4 Safe handoff sentence

Use this sentence mentally or in a handoff when unsure:
- P3.1 tells me what real work is live; P3.2 tells me what small set of instructions I should read before continuing it.

If a proposed step does not fit that sentence, it probably belongs in another layer.

---

## 7. Recommended operator commands

Run from `qxiaohu-erliang-collab/`.

### 7.1 Check startup-recovery baseline

```powershell
node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json
```

### 7.2 Preview from the live startup state

```powershell
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --user-request "Continue the current bounded task and surface the right support packet before acting."
```

### 7.3 Preview for a fresh bounded task and save the packet

```powershell
$packet = Join-Path $env:TEMP 'skills-recall-operator-flow-packet.json'
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Draft the Skills Recall operator flow note" --task-path notes/p3-2-skills-recall-operator-flow-v1.md --user-request "Write one adoption note that explains when to call preview, when to review the packet, and how to keep P3.1 and P3.2 boundaries clean." --write-packet $packet
```

### 7.4 Validate and review the saved packet

```powershell
node scripts/skills_recall_preview.mjs validate --owner qxiaohu --packet-path $packet
node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path $packet
```

### 7.5 Review gate reminder

Use this file when review is required or when you need the manual fallback checks:
- `plans/p3-2-skills-recall-packet-review-gate-v1.md`

---

## 8. Exact validation checks

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/p3-2-skills-recall-operator-flow-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('notes/p3-2-skills-recall-operator-flow-v1.md','utf8'); const required=['## 3. Day-to-day operator flow','## 4. When to call the preview/helper','## 5. When to review the packet','## 6. Clean boundary between P3.1 and P3.2','## 8. Exact validation checks']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const boundary=['notes/startup-recovery-state.json','choose a different hottest item than P3.1','invent cron or delivery behavior','make gateway changes','design MCP implementation details']; for (const token of boundary) { if (!text.includes(token)) throw new Error('missing boundary '+token); } const mustInclude=['--write-packet $packet','node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path $packet']; for (const token of mustInclude) { if (!text.includes(token)) throw new Error('missing operator token '+token); } console.log('operator-flow-structure-ok');"
node -e "const {spawnSync}=require('child_process'); const run=spawnSync('node',['scripts/startup_recovery_check.mjs','doctor','qxiaohu','notes/startup-recovery-state.json'],{encoding:'utf8'}); if (run.status !== 0) throw new Error(run.stderr || run.stdout); const parsed=JSON.parse(run.stdout); if (!parsed.ok || parsed.summary.shouldAlert !== false || parsed.summary.openCount !== 0) throw new Error(JSON.stringify(parsed,null,2)); console.log('startup-baseline-ok');"
node -e "const {spawnSync}=require('child_process'); const run=spawnSync('node',['scripts/skills_recall_preview.mjs','preview','--owner','qxiaohu','--task-title','Draft the Skills Recall operator flow note','--task-path','notes/p3-2-skills-recall-operator-flow-v1.md','--user-request','Write one adoption note that explains when to call preview, when to review the packet, and how to keep P3.1 and P3.2 boundaries clean.'],{encoding:'utf8'}); if (run.status !== 0) throw new Error(run.stderr || run.stdout); const packet=JSON.parse(run.stdout); if (!packet.active_item || packet.active_item.title !== 'Draft the Skills Recall operator flow note') throw new Error('wrong active item'); if (!Array.isArray(packet.recall_candidates) || packet.recall_candidates.length > 3) throw new Error('bad recall candidate count'); if (!packet.boundary || packet.boundary.does_not_update_promise_state !== true || packet.boundary.does_not_override_hottest_item !== true || packet.boundary.does_not_start_external_actions !== true) throw new Error('boundary flags wrong'); console.log('preview-helper-ok');"
```

Expected results:
- `git diff --check` returns clean for this note.
- the structure check prints `operator-flow-structure-ok`.
- the startup baseline check prints `startup-baseline-ok`.
- the preview packet check prints `preview-helper-ok`.

---

## 9. Work log

- `2026-03-18 00:53 +08`: checked the scoped dirty worktree inside `qxiaohu-erliang-collab` and confirmed this task should stay as one new note only.
- `2026-03-18 00:54 +08`: read the P3.1 transition note, the P3.2 plan, the preview-helper doc, the packet review gate, and the kickoff handoff to lock the existing boundary and avoid implementation drift.
- `2026-03-18 00:56 +08`: wrote `notes/p3-2-skills-recall-operator-flow-v1.md` as the bounded adoption artifact for day-to-day operator use.
- `2026-03-18 00:57 +08`: prepared exact validation checks that verify structure, current startup baseline, and a real preview-helper packet.
- `2026-03-18 01:52 +08`: tightened the default operator path to save packets with `--write-packet` and review them with `node scripts/skills_recall_preview.mjs review` instead of jumping straight to manual gate snippets.

## 10. Exact file paths changed

- `notes/p3-2-skills-recall-operator-flow-v1.md`

Author: Q xiaohu
Version: v1
