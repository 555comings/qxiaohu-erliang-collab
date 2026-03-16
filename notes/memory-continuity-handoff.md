# Memory Continuity Handoff

## Protocol
- Read this file and `notes/memory-continuity-state.json` before writing a new update.
- Append only the delta; do not rewrite history.
- No pleasantries.
- Each entry must include: who, what changed, artifact path(s), next owner.
- Use chat only for human decisions, approvals, or blocking alerts.

## Entries
## [handoff] 2026-03-17 01:10
- Who: Q xiaohu
- Change: Started the cross-computer memory continuity bootstrap. Created a shared startup context and a shared collaboration-rules file because Q xiaohu local workspace memory files are not valid shared truth for Erliang on another machine. This slice establishes a common read path before wiring startup hooks or skill recall.
- Artifacts: `memory/shared-startup-context.md`, `memory/shared-collab-rules.json`, `notes/memory-continuity-state.json`, `plans/shared-memory-source-of-truth-v1.md`
- Next Owner: Q xiaohu
