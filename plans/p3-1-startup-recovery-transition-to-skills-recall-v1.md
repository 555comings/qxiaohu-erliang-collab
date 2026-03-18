# P3.1 startup recovery transition to Skills Recall v1

Scope: close the third-layer startup recovery pass at a bounded, evidence-based line and define the next-layer handoff into Skills Recall without reopening runtime implementation scope.
Baseline: this transition assumes the startup recovery runtime already includes the resolve-hottest path landed by `0a6f910`, plus the current shared state, tests, and gate note now present in the repo.
References: `plans/p3-1-startup-recovery-confirmation-v1.md`, `plans/p3-1-startup-recovery-done-enough-gate-v1.md`, `notes/startup-recovery-state.json`, `scripts/startup_recovery_check.mjs`, `scripts/startup_recovery_check_test.mjs`, `outputs/execution-checklist-v2.md`, `outputs/stage3-retrospective-v1.md`

---

## 1. Transition call

Decision: mark P3.1 startup recovery as passed for "done enough to move on".

Reason:
- the shared source of truth exists in `notes/startup-recovery-state.json`,
- the create -> recover -> close operator loop exists in `scripts/startup_recovery_check.mjs`,
- the main guardrails are covered in `scripts/startup_recovery_check_test.mjs`, and
- the state already records bounded real-use passes instead of only toy fixtures.

This is enough to close the third-layer startup recovery pass itself. Remaining alert-delivery, watchdog, and policy-tuning work stays real, but it is follow-up hardening rather than proof that the layer is still missing.

---

## 2. Standard handoff package

One-line summary:
- P3.1 is passed at the startup-recovery layer; keep the runtime stable and move the next bounded planning pass to Skills Recall.

Artifact paths:
- `plans/p3-1-startup-recovery-confirmation-v1.md`
- `plans/p3-1-startup-recovery-done-enough-gate-v1.md`
- `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`
- `notes/startup-recovery-state.json`
- `scripts/startup_recovery_check.mjs`
- `scripts/startup_recovery_check_test.mjs`

Verification method:
- Run the exact checks in section 5 and confirm each expected result matches.

Known issues:
- proactive alert delivery is still separate from the startup-recovery pass line
- watchdog delivery plumbing is still separate from the startup-recovery pass line
- threshold tuning and broader live adoption still need follow-up runtime evidence
- no Skills Recall artifact exists yet; this note only defines the handoff boundary and first packet

Next owner:
- Q小虎 owns the first bounded Skills Recall planning pass.
- 二两 reviews that pass for scope control, retrieval gaps, and hidden coupling back into P3.1.

---

## 3. What carries forward into Skills Recall

Carry these assumptions forward as fixed inputs, not as open debates:

1. Startup recovery already owns execution-truth recovery.
   - Open promise state stays in `notes/startup-recovery-state.json`.
   - `doctor`, `resume-hottest`, and `resolve-hottest` remain the low-friction recovery path.

2. Evidence beats wording.
   - Skills Recall should consume shared artifacts and recorded evidence, not trust front-channel phrasing by itself.

3. Stage boundaries matter.
   - Skills Recall is a follow-on retrieval layer, not a rewrite of startup recovery, alert delivery, cron, or gateway behavior.

4. The next layer should stay bounded.
   - The first Skills Recall pass should produce a retrieval spec or note, not a large implementation burst.

---

## 4. Skills Recall handoff definition

### 4.1 Goal of the next layer

Skills Recall should answer one practical question:
- after startup recovery restores the hottest active work item, how does the agent also recover the right reusable skill, checklist, or local operating note needed to continue that work fast and accurately?

### 4.2 In scope for the first bounded pass

The first Skills Recall pass should define:
- which sources count as skill memory for startup use, such as `AGENTS.md`, `TOOLS.md`, installed skill `SKILL.md` files, and any repo-local runbooks or checklists
- which triggers should cause skill recall, such as task domain, mentioned tools, user intent, or the recovered active item
- the minimum retrieval output shape, for example source path, why it was recalled, and whether it is mandatory or optional before action
- how Skills Recall interacts with startup recovery without duplicating promise tracking or execution-state logic
- a minimal validation approach for checking whether the right skill context is surfaced at startup

### 4.3 Explicitly out of scope for the first bounded pass

Do not bundle these into the first Skills Recall handoff packet:
- new cron or delivery behavior
- OpenClaw gateway changes
- startup recovery schema redesign
- MCP integration details beyond naming the boundary
- broad memory cleanup unrelated to skill retrieval
- large code implementation unless the spec proves a tiny wiring change is strictly needed

### 4.4 First bounded deliverable

Create one note under `plans/` that answers the in-scope questions above and ends with exact validation checks.

Recommended first packet name:
- `plans/p3-2-skills-recall-v1.md`

Recommended first packet summary:
- define what should be recalled after startup recovery succeeds, from which sources, under which triggers, and how that recall is verified without reopening P3.1 scope.

---

## 5. Exact validation checks

Run these checks from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md
node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json
node -e "const s=require('./notes/startup-recovery-state.json'); const done=s.items.filter(i=>i.state==='done').length; if(done<2){throw new Error('need >=2 done items')} console.log('doneItems='+done)"
node --test scripts/startup_recovery_check_test.mjs
```

Expected results:
- `git diff --check` returns clean output for this transition artifact
- `doctor` returns `ok: true`, `shouldAlert: false`, and `openCount: 0` for the current state snapshot
- the Node one-liner prints `doneItems=2` or higher
- the test run passes all startup recovery tests with zero failures

---

## 6. Operational next step

Once this transition note is accepted:
1. Freeze P3.1 as passed/done-enough.
2. Keep startup recovery runtime changes out of the next planning packet unless a new defect is found.
3. Start the first Skills Recall pass as a bounded planning artifact and track it through the existing startup-recovery state path if it becomes live work.

Recommended capture command for the next live pass:

```powershell
node scripts/startup_recovery_check.mjs capture-live qxiaohu "Define the first Skills Recall packet" "Move from passed startup recovery into the next bounded layer." "Started the bounded Skills Recall planning pass." --state-path notes/startup-recovery-state.json --eta-minutes 30 --notes "Defining recall sources, triggers, output shape, and validation for the next layer." --path plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md --expected-artifacts "plans/p3-2-skills-recall-v1.md"
```

Author: Q小虎
Date: 2026-03-18
Version: v1
