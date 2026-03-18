# P3 sync pack for Erliang

Date: 2026-03-18
Scope: one bounded coordination note for Erliang that freezes the current P3 boundary, lists the live P3.2 assets, and says what should be reviewed next.
Boundary: coordination only. This note does not change startup-recovery state, reopen P3.1 runtime work, or edit any main implementation file.
References: `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`, `notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md`, `notes/startup-recovery-state.json`, `plans/p3-2-skills-recall-v1.md`, `plans/p3-2-skills-recall-source-map-v1.md`, `plans/p3-2-skills-recall-packet-schema-v1.json`, `plans/p3-2-skills-recall-packet-review-gate-v1.md`, `scripts/SKILLS_RECALL_PREVIEW.md`, `scripts/skills_recall_preview.mjs`, `scripts/skills_recall_preview_test.mjs`, `notes/p3-2-skills-recall-kickoff-handoff-v1.md`, `notes/p3-2-skills-recall-operator-flow-v1.md`, `notes/p3-2-skills-recall-example-corpus-v1.json`

---

## 1. Handoff call

One-line summary:
- P3.1 is passed / done-enough, the shared startup-recovery baseline is healthy, and P3.2 now has a bounded packet stack ready for reviewer pressure rather than another round of boundary debate.

Current status call:
- Treat P3.1 startup recovery as passed.
- Treat the current P3.2 work as a reviewable asset stack, not as an empty planning placeholder.
- Keep reviewer attention on packet quality, source choice, and boundary discipline.

Next owner:
- Reviewer: Erliang
- Expected review surface: the current P3.2 packet stack listed in section 3
- Return mode: `pass / bounded revision / bounce to P3.1 only if new defect evidence appears`

---

## 2. Why P3.1 stays closed

P3.1 is already over the pass line because the bounded create -> recover -> close loop has real evidence:

1. Transition decision already exists.
- `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md` marks P3.1 as passed / done-enough and names Skills Recall as the next layer.

2. Final bounded proof already exists.
- `notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md` records a successful create -> recover -> close pass using the current CLI flow.

3. Shared state is currently clean.
- `notes/startup-recovery-state.json` is the live source of truth and the expected baseline for this handoff is `openCount=0` with no active cleanup requirement.

4. Remaining runtime gaps are follow-up hardening only.
- alert delivery, watchdog delivery plumbing, threshold tuning, and broader live adoption still matter, but they are not reasons to reopen the P3.1 pass line.

Reviewer rule:
- Do not reopen P3.1 unless you find new concrete defect evidence in the current startup-recovery behavior.

---

## 3. Current P3.2 assets

These are the assets that already exist and should be treated as the live P3.2 stack.

1. Layer definition
- `plans/p3-2-skills-recall-v1.md`
- fixes the first bounded Skills Recall layer: sources, triggers, output shape, boundary, and done-enough line.

2. Ranked source inventory
- `plans/p3-2-skills-recall-source-map-v1.md`
- maps recall sources, tiers, triggers, and guardrails, including blocked-source handling for shared/subagent review.

3. Packet contract
- `plans/p3-2-skills-recall-packet-schema-v1.json`
- defines the expected JSON packet shape for one recalled packet.

4. Packet review rubric
- `plans/p3-2-skills-recall-packet-review-gate-v1.md`
- defines the pass/fail gate Erliang should use when judging one packet for real work.

5. Preview helper documentation
- `scripts/SKILLS_RECALL_PREVIEW.md`
- explains how to emit or validate one packet without mutating startup state.

6. Preview helper runtime
- `scripts/skills_recall_preview.mjs`
- emits first-pass packets and validates boundary/path rules.

7. Preview helper tests
- `scripts/skills_recall_preview_test.mjs`
- covers packet generation and validation behavior.

8. Kickoff handoff note
- `notes/p3-2-skills-recall-kickoff-handoff-v1.md`
- freezes the initial handoff from passed P3.1 into bounded P3.2 planning.

9. Operator adoption note
- `notes/p3-2-skills-recall-operator-flow-v1.md`
- explains when to call preview, when to review the packet, and how P3.1 and P3.2 stay separate in day-to-day work.

10. Example packet corpus
- `notes/p3-2-skills-recall-example-corpus-v1.json`
- provides representative packets for startup follow-up, rework/ETA discipline, and one installed-skill case.

Asset read order for review:
1. `plans/p3-2-skills-recall-v1.md`
2. `plans/p3-2-skills-recall-packet-review-gate-v1.md`
3. `scripts/SKILLS_RECALL_PREVIEW.md`
4. `scripts/skills_recall_preview.mjs`
5. `notes/p3-2-skills-recall-operator-flow-v1.md`
6. `notes/p3-2-skills-recall-example-corpus-v1.json`

---

## 4. What to review next

Review next should stay narrow and evidence-first.

Primary review target:
- Judge whether the current preview-helper output is already good enough for real work under the existing gate.

Suggested reviewer sequence:
1. Re-read the contract and gate.
- `plans/p3-2-skills-recall-v1.md`
- `plans/p3-2-skills-recall-packet-review-gate-v1.md`

2. Generate or inspect one real packet.
- use `scripts/skills_recall_preview.mjs` with an explicit bounded task or the current startup baseline.

3. Check these points first.
- Is the packet anchored to the right active item or explicit task?
- Does it stay within `<= 3` recall candidates?
- Does it pick the right mandatory source before action?
- Does it keep P3.1 as the owner of execution truth?
- Does it avoid broad repo sweeps, hidden private context, and later-layer scope creep?

4. Cross-check consistency only where it matters.
- Make sure the plan, schema, helper, operator flow, and example corpus all describe the same packet boundary.

5. Return one of three calls only.
- `pass`
- `bounded revision`
- `bounce to P3.1` only if the real issue is a fresh startup-recovery defect, not packet quality

Best next concrete review artifact:
- one reviewer judgment on a real generated packet, using `plans/p3-2-skills-recall-packet-review-gate-v1.md` as the scoring surface.

---

## 5. What not to reopen

Do not spend the next review round reopening these topics unless new evidence forces it:

1. P3.1 pass line itself.
- The question is no longer whether startup recovery exists; the question is whether P3.2 packet recall is good enough.

2. Startup-recovery runtime redesign.
- Do not reopen `doctor`, `resume-hottest`, `resolve-hottest`, shared-state semantics, or the general P3.1 operator loop from this note alone.

3. Follow-up hardening that was already split out.
- alert delivery
- watchdog delivery plumbing
- threshold tuning
- broader runtime adoption

4. Later layers.
- gateway changes
- MCP implementation details
- broad memory cleanup unrelated to one recalled packet

5. Repo-wide scavenger hunts.
- P3.2 should not widen into "read everything again" behavior.

6. Private-context recall in shared/subagent review.
- Do not pull `MEMORY.md` into this review context.

---

## 6. Known issues and bounded risks

Known issues:
- The current stack looks complete enough for review, but it still needs one reviewer call on a real packet rather than only self-authored artifacts.
- The preview-helper quality still depends on source ranking and mandatory-source selection staying sharp on real tasks.
- If a reviewer finds a gap, the fix should stay bounded to packet quality or local P3.2 assets unless a fresh P3.1 defect is proven.

Verification method:
- Run the exact checks in section 7 and confirm the startup baseline is healthy, the P3.2 assets exist, and the preview helper still emits a bounded packet.

Artifact paths:
- `notes/p3-2-erliang-sync-pack-2026-03-18.md`
- `plans/p3-2-skills-recall-v1.md`
- `plans/p3-2-skills-recall-source-map-v1.md`
- `plans/p3-2-skills-recall-packet-schema-v1.json`
- `plans/p3-2-skills-recall-packet-review-gate-v1.md`
- `scripts/SKILLS_RECALL_PREVIEW.md`
- `scripts/skills_recall_preview.mjs`
- `scripts/skills_recall_preview_test.mjs`
- `notes/p3-2-skills-recall-kickoff-handoff-v1.md`
- `notes/p3-2-skills-recall-operator-flow-v1.md`
- `notes/p3-2-skills-recall-example-corpus-v1.json`

---

## 7. Exact validation checks

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/p3-2-erliang-sync-pack-2026-03-18.md
node -e "const fs=require('fs'); const text=fs.readFileSync('notes/p3-2-erliang-sync-pack-2026-03-18.md','utf8'); const required=['## 2. Why P3.1 stays closed','## 3. Current P3.2 assets','## 4. What to review next','## 5. What not to reopen','## 7. Exact validation checks']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const paths=['plans/p3-2-skills-recall-v1.md','plans/p3-2-skills-recall-packet-review-gate-v1.md','scripts/skills_recall_preview.mjs','notes/p3-2-skills-recall-operator-flow-v1.md','notes/p3-2-skills-recall-example-corpus-v1.json']; for (const token of paths) { if (!text.includes(token)) throw new Error('missing path '+token); } console.log('erliang-sync-structure-ok');"
node -e "const fs=require('fs'); const paths=['notes/p3-2-erliang-sync-pack-2026-03-18.md','notes/p3-1-startup-recovery-final-e2e-pass-2026-03-18.md','notes/startup-recovery-state.json','plans/p3-2-skills-recall-v1.md','plans/p3-2-skills-recall-source-map-v1.md','plans/p3-2-skills-recall-packet-schema-v1.json','plans/p3-2-skills-recall-packet-review-gate-v1.md','scripts/SKILLS_RECALL_PREVIEW.md','scripts/skills_recall_preview.mjs','scripts/skills_recall_preview_test.mjs','notes/p3-2-skills-recall-kickoff-handoff-v1.md','notes/p3-2-skills-recall-operator-flow-v1.md','notes/p3-2-skills-recall-example-corpus-v1.json']; const missing=paths.filter(p=>!fs.existsSync(p)); if (missing.length) throw new Error('missing '+missing.join(',')); console.log('syncAssetsOk='+paths.length);"
node -e "const {spawnSync}=require('child_process'); const run=spawnSync('node',['scripts/startup_recovery_check.mjs','doctor','qxiaohu','notes/startup-recovery-state.json'],{encoding:'utf8'}); if (run.status !== 0) throw new Error(run.stderr || run.stdout); const parsed=JSON.parse(run.stdout); if (!parsed.ok || parsed.summary.shouldAlert !== false || parsed.summary.openCount !== 0) throw new Error(JSON.stringify(parsed,null,2)); console.log('startup-baseline-ok');"
node --test scripts/skills_recall_preview_test.mjs
node -e "const {spawnSync}=require('child_process'); const run=spawnSync('node',['scripts/skills_recall_preview.mjs','preview','--owner','qxiaohu','--task-title','Review the current Skills Recall packet stack','--task-path','notes/p3-2-erliang-sync-pack-2026-03-18.md','--user-request','Check the current Skills Recall assets, freeze the P3.1 boundary, and tell Erliang what to review next.'],{encoding:'utf8'}); if (run.status !== 0) throw new Error(run.stderr || run.stdout); const packet=JSON.parse(run.stdout); if (!packet.active_item || packet.active_item.title !== 'Review the current Skills Recall packet stack') throw new Error('wrong active item'); if (!Array.isArray(packet.recall_candidates) || packet.recall_candidates.length > 3) throw new Error('bad recall candidate count'); if (!packet.boundary || packet.boundary.does_not_update_promise_state !== true || packet.boundary.does_not_override_hottest_item !== true || packet.boundary.does_not_start_external_actions !== true) throw new Error('boundary flags wrong'); console.log('preview-packet-ok');"
```

Expected results:
- `git diff --check` returns clean for this note.
- the structure check prints `erliang-sync-structure-ok`.
- the asset existence check prints `syncAssetsOk=13`.
- the startup check prints `startup-baseline-ok`.
- the test file passes with zero failures.
- the preview packet check prints `preview-packet-ok`.

---

## 8. Work log

- `2026-03-18 01:24 +08`: read the current P3.1 transition/E2E artifacts, the live P3.2 plan and source-map, the packet review gate, the operator flow note, the example corpus, and the preview-helper doc to freeze the reviewer boundary from existing evidence.
- `2026-03-18 01:27 +08`: wrote `qxiaohu-erliang-collab/notes/p3-2-erliang-sync-pack-2026-03-18.md` as the single bounded coordination artifact for Erliang.
- `2026-03-18 01:28 +08`: prepared and ran the exact validation checks from section 7, keeping the work scoped to one new note and leaving unrelated dirty files untouched.

## 9. Exact file paths changed

- `qxiaohu-erliang-collab/notes/p3-2-erliang-sync-pack-2026-03-18.md`

Author: Q小虎
Version: v1
