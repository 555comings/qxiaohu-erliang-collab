# P3.2 Skills Recall kickoff handoff v1

Date: 2026-03-18
Repo HEAD observed while drafting: `7c7a5c9`
Scope: one bounded kickoff handoff for the first Skills Recall packet, based on the now-passed P3.1 startup-recovery layer.
References: `plans/p3-1-startup-recovery-confirmation-v1.md`, `plans/p3-1-startup-recovery-done-enough-gate-v1.md`, `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`, `notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md`, `notes/startup-recovery-state.json`, `outputs/execution-checklist-v2.md`, `outputs/stage3-retrospective-v1.md`

---

## 1. Kickoff call

Decision:
- Treat P3.1 startup recovery as passed / done-enough.
- Start P3.2 as a bounded Skills Recall planning pass.
- Keep this handoff in `notes/` so the main plan files stay untouched during kickoff.

One-line summary:
- P3.1 already proved the shared create -> recover -> close loop, so the next packet should define how the agent recalls the right reusable skill context after startup recovery succeeds.

Next owner:
- Primary drafter: Q小虎
- Reviewer: 二两 or a second agent acting in reviewer mode

---

## 2. Why P3.1 counts as passed / done-enough

P3.1 is at the pass line because all of the third-layer essentials already exist and have bounded evidence:

1. Shared source of truth exists.
   - `notes/startup-recovery-state.json` is the live shared state.

2. The operator loop exists.
   - `capture-live`, `doctor`, `resume-hottest`, `resolve-hottest`, and `heartbeat-check` already form the practical create -> recover -> close path described in `plans/p3-1-startup-recovery-confirmation-v1.md`.

3. Evidence beats wording.
   - The runtime and tests enforce state/evidence checks instead of trusting chat phrasing alone.

4. Real proof already exists.
   - `notes/startup-recovery-state.json` currently contains three done items, including the final bounded E2E pass recorded in `notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md`.

5. Remaining gaps are follow-up hardening, not P3.1 blockers.
   - Alert delivery, watchdog plumbing, and threshold tuning stay real, but they do not reopen the P3.1 pass line.

Call for handoff:
- Use P3.1 as a fixed baseline, not as an active debate.

---

## 3. Fixed input for the next layer

These are fixed inputs for P3.2 and should not be renegotiated in the first Skills Recall packet.

1. Execution-truth recovery already belongs to startup recovery.
   - Open promise tracking stays in `notes/startup-recovery-state.json`.
   - P3.2 must not duplicate promise tracking, stall logic, or finish-line state transitions.

2. The startup-recovery runtime is good enough to depend on.
   - The next packet should assume `doctor`, `resume-hottest`, and `resolve-hottest` are the current low-friction operating path.

3. The current state snapshot is clean.
   - The handoff baseline expects `openCount=0` and no active P3.1 cleanup requirement before drafting the first Skills Recall packet.

4. Evidence remains the source of truth.
   - Skills Recall should consume shared artifacts, file paths, and validated notes, not front-channel memory claims by themselves.

5. Stage boundaries stay hard.
   - P3.2 is about skill retrieval after recovery, not cron, delivery, gateway, MCP implementation, or broad memory cleanup.

6. The first packet stays planning-sized.
   - The deliverable is one bounded note, not a broad code burst.

---

## 4. What the first Skills Recall packet should deliver

Recommended artifact:
- `plans/p3-2-skills-recall-v1.md`

Minimum required content:

1. Goal statement.
   - Answer this question clearly: after startup recovery restores the hottest active work item, how does the agent recall the right reusable skill/checklist/runbook context fast enough to continue accurately?

2. Recall-source inventory.
   - Define which sources count for startup skill recall, at minimum covering `AGENTS.md`, `TOOLS.md`, installed `SKILL.md` files when applicable, and repo-local runbooks/checklists.

3. Trigger model.
   - Define what causes recall, such as recovered work-item metadata, task domain, tool mentions, user intent, or named operating surfaces.

4. Output packet shape.
   - Define the minimum recall output, including source path, why the source was selected, whether it is mandatory or optional, and what the agent should do next with it.

5. Boundary with P3.1.
   - State exactly how Skills Recall consumes startup-recovery outputs without recreating state tracking or execution-truth logic.

6. Boundary with later layers.
   - Name the MCP boundary, but do not design or implement MCP here.

7. Validation method.
   - End with exact checks showing how someone can review whether the packet stays bounded and whether the proposed recall path is testable or inspectable.

Preferred packet outcome:
- A reviewer can read one note and answer: what gets recalled, from where, under what triggers, in what format, and how we know the recall step stayed within scope.

---

## 5. Review questions for 二两 or a second agent

Use these questions to review the first Skills Recall packet before calling it passed.

1. Scope control:
   - Does the packet stay on skill recall only, or does it quietly drift back into startup recovery, cron, delivery, gateway, or MCP implementation?

2. Fixed-input discipline:
   - Does it treat P3.1 as already passed, or does it reopen the P3.1 finish line without new defect evidence?

3. Source coverage:
   - Are the recall sources explicit and sufficient for real work, especially `AGENTS.md`, `TOOLS.md`, relevant `SKILL.md`, and repo-local runbooks/checklists?

4. Trigger quality:
   - Are the recall triggers concrete enough that an agent could decide when recall is required versus optional?

5. Output usefulness:
   - Does the packet define a recall output shape that is actually actionable at startup, instead of producing vague summaries?

6. Evidence discipline:
   - Does the packet rely on concrete file/artifact retrieval, instead of trusting chat wording or assumed memory?

7. Validation quality:
   - Do the ending checks verify both bounded scope and practical reviewability, rather than only checking formatting?

8. Hidden coupling:
   - Does any part of the proposal implicitly require new runtime plumbing that should belong to a later layer?

Review decision rule:
- Pass only if the packet is bounded, evidence-first, and directly usable as the next planning/control artifact.

---

## 6. Known non-blockers

These remain real, but they are not blockers for starting the first Skills Recall packet:
- proactive alert delivery work
- watchdog delivery plumbing
- threshold tuning from more runtime data
- broader adoption beyond the bounded P3.1 passes already recorded

---

## 7. Exact validation checks for this handoff note

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/p3-2-skills-recall-kickoff-handoff-v1.md
node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json
node -e "const s=require('./notes/startup-recovery-state.json'); const done=s.items.filter(i=>i.state==='done').length; if(done<3){throw new Error('need >=3 done items')} console.log('doneItems='+done)"
if (!(Test-Path 'notes/p3-2-skills-recall-kickoff-handoff-v1.md')) { throw 'missing handoff note' } else { Write-Host 'handoffNote=ok' }
```

Expected results:
- `git diff --check` returns clean for this note
- `doctor` returns `ok: true`, `shouldAlert: false`, and `openCount: 0` on the current shared-state snapshot
- the Node one-liner prints `doneItems=3` or higher
- the file existence check prints `handoffNote=ok`

---

## 8. Work log

- `2026-03-18 00:27 +08`: reviewed the active repo state and confirmed this kickoff should avoid the main core plan file because unrelated dirty work already exists elsewhere in the repo.
- `2026-03-18 00:28 +08`: read the P3.1 gate, transition, final E2E note, shared state, and reviewer guidance to freeze the handoff boundary from existing evidence.
- `2026-03-18 00:29 +08`: wrote `qxiaohu-erliang-collab/notes/p3-2-skills-recall-kickoff-handoff-v1.md` as the bounded kickoff artifact for the next layer.
- `2026-03-18 00:29 +08`: prepared exact validation checks and a reviewer question set for 二两 or a second-agent review pass.

## 9. Exact file paths changed

- `qxiaohu-erliang-collab/notes/p3-2-skills-recall-kickoff-handoff-v1.md`

Author: Q小虎
Version: v1
