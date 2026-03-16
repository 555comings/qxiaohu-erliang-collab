# Control Center Phase 0 - Readonly Integration Plan

## Goal

Use `openclaw-control-center` as a readonly control surface for the current Q xiaohu + Erliang system without changing the existing source-of-truth files or enabling risky write paths.

This phase is not about replacing the current system.
It is about making the current system visible, understandable, and auditable inside a control-center shell.

## Why This Phase Exists

The current system already has three working layers:

- `self_alert` sidecar logic
- file-backed memory system
- benchmark evidence chain (`self_alert_bench`, `memory_bench`, `e2e_heartbeat_bench`)

What is missing is a single operator-facing control surface that can answer:

- Is the system healthy right now?
- What changed recently?
- What is blocked?
- Which benchmark baseline is current?
- Which host produced which evidence?
- What needs human attention?

The imported `openclaw-control-center` project is a good shell for that purpose, but it must be adapted carefully.

## Phase 0 Scope

### In scope

- readonly adapters only
- no migration of existing memory files
- no mutation of current `self_alert` state files
- no mutation of benchmark artifacts
- no approval actions
- no import/live mutation features
- no replacement of the current system's source of truth

### Out of scope

- writing back to `memory/*.md`
- writing back to `MEMORY.md`
- changing `self_alert` behavior through the UI
- migrating to the control-center runtime store as the main source of truth
- redesigning the entire control-center information architecture
- building a full project/task operating system around this immediately

## Source-of-Truth Rule

The current system remains authoritative.
The control center only reads and maps.

Authoritative sources for this project:

- `memory/YYYY-MM-DD.md`
- `MEMORY.md`
- `memory/qxiaohu-self-memory-state.json`
- `memory/qxiaohu-collab-rules.json`
- `memory/self_alert_state.json`
- `runtime/self_alert_inputs/*.ndjson`
- `benchmarks/*/benchmark-config.json`
- `benchmarks/*/summary.json`
- `benchmarks/*/report.md`
- selected `plans/*.md` and `outputs/*.md`

If the control center needs cached or derived data, it must be marked as derived and must never silently become the new truth source.

## Target Pages For Phase 0

Only adapt the pages that are immediately useful for the current system.

### 1. Overview

Add cards for:

- memory health
- self-alert health
- benchmark status
- recent cross-host validation status
- current active focus / open loops

### 2. Memory

Turn this into a practical memory status workspace:

- today + yesterday daily notes
- long-term memory summary
- active focus
- open loops
- memory health / search status
- last meaningful memory write

### 3. Collaboration

Use this as the Q xiaohu <-> Erliang handoff view:

- recent handoffs
- latest validation result
- current owner
- pending confirmations
- blocked items and next owner

### 4. Settings

Add a dedicated wiring/status area for the current system:

- memory files readable
- self-alert state readable
- benchmark artifacts readable
- adapter freshness
- readonly mode status
- missing optional sources

## Adapters To Build

Phase 0 should introduce four readonly adapters.

### A. Memory Adapter

Reads:

- `MEMORY.md`
- `memory/YYYY-MM-DD.md` (today + yesterday)
- `memory/qxiaohu-self-memory-state.json`
- `memory/qxiaohu-collab-rules.json`

Outputs:

- active focus
- open loops
- recent memory entries
- long-term memory summary
- memory status (`ok`, `degraded`, `missing`)
- last updated anchors

### B. Self-Alert Adapter

Reads:

- `memory/self_alert_state.json`
- `runtime/self_alert_inputs/user.ndjson`
- `runtime/self_alert_inputs/tool.ndjson`
- recent daily entries tagged from self-alert

Outputs:

- last known health issue count
- consumed user/tool counts
- last write count
- skipped poll state
- recent routes touched
- self-alert status (`ok`, `warn`, `blocked`)

### C. Benchmark Adapter

Reads:

- latest benchmark folders for:
  - `self_alert_bench`
  - `memory_bench`
  - `e2e_heartbeat_bench`
- `benchmark-config.json`
- `summary.json`
- `report.md`

Outputs:

- latest run per suite
- pass/warn/fail per suite
- key p95 metrics
- host labels
- cross-host comparability state
- latest evidence paths

### D. Collaboration Adapter

Reads:

- selected `plans/*.md`
- selected `outputs/*.md`
- handoff-oriented memory entries
- cross-host validation notes

Outputs:

- current owner
- latest handoff summary
- pending validations
- recent completed validations
- current blocked item list

## Integration Rule

Do not force the current system to match control-center internals.
Instead:

- build a translation layer from current files -> control-center view models
- prefer isolated adapter modules
- keep adapters readonly
- fail visibly when a source is missing
- never invent fake values where evidence is absent

## Deliverables For Phase 0

### Deliverable 1 - System mapping brief

A written map showing:

- page -> adapter -> source file(s)
- which data is authoritative
- which values are derived
- where freshness/risk boundaries exist

### Deliverable 2 - Reuse triage

A three-column decision table:

- reusable as-is
- reusable with adaptation
- should not be adopted

This applies to pages, runtime modules, and store assumptions from `openclaw-control-center`.

### Deliverable 3 - Minimal readonly contract

Define the JSON/view-model shape for the four adapters.

### Deliverable 4 - Implementation slice recommendation

Recommend the smallest first coding slice that gives real operator value without coupling the current system to a second truth source.

## Work Split

### Q xiaohu (chief engineer)

Owns:

- architecture decision
- source-of-truth boundary
- adapter contract design
- phase acceptance criteria
- final implementation order

### Erliang (execution support)

Owns the upstream teardown and inventory work:

- page inventory
- runtime truth-source inventory
- module reuse triage
- conflict/risk note collection
- candidate integration points

Erliang should not start broad integration coding before the adapter boundaries are approved.

## Exact Task Package For Erliang

1. List every core page/section in `openclaw-control-center` and the file/module that powers it.
2. List every local runtime truth source it maintains under `runtime/*` and mark whether it is readonly-derived or actively mutated.
3. For each major module/page, classify it as:
   - reusable as-is
   - reusable with adaptation
   - not recommended for our current phase
4. Identify where its own local store model would conflict with our current source-of-truth files.
5. Mark the best integration points for these four adapters:
   - memory
   - self-alert
   - benchmark
   - collaboration
6. Produce a decision brief for Q xiaohu, not an implementation branch.

## Acceptance Criteria For Phase 0 Planning

This planning phase is complete when:

- the current source-of-truth boundary is explicit
- the four adapter contracts are defined
- the first four target pages are fixed
- the reused vs adapted vs rejected module list exists
- the first coding slice is small, readonly, and testable

## First Coding Slice Recommendation

After planning, the first implementation slice should be:

- benchmark adapter
- overview benchmark card
- settings wiring/status card

Reason:

- benchmark artifacts are already stable and well-structured
- they are easier to map than memory prose
- they create immediate operator value
- they do not risk mutating the current system

Memory and collaboration views should follow after the benchmark slice proves the adapter pattern.
