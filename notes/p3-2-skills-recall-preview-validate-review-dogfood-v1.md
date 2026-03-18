# P3.2 Skills Recall preview/validate/review dogfood v1

Date: 2026-03-18
Scope: one bounded dogfood note that shows how to use the new Skills Recall preview -> validate -> review flow on one real task packet.
Boundary: this note does not change startup recovery, packet generation logic, gateway behavior, delivery plumbing, or MCP work. It only captures one worked operator example with exact commands.
References: `notes/p3-2-skills-recall-operator-flow-v1.md`, `plans/p3-2-skills-recall-packet-review-gate-v1.md`, `plans/p3-2-skills-recall-packet-schema-v1.json`, `scripts/SKILLS_RECALL_PREVIEW.md`, `scripts/skills_recall_preview.mjs`, `scripts/startup_recovery_check.mjs`, `notes/startup-recovery-state.json`, `outputs/execution-checklist-v2.md`

---

## 1. Real task packet used for dogfooding

This note uses one real repo task instead of a synthetic placeholder.

Task title:
- `Review the Skills Recall operator flow note`

Task path:
- `notes/p3-2-skills-recall-operator-flow-v1.md`

User request used for preview:
- `Validate the operator flow note, review whether the packet stays bounded, and prepare a handoff-ready verdict with exact checks.`

Why this is a good dogfood target:
- the artifact already exists and is readable;
- the task is genuinely inside the current P3.2 workstream;
- the request naturally exercises the preview, validate, and review steps without touching startup-recovery state.

---

## 2. Exact preview -> validate -> review flow

Run from `qxiaohu-erliang-collab/`.

Important Windows PowerShell note:
- prefer `--write-packet` so the helper writes UTF-8 JSON directly;
- only fall back to `Set-Content -Encoding utf8` if you intentionally capture stdout yourself;
- plain `>` can still write JSON in a PowerShell-default encoding that breaks later JSON reads.

### 2.1 Baseline P3.1 check first

```powershell
node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json
```

Expected baseline for this worked example:
- `ok=true`
- `summary.openCount=0`
- `nextAction.kind=capture-live-template`

### 2.2 Preview one real packet and save it

```powershell
$packet = Join-Path $env:TEMP 'skills-recall-dogfood-operator-flow-packet-v1.json'
node scripts/skills_recall_preview.mjs preview --owner qxiaohu --task-title "Review the Skills Recall operator flow note" --task-path notes/p3-2-skills-recall-operator-flow-v1.md --user-request "Validate the operator flow note, review whether the packet stays bounded, and prepare a handoff-ready verdict with exact checks." --write-packet $packet
Write-Host "packetPath=$packet"
```

### 2.3 Validate the packet with the preview helper

```powershell
node scripts/skills_recall_preview.mjs validate --owner qxiaohu --packet-path $packet
```

Expected result:
- `ok=true`
- `packet_summary.trigger=artifact-path-match`
- `packet_summary.recall_candidate_count=2`
- checks include `packet-schema-shape-ok`, `packet-source-paths-ok`, `packet-anchor-check-skipped-no-open-item`, and `packet-scope-clean`

### 2.4 Review the packet with the helper review path

This is the default gate-style check used for this dogfood pass.

```powershell
node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json
node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path $packet
```

Expected review-check outputs:
- `doctor` still reports a healthy baseline
- `review` returns `ok=true`
- `review.verdict=pass`
- review checks include `review-first-read-clear`, `review-required-source-coverage-ok`, and `review-order-clean`

---

## 3. Produced packet

This is the actual packet produced by the preview command for the worked example.

```json
{
  "trigger": "artifact-path-match",
  "active_item": {
    "id": "qxiaohu-review-the-skills-recall-operator-flow-note",
    "title": "Review the Skills Recall operator flow note",
    "state": "task-context",
    "owner": "qxiaohu",
    "artifact_hint": "notes/p3-2-skills-recall-operator-flow-v1.md"
  },
  "recall_candidates": [
    {
      "source_path": "notes/p3-2-skills-recall-operator-flow-v1.md",
      "source_kind": "active-item-evidence",
      "why_recalled": "The provided task context already names this artifact, so it becomes the first anchor for the bounded recall pass.",
      "required_before_action": true,
      "matched_from": [
        "artifact_hint",
        "task_path"
      ],
      "priority_index": 0
    },
    {
      "source_path": "outputs/execution-checklist-v2.md",
      "source_kind": "collab-runbook",
      "why_recalled": "The task wording asks for validation and handoff-ready output, so the standard execution checklist is the most relevant reusable runbook.",
      "required_before_action": true,
      "matched_from": [
        "user_request"
      ],
      "priority_index": 1
    }
  ],
  "boundary": {
    "startup_recovery_status": "task context supplied directly; no startup state change performed",
    "does_not_update_promise_state": true,
    "does_not_override_hottest_item": true,
    "does_not_start_external_actions": true
  }
}
```

---

## 4. Review verdict on this packet

Decision:
- `pass`

Why it passes the gate:
1. Anchor is correct.
   - `active_item.title` and `artifact_hint` match the real task under review.

2. Packet stays bounded.
   - only 2 recall candidates are returned;
   - no installed skill is pulled in because the task is local repo review work, not a tool-domain task.

3. Packet is actionable.
   - read `notes/p3-2-skills-recall-operator-flow-v1.md` first;
   - read `outputs/execution-checklist-v2.md` second to shape the handoff-ready verdict.

4. Packet is evidence-first.
   - both recalled paths are real files;
   - the first source comes directly from the task path;
   - the second source is justified by `validation` and `handoff-ready` wording in the user request.

5. Packet respects boundaries.
   - boundary flags remain locked to `true`;
   - no promise-state write, hottest-item override, external action, cron, gateway, or MCP work appears.

6. Packet is safe in shared/subagent context.
   - no private source such as `MEMORY.md` is recalled.

One bounded reviewer note:
- `memory/qxiaohu-collab-rules.json` could be a plausible optional source, but excluding it keeps this packet tighter and still sufficient for the task.

---

## 5. Recorded command results

Recorded on this pass:
- `node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json` returned `ok=true`, `openCount=0`, `shouldAlert=false`, `nextAction.kind=capture-live-template`
- `node scripts/skills_recall_preview.mjs validate --owner qxiaohu --packet-path $packet` returned `ok=true` with checks `packet-schema-shape-ok`, `packet-source-paths-ok`, `packet-anchor-check-skipped-no-open-item`, `packet-scope-clean`
- `node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path $packet` returned `ok=true`, `verdict=pass`, `review_summary.first_read_source=notes/p3-2-skills-recall-operator-flow-v1.md`, and checks `review-first-read-clear`, `review-required-source-coverage-ok`, `review-order-clean`

Interpretation:
- preview worked on a real task anchor;
- validate passed without needing implementation changes;
- review now passes through a single helper command instead of copied gate snippets.

---

## 6. Exact validation checks for this note

Run from `qxiaohu-erliang-collab/`.

```powershell
git diff --check -- notes/p3-2-skills-recall-preview-validate-review-dogfood-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('notes/p3-2-skills-recall-preview-validate-review-dogfood-v1.md','utf8'); const required=['## 1. Real task packet used for dogfooding','## 2. Exact preview -> validate -> review flow','## 3. Produced packet','## 4. Review verdict on this packet','## 6. Exact validation checks for this note']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const mustInclude=['--write-packet $packet','node scripts/skills_recall_preview.mjs validate --owner qxiaohu --packet-path $packet','node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path $packet','review-order-clean','notes/p3-2-skills-recall-operator-flow-v1.md']; for (const token of mustInclude) { if (!text.includes(token)) throw new Error('missing token '+token); } console.log('dogfood-note-structure-ok');"
```

Expected results:
- `git diff --check` returns clean output for this note
- the Node check prints `dogfood-note-structure-ok`

---

## 7. Work log

- `2026-03-18 01:23 +08`: checked the scoped dirty worktree and confirmed this pass should avoid touching the existing startup-recovery files and unrelated plans.
- `2026-03-18 01:24 +08`: read the current P3.2 operator-flow note, packet-review gate, preview helper doc, packet schema, and startup baseline to anchor the dogfood example in existing artifacts.
- `2026-03-18 01:25 +08`: tried the preview flow against a not-yet-created note path, hit a real missing-anchor validation failure, and kept the final example on an already-existing repo artifact instead.
- `2026-03-18 01:26 +08`: generated a real packet for `notes/p3-2-skills-recall-operator-flow-v1.md`, validated it, and ran the review-gate checks.
- `2026-03-18 01:27 +08`: hit a PowerShell encoding footgun when saving JSON with `>`, corrected the reproducible flow to `Set-Content -Encoding utf8`, reran the end-to-end checks, and recorded the passing sequence in this note.
- `2026-03-18 01:52 +08`: replaced the manual review snippet bundle with the helper-native `review` command and updated the saved-packet step to use `--write-packet`.

## 8. Exact files changed

- `notes/p3-2-skills-recall-preview-validate-review-dogfood-v1.md`

Author: Q xiaohu
Version: v1
