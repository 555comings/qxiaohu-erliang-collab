# P3.2 Skills Recall packet review gate v1

Scope: define how to judge whether one recalled packet is good enough for real work, without reopening startup recovery, cron/delivery, gateway, MCP implementation, or broad memory cleanup.
Boundary: this is a review/evaluation artifact only. It does not define a new runtime, packet generator, or state mutation path.
References: `plans/p3-2-skills-recall-v1.md`, `plans/p3-2-skills-recall-source-map-v1.md`, `notes/p3-2-skills-recall-kickoff-handoff-v1.md`, `plans/p3-1-startup-recovery-transition-to-skills-recall-v1.md`, `notes/startup-recovery-state.json`, `outputs/execution-checklist-v2.md`, `outputs/stage3-retrospective-v1.md`, `../memory/qxiaohu-collab-rules.json`

---

## 1. Decision

A recalled packet counts as good enough only if a reviewer can use it to continue the active work accurately with one bounded read step, while still keeping P3.1 startup recovery as the owner of execution truth.

In practice, that means the packet must be:
- anchored to the real active item,
- small enough to review quickly,
- concrete enough to act on,
- traceable back to real files or state fields, and
- disciplined enough not to smuggle in new scope.

If any of those break, the packet is not good enough yet.

---

## 2. Review target

This gate reviews one concrete packet that claims to satisfy `plans/p3-2-skills-recall-v1.md`.

Expected packet shape:
- a JSON object
- one `active_item`
- zero to three `recall_candidates`
- one explicit `boundary` block

Minimum packet fields expected by this gate:
- `trigger`
- `active_item.id`
- `active_item.title`
- `active_item.state`
- `active_item.owner`
- `active_item.artifact_hint`
- `recall_candidates[*].source_path`
- `recall_candidates[*].source_kind`
- `recall_candidates[*].why_recalled`
- `recall_candidates[*].required_before_action`
- `recall_candidates[*].matched_from`
- `boundary.startup_recovery_status`
- `boundary.does_not_update_promise_state`
- `boundary.does_not_override_hottest_item`
- `boundary.does_not_start_external_actions`

Default comparison source for real-work review:
- `notes/startup-recovery-state.json` when a hottest recovered item exists
- otherwise the explicitly named task/artifact from the current handoff

---

## 3. Real-work pass criteria

All criteria below must pass at the same time.

### 3.1 The packet is anchored to real work

Required:
- `active_item` matches the live recovered item, or clearly names the explicit task under review.
- `artifact_hint` or `matched_from` points back to real evidence such as `expected_artifacts`, `evidence[].path`, `title`, or `user_request`.
- The packet does not invent a hotter item than the one already chosen by P3.1.

Pass reading:
- A reviewer can tell exactly what work this packet is trying to support.

Fail reading:
- The packet could apply to several unrelated tasks, or it quietly swaps in a different anchor than the recovered one.

### 3.2 The packet is bounded

Required:
- `recall_candidates.length <= 3`.
- The packet contains at most one installed skill recall.
- Each recalled source has a non-generic reason tied to this task.
- If zero candidates are returned, the packet explicitly works as a no-extra-recall result instead of padding with background files.

Pass reading:
- The packet feels like a tight working set, not a repo tour.

Fail reading:
- It dumps many files, vague memory categories, or broad sweeps such as "read all plans".

### 3.3 The packet is actionable

Required:
- A second agent can say which source to read first and why.
- `required_before_action` is believable for each source.
- At least one source is marked mandatory when the task obviously carries protocol risk, such as review, handoff, rework, or skill/tool use.
- The packet makes clear what can be done next after reading the recalled sources.

Pass reading:
- Erliang can pick up the packet and continue with no extra scavenger hunt.

Fail reading:
- The packet is only descriptive, or it leaves the reviewer unable to choose the next read/action.

### 3.4 The packet is evidence-first

Required:
- Every `source_path` is a real file path or a clearly valid installed skill path.
- `matched_from` references concrete signals, not vague claims such as "probably useful".
- The packet prefers active-item and local workflow evidence before background notes.

Pass reading:
- The reviewer can trace every source back to a reason that is inspectable.

Fail reading:
- The packet leans on chat memory, unsupported intuition, or sources that are not actually present.

### 3.5 The packet respects boundaries

Required:
- The boundary block keeps all three protection flags true.
- The packet does not change or reinterpret `notes/startup-recovery-state.json`.
- The packet does not propose cron, delivery, gateway, or MCP implementation work as part of recall.
- The packet does not treat chat status as execution truth.

Pass reading:
- P3.1 still owns state and recovery truth; the packet only recalls support context.

Fail reading:
- The packet tries to repair missing execution truth with more context, or sneaks in later-layer work.

### 3.6 The packet is safe for this context

Required:
- No blocked/private source is pulled into the wrong context, especially `MEMORY.md` in shared/subagent review.
- No recalled source violates the collaboration rules or handoff package discipline.
- The packet does not require hidden local knowledge to make sense.

Pass reading:
- Another agent in the same context can use the packet without leaking private context or guessing missing rules.

Fail reading:
- The packet depends on context the reviewer should not have, or skips mandatory collaboration guardrails.

---

## 4. Fast fail conditions

Fail the packet immediately if any of these happen:
- `active_item.id` or `active_item.title` is missing.
- Any `source_path` does not exist.
- `recall_candidates` contains more than 3 entries.
- The packet includes more than 1 installed skill.
- The packet recalls `MEMORY.md` in a shared/subagent context.
- Any boundary flag is missing or not `true` where expected.
- The packet claims to update promise state, choose a new hottest item, or start external actions.
- The packet uses generic reasons like `useful context` or `probably relevant` with no concrete match signal.
- The packet asks the reviewer to reread broad areas of the repo instead of naming exact sources.

---

## 5. Reviewer questions for Erliang or a second agent

Use these questions before calling the packet passed.

1. Anchor check:
   - Does this packet clearly match the real active item, or could it be attached to several different tasks?

2. First-read usefulness:
   - If you had to act now, which source would you read first, and does the packet make that obvious?

3. Missing-source check:
   - Is there one mandatory rule, runbook, or skill that should be here but is not?

4. Boundedness check:
   - Does the packet stay small and ranked, or is it compensating for uncertainty by dumping extra files?

5. Evidence check:
   - For each recalled source, can you point to the exact signal that caused it to be selected?

6. Boundary check:
   - Does any part of the packet quietly reopen startup recovery, cron/delivery, gateway, or MCP work?

7. Collaboration-safety check:
   - Would another agent in this context understand and safely use the packet without reading private or off-limits files?

8. Actionability check:
   - After reading the packet, can you state the next concrete action without doing a fresh broad search?

9. Skeptical-removal check:
   - If you remove one recalled source, which one is weakest, and does the packet become cleaner or break?

10. Pass/fail call:
   - Would you trust this packet to guide real continuation work right now, or would you send it back for one bounded revision?

Reviewer decision rule:
- Pass only if the reviewer can defend every recalled source, reject hidden scope growth, and continue the work without needing a second broad recall sweep.

---

## 6. Exact validation checks

Run from `C:/Users/555/.openclaw/workspace/qxiaohu-erliang-collab`.

Set the packet under review first:

```powershell
$packet = 'PATH_TO_PACKET_JSON'
```

### 6.1 Gate artifact self-check

```powershell
git diff --check -- plans/p3-2-skills-recall-packet-review-gate-v1.md
node -e "const fs=require('fs'); const text=fs.readFileSync('plans/p3-2-skills-recall-packet-review-gate-v1.md','utf8'); const required=['## 3. Real-work pass criteria','## 4. Fast fail conditions','## 5. Reviewer questions for Erliang or a second agent','## 6. Exact validation checks']; for (const token of required) { if (!text.includes(token)) throw new Error('missing '+token); } const reviewerQs=(text.match(/^[0-9]+\. /gm)||[]).length; if (reviewerQs < 10) throw new Error('need >=10 numbered reviewer questions, found '+reviewerQs); console.log('review-gate-structure-ok');"
```

Expected results:
- `git diff --check` returns clean output for this gate file.
- the Node check prints `review-gate-structure-ok`.

### 6.2 Default helper review path

Use this as the default operator path before falling back to the manual Node snippets.

```powershell
node scripts/skills_recall_preview.mjs validate --owner qxiaohu --packet-path $packet
node scripts/skills_recall_preview.mjs review --owner qxiaohu --packet-path $packet
```

Expected results:
- `validate` returns `ok=true` with checks such as `packet-schema-shape-ok`, `packet-source-paths-ok`, `packet-anchor-ok` or a skip variant, and `packet-scope-clean`.
- `review` returns `ok=true`, `verdict=pass`, and adds operator-facing checks such as `review-first-read-clear`, `review-required-source-coverage-ok`, and `review-order-clean`.

### 6.3 Packet schema and bound check fallback

Use this only if you need the manual gate snippet for debugging or to inspect one check in isolation.

```powershell
node -e "const fs=require('fs'); const path=require('path'); const packetPath=process.argv[1]; if(!packetPath) throw new Error('missing packet path'); const packet=JSON.parse(fs.readFileSync(packetPath,'utf8')); const top=['trigger','active_item','recall_candidates','boundary']; for (const key of top) if (!(key in packet)) throw new Error('missing '+key); const active=['id','title','state','owner','artifact_hint']; for (const key of active) if (!(key in packet.active_item)) throw new Error('missing active_item.'+key); if (!Array.isArray(packet.recall_candidates)) throw new Error('recall_candidates must be array'); if (packet.recall_candidates.length > 3) throw new Error('too many recall candidates: '+packet.recall_candidates.length); const allowedKinds=new Set(['active-item-evidence','workspace-note','collab-runbook','installed-skill']); let skillCount=0; for (const [i,item] of packet.recall_candidates.entries()) { for (const key of ['source_path','source_kind','why_recalled','required_before_action','matched_from']) if (!(key in item)) throw new Error('missing recall_candidates['+i+'].'+key); if (!allowedKinds.has(item.source_kind)) throw new Error('bad source_kind '+item.source_kind); if (item.source_kind === 'installed-skill') skillCount += 1; if (typeof item.why_recalled !== 'string' || item.why_recalled.trim().length < 12) throw new Error('weak why_recalled at '+i); if (!Array.isArray(item.matched_from) || item.matched_from.length === 0) throw new Error('matched_from must be non-empty array at '+i); } if (skillCount > 1) throw new Error('too many installed skills: '+skillCount); const b=packet.boundary; for (const key of ['startup_recovery_status','does_not_update_promise_state','does_not_override_hottest_item','does_not_start_external_actions']) if (!(key in b)) throw new Error('missing boundary.'+key); if (b.does_not_update_promise_state !== true) throw new Error('boundary must keep does_not_update_promise_state=true'); if (b.does_not_override_hottest_item !== true) throw new Error('boundary must keep does_not_override_hottest_item=true'); if (b.does_not_start_external_actions !== true) throw new Error('boundary must keep does_not_start_external_actions=true'); console.log('packet-schema-ok');" -- "$packet"
```

Expected result:
- the Node check prints `packet-schema-ok`.

### 6.4 Source existence and blocked-source check

```powershell
node -e "const fs=require('fs'); const path=require('path'); const packetPath=process.argv[1]; if(!packetPath) throw new Error('missing packet path'); const packet=JSON.parse(fs.readFileSync(packetPath,'utf8')); const repoRoot=process.cwd(); const workspaceRoot=path.resolve(repoRoot,'..'); for (const [i,item] of packet.recall_candidates.entries()) { const p=item.source_path; const normalized=p.replace(/\\/g,'/'); if (path.basename(normalized) === 'MEMORY.md') throw new Error('blocked source MEMORY.md in shared/subagent review'); const candidates=path.isAbsolute(p) ? [p] : [path.join(repoRoot,p), path.join(workspaceRoot,p)]; if (!candidates.some(full => fs.existsSync(full))) throw new Error('missing source_path at '+i+': '+p); } console.log('packet-paths-ok');" -- "$packet"
```

Expected result:
- the Node check prints `packet-paths-ok`.

### 6.5 Active-item alignment check against the current startup state

```powershell
node scripts/startup_recovery_check.mjs doctor qxiaohu notes/startup-recovery-state.json
node -e "const fs=require('fs'); const packet=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const state=JSON.parse(fs.readFileSync('notes/startup-recovery-state.json','utf8')); const open=state.items.filter(i=>i.owner==='qxiaohu' && i.state!=='done'); if (open.length === 0) { console.log('no-open-item-baseline-ok'); process.exit(0); } open.sort((a,b)=>new Date(b.updated_at||b.created_at||0)-new Date(a.updated_at||a.created_at||0)); const hottest=open[0]; if (packet.active_item.id !== hottest.id) throw new Error('packet active_item.id does not match hottest open item'); if (packet.active_item.title !== hottest.title) throw new Error('packet active_item.title does not match hottest open item'); console.log('packet-anchor-ok');" -- "$packet"
```

Expected result:
- `doctor` returns a parseable healthy snapshot for the current state.
- the alignment check prints either `no-open-item-baseline-ok` when no live item exists, or `packet-anchor-ok` when the packet matches the hottest live item.

### 6.6 Language-quality and scope-smuggle check

```powershell
node -e "const fs=require('fs'); const packet=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const banned=['cron','gateway','MCP implementation','delivery plumbing','read all plans','useful context','probably relevant']; const hay=JSON.stringify(packet); for (const token of banned) { if (hay.includes(token)) throw new Error('banned token in packet: '+token); } console.log('packet-scope-clean');" -- "$packet"
```

Expected result:
- the Node check prints `packet-scope-clean`.

Pass call:
- Call the packet good enough when the default helper path in `6.2` passes and the reviewer questions in section 5 still come back clean.
- If you are using the fallback snippets instead, require `6.3` through `6.6` to pass before making the same call.

---

## 7. Known limits of this gate

This gate does not prove:
- that automatic packet generation is implemented,
- that the top-ranked packet is globally optimal,
- that embeddings/search ranking are solved,
- that later MCP or delivery layers are done.

It only proves the reviewed packet is small, traceable, safe, and usable enough for real continuation work.

---

## 8. Work log

- `2026-03-18 00:38 +08`: reviewed the existing P3.2 kickoff, plan, and source-map artifacts to avoid duplicating design work and to isolate this note to evaluation only.
- `2026-03-18 00:40 +08`: wrote `plans/p3-2-skills-recall-packet-review-gate-v1.md` as a bounded pass/fail rubric for one recalled packet in real work.
- `2026-03-18 00:40 +08`: added reviewer questions for Erliang or a second agent plus exact packet-validation commands that can be run against any candidate packet JSON.
- `2026-03-18 01:52 +08`: updated the gate to name `node scripts/skills_recall_preview.mjs review` as the default operator path, while keeping the manual snippets as the debugging fallback.

## 9. Exact file paths changed

- `plans/p3-2-skills-recall-packet-review-gate-v1.md`

Author: Q小虎
Date: 2026-03-18
Version: v1
