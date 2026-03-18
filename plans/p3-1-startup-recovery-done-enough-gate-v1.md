# P3.1 startup recovery done-enough gate v1

Scope: clarify when the third layer should count as complete enough to move on, without silently expanding it into delivery infra, cron orchestration, or a bigger supervision project.
References: `plans/p3-1-startup-recovery-confirmation-v1.md`, `notes/startup-recovery-state.json`, `scripts/startup_recovery_check.mjs`, `scripts/startup_recovery_check_test.mjs`, `outputs/stage3-retrospective-v1.md`

---

## 1. Decision

P3.1 should count as done enough to move on once startup recovery can reliably do three things:

1. restore the hottest open promise from shared state,
2. downgrade or flag stale work based on evidence instead of chat wording, and
3. close a bounded promise with explicit verification.

By that bar, the current work is already very close to or at the pass line for the startup-recovery layer itself. The remaining gaps are mostly about delivery, policy tuning, or broader adoption, not about whether the third layer exists.

---

## 2. Exit criteria for "done enough"

All items below should be true at the same time.

### 2.1 Shared source of truth exists

Required:
- `notes/startup-recovery-state.json` is the live shared state for open promises.
- `plans/p3-1-startup-recovery-confirmation-v1.md` defines the four-state model, provenance rules, evidence rules, and stall rules.
- The state shape is stable enough for real use, not only for a thought experiment.

Why this is enough:
- The third layer is about recovering execution truth from shared artifacts. If the truth is not in one shared state, startup recovery is still fake.

### 2.2 One bounded operator loop exists end to end

Required:
- A new live promise can be captured without hand-writing JSON.
- The hottest open promise can be resumed after restart or stall.
- A bounded promise can be resolved with verification in one practical path.

Concrete commands already present:
- `capture-live`
- `resume`
- `resume-hottest`
- `doctor`
- `doctor --apply-resume`
- `resolve`
- `resolve-hottest`
- `heartbeat-check`

Why this is enough:
- Once the operator has one low-friction create -> recover -> close path, P3.1 is no longer spec-only.

### 2.3 Evidence beats wording

Required:
- `heartbeat-check` and `doctor` can detect watch/stalled conditions from timestamps and evidence.
- `in_progress` is not allowed to survive on a single old progress claim.
- `outbound` promises are treated as commitments to recover, not as proof that work is still running.

Why this is enough:
- This is the actual problem P3.1 was created to solve.

### 2.4 At least one real bounded pass has been proven

Required:
- Shared state contains at least one finished item showing the layer was used on real work, not only toy fixtures.
- Validation exists in `scripts/startup_recovery_check_test.mjs` for the core loop and guardrails.

Current evidence:
- `notes/startup-recovery-state.json` already shows finished bounded passes for live adoption and inline resolve verification.
- Recent commits show the create/resume/doctor/resolve loop landed incrementally.

Why this is enough:
- The pass line should require one real proof of use, not perfection.

### 2.5 Front-channel honesty is now enforceable

Required:
- Before claiming "working on it", there is a checkable path that can confirm whether the promise is really active, merely started, or already stalled.
- Startup recovery can now tell the difference between "I promised" and "I am still executing".

Why this is enough:
- `outputs/stage3-retrospective-v1.md` identified exactly this gap as the root failure.

---

## 3. What is optional after the pass line

These are useful, but they should not block calling P3.1 complete enough to move on.

Optional next-step items:
- automatic alert delivery to 猫爸 when `shouldAlert=true`
- cron/watchdog escalation that pushes alerts without relying on a manual check
- better default thresholds based on more runtime data
- richer dashboards, summaries, or reporting views
- more examples, wrappers, or ergonomics around the same state machine
- broader adoption beyond the bounded startup-recovery work already tracked
- stricter policy on whether `doctor --apply-resume` becomes mandatory at every restart

Reason:
- These improve supervision and operational smoothness, but they do not change whether the third-layer recovery model itself is already real.

---

## 4. Not in scope for this gate

Do not keep P3.1 open for these:
- cron wiring
- OpenClaw delivery paths
- watchdog delivery plumbing
- gateway work
- reminder/announce infrastructure
- Skills Recall or MCP follow-on layers
- general cleanup unrelated to startup recovery truth recovery

Reason:
- If these are bundled into the P3.1 finish line, the layer never ends and the stage boundary becomes meaningless.

---

## 5. Open questions before or during handoff

These are real questions, but none of them should automatically fail the gate.

1. Should the team require one more non-self-dogfood example before declaring the layer finished, or is the current bounded proof enough?
2. Should `doctor --apply-resume` become the default startup habit for Q小虎 only, or for both Q小虎 and 二两?
3. Is the current "hottest item" selection order stable enough once multiple live promises per owner become common?
4. Should `expected_update_by` remain required for every open item, or only for items that were explicitly given an ETA?

---

## 6. Recommended gate call

Recommended call: mark P3.1 as passed for "done enough to move on", then treat the remaining work as follow-up hardening rather than as proof that the third layer still does not exist.

Short reason:
- the spec exists,
- the shared state exists,
- the low-friction recovery commands exist,
- the guardrails are tested, and
- there is already bounded real-use evidence in the shared state.

What should happen next if this call is accepted:
1. Freeze the P3.1 success bar at the startup-recovery layer.
2. Track delivery/alerting gaps as separate follow-up work, not as hidden P3.1 blockers.
3. Move the main stage narrative forward to the next layer only after preserving this gate note as the explicit pass criterion.

---

## 7. Fast validation checks

Use these exact checks when someone asks whether this gate note still matches reality:

```powershell
git -C qxiaohu-erliang-collab diff --check -- plans/p3-1-startup-recovery-done-enough-gate-v1.md
node qxiaohu-erliang-collab/scripts/startup_recovery_check.mjs doctor qxiaohu qxiaohu-erliang-collab/notes/startup-recovery-state.json
node --test qxiaohu-erliang-collab/scripts/startup_recovery_check_test.mjs
```

Expected reading of results:
- `diff --check` returns clean
- `doctor` shows whether the current shared state still supports the gate assumptions
- the node test run keeps the operator loop and guardrails from regressing

Author: Q小虎
Date: 2026-03-18
Version: v1
